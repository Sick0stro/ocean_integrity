import { NextResponse } from 'next/server';
import { submitToPlastiks } from '@/lib/plastiks';
import { getSupabaseAdmin } from '@/utils/supabase';

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
  const secret =
    req.headers.get('x-cron-secret') || req.headers.get('x-submit-secret');
  const expected =
    process.env.CRON_SUBMIT_SECRET || process.env.CRON_INGEST_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional: process a single invoice_number via query param
  const url = new URL(req.url);
  const single = url.searchParams.get('invoice');

  const results: any[] = [];

  // Load pending rows
  const rows = await getPendingRows();
  const toProcess = single
    ? rows.filter((r) => r.invoice_number === single)
    : rows;

  for (const row of toProcess) {
    try {
      const prg = await submitToPlastiks(row);
      await markSubmitted(row.invoice_number, {
        plastiks_collection_id: prg.id,
        plastiks_collection_address: prg.address,
        plastiks_metadata_hash: prg.metadata_hash || null,
        plastiks_submitted_at: new Date().toISOString(),
      });
      results.push({
        invoice_number: row.invoice_number,
        status: 'submitted',
        id: prg.id,
      });
    } catch (e) {
      await markFailed(row.invoice_number, String(e));
      results.push({
        invoice_number: row.invoice_number,
        status: 'failed',
        error: String(e),
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
