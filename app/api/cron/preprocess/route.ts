import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: Request) {
  const requestId = Math.random().toString(36).substring(2, 15);
  console.log(`🚀 [preprocess:${requestId}] === PREPROCESSING STARTED ===`);
  console.log(
    `⏰ [preprocess:${requestId}] Timestamp: ${new Date().toISOString()}`
  );

  try {
    // Check for cron secret in headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error(
        `❌ [preprocess:${requestId}] Unauthorized: Missing Bearer token`
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const cronSecret =
      process.env.CRON_INGEST_SECRET ||
      process.env.CRON_SUBMIT_SECRET ||
      'test-secret';

    if (!cronSecret || token !== cronSecret) {
      console.error(`❌ [preprocess:${requestId}] Invalid token provided`);
      return NextResponse.json(
        {
          error: 'Invalid token',
          debug: {
            providedToken: token,
            expectedSecret: cronSecret,
            hasEnvSecret: !!(
              process.env.CRON_INGEST_SECRET || process.env.CRON_SUBMIT_SECRET
            ),
          },
        },
        { status: 401 }
      );
    }

    console.log(`✅ [preprocess:${requestId}] Authentication successful`);

    const supabase = getSupabaseAdmin();

    // Optional request scoping: allow client to pass specific temp pdf_paths to process
    let scopePdfPaths: string[] | null = null;
    try {
      const body = await request.json().catch(() => null);
      if (body && Array.isArray(body?.pdf_paths)) {
        scopePdfPaths = body.pdf_paths.filter(
          (p: unknown) => typeof p === 'string'
        );
        console.log(
          `🎯 [preprocess:${requestId}] Scoped processing requested for ${
            scopePdfPaths?.length || 0
          } paths:`,
          scopePdfPaths
        );
      }
    } catch {
      console.log(
        `📝 [preprocess:${requestId}] No JSON body provided; processing all pending documents`
      );
    }

    // Fetch documents from temp_documents (optionally scoped)
    let query = supabase
      .from('temp_documents')
      .select('*')
      .order('upload_date', { ascending: true });

    if (scopePdfPaths && scopePdfPaths.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = (query as any).in('pdf_path', scopePdfPaths);
    } else {
      // Conservative default batch size
      query = query.limit(12);
    }

    console.log(
      `🔍 [preprocess:${requestId}] Fetching documents from temp_documents...`
    );
    const { data: tempDocs, error: fetchError } = await query;

    if (fetchError) {
      console.error(
        `❌ [preprocess:${requestId}] Error fetching temp_documents:`,
        fetchError
      );
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    if (!tempDocs || tempDocs.length === 0) {
      console.log(`ℹ️ [preprocess:${requestId}] No documents to process`);
      return NextResponse.json(
        {
          message: 'No documents to process',
          processed: 0,
          errors: 0,
          details: [],
        },
        { status: 200 }
      );
    }

    console.log(
      `📊 [preprocess:${requestId}] Processing ${tempDocs.length} documents...`,
      {
        scopeProvided: Boolean(scopePdfPaths && scopePdfPaths.length > 0),
        scopeCount: scopePdfPaths?.length || 0,
        documents: tempDocs.map((d) => ({
          pdf_path: d.pdf_path,
          user_id: d.user_id,
          upload_date: d.upload_date,
        })),
      }
    );

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

    // Retry helper with simple backoff
    const withRetry = async <T>(label: string, fn: () => Promise<T>) => {
      let err: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const start = Date.now();
          const result = await fn();
          console.log(
            `✅ [preprocess:${requestId}] [retry:${label}] attempt ${attempt} succeeded in ${
              Date.now() - start
            }ms`
          );
          return result;
        } catch (e) {
          err = e;
          const delay = attempt * 300;
          console.warn(
            `⚠️ [preprocess:${requestId}] [retry:${label}] attempt ${attempt} failed; retrying in ${delay}ms`,
            e
          );
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      console.error(
        `❌ [preprocess:${requestId}] [retry:${label}] All 3 attempts failed`,
        err
      );
      throw err;
    };

    // Concurrency control (2–4 recommended); choose 3 as a balance
    const CONCURRENCY = 3;
    const chunks: (typeof tempDocs)[] = [];
    for (let i = 0; i < tempDocs.length; i += CONCURRENCY) {
      chunks.push(tempDocs.slice(i, i + CONCURRENCY));
    }

    console.log(
      `🔄 [preprocess:${requestId}] Processing in ${chunks.length} batches with concurrency ${CONCURRENCY}`
    );

    // Process in small batches concurrently
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const batch = chunks[chunkIndex];
      console.log(
        `📦 [preprocess:${requestId}] Starting batch ${chunkIndex + 1}/${
          chunks.length
        } with ${batch.length} documents`
      );

      await Promise.all(
        batch.map(async (doc, docIndex) => {
          const docId = `batch${chunkIndex + 1}-doc${docIndex + 1}`;
          try {
            console.log(
              `🔄 [preprocess:${requestId}] [${docId}] Processing document: ${doc.pdf_path}`
            );

            // Download PDF from storage
            console.log(
              `📥 [preprocess:${requestId}] [${docId}] Downloading PDF from storage...`
            );
            const { data: pdfData, error: downloadError } = await withRetry(
              `download:${doc.pdf_path}`,
              async () => {
                const res = await supabase.storage
                  .from('documents')
                  .download(doc.pdf_path);
                if (res.error || !res.data)
                  throw res.error || new Error('No data');
                return res;
              }
            );

            if (!pdfData) {
              console.error(
                `❌ [preprocess:${requestId}] [${docId}] Download error for ${doc.pdf_path}:`,
                downloadError
              );
              console.error(
                `📊 [preprocess:${requestId}] [${docId}] Download attempt details:`,
                {
                  path: doc.pdf_path,
                  user_id: doc.user_id,
                  error_type: 'StorageError',
                }
              );

              // Skip files from other users that we can't access (assume 400 status for simplicity)
              console.warn(
                `⚠️ [preprocess:${requestId}] [${docId}] Skipping inaccessible file from user ${doc.user_id}`
              );
              results.errors++;
              results.details.push({
                pdf_path: doc.pdf_path,
                action: 'error',
                error: 'File inaccessible (likely from another user)',
              });
              return;
            }

            // Convert blob to buffer and parse PDF
            console.log(
              `🔍 [preprocess:${requestId}] [${docId}] Parsing PDF structure...`
            );
            const pdfBuffer = await pdfData.arrayBuffer();
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            const pageCount = pdfDoc.getPageCount();

            console.log(
              `📄 [preprocess:${requestId}] [${docId}] Document ${doc.pdf_path} has ${pageCount} pages`
            );

            if (pageCount === 1) {
              // Single page - move directly to single_documents
              const singleDocPath = doc.pdf_path.replace('/temp/', '/single/');
              console.log(
                `📝 [preprocess:${requestId}] [${docId}] Single page detected; target path: ${singleDocPath}`
              );

              // Check if file already exists in single_documents
              const { data: existingDoc } = await supabase
                .from('single_documents')
                .select('id')
                .eq('pdf_path', singleDocPath)
                .single();

              if (existingDoc) {
                console.log(
                  `⚠️ [preprocess:${requestId}] [${docId}] Document already processed: ${singleDocPath}, skipping...`
                );
                results.processed++;
                results.details.push({
                  pdf_path: doc.pdf_path,
                  action: 'moved',
                  pageCount: 1,
                  newPath: singleDocPath,
                });
                return;
              }

              // Copy file to new location
              console.log(
                `📋 [preprocess:${requestId}] [${docId}] Copying single page to storage...`
              );
              const { error: copyError } = await withRetry(
                `copy:${singleDocPath}`,
                async () => {
                  const res = await supabase.storage
                    .from('documents')
                    .copy(doc.pdf_path, singleDocPath);
                  if (res.error) throw res.error;
                  return res;
                }
              );

              if (copyError) {
                // If file already exists in storage, that's ok
                const errorMessage =
                  copyError &&
                  typeof copyError === 'object' &&
                  'message' in copyError
                    ? (copyError as { message?: string }).message
                    : undefined;
                if (errorMessage) {
                  console.log(
                    `ℹ️ [preprocess:${requestId}] [${docId}] File already exists in storage: ${singleDocPath}`
                  );
                } else {
                  throw new Error(
                    `Failed to copy single page PDF: ${
                      errorMessage || 'Unknown error'
                    }`
                  );
                }
              }

              // Insert into single_documents
              console.log(
                `💾 [preprocess:${requestId}] [${docId}] Inserting record into single_documents...`
              );
              const { error: insertError } = await withRetry(
                `insert-single:${singleDocPath}`,
                async () => {
                  const res = await supabase.from('single_documents').insert({
                    pdf_path: singleDocPath,
                    upload_date: doc.upload_date,
                    status: 'uploaded',
                    original_filename: doc.pdf_path.split('/').pop(),
                    file_size: pdfBuffer.byteLength,
                    mime_type: 'application/pdf',
                    user_id: doc.user_id, // Add user_id from temp_documents
                  });
                  if (res.error) throw res.error;
                  return res;
                }
              );

              if (insertError) {
                throw new Error(
                  `Failed to insert single document: ${
                    (insertError as { message?: string })?.message ||
                    'Unknown error'
                  }`
                );
              }

              console.log(
                `✅ [preprocess:${requestId}] [${docId}] Single page processed successfully`
              );
              results.details.push({
                pdf_path: doc.pdf_path,
                action: 'moved',
                pageCount: 1,
                newPath: singleDocPath,
              });
            } else {
              // Multiple pages - split and save each page
              console.log(
                `📑 [preprocess:${requestId}] [${docId}] Multi-page document detected; splitting into ${pageCount} pages...`
              );
              const splitResults = [];

              for (let i = 0; i < pageCount; i++) {
                const pageNum = i + 1;
                console.log(
                  `📄 [preprocess:${requestId}] [${docId}] Processing page ${pageNum}/${pageCount}...`
                );

                const newPdf = await PDFDocument.create();
                const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
                newPdf.addPage(copiedPage);

                const newPdfBytes = await newPdf.save();
                const baseName =
                  doc.pdf_path.split('/').pop()?.replace('.pdf', '') ||
                  'document';
                const pagePath = doc.pdf_path
                  .replace('/temp/', '/single/')
                  .replace('.pdf', `_page${pageNum}.pdf`);

                console.log(
                  `🔍 [preprocess:${requestId}] [${docId}] Page ${pageNum} target path: ${pagePath}`
                );

                // Check if page already exists in single_documents
                const { data: existingPage } = await supabase
                  .from('single_documents')
                  .select('id')
                  .eq('pdf_path', pagePath)
                  .single();

                if (existingPage) {
                  console.log(
                    `⚠️ [preprocess:${requestId}] [${docId}] Page ${pageNum} already processed: ${pagePath}, skipping...`
                  );
                  splitResults.push(pagePath);
                  continue;
                }

                // Upload split page
                console.log(
                  `📤 [preprocess:${requestId}] [${docId}] Uploading page ${pageNum} to storage...`
                );
                const { error: uploadError } = await withRetry(
                  `upload:${pagePath}`,
                  async () => {
                    const res = await supabase.storage
                      .from('documents')
                      .upload(pagePath, newPdfBytes, {
                        contentType: 'application/pdf',
                        upsert: true,
                      });
                    if (res.error) throw res.error;
                    return res;
                  }
                );

                if (uploadError) {
                  throw new Error(
                    `Failed to upload page ${pageNum}: ${
                      (uploadError as { message?: string })?.message ||
                      'Unknown error'
                    }`
                  );
                }

                // Insert into single_documents
                console.log(
                  `💾 [preprocess:${requestId}] [${docId}] Inserting page ${pageNum} record into single_documents...`
                );
                const { error: insertError } = await withRetry(
                  `insert-page:${pagePath}`,
                  async () => {
                    const res = await supabase.from('single_documents').insert({
                      pdf_path: pagePath,
                      upload_date: doc.upload_date,
                      status: 'uploaded',
                      original_filename: `${baseName}_page${pageNum}.pdf`,
                      file_size: newPdfBytes.length,
                      mime_type: 'application/pdf',
                      user_id: doc.user_id, // Add user_id from temp_documents
                    });
                    if (res.error) throw res.error;
                    return res;
                  }
                );

                if (insertError) {
                  throw new Error(
                    `Failed to insert page ${pageNum}: ${
                      (insertError as { message?: string })?.message ||
                      'Unknown error'
                    }`
                  );
                }

                console.log(
                  `✅ [preprocess:${requestId}] [${docId}] Page ${pageNum} processed successfully`
                );
                splitResults.push(pagePath);
              }

              console.log(
                `✅ [preprocess:${requestId}] [${docId}] Multi-page document split completed: ${splitResults.length} pages`
              );
              results.details.push({
                pdf_path: doc.pdf_path,
                action: 'split',
                pageCount: pageCount,
                splitPaths: splitResults,
              });
            }

            // Retain temp_documents and original storage for up to 24h (cleanup via separate retention job)
            console.log(
              `📁 [preprocess:${requestId}] [${docId}] Retaining temp_documents entry and original file for 24h cleanup`
            );

            results.processed++;
            console.log(
              `✅ [preprocess:${requestId}] [${docId}] Document processing completed successfully`
            );
          } catch (error) {
            console.error(
              `❌ [preprocess:${requestId}] [${docId}] Error processing document ${doc.pdf_path}:`,
              error
            );
            console.error(
              `📊 [preprocess:${requestId}] [${docId}] Full error details:`,
              {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                doc: {
                  id: doc.id,
                  pdf_path: doc.pdf_path,
                  user_id: doc.user_id,
                  upload_date: doc.upload_date,
                },
              }
            );
            results.errors++;
            results.details.push({
              pdf_path: doc.pdf_path,
              action: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      );

      console.log(
        `✅ [preprocess:${requestId}] Batch ${chunkIndex + 1}/${
          chunks.length
        } completed`
      );
    }

    console.log(
      `🎉 [preprocess:${requestId}] Preprocessing complete: ${results.processed} processed, ${results.errors} errors`
    );

    // Log detailed results for debugging
    console.log(`📊 [preprocess:${requestId}] Detailed preprocessing results:`);
    results.details.forEach((detail, index) => {
      console.log(`${index + 1}. ${detail.pdf_path}:`);
      console.log(`   Action: ${detail.action}`);
      if (detail.error) {
        console.log(`   ❌ Error: ${detail.error}`);
      } else if (detail.action === 'moved') {
        console.log(`   ✅ Moved to: ${detail.newPath}`);
      } else if (detail.action === 'split') {
        console.log(`   ✅ Split into ${detail.splitPaths?.length || 0} pages`);
        detail.splitPaths?.forEach((path, i) => {
          console.log(`      Page ${i + 1}: ${path}`);
        });
      }
    });

    console.log(`🏁 [preprocess:${requestId}] === PREPROCESSING COMPLETED ===`);

    return NextResponse.json(
      {
        success: true,
        ...results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      `❌ [preprocess:${requestId}] Preprocessing cron error:`,
      error
    );
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
