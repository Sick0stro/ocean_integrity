// diagnostics/route.ts - Standalone Supabase diagnostics endpoint
import { NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseAdmin } from '@/utils/supabase';

interface ConnectionTestResult {
  success: boolean;
  error?: string;
  data?: unknown;
  operation?: string;
}

interface BucketTestResult {
  success: boolean;
  error?: string;
  buckets?: string[];
  operation?: string;
  hasDocumentsBucket?: boolean;
  documentsBucketFound?: boolean;
  listFiles?: {
    success: boolean;
    error?: string;
    fileCount?: number;
  };
}

interface SupabaseStorageError extends Error {
  status?: number;
  statusCode?: number;
  error?: string;
  message: string;
}

interface UploadTestResult {
  success: boolean;
  error?: string;
  fileUrl?: string;
  filePath?: string;
  tests?: Record<
    string,
    {
      name: string;
      success: boolean;
      error?: string;
      filePath?: string;
      fileUrl?: string;
      errorDetails?: unknown;
      mimeType?: string;
      uploadData?: unknown;
      cleanup?: 'success' | 'failed';
      exception?: boolean;
    }
  >;
  summary?: {
    successful: number;
    total: number;
    successRate: string;
    hasAnySuccess: boolean;
    pdfWorking: boolean;
  };
}

export async function GET() {
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
      connectionTests: {} as Record<string, ConnectionTestResult>,
      bucketTests: {} as Record<string, BucketTestResult>,
      uploadTests: {} as Record<string, UploadTestResult>,
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
      results.uploadTests[clientTest.name] = {
        success: false, // Initialize with default success value
        tests: {},
      };

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
            // Initialize the test result object if it doesn't exist
            if (!results.uploadTests[clientTest.name]) {
              results.uploadTests[clientTest.name] = {
                success: false,
                tests: {},
              };
            }

            // Get a reference to the test result object
            const testResult = results.uploadTests[clientTest.name];

            // Initialize tests object if it doesn't exist
            if (!testResult.tests) {
              testResult.tests = {};
            }

            // Now it's safe to assign
            const uploadErrorTyped =
              uploadError as unknown as SupabaseStorageError;

            // Ensure tests object exists
            if (!testResult.tests) {
              testResult.tests = {};
            }

            testResult.tests[testCase.name] = {
              name: testCase.name,
              success: false,
              error: uploadErrorTyped?.message || 'Unknown error',
              errorDetails: {
                message: uploadErrorTyped?.message || 'Unknown error',
                status: uploadErrorTyped?.status,
                statusCode: uploadErrorTyped?.statusCode,
              },
              mimeType: testCase.contentType,
            };
            console.log(
              `      ❌ [${requestId}] ${testCase.name} upload failed: ${uploadErrorTyped.message}`
            );
          } else {
            // Test getting public URL
            const { data: urlData } = clientTest.client.storage
              .from('documents')
              .getPublicUrl(testCase.fileName);

            if (!urlData?.publicUrl) {
              // Create test result object
              const testResult = {
                name: testCase.name,
                success: false,
                error: 'Failed to generate public URL',
                mimeType: testCase.contentType,
              };

              // Safely initialize the test result structure if it doesn't exist
              const testEntry = results.uploadTests[clientTest.name] || {
                success: false,
                tests: {},
              };

              // Ensure tests object exists
              testEntry.tests = testEntry.tests || {};
              // Update the test result
              testEntry.tests[testCase.name] = testResult;
              // Update the entry in the results
              results.uploadTests[clientTest.name] = testEntry;

              console.error(
                `      ❌ [${requestId}] ${testCase.name} failed to generate public URL`
              );
              continue;
            }

            // Ensure the client test entry exists and is properly typed
            if (!results.uploadTests[clientTest.name]) {
              results.uploadTests[clientTest.name] = {
                success: true,
                tests: {},
              };
            }

            // Ensure tests object exists and is properly typed
            const testEntry = results.uploadTests[clientTest.name] || {};
            if (!testEntry.tests) {
              testEntry.tests = {};
            }

            testEntry.tests[testCase.name] = {
              name: testCase.name,
              success: true,
              uploadData,
              fileUrl: urlData.publicUrl,
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

              // Safe cleanup status update
              const testResult =
                results.uploadTests[clientTest.name]?.tests?.[testCase.name];
              if (testResult) {
                testResult.cleanup = 'success';
              }
            } catch (cleanupError) {
              // Safe error handling for cleanup
              const testResult =
                results.uploadTests[clientTest.name]?.tests?.[testCase.name];
              if (testResult) {
                testResult.cleanup = 'failed';
              }
              console.warn(
                `      ⚠️ [${requestId}] Failed to cleanup ${testCase.name} test file:`,
                cleanupError
              );
            }
          }
        } catch (error) {
          // Initialize the test result object if it doesn't exist with all required properties
          if (!results.uploadTests[clientTest.name]) {
            results.uploadTests[clientTest.name] = {
              success: false, // Required by UploadTestResult
              tests: {},
            };
          }

          // Safe access to the test result object
          const testResult = {
            name: testCase.name,
            success: false, // Explicitly set success to false for error case
            error: (error as Error).message,
            exception: true,
            mimeType: testCase.contentType,
            // Initialize other optional properties that might be expected
            filePath: undefined,
            fileUrl: undefined,
            errorDetails: error,
            uploadData: undefined,
            cleanup: undefined,
          };

          // Safely update the tests object
          if (!results.uploadTests[clientTest.name].tests) {
            results.uploadTests[clientTest.name].tests = {};
          }
          results.uploadTests[clientTest.name].tests![testCase.name] =
            testResult;
          console.error(
            `      💥 [${requestId}] ${testCase.name} upload exception:`,
            error
          );
        }
      }

      // Summary for this client
      // Safe access to upload tests with proper initialization
      const uploadTests = results.uploadTests[clientTest.name];
      if (!uploadTests) continue;

      const tests = uploadTests.tests || {};
      const successfulTests = Object.values(tests).filter(
        (t) => t?.success
      ).length;
      const totalTests = uploadTestCases.length;

      // Safe summary creation
      uploadTests.summary = {
        successful: successfulTests,
        total: totalTests,
        successRate: `${successfulTests}/${totalTests}`,
        hasAnySuccess: successfulTests > 0,
        pdfWorking: tests['PDF']?.success === true,
      };

      console.log(
        `   📊 [${requestId}] ${clientTest.name} upload summary:`,
        results.uploadTests[clientTest.name].summary
      );
    }

    // 6. Overall Assessment
    const pdfUploadWorking = Boolean(
      results.uploadTests.anonClient?.summary?.pdfWorking ||
        results.uploadTests.adminClient?.summary?.pdfWorking
    );

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
