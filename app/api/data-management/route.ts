import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  if (
    !table ||
    ![
      'temp_documents',
      'single_documents',
      'parsed_documents',
      'recycling_docs',
      'document_groups',
    ].includes(table)
  ) {
    return NextResponse.json(
      { error: 'Valid table name required' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const offset = (page - 1) * limit;

    // Build the query based on table type with correct column ordering
    let query = supabase.from(table).select('*').eq('user_id', userId);

    // Add specific ordering for different tables
    if (table === 'temp_documents') {
      query = query.order('upload_date', { ascending: false });
    } else if (table === 'single_documents') {
      query = query.order('upload_date', { ascending: false });
    } else if (table === 'parsed_documents') {
      query = query.order('created_at', { ascending: false });
    } else if (table === 'recycling_docs') {
      query = query.order('updated_at', { ascending: false });
    } else if (table === 'document_groups') {
      query = query.order('last_processed_at', { ascending: false });
    } else {
      // Fallback ordering for any other tables
      query = query.order('id', { ascending: false });
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error(`Error getting count for ${table}:`, countError);
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
        hasNextPage: offset + limit < (totalCount || 0),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error(`API error for ${table}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const recordId = searchParams.get('id');
  const userId = searchParams.get('userId');

  if (!userId || !table || !recordId) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  if (
    ![
      'temp_documents',
      'single_documents',
      'parsed_documents',
      'recycling_docs',
      'document_groups',
    ].includes(table)
  ) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // First verify the record belongs to the user
    const { data: record, error: fetchError } = await supabase
      .from(table)
      .select('*')
      .eq('id', recordId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !record) {
      return NextResponse.json(
        { error: 'Record not found or access denied' },
        { status: 404 }
      );
    }

    // 🚀 NEW: Advanced security check for unprocessed documents only
    if (table === 'single_documents') {
      // Check if this single_document has been processed (exists in parsed_documents)
      const { data: parsedDoc, error: parsedError } = await supabase
        .from('parsed_documents')
        .select('id')
        .ilike('file_url', `%${record.pdf_path}`)
        .eq('user_id', userId)
        .limit(1);

      if (parsedError) {
        console.error('Error checking parsed_documents:', parsedError);
        return NextResponse.json(
          { error: 'Failed to verify document processing status' },
          { status: 500 }
        );
      }

      // If document exists in parsed_documents, it's been processed - don't allow deletion
      if (parsedDoc && parsedDoc.length > 0) {
        return NextResponse.json(
          {
            error:
              'Cannot delete processed documents. This document has been processed by AI and exists in parsed_documents.',
          },
          { status: 403 }
        );
      }

      // Document is unprocessed, deletion is allowed
      console.log(
        `✅ Document ${record.pdf_path} is unprocessed and can be deleted`
      );
    }

    // For temp_documents, only allow deletion of failed or uploaded status
    if (table === 'temp_documents') {
      const unprocessedStatuses = ['uploaded', 'failed', null, undefined];
      if (record.status && !unprocessedStatuses.includes(record.status)) {
        return NextResponse.json(
          {
            error:
              'Cannot delete processed temp documents. Only unprocessed documents can be deleted.',
          },
          { status: 403 }
        );
      }
    }

    // Protect processed tables from deletion
    if (
      table === 'parsed_documents' ||
      table === 'recycling_docs' ||
      table === 'document_groups'
    ) {
      return NextResponse.json(
        {
          error:
            'Cannot delete processed documents. Only unprocessed documents from temp_documents and single_documents can be deleted.',
        },
        { status: 403 }
      );
    }

    // 🚀 NEW: Smart deletion logic for unprocessed documents
    if (table === 'single_documents') {
      // Extract original filename from single_documents path for temp_documents lookup
      // Path format: user_id/timestamp_page_originalfilename.pdf
      const pathParts = record.pdf_path.split('/');
      const filename = pathParts[pathParts.length - 1]; // Get the filename part
      const originalFilename = filename.replace(/^[^_]*_[^_]*_[^_]*_/, ''); // Remove timestamp and page prefix

      console.log(
        `🔍 Looking for temp_document with original filename: ${originalFilename}`
      );

      // Check if corresponding temp_document exists and delete it
      const { data: tempDocs, error: tempError } = await supabase
        .from('temp_documents')
        .select('id, pdf_path')
        .eq('pdf_path', originalFilename)
        .eq('user_id', userId);

      if (!tempError && tempDocs && tempDocs.length > 0) {
        console.log(
          `🗑️ Found ${tempDocs.length} corresponding temp_document(s), deleting...`
        );

        for (const tempDoc of tempDocs) {
          const { error: tempDeleteError } = await supabase
            .from('temp_documents')
            .delete()
            .eq('id', tempDoc.id)
            .eq('user_id', userId);

          if (tempDeleteError) {
            console.error(
              `❌ Failed to delete temp_document ${tempDoc.id}:`,
              tempDeleteError
            );
          } else {
            console.log(`✅ Deleted temp_document: ${tempDoc.pdf_path}`);
          }
        }
      } else {
        console.log(
          `ℹ️ No corresponding temp_document found for ${originalFilename}`
        );
      }
    }

    // For smart deletion of parsed_documents, also remove from related tables
    if (table === 'parsed_documents') {
      // Remove from document_groups and recycling_docs if they reference this document
      const invoiceNumber =
        record.raw_json?.invoice_number || record.anchor_key;
      if (invoiceNumber) {
        // Remove from recycling_docs
        await supabase
          .from('recycling_docs')
          .delete()
          .eq('invoice_number', invoiceNumber)
          .eq('user_id', userId);

        // Remove from document_groups
        await supabase
          .from('document_groups')
          .delete()
          .eq('invoice_number', invoiceNumber)
          .eq('user_id', userId);
      }
    }

    // Delete the main record
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('id', recordId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error(`Error deleting from ${table}:`, deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Record deleted successfully',
    });
  } catch (error) {
    console.error(`Delete error for ${table}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const table = searchParams.get('table');
  const recordId = searchParams.get('id');
  const userId = searchParams.get('userId');

  if (!userId || !table || !recordId || !action) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  if (action !== 'retry') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Retry logic for different tables
    if (table === 'temp_documents') {
      // Reset status to allow reprocessing
      const { error } = await supabase
        .from('temp_documents')
        .update({
          status: 'uploaded',
          error_message: null,
          last_attempt: new Date().toISOString(),
        })
        .eq('id', recordId)
        .eq('user_id', userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (table === 'single_documents') {
      // Reset status to allow AI reprocessing
      const { error } = await supabase
        .from('single_documents')
        .update({
          status: 'uploaded',
          error_message: null,
          failed_at: null,
        })
        .eq('id', recordId)
        .eq('user_id', userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      return NextResponse.json(
        { error: 'Retry not supported for this table' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Document marked for retry',
    });
  } catch (error) {
    console.error(`Retry error for ${table}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
