import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

interface DocumentGroup {
  temp_document_id: string;
  original_filename: string;
  upload_date: string;
  temp_status: string;
  total_pages: number;
  pages_uploaded: number;
  pages_processed: number;
  pages_failed: number;
  pages_skipped_duplicate: number;
  can_retry: boolean;
  overall_status: string;
}

interface DetailedDocumentStatus {
  id: string;
  originalFilename: string;
  uploadDate: Date;
  currentStage: 'temp' | 'single' | 'parsed' | 'completed';
  status: string;
  totalPages: number;
  processedPages: number;
  failedPages: number;
  skippedPages: number;
  canRetry: boolean;
  canDelete: boolean;
  lastError?: string;
  retryCount: number;
  pages?: {
    id: string;
    pageNumber: number;
    status: string;
    lastError?: string;
  }[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const documentId = searchParams.get('documentId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    if (documentId) {
      // Get detailed status for a specific document
      const detailedStatus = await getDetailedDocumentStatus(supabase, documentId, userId);
      if (!detailedStatus) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ document: detailedStatus });
    } else {
      // Get grouped status for all user documents
      const groups = await getDocumentGroups(supabase, userId);
      return NextResponse.json({ groups });
    }

  } catch (error) {
    console.error('❌ [status] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function getDocumentGroups(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<DocumentGroup[]> {
  console.log(`📊 [status] Getting document groups for user ${userId}`);

  // Use the database function we created in the migration
  const { data: groups, error } = await supabase.rpc('get_document_groups', {
    p_user_id: userId,
  });

  if (error) {
    console.error('❌ [status] Error fetching document groups:', error);
    throw new Error(`Failed to fetch document groups: ${error.message}`);
  }

  return groups || [];
}

async function getDetailedDocumentStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentId: string,
  userId: string
): Promise<DetailedDocumentStatus | null> {
  console.log(`🔍 [status] Getting detailed status for document ${documentId}`);

  // Try to find as temp_document first (parent level)
  const { data: tempDoc, error: tempError } = await supabase
    .from('temp_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (!tempError && tempDoc) {
    // Get all child single_documents
    const { data: children, error: childrenError } = await supabase
      .from('single_documents')
      .select('id, page_number, total_pages, status, last_error, retry_count')
      .eq('temp_document_id', tempDoc.id)
      .eq('user_id', userId)
      .order('page_number');

    if (childrenError) {
      console.warn('⚠️ [status] Error fetching children:', childrenError);
    }

    const pages = children || [];
    const totalPages = pages.length > 0 ? pages[0].total_pages : 1;
    const processedPages = pages.filter((p: { status: string }) => p.status === 'processed').length;
    const failedPages = pages.filter((p: { status: string }) => p.status === 'failed').length;
    const skippedPages = pages.filter((p: { status: string }) => p.status === 'skipped_duplicate').length;

    // Determine current stage and overall status
    let currentStage: 'temp' | 'single' | 'parsed' | 'completed' = 'temp';
    let overallStatus = tempDoc.status || 'uploaded';

    if (tempDoc.status === 'processed' && pages.length > 0) {
      currentStage = 'single';
      if (processedPages + skippedPages === pages.length) {
        currentStage = 'completed';
        overallStatus = 'completed';
      } else if (failedPages > 0) {
        overallStatus = 'ai_processing_failed';
      } else {
        overallStatus = 'ai_processing_pending';
      }
    } else if (tempDoc.status === 'failed') {
      overallStatus = 'preprocessing_failed';
    }

    return {
      id: tempDoc.id,
      originalFilename: tempDoc.pdf_path,
      uploadDate: new Date(tempDoc.upload_date),
      currentStage,
      status: overallStatus,
      totalPages,
      processedPages,
      failedPages,
      skippedPages,
      canRetry: tempDoc.status === 'failed' || failedPages > 0,
      canDelete: processedPages === 0, // Can delete if nothing processed yet
      lastError: tempDoc.last_error,
      retryCount: tempDoc.retry_count || 0,
      pages: pages.map((p: { id: string; page_number: number; status: string; last_error?: string }) => ({
        id: p.id,
        pageNumber: p.page_number,
        status: p.status,
        lastError: p.last_error,
      })),
    };
  }

  // Try to find as single_document (page level)
  const { data: singleDoc, error: singleError } = await supabase
    .from('single_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (!singleError && singleDoc) {
    let currentStage: 'temp' | 'single' | 'parsed' | 'completed' = 'single';
    let overallStatus = singleDoc.status || 'uploaded';

    if (singleDoc.status === 'processed') {
      currentStage = 'completed';
      overallStatus = 'completed';
    } else if (singleDoc.status === 'failed') {
      overallStatus = 'ai_processing_failed';
    } else if (singleDoc.status === 'skipped_duplicate') {
      overallStatus = 'skipped_duplicate';
    }

    return {
      id: singleDoc.id,
      originalFilename: singleDoc.original_filename || singleDoc.pdf_path,
      uploadDate: new Date(singleDoc.upload_date),
      currentStage,
      status: overallStatus,
      totalPages: singleDoc.total_pages || 1,
      processedPages: singleDoc.status === 'processed' ? 1 : 0,
      failedPages: singleDoc.status === 'failed' ? 1 : 0,
      skippedPages: singleDoc.status === 'skipped_duplicate' ? 1 : 0,
      canRetry: singleDoc.status === 'failed' || singleDoc.status === 'uploaded',
      canDelete: singleDoc.status !== 'processed',
      lastError: singleDoc.last_error,
      retryCount: singleDoc.retry_count || 0,
      pages: [{
        id: singleDoc.id,
        pageNumber: singleDoc.page_number || 1,
        status: singleDoc.status,
        lastError: singleDoc.last_error,
      }],
    };
  }

  return null;
}

// Helper function to create increment function in database if it doesn't exist
export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    if (action === 'create_helper_functions') {
      const supabase = getSupabaseAdmin();

      // Create helper function for incrementing retry count
      const { error } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE OR REPLACE FUNCTION increment_retry_count(row_id UUID)
          RETURNS INTEGER AS $$
          DECLARE
            current_count INTEGER;
          BEGIN
            -- Get current retry_count, default to 0 if NULL
            SELECT COALESCE(retry_count, 0) + 1 INTO current_count
            FROM temp_documents WHERE id = row_id
            UNION ALL
            SELECT COALESCE(retry_count, 0) + 1
            FROM single_documents WHERE id = row_id
            LIMIT 1;

            RETURN COALESCE(current_count, 1);
          END;
          $$ LANGUAGE plpgsql;
        `
      });

      if (error) {
        throw new Error(`Failed to create helper function: ${error.message}`);
      }

      return NextResponse.json({ success: true, message: 'Helper functions created' });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ [status] POST Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}