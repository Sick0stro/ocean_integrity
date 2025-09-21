import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

interface RetryRequest {
  documentId: string;
  userId: string;
  action?: 'auto' | 'force_preprocessing' | 'force_ai' | 'skip_duplicate';
}

interface DocumentStatus {
  id: string;
  type: 'temp' | 'single';
  status: string;
  last_error?: string;
  temp_document_id?: string;
}

export async function POST(request: Request) {
  try {
    const body: RetryRequest = await request.json();
    const { documentId, userId, action = 'auto' } = body;

    if (!documentId || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: documentId, userId' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Find document in pipeline and determine current status
    const documentStatus = await findDocumentStatus(supabase, documentId, userId);

    if (!documentStatus) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    console.log(`🔄 [retry] Document ${documentId} status:`, documentStatus);

    // Determine retry action based on current status
    const retryAction = determineRetryAction(documentStatus, action);

    console.log(`🎯 [retry] Retry action for ${documentId}:`, retryAction);

    // Execute the retry action
    const result = await executeRetryAction(supabase, documentStatus, retryAction, userId);

    return NextResponse.json({
      success: true,
      action: retryAction.type,
      documentId,
      status: documentStatus.status,
      message: retryAction.message,
      ...result,
    });

  } catch (error) {
    console.error('❌ [retry] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function findDocumentStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentId: string,
  userId: string
): Promise<DocumentStatus | null> {
  // Try to find as single_document first
  const { data: singleDoc, error: singleError } = await supabase
    .from('single_documents')
    .select('id, status, last_error, temp_document_id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (!singleError && singleDoc) {
    return {
      id: singleDoc.id,
      type: 'single',
      status: singleDoc.status || 'uploaded',
      last_error: singleDoc.last_error,
      temp_document_id: singleDoc.temp_document_id,
    };
  }

  // Try to find as temp_document
  const { data: tempDoc, error: tempError } = await supabase
    .from('temp_documents')
    .select('id, status, last_error')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (!tempError && tempDoc) {
    return {
      id: tempDoc.id,
      type: 'temp',
      status: tempDoc.status || 'uploaded',
      last_error: tempDoc.last_error,
    };
  }

  return null;
}

function determineRetryAction(documentStatus: DocumentStatus, requestedAction: string) {
  // Handle forced actions
  if (requestedAction === 'force_preprocessing') {
    return {
      type: 'retry_preprocessing',
      message: 'Forcing preprocessing retry',
    };
  }

  if (requestedAction === 'force_ai') {
    return {
      type: 'retry_ai_processing',
      message: 'Forcing AI processing retry',
    };
  }

  if (requestedAction === 'skip_duplicate') {
    return {
      type: 'skip_duplicate',
      message: 'Marking document as skipped duplicate',
    };
  }

  // Auto-determine action based on document status
  if (documentStatus.type === 'temp') {
    if (documentStatus.status === 'failed' || documentStatus.status === 'uploaded') {
      return {
        type: 'retry_preprocessing',
        message: 'Retrying preprocessing from temp_documents',
      };
    }
    if (documentStatus.status === 'processed') {
      return {
        type: 'check_children',
        message: 'Checking child documents for retry needs',
      };
    }
  }

  if (documentStatus.type === 'single') {
    if (documentStatus.status === 'failed' || documentStatus.status === 'uploaded') {
      return {
        type: 'retry_ai_processing',
        message: 'Retrying AI processing from single_documents',
      };
    }
    if (documentStatus.status === 'skipped_duplicate') {
      return {
        type: 'already_skipped',
        message: 'Document was skipped due to duplicate content',
      };
    }
    if (documentStatus.status === 'processed') {
      return {
        type: 'already_processed',
        message: 'Document already processed successfully',
      };
    }
  }

  return {
    type: 'no_action_needed',
    message: 'Document is in a valid state, no retry needed',
  };
}

async function executeRetryAction(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentStatus: DocumentStatus,
  retryAction: { type: string; message: string },
  userId: string
) {
  switch (retryAction.type) {
    case 'retry_preprocessing':
      return await retryPreprocessing(supabase, documentStatus.id, userId);

    case 'retry_ai_processing':
      return await retryAIProcessing(supabase, documentStatus.id, userId);

    case 'check_children':
      return await checkChildDocuments(supabase, documentStatus.id, userId);

    case 'skip_duplicate':
      return await markAsSkippedDuplicate(supabase, documentStatus.id, userId);

    case 'already_skipped':
    case 'already_processed':
    case 'no_action_needed':
      return { details: retryAction.message };

    default:
      throw new Error(`Unknown retry action: ${retryAction.type}`);
  }
}

async function retryPreprocessing(supabase: ReturnType<typeof getSupabaseAdmin>, tempDocId: string, userId: string) {
  console.log(`🔄 [retry] Retrying preprocessing for temp_document ${tempDocId}`);

  // Reset temp_document status and increment retry count
  const { error: updateError } = await supabase
    .from('temp_documents')
    .update({
      status: 'uploaded',
      last_error: null,
      retry_count: supabase.rpc('increment_retry_count', { row_id: tempDocId }),
    })
    .eq('id', tempDocId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error(`Failed to reset temp_document status: ${updateError.message}`);
  }

  // Trigger preprocessing
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/cron/preprocess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_INGEST_SECRET || 'local-dev-submit-123'}`,
      },
      body: JSON.stringify({
        user_id: userId,
        pdf_paths: [], // Will process all pending for user
      }),
    });

    if (!response.ok) {
      throw new Error(`Preprocessing trigger failed: ${response.statusText}`);
    }

    return {
      details: 'Preprocessing retry initiated',
      triggered_preprocessing: true,
    };
  } catch (error) {
    console.error('❌ [retry] Failed to trigger preprocessing:', error);
    return {
      details: 'Document reset for retry, but preprocessing trigger failed',
      triggered_preprocessing: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function retryAIProcessing(supabase: ReturnType<typeof getSupabaseAdmin>, singleDocId: string, userId: string) {
  console.log(`🔄 [retry] Retrying AI processing for single_document ${singleDocId}`);

  // Reset single_document status and increment retry count
  const { error: updateError } = await supabase
    .from('single_documents')
    .update({
      status: 'uploaded',
      last_error: null,
      retry_count: supabase.rpc('increment_retry_count', { row_id: singleDocId }),
    })
    .eq('id', singleDocId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error(`Failed to reset single_document status: ${updateError.message}`);
  }

  return {
    details: 'Document reset for AI processing retry - will be picked up by next processing run',
    status_reset: true,
  };
}

async function checkChildDocuments(supabase: ReturnType<typeof getSupabaseAdmin>, tempDocId: string, userId: string) {
  console.log(`🔍 [retry] Checking child documents for temp_document ${tempDocId}`);

  // Get all child single_documents
  const { data: children, error: childrenError } = await supabase
    .from('single_documents')
    .select('id, status, last_error')
    .eq('temp_document_id', tempDocId)
    .eq('user_id', userId);

  if (childrenError) {
    throw new Error(`Failed to fetch child documents: ${childrenError.message}`);
  }

  const failedChildren = children?.filter((child: { id: string; status: string; last_error?: string }) =>
    child.status === 'failed' || child.status === 'uploaded'
  ) || [];

  if (failedChildren.length === 0) {
    return {
      details: 'All child documents are processed or skipped',
      children_count: children?.length || 0,
      failed_count: 0,
    };
  }

  // Reset failed children for retry
  const resetPromises = failedChildren.map((child: { id: string; status: string; last_error?: string }) =>
    supabase
      .from('single_documents')
      .update({
        status: 'uploaded',
        last_error: null,
        retry_count: supabase.rpc('increment_retry_count', { row_id: child.id }),
      })
      .eq('id', child.id)
  );

  await Promise.all(resetPromises);

  return {
    details: `Reset ${failedChildren.length} failed child documents for retry`,
    children_count: children?.length || 0,
    failed_count: failedChildren.length,
    reset_children: failedChildren.map((c: { id: string; status: string; last_error?: string }) => c.id),
  };
}

async function markAsSkippedDuplicate(supabase: ReturnType<typeof getSupabaseAdmin>, documentId: string, userId: string) {
  console.log(`⏭️ [retry] Marking document ${documentId} as skipped duplicate`);

  // This could be either temp or single document
  // Try single_documents first
  const { error: singleUpdateError } = await supabase
    .from('single_documents')
    .update({
      status: 'skipped_duplicate',
      last_error: 'Manually marked as duplicate',
    })
    .eq('id', documentId)
    .eq('user_id', userId);

  if (!singleUpdateError) {
    return {
      details: 'Document marked as skipped duplicate',
      table: 'single_documents',
    };
  }

  // Try temp_documents
  const { error: tempUpdateError } = await supabase
    .from('temp_documents')
    .update({
      status: 'skipped_duplicate',
      last_error: 'Manually marked as duplicate',
    })
    .eq('id', documentId)
    .eq('user_id', userId);

  if (!tempUpdateError) {
    return {
      details: 'Document marked as skipped duplicate',
      table: 'temp_documents',
    };
  }

  throw new Error('Failed to update document status in either table');
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'retry' });
}