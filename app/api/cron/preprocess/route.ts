import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: Request) {
  try {
    // Check for cron secret in headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const cronSecret =
      process.env.CRON_INGEST_SECRET || process.env.CRON_SUBMIT_SECRET;

    if (!cronSecret || token !== cronSecret) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Fetch unprocessed documents from temp_documents
    const { data: tempDocs, error: fetchError } = await supabase
      .from('temp_documents')
      .select('*')
      .order('upload_date', { ascending: true })
      .limit(10); // Process 10 at a time

    if (fetchError) {
      console.error('Error fetching temp_documents:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    if (!tempDocs || tempDocs.length === 0) {
      return NextResponse.json(
        { message: 'No documents to process' },
        { status: 200 }
      );
    }

    console.log(`Processing ${tempDocs.length} documents...`);

    type ProcessingDetail = {
      pdf_path: string;
      action: 'moved' | 'split' | 'error';
      pageCount?: number;
      newPath?: string;
      splitPaths?: string[];
      error?: string;
    };

    const results = {
      processed: 0,
      errors: 0,
      details: [] as ProcessingDetail[],
    };

    // Process each document
    for (const doc of tempDocs) {
      try {
        // Download PDF from storage
        const { data: pdfData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(doc.pdf_path);

        if (downloadError || !pdfData) {
          throw new Error(`Failed to download PDF: ${downloadError?.message}`);
        }

        // Convert blob to buffer
        const pdfBuffer = await pdfData.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pageCount = pdfDoc.getPageCount();

        console.log(`Document ${doc.pdf_path} has ${pageCount} pages`);

        if (pageCount === 1) {
          // Single page - move directly to single_documents
          const singleDocPath = doc.pdf_path.replace('/temp/', '/single/');

          // Copy file to new location
          const { error: copyError } = await supabase.storage
            .from('documents')
            .copy(doc.pdf_path, singleDocPath);

          if (copyError) {
            throw new Error(
              `Failed to copy single page PDF: ${copyError.message}`
            );
          }

          // Insert into single_documents
          const { error: insertError } = await supabase
            .from('single_documents')
            .insert({
              pdf_path: singleDocPath,
              upload_date: doc.upload_date,
              status: 'uploaded',
              original_filename: doc.pdf_path.split('/').pop(),
              file_size: pdfBuffer.byteLength,
              mime_type: 'application/pdf',
            });

          if (insertError) {
            throw new Error(
              `Failed to insert single document: ${insertError.message}`
            );
          }

          results.details.push({
            pdf_path: doc.pdf_path,
            action: 'moved',
            pageCount: 1,
            newPath: singleDocPath,
          });
        } else {
          // Multiple pages - split and save each page
          const splitResults = [];

          for (let i = 0; i < pageCount; i++) {
            const newPdf = await PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
            newPdf.addPage(copiedPage);

            const newPdfBytes = await newPdf.save();
            const pageNum = i + 1;
            const baseName =
              doc.pdf_path.split('/').pop()?.replace('.pdf', '') || 'document';
            const pagePath = doc.pdf_path
              .replace('/temp/', '/single/')
              .replace('.pdf', `_page${pageNum}.pdf`);

            // Upload split page
            const { error: uploadError } = await supabase.storage
              .from('documents')
              .upload(pagePath, newPdfBytes, {
                contentType: 'application/pdf',
              });

            if (uploadError) {
              throw new Error(
                `Failed to upload page ${pageNum}: ${uploadError.message}`
              );
            }

            // Insert into single_documents
            const { error: insertError } = await supabase
              .from('single_documents')
              .insert({
                pdf_path: pagePath,
                upload_date: doc.upload_date,
                status: 'uploaded',
                original_filename: `${baseName}_page${pageNum}.pdf`,
                file_size: newPdfBytes.length,
                mime_type: 'application/pdf',
              });

            if (insertError) {
              throw new Error(
                `Failed to insert page ${pageNum}: ${insertError.message}`
              );
            }

            splitResults.push(pagePath);
          }

          results.details.push({
            pdf_path: doc.pdf_path,
            action: 'split',
            pageCount: pageCount,
            splitPaths: splitResults,
          });
        }

        // Delete from temp_documents
        const { error: deleteError } = await supabase
          .from('temp_documents')
          .delete()
          .eq('id', doc.id);

        if (deleteError) {
          console.error(
            `Failed to delete temp document ${doc.id}:`,
            deleteError
          );
        }

        // Delete original file from storage
        const { error: removeError } = await supabase.storage
          .from('documents')
          .remove([doc.pdf_path]);

        if (removeError) {
          console.error(
            `Failed to remove temp file ${doc.pdf_path}:`,
            removeError
          );
        }

        results.processed++;
      } catch (error) {
        console.error(`Error processing document ${doc.pdf_path}:`, error);
        results.errors++;
        results.details.push({
          pdf_path: doc.pdf_path,
          action: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(
      `Preprocessing complete: ${results.processed} processed, ${results.errors} errors`
    );

    return NextResponse.json(
      {
        success: true,
        ...results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Preprocessing cron error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'preprocess' });
}
