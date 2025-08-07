// diagnostics/route.ts - Standalone Supabase diagnostics endpoint
import { NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseAdmin } from '@/utils/supabase';

export async function GET(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 15);

  console.log(`🔍 [${requestId}] === STANDALONE DIAGNOSTICS STARTED ===`);
  console.log(`⏰ [${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    // 1. Environment Variables Check
    console.log(`🔐 [${requestId}] Checking environment variables...`);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const envCheck = {
      SUPABASE_URL: supabaseUrl ? 'Present' : 'Missing',
      SUPABASE_ANON_KEY: supabaseAnonKey ? 'Present' : 'Missing',
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? 'Present' : 'Missing',
    };

    console.log(`   📍 Environment check:`, envCheck);

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing Supabase configuration',
          envCheck,
          requestId,
        },
        { status: 500 }
      );
    }

    // 2. Client Creation
    console.log(`🔌 [${requestId}] Creating Supabase clients...`);
    const supabase = getSupabaseClient();
    const adminClient = getSupabaseAdmin();

    const results = {
      envCheck,
      connectionTests: {} as any,
      bucketTests: {} as any,
      uploadTests: {} as any,
      requestId,
      timestamp: new Date().toISOString(),
    };

    // 3. Database Connection Tests
    console.log(`🔌 [${requestId}] Testing database connections...`);

    try {
      const { error: anonError } = await supabase
        .from('document_storage')
        .select('count', { count: 'exact', head: true });

      results.connectionTests.anonClient = anonError
        ? { success: false, error: anonError.message }
        : { success: true };

      console.log(
        `   ✅ [${requestId}] Anon client connection:`,
        results.connectionTests.anonClient
      );
    } catch (error) {
      results.connectionTests.anonClient = {
        success: false,
        error: (error as Error).message,
      };
      console.error(
        `   ❌ [${requestId}] Anon client connection failed:`,
        error
      );
    }

    try {
      const { error: adminError } = await adminClient
        .from('document_storage')
        .select('count', { count: 'exact', head: true });

      results.connectionTests.adminClient = adminError
        ? { success: false, error: adminError.message }
        : { success: true };

      console.log(
        `   ✅ [${requestId}] Admin client connection:`,
        results.connectionTests.adminClient
      );
    } catch (error) {
      results.connectionTests.adminClient = {
        success: false,
        error: (error as Error).message,
      };
      console.error(
        `   ❌ [${requestId}] Admin client connection failed:`,
        error
      );
    }

    // 4. Storage Bucket Tests
    console.log(`🪣 [${requestId}] Testing storage buckets...`);

    const clients = [
      { name: 'anonClient', client: supabase },
      { name: 'adminClient', client: adminClient },
    ];

    for (const clientTest of clients) {
      console.log(`   🔬 [${requestId}] Testing ${clientTest.name} storage...`);

      try {
        // List buckets
        const { data: buckets, error: bucketsError } =
          await clientTest.client.storage.listBuckets();

        if (bucketsError) {
          results.bucketTests[clientTest.name] = {
            success: false,
            error: bucketsError.message,
            operation: 'listBuckets',
          };
        } else {
          const bucketNames = buckets?.map((b) => b.name) || [];
          const hasDocumentsBucket = bucketNames.includes('documents');

          results.bucketTests[clientTest.name] = {
            success: true,
            buckets: bucketNames,
            hasDocumentsBucket,
            documentsBucketFound: hasDocumentsBucket,
          };

          // Try to list files in documents bucket
          if (hasDocumentsBucket) {
            try {
              const { data: files, error: listError } =
                await clientTest.client.storage
                  .from('documents')
                  .list('', { limit: 1 });

              results.bucketTests[clientTest.name].listFiles = listError
                ? { success: false, error: listError.message }
                : { success: true, fileCount: files?.length || 0 };
            } catch (error) {
              results.bucketTests[clientTest.name].listFiles = {
                success: false,
                error: (error as Error).message,
              };
            }
          }
        }

        console.log(
          `   📊 [${requestId}] ${clientTest.name} bucket test:`,
          results.bucketTests[clientTest.name]
        );
      } catch (error) {
        results.bucketTests[clientTest.name] = {
          success: false,
          error: (error as Error).message,
          operation: 'exception',
        };
        console.error(
          `   💥 [${requestId}] ${clientTest.name} storage exception:`,
          error
        );
      }
    }

    // 5. Upload Tests - Test Multiple MIME Types Including PDF
    console.log(
      `🧪 [${requestId}] Testing file uploads with different MIME types...`
    );

    const uploadTestCases = [
      {
        name: 'PDF',
        content: Buffer.from('PDF test content'),
        fileName: `diagnostics/test-pdf-${requestId}-${Date.now()}.pdf`,
        contentType: 'application/pdf',
      },
      {
        name: 'Text',
        content: `Diagnostic test file created at ${new Date().toISOString()}`,
        fileName: `diagnostics/test-txt-${requestId}-${Date.now()}.txt`,
        contentType: 'text/plain',
      },
      {
        name: 'JSON',
        content: JSON.stringify({
          test: true,
          timestamp: new Date().toISOString(),
        }),
        fileName: `diagnostics/test-json-${requestId}-${Date.now()}.json`,
        contentType: 'application/json',
      },
    ];

    for (const clientTest of clients) {
      console.log(`   🔬 [${requestId}] Testing ${clientTest.name} uploads...`);
      results.uploadTests[clientTest.name] = { tests: {} };

      for (const testCase of uploadTestCases) {
        console.log(
          `      🧪 [${requestId}] Testing ${testCase.name} (${testCase.contentType})...`
        );

        try {
          const { error: uploadError, data: uploadData } =
            await clientTest.client.storage
              .from('documents')
              .upload(testCase.fileName, testCase.content, {
                contentType: testCase.contentType,
                upsert: true,
              });

          if (uploadError) {
            results.uploadTests[clientTest.name].tests[testCase.name] = {
              success: false,
              error: uploadError.message,
              errorDetails: {
                message: uploadError.message,
                status: (uploadError as any).status,
                statusCode: (uploadError as any).statusCode,
              },
              mimeType: testCase.contentType,
            };
            console.log(
              `      ❌ [${requestId}] ${testCase.name} upload failed: ${uploadError.message}`
            );
          } else {
            // Test getting public URL
            const { data: urlData } = clientTest.client.storage
              .from('documents')
              .getPublicUrl(testCase.fileName);

            results.uploadTests[clientTest.name].tests[testCase.name] = {
              success: true,
              uploadData,
              publicUrl: urlData.publicUrl,
              mimeType: testCase.contentType,
            };

            console.log(
              `      ✅ [${requestId}] ${testCase.name} upload successful!`
            );

            // Clean up test file
            try {
              await clientTest.client.storage
                .from('documents')
                .remove([testCase.fileName]);
              results.uploadTests[clientTest.name].tests[
                testCase.name
              ].cleanup = 'success';
            } catch (cleanupError) {
              results.uploadTests[clientTest.name].tests[
                testCase.name
              ].cleanup = 'failed';
              console.warn(
                `      ⚠️ [${requestId}] Failed to cleanup ${testCase.name} test file:`,
                cleanupError
              );
            }
          }
        } catch (error) {
          results.uploadTests[clientTest.name].tests[testCase.name] = {
            success: false,
            error: (error as Error).message,
            exception: true,
            mimeType: testCase.contentType,
          };
          console.error(
            `      💥 [${requestId}] ${testCase.name} upload exception:`,
            error
          );
        }
      }

      // Summary for this client
      const successfulTests = Object.values(
        results.uploadTests[clientTest.name].tests
      ).filter((t: any) => t.success).length;
      const totalTests = uploadTestCases.length;
      results.uploadTests[clientTest.name].summary = {
        successful: successfulTests,
        total: totalTests,
        successRate: `${successfulTests}/${totalTests}`,
        hasAnySuccess: successfulTests > 0,
        pdfWorking:
          results.uploadTests[clientTest.name].tests['PDF']?.success || false,
      };

      console.log(
        `   📊 [${requestId}] ${clientTest.name} upload summary:`,
        results.uploadTests[clientTest.name].summary
      );
    }

    // 6. Overall Assessment
    const pdfUploadWorking =
      results.uploadTests.anonClient?.summary?.pdfWorking ||
      results.uploadTests.adminClient?.summary?.pdfWorking ||
      false;

    const overallSuccess =
      results.connectionTests.anonClient?.success &&
      results.bucketTests.anonClient?.success &&
      results.bucketTests.anonClient?.hasDocumentsBucket &&
      pdfUploadWorking;

    console.log(`🎯 [${requestId}] === DIAGNOSTICS COMPLETED ===`);
    console.log(`📊 [${requestId}] Overall success: ${overallSuccess}`);
    console.log(`📄 [${requestId}] PDF upload working: ${pdfUploadWorking}`);

    return NextResponse.json({
      success: overallSuccess,
      results,
      summary: {
        environmentOk:
          envCheck.SUPABASE_URL === 'Present' &&
          envCheck.SUPABASE_ANON_KEY === 'Present',
        connectionOk: results.connectionTests.anonClient?.success,
        bucketOk: results.bucketTests.anonClient?.hasDocumentsBucket,
        uploadOk:
          results.uploadTests.anonClient?.summary?.hasAnySuccess ||
          results.uploadTests.adminClient?.summary?.hasAnySuccess,
        pdfUploadOk: pdfUploadWorking,
        mimeTypeIssue:
          !pdfUploadWorking &&
          results.bucketTests.anonClient?.hasDocumentsBucket,
      },
    });
  } catch (error) {
    console.error(`💥 [${requestId}] Diagnostics failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: 'Diagnostics failed',
        details: (error as Error).message,
        requestId,
      },
      { status: 500 }
    );
  }
}
