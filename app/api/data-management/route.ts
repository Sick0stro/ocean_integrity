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
      'unprocessed_documents',
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

    let data, error, totalCount;

    // Handle special case for unprocessed_documents (virtual table)
    if (table === 'unprocessed_documents') {
      console.log(`📊 [data-management] Fetching unprocessed documents for user ${userId}`);

      // Get failed documents from temp_documents
      const { data: failedTempDocs, error: tempError } = await supabase
        .from('temp_documents')
        .select('id, pdf_path, upload_date, status, last_error, retry_count')
        .eq('user_id', userId)
        .in('status', ['failed', 'uploaded'])
        .order('upload_date', { ascending: false });

      // Get failed documents from single_documents
      const { data: failedSingleDocs, error: singleError } = await supabase
        .from('single_documents')
        .select('id, pdf_path, original_filename, upload_date, status, last_error, retry_count, temp_document_id, page_number, total_pages')
        .eq('user_id', userId)
        .in('status', ['failed', 'uploaded'])
        .order('upload_date', { ascending: false });

      if (tempError || singleError) {
        console.error('❌ [data-management] Error fetching unprocessed documents:', tempError || singleError);
        return NextResponse.json(
          { error: `Failed to fetch unprocessed documents: ${(tempError || singleError)?.message}` },
          { status: 500 }
        );
      }

      // Combine and format the results
      const unprocessedDocs = [];

      // Add failed temp_documents
      if (failedTempDocs) {
        unprocessedDocs.push(...failedTempDocs.map(doc => ({
          ...doc,
          source_table: 'temp_documents',
          original_filename: doc.pdf_path,
          temp_document_id: null,
          page_number: null,
          total_pages: 1
        })));
      }

      // Add failed single_documents
      if (failedSingleDocs) {
        unprocessedDocs.push(...failedSingleDocs.map(doc => ({
          ...doc,
          source_table: 'single_documents'
        })));
      }

      // Sort by upload_date and apply pagination
      unprocessedDocs.sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());

      // Apply offset and limit
      const paginatedDocs = unprocessedDocs.slice(offset, offset + limit);

      data = paginatedDocs;
      totalCount = unprocessedDocs.length;
      error = null;

      console.log(`✅ [data-management] Found ${data.length} unprocessed documents (${totalCount} total)`);
      console.log(`🔍 [data-management] Sample data:`, data.slice(0, 2));
    } else {
      // Build the query for regular tables
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

      const result = await query;
      data = result.data;
      error = result.error;

      // Get total count for regular tables
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      totalCount = count || 0;
    }

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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
      'unprocessed_documents',
    ].includes(table)
  ) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // For unprocessed_documents, we need to determine the actual table from source_table
    let actualTable = table;
    let record;

    if (table === 'unprocessed_documents') {
      // For unprocessed_documents, we need to check both single_documents and temp_documents
      // Try single_documents first
      const { data: singleDoc, error: singleError } = await supabase
        .from('single_documents')
        .select('*')
        .eq('id', recordId)
        .eq('user_id', userId)
        .single();

      if (!singleError && singleDoc) {
        actualTable = 'single_documents';
        record = singleDoc;
      } else {
        // Try temp_documents
        const { data: tempDoc, error: tempError } = await supabase
          .from('temp_documents')
          .select('*')
          .eq('id', recordId)
          .eq('user_id', userId)
          .single();

        if (!tempError && tempDoc) {
          actualTable = 'temp_documents';
          record = tempDoc;
        }
      }
    } else {
      // Regular table lookup
      const { data: fetchedRecord, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq('id', recordId)
        .eq('user_id', userId)
        .single();

      if (!fetchError && fetchedRecord) {
        record = fetchedRecord;
      }
    }

    if (!record) {
      return NextResponse.json(
        { error: 'Record not found or access denied' },
        { status: 404 }
      );
    }

    // 🚀 NEW: Advanced security check for unprocessed documents only
    if (actualTable === 'single_documents') {
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
    if (actualTable === 'temp_documents') {
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

    // 🚀 NEW: Smart deletion logic using relationship tracking
    if (actualTable === 'single_documents' && record.temp_document_id) {
      console.log(
        `🔍 [delete] Found temp_document_id: ${record.temp_document_id}, checking for parent cleanup`
      );

      // Check if this is the last unprocessed page from this temp_document
      const { data: siblingPages, error: siblingsError } = await supabase
        .from('single_documents')
        .select('id, status')
        .eq('temp_document_id', record.temp_document_id)
        .eq('user_id', userId);

      if (!siblingsError && siblingPages) {
        // Check if all other siblings are processed or will be deleted
        const otherUnprocessedSiblings = siblingPages.filter(
          page => page.id !== recordId && page.status !== 'processed'
        );

        console.log(
          `📊 [delete] Found ${siblingPages.length} total pages, ${otherUnprocessedSiblings.length} other unprocessed`
        );

        // If this is the only unprocessed page left, also clean up parent temp_document
        if (otherUnprocessedSiblings.length === 0) {
          console.log(
            `🗑️ [delete] This is the last unprocessed page, cleaning up parent temp_document ${record.temp_document_id}`
          );

          const { error: tempDeleteError } = await supabase
            .from('temp_documents')
            .delete()
            .eq('id', record.temp_document_id)
            .eq('user_id', userId);

          if (tempDeleteError) {
            console.error(
              `❌ [delete] Failed to delete parent temp_document ${record.temp_document_id}:`,
              tempDeleteError
            );
          } else {
            console.log(`✅ [delete] Successfully deleted parent temp_document`);
          }
        } else {
          console.log(
            `ℹ️ [delete] Other unprocessed pages exist, keeping parent temp_document`
          );
        }
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
      .from(actualTable)
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
    } else if (
      table === 'single_documents' ||
      table === 'unprocessed_documents'
    ) {
      // For unprocessed_documents, determine the actual table
      let actualTable = table;
      if (table === 'unprocessed_documents') {
        // Check which table the record is actually in
        const { data: singleDoc } = await supabase
          .from('single_documents')
          .select('id')
          .eq('id', recordId)
          .eq('user_id', userId)
          .single();

        if (singleDoc) {
          actualTable = 'single_documents';
        } else {
          actualTable = 'temp_documents';
        }
      }

      // Reset status to allow AI reprocessing
      const updateData =
        actualTable === 'temp_documents'
          ? {
              status: 'uploaded',
              error_message: null,
              last_attempt: new Date().toISOString(),
            }
          : {
              status: 'uploaded',
              error_message: null,
              failed_at: null,
            };

      const { error } = await supabase
        .from(actualTable)
        .update(updateData)
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
