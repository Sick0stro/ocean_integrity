/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { submitToPlastiks } from '@/lib/plastiks';
import { getSupabaseAdmin } from '@/utils/supabase';

interface ProcessResult {
  invoice_number: string;
  status: string;
  id?: number;
  error?: string;
}

async function getPendingRows(userFilter?: string) {
  console.log(
    `🔍 [BLOCKCHAIN] getPendingRows() called with userFilter: '${
      userFilter || 'NONE'
    }'`
  );

  const supabase = getSupabaseAdmin();
  console.log(`📡 [BLOCKCHAIN] Supabase admin client initialized`);

  let query = supabase
    .from('recycling_docs')
    .select('*')
    .in('ngtus', ['new', 'updated'])
    .limit(100);

  console.log(
    `🔍 [BLOCKCHAIN] Base query: SELECT * FROM recycling_docs WHERE status IN ('new', 'updated') LIMIT 100`
  );

  // Optional: filter by specific user_id
  if (userFilter) {
    query = query.eq('user_id', userFilter);
    console.log(
      `👤 [BLOCKCHAIN] Added user filter: AND user_id = '${userFilter}'`
    );
  } else {
    console.log(
      `🌐 [BLOCKCHAIN] No user filter applied - will fetch for all users`
    );
  }

  console.log(`⚡ [BLOCKCHAIN] Executing database query...`);
  const queryStart = Date.now();
  const { data, error } = await query;
  const queryDuration = Date.now() - queryStart;

  if (error) {
    console.error(
      `❌ [BLOCKCHAIN] Database query failed after ${queryDuration}ms:`,
      error
    );
    throw error;
  }

  const resultCount = data?.length || 0;
  console.log(
    `✅ [BLOCKCHAIN] Database query successful in ${queryDuration}ms`
  );
  console.log(`📊 [BLOCKCHAIN] Query returned ${resultCount} row(s)`);

  if (resultCount > 0) {
    console.log(`📋 [BLOCKCHAIN] Row details:`);
    data?.forEach((row, index) => {
      console.log(
        `   ${index + 1}. Invoice: '${row.invoice_number}' | User: ${
          row.user_id
        } | Status: ${row.status} | Verified: ${
          row.human_verified
        } | Company: ${row.recycler_company}`
      );
    });
  } else {
    console.log(`📭 [BLOCKCHAIN] No rows found matching criteria`);
    console.log(`   💡 This could mean:`);
    console.log(`      - No documents in 'new' or 'updated' status`);
    console.log(
      `      - All documents already processed (status = 'submitted' or 'failed')`
    );
    console.log(`      - User filter excludes all documents`);
    console.log(`      - No documents exist in the recycling_docs table`);
  }

  return data || [];
}

type SubmittedData = {
  plastiks_collection_id: number;
  plastiks_collection_address: string;
  plastiks_metadata_hash: string | null;
  plastiks_tx_hash?: string | null;
  plastiks_submitted_at: string;
};

async function markSubmitted(invoice_number: string, data: SubmittedData) {
  console.log(
    `💾 [BLOCKCHAIN] markSubmitted() called for invoice: '${invoice_number}'`
  );
  console.log(`   📊 Update data:`, JSON.stringify(data, null, 2));

  const supabase = getSupabaseAdmin();

  const updateData = {
    status: 'submitted',
    plastiks_collection_id: data.plastiks_collection_id,
    plastiks_collection_address: data.plastiks_collection_address,
    plastiks_metadata_hash: data.plastiks_metadata_hash,
    plastiks_tx_hash: data.plastiks_tx_hash || null,
    plastiks_last_error: null, // Clear any previous errors
    plastiks_submitted_at: data.plastiks_submitted_at,
    updated_at: new Date().toISOString(),
  };

  console.log(
    `🔄 [BLOCKCHAIN] Executing UPDATE query on recycling_docs table...`
  );
  console.log(`   📋 WHERE clause: invoice_number = '${invoice_number}'`);
  console.log(`   📊 UPDATE data:`, JSON.stringify(updateData, null, 2));

  const updateStart = Date.now();
  const { error, count } = await supabase
    .from('recycling_docs')
    .update(updateData)
    .eq('invoice_number', invoice_number);
  const updateDuration = Date.now() - updateStart;

  if (error) {
    console.error(
      `❌ [BLOCKCHAIN] markSubmitted() failed after ${updateDuration}ms:`,
      error
    );
    throw error;
  }

  console.log(
    `✅ [BLOCKCHAIN] markSubmitted() successful in ${updateDuration}ms`
  );
  console.log(`   📊 Rows affected: ${count || 'unknown'}`);
  console.log(
    `   📄 Invoice '${invoice_number}' status changed to 'submitted'`
  );
  console.log(`   🆔 Plastiks Collection ID: ${data.plastiks_collection_id}`);
  console.log(`   📍 Plastiks Address: ${data.plastiks_collection_address}`);
  console.log(`   ⏰ Submitted at: ${data.plastiks_submitted_at}`);

  return true;
}

async function markFailed(invoice_number: string, errorMsg: string) {
  console.log(
    `💾 [BLOCKCHAIN] markFailed() called for invoice: '${invoice_number}'`
  );
  console.log(
    `   ❌ Error message: ${errorMsg.substring(0, 200)}${
      errorMsg.length > 200 ? '...' : ''
    }`
  );

  const supabase = getSupabaseAdmin();

  const updateData = {
    status: 'failed',
    plastiks_last_error: errorMsg,
    updated_at: new Date().toISOString(),
  };

  console.log(
    `🔄 [BLOCKCHAIN] Executing UPDATE query on recycling_docs table (failure)...`
  );
  console.log(`   📋 WHERE clause: invoice_number = '${invoice_number}'`);
  console.log(`   📊 UPDATE data:`, JSON.stringify(updateData, null, 2));

  const updateStart = Date.now();
  const { error, count } = await supabase
    .from('recycling_docs')
    .update(updateData)
    .eq('invoice_number', invoice_number);
  const updateDuration = Date.now() - updateStart;

  if (error) {
    console.error(
      `❌ [BLOCKCHAIN] markFailed() database update failed after ${updateDuration}ms:`,
      error
    );
    throw error;
  }

  console.log(`✅ [BLOCKCHAIN] markFailed() successful in ${updateDuration}ms`);
  console.log(`   📊 Rows affected: ${count || 'unknown'}`);
  console.log(`   📄 Invoice '${invoice_number}' status changed to 'failed'`);
  console.log(`   ❌ Error stored in plastiks_last_error field`);
  console.log(`   ⏰ Updated at: ${updateData.updated_at}`);

  return true;
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).slice(2);
  const startTime = Date.now();

  console.log(
    `🚀 [BLOCKCHAIN:${requestId}] =======================================`
  );
  console.log(
    `🚀 [BLOCKCHAIN:${requestId}] NEW PUSH TO PLASTIKS REQUEST STARTED`
  );
  console.log(
    `🚀 [BLOCKCHAIN:${requestId}] =======================================`
  );
  console.log(
    `🚀 [BLOCKCHAIN:${requestId}] Request timestamp: ${new Date().toISOString()}`
  );
  console.log(`🚀 [BLOCKCHAIN:${requestId}] Request method: ${req.method}`);
  console.log(`🚀 [BLOCKCHAIN:${requestId}] Request URL: ${req.url}`);

  const url = new URL(req.url);
  console.log(`🔍 [BLOCKCHAIN:${requestId}] Parsed URL components:`);
  console.log(`   📍 Origin: ${url.origin}`);
  console.log(`   🛤️  Pathname: ${url.pathname}`);
  console.log(`   🔗 Search params: ${url.searchParams.toString()}`);

  // Log all headers for debugging
  console.log(`📋 [BLOCKCHAIN:${requestId}] Request headers:`);
  req.headers.forEach((value, key) => {
    // Don't log sensitive data
    if (
      key.toLowerCase().includes('secret') ||
      key.toLowerCase().includes('authorization')
    ) {
      console.log(`   ${key}: [REDACTED]`);
    } else {
      console.log(`   ${key}: ${value}`);
    }
  });

  const headerSecret =
    req.headers.get('x-cron-secret') || req.headers.get('x-submit-secret');
  const querySecret = url.searchParams.get('secret');
  const secret = headerSecret || querySecret || '';
  const expected =
    process.env.CRON_SUBMIT_SECRET || process.env.CRON_INGEST_SECRET;
  const allowDevBypass = process.env.NODE_ENV !== 'production' && !expected;

  console.log(`🔐 [BLOCKCHAIN:${requestId}] Authentication check:`);
  console.log(`   🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`   🚫 Allow dev bypass: ${allowDevBypass}`);
  console.log(`   🔑 Has expected secret: ${!!expected}`);
  console.log(`   📤 Has provided secret: ${!!secret}`);

  if (!allowDevBypass) {
    if (!expected || secret !== expected) {
      console.log(
        `❌ [BLOCKCHAIN:${requestId}] Authentication failed - unauthorized request`
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  console.log(`✅ [BLOCKCHAIN:${requestId}] Authentication successful`);

  // Try to extract user info from request if available
  const userAgent = req.headers.get('user-agent');
  const referer = req.headers.get('referer');
  console.log(`👤 [BLOCKCHAIN:${requestId}] Client information:`);
  console.log(`   🖥️  User-Agent: ${userAgent || 'N/A'}`);
  console.log(`   🔗 Referer: ${referer || 'N/A'}`);
  console.log(`   📍 Origin: ${req.headers.get('origin') || 'N/A'}`);

  console.log(
    `🎯 [BLOCKCHAIN:${requestId}] Authentication completed, proceeding with request processing...`
  );

  // Optional filters via query params
  const single = url.searchParams.get('invoice');
  const userFilter = url.searchParams.get('user_id');

  console.log(
    `🔍 [BLOCKCHAIN:${requestId}] Processing filters from query params:`
  );
  console.log(`   📄 Single invoice filter: '${single || 'NONE'}'`);
  console.log(`   👤 User ID filter: '${userFilter || 'NONE'}'`);

  if (single) {
    console.log(
      `🎯 [BLOCKCHAIN:${requestId}] Single invoice mode - will only process invoice: '${single}'`
    );
  } else {
    console.log(
      `📦 [BLOCKCHAIN:${requestId}] Bulk mode - will process all available invoices for user`
    );
  }

  const results: ProcessResult[] = [];
  let toProcess: any[] = []; // Declare outside try block

  console.log(
    `🗄️  [BLOCKCHAIN:${requestId}] Starting database query for pending recycling_docs...`
  );
  const queryStart = Date.now();

  try {
    // Load pending rows (optionally filtered by user)
    const rows = await getPendingRows(userFilter || undefined);
    const queryTime = Date.now() - queryStart;

    console.log(
      `✅ [BLOCKCHAIN:${requestId}] Database query completed in ${queryTime}ms`
    );
    console.log(`📊 [BLOCKCHAIN:${requestId}] Query results:`);
    console.log(`   📄 Total pending rows: ${rows.length}`);
    console.log(
      `   🔍 Filter applied: ${
        userFilter ? `user_id='${userFilter}'` : 'none (all users)'
      }`
    );
    console.log(`   📋 Row status criteria: ['new', 'updated']`);
    console.log(`   📏 Query limit: 100 rows`);

    if (rows.length > 0) {
      console.log(
        `📃 [BLOCKCHAIN:${requestId}] Available invoices in query result:`
      );
      rows.forEach((row, index) => {
        console.log(
          `   ${index + 1}. Invoice: '${row.invoice_number}' | User: ${
            row.user_id
          } | Status: ${row.status} | Plastic: ${row.plastic_type} | Weight: ${
            row.weight_kg
          }kg/${row.tonnage_tons}t`
        );
      });
    }

    toProcess = single ? rows.filter((r) => r.invoice_number === single) : rows;

    console.log(`🎯 [BLOCKCHAIN:${requestId}] Final processing selection:`);
    console.log(`   📊 Total available rows: ${rows.length}`);
    console.log(`   ✅ Rows selected for processing: ${toProcess.length}`);

    if (single && toProcess.length === 0) {
      console.log(
        `⚠️  [BLOCKCHAIN:${requestId}] WARNING: Single invoice '${single}' not found in pending rows!`
      );
      console.log(`   💡 This could mean:`);
      console.log(
        `      - Invoice already processed (status != 'new' or 'updated')`
      );
      console.log(`      - Invoice doesn't exist in database`);
      console.log(`      - User doesn't have access to this invoice`);
    } else if (single && toProcess.length > 0) {
      console.log(
        `✅ [BLOCKCHAIN:${requestId}] Single invoice '${single}' found and ready for processing`
      );
    }

    if (toProcess.length > 0) {
      console.log(
        `🔄 [BLOCKCHAIN:${requestId}] Processing pipeline started for ${toProcess.length} document(s)...`
      );
    } else {
      console.log(
        `📭 [BLOCKCHAIN:${requestId}] No documents to process - ending request`
      );
    }
  } catch (queryError) {
    const queryTime = Date.now() - queryStart;
    console.error(
      `❌ [BLOCKCHAIN:${requestId}] Database query failed after ${queryTime}ms:`,
      queryError
    );
    throw queryError;
  }

  for (const row of toProcess) {
    const invoiceStartTime = Date.now();
    console.log(
      `\n🔵 [BLOCKCHAIN:${requestId}] ==========================================`
    );
    console.log(`🔵 [BLOCKCHAIN:${requestId}] PROCESSING INDIVIDUAL INVOICE`);
    console.log(
      `🔵 [BLOCKCHAIN:${requestId}] ==========================================`
    );

    try {
      console.log(`🎯 [BLOCKCHAIN:${requestId}] Starting invoice processing:`);
      console.log(`   📄 Invoice: '${row.invoice_number}'`);
      console.log(`   👤 User ID: '${row.user_id}'`);
      console.log(`   ⏰ Started at: ${new Date().toISOString()}`);

      console.log(
        `\n📋 [BLOCKCHAIN:${requestId}] COMPLETE ROW DATA FROM DATABASE:`
      );
      console.log(`   🏢 Recycler Company: ${row.recycler_company || 'N/A'}`);
      console.log(`   🔬 Plastic Type: ${row.plastic_type || 'N/A'}`);
      console.log(`   ⚖️  Weight Data:`);
      console.log(`      📦 Weight (kg): ${row.weight_kg || 'N/A'}`);
      console.log(`      🏗️  Tonnage (tons): ${row.tonnage_tons || 'N/A'}`);
      console.log(`   🌍 Location Data:`);
      console.log(`      🏙️  City: ${(row as any).city || 'N/A'}`);
      console.log(`      🗺️  Country: ${row.country || 'N/A'}`);
      console.log(`      📍 Origin: ${(row as any).origin || 'N/A'}`);
      console.log(`   👥 Company Data:`);
      console.log(
        `      🔄 Network Operator: ${row.network_operator_company || 'N/A'}`
      );
      console.log(`      🏢 Recycler: ${row.recycler_company || 'N/A'}`);
      console.log(`   📎 Document URLs:`);
      console.log(
        `      📄 Invoice URL: ${(row as any).invoice_url || 'NULL'}`
      );
      console.log(`      💳 EFT URL: ${(row as any).eft_url || 'NULL'}`);
      console.log(
        `      🚛 E-way Bill URL: ${(row as any).ewaybill_url || 'NULL'}`
      );
      console.log(`   📊 Record Metadata:`);
      console.log(`      🔄 Status: ${row.status}`);
      console.log(`      ✅ Human Verified: ${row.human_verified}`);
      console.log(`      👤 Verified By: ${(row as any).verified_by || 'N/A'}`);
      console.log(`      ⏰ Verified At: ${row.verified_at || 'N/A'}`);
      console.log(`      📅 Created: ${row.created_at}`);
      console.log(`      🔄 Updated: ${row.updated_at || 'N/A'}`);
      console.log(`   🔗 Plastiks Data (existing):`);
      console.log(
        `      🆔 Collection ID: ${row.plastiks_collection_id || 'NULL'}`
      );
      console.log(
        `      📍 Collection Address: ${
          row.plastiks_collection_address || 'NULL'
        }`
      );
      console.log(
        `      🔒 Metadata Hash: ${row.plastiks_metadata_hash || 'NULL'}`
      );
      console.log(
        `      ⏰ Last Submitted: ${row.plastiks_submitted_at || 'NULL'}`
      );
      console.log(`      ❌ Last Error: ${row.plastiks_last_error || 'NULL'}`);

      console.log(`\n🔧 [BLOCKCHAIN:${requestId}] DATA NORMALIZATION:`);
      // Normalize tons -> kg for submission layer
      const originalWeightKg = row.weight_kg;
      const originalTonnageTons = row.tonnage_tons;
      const calculatedWeightKg = originalTonnageTons
        ? Number(originalTonnageTons) * 1000
        : undefined;
      const finalWeightKg = originalWeightKg ?? calculatedWeightKg;

      console.log(`   📊 Weight calculation:`);
      console.log(`      📦 Original weight_kg: ${originalWeightKg || 'NULL'}`);
      console.log(
        `      🏗️  Original tonnage_tons: ${originalTonnageTons || 'NULL'}`
      );
      console.log(
        `      🧮 Calculated weight_kg from tonnage: ${
          calculatedWeightKg || 'NULL'
        }`
      );
      console.log(
        `      ✅ Final weight_kg for submission: ${finalWeightKg || 'NULL'}`
      );

      const submissionRow = {
        ...row,
        tonnage_kg: finalWeightKg,
      };

      console.log(`\n🚀 [BLOCKCHAIN:${requestId}] CALLING PLASTIKS API:`);
      console.log(
        `   📤 Submission payload prepared with ${
          Object.keys(submissionRow).length
        } fields`
      );
      console.log(`   ⏰ API call starting at: ${new Date().toISOString()}`);

      const plastiks_start = Date.now();
      const prg = await submitToPlastiks(submissionRow);
      const plastiks_time = Date.now() - plastiks_start;

      console.log(`\n✅ [BLOCKCHAIN:${requestId}] PLASTIKS API SUCCESS:`);
      console.log(`   ⏱️  API call duration: ${plastiks_time}ms`);
      console.log(`   🆔 PRG Collection ID: ${prg.id}`);
      console.log(`   📍 PRG Collection Address: ${prg.address}`);
      console.log(`   🔒 PRG Metadata Hash: ${prg.metadata_hash || 'N/A'}`);
      console.log(
        `   🔗 PRG Transaction Hash: ${(prg as any).tx_hash || 'N/A'}`
      );

      console.log(`\n💾 [BLOCKCHAIN:${requestId}] UPDATING DATABASE RECORD:`);
      const dbUpdateData = {
        plastiks_collection_id: prg.id,
        plastiks_collection_address: prg.address,
        plastiks_metadata_hash: prg.metadata_hash || null,
        plastiks_submitted_at: new Date().toISOString(),
      };
      console.log(`   📊 Update data:`, JSON.stringify(dbUpdateData, null, 2));

      const dbUpdate_start = Date.now();
      await markSubmitted(row.invoice_number, dbUpdateData);
      const dbUpdate_time = Date.now() - dbUpdate_start;

      console.log(`   ✅ Database update completed in ${dbUpdate_time}ms`);
      console.log(
        `   📄 Invoice '${row.invoice_number}' marked as 'submitted'`
      );

      const invoiceProcessTime = Date.now() - invoiceStartTime;
      console.log(`\n🎉 [BLOCKCHAIN:${requestId}] INVOICE PROCESSING SUCCESS:`);
      console.log(`   📄 Invoice: '${row.invoice_number}'`);
      console.log(`   ⏱️  Total processing time: ${invoiceProcessTime}ms`);
      console.log(`   🆔 Plastiks Collection ID: ${prg.id}`);
      console.log(`   ✅ Status: SUBMITTED TO BLOCKCHAIN`);

      results.push({
        invoice_number: row.invoice_number,
        status: 'submitted',
        id: prg.id,
      });
    } catch (e) {
      const invoiceProcessTime = Date.now() - invoiceStartTime;
      console.log(`\n❌ [BLOCKCHAIN:${requestId}] INVOICE PROCESSING FAILED:`);
      console.log(`   📄 Invoice: '${row.invoice_number}'`);
      console.log(
        `   ⏱️  Processing time before failure: ${invoiceProcessTime}ms`
      );
      console.log(
        `   🔥 Error type: ${
          e instanceof Error ? e.constructor.name : typeof e
        }`
      );
      console.log(
        `   📝 Error message: ${e instanceof Error ? e.message : String(e)}`
      );
      console.log(`   📚 Error stack trace:`);
      if (e instanceof Error && e.stack) {
        console.log(e.stack);
      } else {
        console.log(`   (No stack trace available)`);
      }

      console.log(`\n💾 [BLOCKCHAIN:${requestId}] MARKING INVOICE AS FAILED:`);
      try {
        const dbFail_start = Date.now();
        await markFailed(row.invoice_number, String(e));
        const dbFail_time = Date.now() - dbFail_start;
        console.log(
          `   ✅ Invoice marked as failed in database (${dbFail_time}ms)`
        );
      } catch (dbError) {
        console.log(
          `   ❌ Failed to mark invoice as failed in database:`,
          dbError
        );
      }

      results.push({
        invoice_number: row.invoice_number,
        status: 'failed',
        error: String(e),
      });
    }
    console.log(
      `🔵 [BLOCKCHAIN:${requestId}] ==========================================`
    );
  }

  const totalProcessTime = Date.now() - startTime;

  console.log(
    `\n🏁 [BLOCKCHAIN:${requestId}] =======================================`
  );
  console.log(`🏁 [BLOCKCHAIN:${requestId}] REQUEST PROCESSING COMPLETED`);
  console.log(
    `🏁 [BLOCKCHAIN:${requestId}] =======================================`
  );

  const successCount = results.filter((r) => r.status === 'submitted').length;
  const failureCount = results.filter((r) => r.status === 'failed').length;

  console.log(`📊 [BLOCKCHAIN:${requestId}] FINAL PROCESSING STATISTICS:`);
  console.log(`   ⏱️  Total request duration: ${totalProcessTime}ms`);
  console.log(`   📄 Total invoices processed: ${results.length}`);
  console.log(`   ✅ Successful submissions: ${successCount}`);
  console.log(`   ❌ Failed submissions: ${failureCount}`);
  console.log(
    `   📈 Success rate: ${
      results.length > 0
        ? ((successCount / results.length) * 100).toFixed(1)
        : 0
    }%`
  );

  if (successCount > 0) {
    console.log(`\n✅ [BLOCKCHAIN:${requestId}] SUCCESSFUL SUBMISSIONS:`);
    results
      .filter((r) => r.status === 'submitted')
      .forEach((result, index) => {
        console.log(
          `   ${index + 1}. Invoice: '${
            result.invoice_number
          }' → Collection ID: ${result.id}`
        );
      });
  }

  if (failureCount > 0) {
    console.log(`\n❌ [BLOCKCHAIN:${requestId}] FAILED SUBMISSIONS:`);
    results
      .filter((r) => r.status === 'failed')
      .forEach((result, index) => {
        console.log(
          `   ${index + 1}. Invoice: '${result.invoice_number}' → Error: ${
            result.error
          }`
        );
      });
  }

  const response = {
    success: true,
    processed: results.length,
    results,
    statistics: {
      totalDuration: totalProcessTime,
      successCount,
      failureCount,
      successRate:
        results.length > 0 ? (successCount / results.length) * 100 : 0,
    },
  };

  console.log(`\n📤 [BLOCKCHAIN:${requestId}] RESPONSE PAYLOAD:`);
  console.log(`   📊 Response structure:`, JSON.stringify(response, null, 2));
  console.log(
    `   📏 Response size: ${JSON.stringify(response).length} characters`
  );
  console.log(`   ⏰ Response timestamp: ${new Date().toISOString()}`);

  console.log(`\n🏁 [BLOCKCHAIN:${requestId}] REQUEST COMPLETED SUCCESSFULLY`);
  console.log(
    `🏁 [BLOCKCHAIN:${requestId}] =======================================\n`
  );

  return NextResponse.json(response);
}
