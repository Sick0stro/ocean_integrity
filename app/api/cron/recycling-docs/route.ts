import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

// Payload types
interface IngestionItem {
  invoice_number: string;
  invoice_url: string;
  eft_url: string;
  ewaybill_url: string;
  recycler_company: string;
  network_operator_company: string;
  plastic_type: string; // e.g., PET1
  tonnage_value: number; // numeric value (typically tonnes)
  tonnage_unit?: 'kg' | 't'; // kg or tonnes (t)
  country: string; // country code/name
  city: string; // city name
  origin?: string; // legacy field; if present used as country fallback
  currency: string; // ISO 4217
  upload_date?: string;
  uploaded_by?: string;
}

function toTonnes(value: number, unit?: 'kg' | 't') {
  // Default to tonnes if unit not provided
  if (unit === 'kg') return value / 1000;
  return value;
}

type UpsertRow = {
  invoice_number: string;
  invoice_url: string;
  eft_url: string;
  ewaybill_url: string;
  recycler_company: string;
  network_operator_company: string;
  plastic_type: string;
  tonnage_tons: number;
  // Back-compat: some DBs have NOT NULL weight_kg; provide it too
  weight_kg?: number;
  origin: string; // keep for backward compatibility, mirrors country
  country: string;
  city: string;
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
  const url = new URL(req.url);
  const headerSecret = req.headers.get('x-cron-secret');
  const querySecret = url.searchParams.get('secret');
  const secret = headerSecret || querySecret || '';
  const expected = process.env.CRON_INGEST_SECRET;
  const allowDevBypass = process.env.NODE_ENV !== 'production' && !expected;
  if (!allowDevBypass) {
    if (!expected || secret !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const json = (await req.json()) as IngestionItem[];
    if (!Array.isArray(json)) {
      return NextResponse.json(
        { error: 'Payload must be an array' },
        { status: 400 }
      );
    }

    const errors: { index: number; message: string }[] = [];
    const rows: UpsertRow[] = json.map((item, idx) => {
      const rec = item as unknown as Record<string, unknown>;
      const missing = [
        'invoice_number',
        'invoice_url',
        'eft_url',
        'ewaybill_url',
        'recycler_company',
        'network_operator_company',
        'plastic_type',
        'tonnage_value',
        'country',
        'city',
        'currency',
      ].filter(
        (k) =>
          rec[k] === undefined ||
          rec[k] === null ||
          (typeof rec[k] === 'string' && (rec[k] as string).trim() === '')
      );
      if (missing.length > 0) {
        errors.push({
          index: idx,
          message: `Missing required fields: ${missing.join(', ')}`,
        });
      }

      const tonnage_tons = toTonnes(
        Number(item.tonnage_value),
        item.tonnage_unit
      );
      const weight_kg = tonnage_tons * 1000;
      // Normalize plastic type to allowed set
      const allowed = ['LDPE', 'PET', 'PP', 'PVC'];
      const incomingType = String(item.plastic_type || '').toUpperCase();
      const plastic_type = allowed.includes(incomingType)
        ? incomingType
        : incomingType; // keep as-is; server-side may reject if not allowed
      const country = String(item.country || item.origin || '').trim();
      const city = String(item.city || '').trim();
      return {
        invoice_number: String(item.invoice_number).trim(),
        invoice_url: String(item.invoice_url).trim(),
        eft_url: String(item.eft_url).trim(),
        ewaybill_url: String(item.ewaybill_url).trim(),
        recycler_company: String(item.recycler_company).trim(),
        network_operator_company: String(item.network_operator_company).trim(),
        plastic_type,
        tonnage_tons,
        weight_kg,
        origin: country,
        country,
        city,
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
    const details = typeof e === 'object' ? JSON.stringify(e) : String(e);
    return NextResponse.json(
      { error: 'Ingestion failed', details },
      { status: 400 }
    );
  }
}
