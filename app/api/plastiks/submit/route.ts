import { NextResponse } from 'next/server';
import { submitToPlastiks } from '@/lib/plastiks';
import { getSupabaseAdmin } from '@/utils/supabase';

interface ProcessResult {
  invoice_number: string;
  status: string;
  id?: number;
  error?: string;
}

async function getPendingRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('recycling_docs')
    .select('*')
    .in('status', ['new', 'updated'])
    .limit(100);
  if (error) throw error;
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
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('recycling_docs')
    .update({
      status: 'submitted',
      plastiks_collection_id: data.plastiks_collection_id,
      plastiks_collection_address: data.plastiks_collection_address,
      plastiks_metadata_hash: data.plastiks_metadata_hash,
      plastiks_tx_hash: data.plastiks_tx_hash || null,
      plastiks_last_error: null,
      plastiks_submitted_at: data.plastiks_submitted_at,
      updated_at: new Date().toISOString(),
    })
    .eq('invoice_number', invoice_number);
  if (error) throw error;
  return true;
}

async function markFailed(invoice_number: string, errorMsg: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('recycling_docs')
    .update({
      status: 'failed',
      plastiks_last_error: errorMsg,
      updated_at: new Date().toISOString(),
    })
    .eq('invoice_number', invoice_number);
  if (error) throw error;
  return true;
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).slice(2);
  console.log(`🔵 [submit:${requestId}] Submit request received`);
  const url = new URL(req.url);
  const headerSecret =
    req.headers.get('x-cron-secret') || req.headers.get('x-submit-secret');
  const querySecret = url.searchParams.get('secret');
  const secret = headerSecret || querySecret || '';
  const expected =
    process.env.CRON_SUBMIT_SECRET || process.env.CRON_INGEST_SECRET;
  const allowDevBypass = process.env.NODE_ENV !== 'production' && !expected;
  if (!allowDevBypass) {
    if (!expected || secret !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Optional: process a single invoice_number via query param
  const single = url.searchParams.get('invoice');
  console.log(`🔵 [submit:${requestId}] Filter invoice='${single || ''}'`);

  const results: ProcessResult[] = [];

  // Load pending rows
  const rows = await getPendingRows();
  console.log(`🔵 [submit:${requestId}] Pending rows: ${rows.length}`);
  const toProcess = single
    ? rows.filter((r) => r.invoice_number === single)
    : rows;
  console.log(`🔵 [submit:${requestId}] To process: ${toProcess.length}`);

  for (const row of toProcess) {
    try {
      console.log(
        `🟡 [submit:${requestId}] Processing invoice='${
          row.invoice_number
        }' | type='${row.plastic_type}' | tons='${row.tonnage_tons ?? 'n/a'}'`
      );

      // 🔍 ADVANCED LOGGING: Log complete row data being processed
      console.log(
        `📋 [submit:${requestId}] Row data from recycling_docs table:`
      );
      console.log(`   📄 Invoice Number: ${row.invoice_number}`);
      console.log(`   🏢 Company: ${row.recycler_company}`);
      console.log(`   🔬 Plastic Type: ${row.plastic_type}`);
      console.log(`   ⚖️  Weight: ${row.weight_kg}kg / ${row.tonnage_tons}t`);
      console.log(`   🌍 Location: ${row.city}, ${row.country || row.origin}`);
      console.log(`   📎 Attachment URLs available in database:`);
      console.log(`      📄 Invoice: ${row.invoice_url || 'NULL'}`);
      console.log(`      💳 EFT: ${row.eft_url || 'NULL'}`);
      console.log(`      🚛 E-way Bill: ${row.ewaybill_url || 'NULL'}`);
      console.log(`   🔄 Status: ${row.status}`);
      console.log(`   📅 Created: ${row.created_at}`);

      // Normalize tons -> kg for submission layer
      const submissionRow = {
        ...row,
        tonnage_kg:
          row.weight_kg ??
          (row.tonnage_tons ? Number(row.tonnage_tons) * 1000 : undefined),
      };

      console.log(
        `🚀 [submit:${requestId}] Calling submitToPlastiks() with normalized data...`
      );
      const prg = await submitToPlastiks(submissionRow);
      console.log(
        `🟢 [submit:${requestId}] Plastiks PRG created id=${prg.id} address=${prg.address}`
      );
      await markSubmitted(row.invoice_number, {
        plastiks_collection_id: prg.id,
        plastiks_collection_address: prg.address,
        plastiks_metadata_hash: prg.metadata_hash || null,
        plastiks_submitted_at: new Date().toISOString(),
      });
      console.log(
        `🟢 [submit:${requestId}] Marked submitted invoice='${row.invoice_number}'`
      );
      results.push({
        invoice_number: row.invoice_number,
        status: 'submitted',
        id: prg.id,
      });
    } catch (e) {
      console.error(
        `🔴 [submit:${requestId}] Failed invoice='${row.invoice_number}'`,
        e
      );
      await markFailed(row.invoice_number, String(e));
      results.push({
        invoice_number: row.invoice_number,
        status: 'failed',
        error: String(e),
      });
    }
  }

  const response = {
    success: true,
    processed: results.length,
    results,
  };
  console.log(`📦 [submit:${requestId}] Summary`, response);
  return NextResponse.json(response);
}
