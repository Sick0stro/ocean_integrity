import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

type DocType = 'invoice' | 'eft_receipt' | 'e-way-bill';

function normalizeUnitToKg(
  value: number | null | undefined,
  unit?: string | null
) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const u = String(unit || '')
    .toLowerCase()
    .trim();
  if (u === 'kg' || u === 'kgs' || u === 'kilogram' || u === 'kilograms')
    return Number(value);
  if (
    u === 't' ||
    u === 'ton' ||
    u === 'tons' ||
    u === 'tonne' ||
    u === 'tonnes'
  )
    return Number(value) * 1000;
  // default assume kg
  return Number(value);
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).slice(2);
  console.log(`🔵 [promote:${requestId}] Received promote request`);
  const url = new URL(req.url);
  const headerSecret =
    req.headers.get('x-cron-secret') || req.headers.get('x-submit-secret');
  const querySecret = url.searchParams.get('secret');
  const invoiceParam = url.searchParams.get('invoice');

  let invoice = invoiceParam || '';
  try {
    if (!invoice) {
      const body = (await req.json().catch(() => ({}))) as { invoice?: string };
      invoice = String(body?.invoice || '');
    }
  } catch {}

  console.log(
    `🔵 [promote:${requestId}] Params: invoice='${invoice}', hasHeaderSecret=${Boolean(
      req.headers.get('x-cron-secret') || req.headers.get('x-submit-secret')
    )}, hasQuerySecret=${Boolean(url.searchParams.get('secret'))}`
  );

  const secret = headerSecret || querySecret || '';
  const expected =
    process.env.CRON_INGEST_SECRET || process.env.CRON_SUBMIT_SECRET;
  const allowDevBypass = process.env.NODE_ENV !== 'production' && !expected;
  if (!allowDevBypass) {
    if (!expected || secret !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!invoice) {
    return NextResponse.json({ error: 'Missing invoice' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Load the latest row per required type for this invoice from parsed_documents
  const required: DocType[] = ['invoice', 'eft_receipt', 'e-way-bill'];
  try {
    const { data, error } = await supa
      .from('parsed_documents')
      .select('id, document_type, file_url, created_at, raw_json')
      .in('document_type', required)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter rows that match the invoice in raw_json (anchor_key or invoice or second/third invoice for EFT)
    type ParsedRow = {
      id: string;
      document_type: DocType;
      file_url: string | null;
      created_at: string;
      raw_json: Record<string, unknown>;
    };
    const rows = (data || []).filter((row: ParsedRow) => {
      const rj = (row?.raw_json || {}) as Record<string, unknown>;
      const candidates: string[] = [];
      const ak = rj['anchor_key'];
      const inv = rj['invoice'];
      const s2 = rj['second_invoice'];
      const s3 = rj['third_invoice'];
      if (ak) candidates.push(String(ak));
      if (inv) candidates.push(String(inv));
      if (s2) candidates.push(String(s2));
      if (s3) candidates.push(String(s3));
      return candidates
        .map((s) => s.trim())
        .filter(Boolean)
        .includes(invoice);
    }) as Array<ParsedRow>;

    console.log(
      `🔵 [promote:${requestId}] Candidates fetched: ${
        (data || []).length
      }, matching invoice '${invoice}': ${rows.length}`
    );
    const latestByType = new Map<DocType, (typeof rows)[number]>();
    for (const t of required) {
      const r = rows.find((x) => x.document_type === t);
      if (r) latestByType.set(t, r);
    }

    // Build payload for recycling_docs
    const invRow = latestByType.get('invoice');
    const eftRow = latestByType.get('eft_receipt');
    const ewbRow = latestByType.get('e-way-bill');

    if (!invRow || !eftRow || !ewbRow) {
      const present = required.filter((t) => latestByType.has(t));
      const missing = required.filter((t) => !present.includes(t));
      console.warn(
        `🟠 [promote:${requestId}] Incomplete group for invoice='${invoice}'. Present=${present.join(
          ','
        )} Missing=${missing.join(',')}`
      );
      return NextResponse.json(
        {
          error: 'Incomplete group',
          missing,
          present,
        },
        { status: 400 }
      );
    }

    const inv = (invRow.raw_json || {}) as Record<string, unknown>;
    const eft = (eftRow.raw_json || {}) as Record<string, unknown>;
    const ewb = (ewbRow.raw_json || {}) as Record<string, unknown>;

    // Derive fields
    const invoice_url = invRow.file_url || '';
    const eft_url = eftRow.file_url || '';
    const ewaybill_url = ewbRow.file_url || '';

    // Prefer company name from invoice; fallback to e-way bill ship_to_company_name or recipient/supplier
    const recycler_company = (
      (inv['bill_to_company_name'] as string) ||
      ((inv['recipient'] as Record<string, unknown> | undefined)?.[
        'name'
      ] as string) ||
      (ewb['ship_to_company_name'] as string) ||
      ((
        (ewb['address_details'] as Record<string, unknown> | undefined)?.[
          'to'
        ] as Record<string, unknown> | undefined
      )?.['name'] as string) ||
      ''
    )
      .toString()
      .trim();

    const plastic_type = (
      (inv['plastic_type'] as string) ||
      (ewb['plastic_type'] as string) ||
      ''
    )
      .toString()
      .toUpperCase();
    const weightVal = Number(
      (inv['weight'] as number | undefined) ??
        (ewb['weight'] as number | undefined) ??
        NaN
    );
    const weightUnit = ((inv['weight_unit_of_mesurement'] as
      | string
      | undefined) ||
      (ewb['weight_unit_of_mesurement'] as string | undefined) ||
      'kg') as string;
    const tonnage_kg = normalizeUnitToKg(weightVal, weightUnit) || 0;

    // Country/city
    const country = ((ewb['ship_to_country_code'] as string) || '')
      .toString()
      .trim();
    const city = ''; // Unknown reliably from current structures

    const currency =
      (
        ((eft['transaction_details'] as Record<string, unknown> | undefined)?.[
          'currency'
        ] as string) || ''
      )
        .toString()
        .trim() || 'INR';
    const upload_date = new Date().toISOString().slice(0, 10);

    const upsertRow = {
      invoice_number: invoice,
      invoice_url,
      eft_url,
      ewaybill_url,
      recycler_company: recycler_company || 'Unknown',
      plastic_type,
      tonnage_tons: tonnage_kg / 1000,
      tonnage_kg,
      origin: country,
      country,
      city,
      currency,
      upload_date,
      uploaded_by: 'ui-promote',
      status: 'updated' as const,
    };

    const { error: upsertError } = await supa
      .from('recycling_docs')
      .upsert(upsertRow as unknown as Record<string, unknown>, {
        onConflict: 'invoice_number',
      });

    if (upsertError) throw upsertError;

    console.log(
      `🟢 [promote:${requestId}] Upserted recycling_docs for invoice='${invoice}' | plastic_type='${plastic_type}' | tonnage_kg=${tonnage_kg} | urls: inv=${Boolean(
        invoice_url
      )}, eft=${Boolean(eft_url)}, ewb=${Boolean(ewaybill_url)}`
    );

    return NextResponse.json({
      success: true,
      invoice,
      upserted: true,
      data: upsertRow,
    });
  } catch (e) {
    console.error(`🔴 [promote:${requestId}] Error`, e);
    return NextResponse.json(
      { error: 'Promote failed', details: String(e) },
      { status: 500 }
    );
  }
}
