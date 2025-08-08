import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

// Payload types
interface IngestionItem {
  invoice_number: string;
  invoice_url: string;
  eft_url: string;
  ewaybill_url: string;
  recycler_company: string;
  plastic_type: string; // e.g., PET1
  tonnage_value: number; // numeric value
  tonnage_unit?: 'kg' | 't'; // kg or tons (t)
  origin: string; // country code or empty
  currency: string; // ISO 4217
  upload_date?: string;
  uploaded_by?: string;
}

function normalizeKg(value: number, unit?: 'kg' | 't') {
  if (!unit || unit === 'kg') return value;
  if (unit === 't') return value * 1000;
  return value;
}

type UpsertRow = {
  invoice_number: string;
  invoice_url: string;
  eft_url: string;
  ewaybill_url: string;
  recycler_company: string;
  plastic_type: string;
  tonnage_kg: number;
  origin: string;
  currency: string;
  upload_date: string | null;
  uploaded_by: string | null;
  status: 'new' | 'updated' | 'submitted' | 'failed';
};

async function upsertRecyclingDocs(rows: UpsertRow[]) {
  const supabase = getSupabaseAdmin();
  // Upsert by invoice_number
  const { data, error } = await supabase
    .from('recycling_docs')
    .upsert(rows, { onConflict: 'invoice_number' })
    .select('invoice_number');
  if (error) throw error;
  return { count: data?.length || 0 };
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_INGEST_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const json = (await req.json()) as IngestionItem[];
    if (!Array.isArray(json)) {
      return NextResponse.json({ error: 'Payload must be an array' }, { status: 400 });
    }

    const errors: { index: number; message: string }[] = [];
    const rows: UpsertRow[] = json.map((item, idx) => {
      const missing = ['invoice_number', 'invoice_url', 'eft_url', 'ewaybill_url', 'recycler_company', 'plastic_type', 'tonnage_value', 'origin', 'currency'].filter(
        (k) => (item as Record<string, unknown>)[k] === undefined || (item as Record<string, unknown>)[k] === null || (typeof (item as Record<string, unknown>)[k] === 'string' && ((item as Record<string, unknown>)[k] as string).trim() === '')
      );
      if (missing.length > 0) {
        errors.push({ index: idx, message: `Missing required fields: ${missing.join(', ')}` });
      }

      const tonnage_kg = normalizeKg(Number(item.tonnage_value), item.tonnage_unit);
      return {
        invoice_number: String(item.invoice_number).trim(),
        invoice_url: String(item.invoice_url).trim(),
        eft_url: String(item.eft_url).trim(),
        ewaybill_url: String(item.ewaybill_url).trim(),
        recycler_company: String(item.recycler_company).trim(),
        plastic_type: String(item.plastic_type || 'PET1').trim(),
        tonnage_kg,
        origin: String(item.origin || ''),
        currency: String(item.currency || ''),
        upload_date: item.upload_date || null,
        uploaded_by: item.uploaded_by || null,
        status: 'new',
      };
    });

    if (errors.length) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const res = await upsertRecyclingDocs(rows);
    return NextResponse.json({ success: true, upserted: res.count });
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON', details: String(e) }, { status: 400 });
  }
}
