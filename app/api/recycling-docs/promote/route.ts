import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

type DocType = 'invoice' | 'eft_receipt' | 'e-way-bill';

// Helper function to detect if a recycler company is Indian
function isIndianRecycler(recyclerCompany: string | null | undefined): boolean {
  if (!recyclerCompany) return false;

  const company = recyclerCompany.toLowerCase();

  // Common Indian company indicators
  const indianIndicators = [
    'private limited',
    'pvt ltd',
    'limited',
    'ltd',
    'enterprises',
    'industries',
    'india',
    'indian',
    'mumbai',
    'delhi',
    'bangalore',
    'chennai',
    'kolkata',
    'hyderabad',
    'pune',
    'ahmedabad',
    'surat',
    'jaipur',
    'lucknow',
    'kanpur',
    'nagpur',
    'indore',
    'bhopal',
    'visakhapatnam',
    'patna',
    'vadodara',
    'ludhiana',
    'agra',
    'nashik',
    'faridabad',
    'meerut',
    'rajkot',
    'kalyan',
    'vasai-virar',
    'varanasi',
    'srinagar',
    'aurangabad',
    'dhanbad',
    'amritsar',
    'navi mumbai',
    'allahabad',
    'howrah',
    'gwalior',
    'jabalpur',
    'coimbatore',
    'vijayawada',
    'jodhpur',
    'madurai',
    'raipur',
    'kota',
    'guwahati',
    'chandigarh',
    'solapur',
    'noida',
    'gurgaon',
    'rangpar',
  ];

  return indianIndicators.some((indicator) => company.includes(indicator));
}

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
  let user_id = url.searchParams.get('user_id') || '';

  try {
    if (!invoice || !user_id) {
      const body = (await req.json().catch(() => ({}))) as {
        invoice?: string;
        user_id?: string;
      };
      invoice = invoice || String(body?.invoice || '');
      user_id = user_id || String(body?.user_id || '');
    }
  } catch {}

  console.log(
    `🔵 [promote:${requestId}] Params: invoice='${invoice}', user_id='${user_id}', hasHeaderSecret=${Boolean(
      req.headers.get('x-cron-secret') || req.headers.get('x-submit-secret')
    )}, hasQuerySecret=${Boolean(url.searchParams.get('secret'))}`
  );

  const secret = headerSecret || querySecret || '';
  const expected =
    process.env.CRON_INGEST_SECRET || process.env.CRON_SUBMIT_SECRET;
  const whichExpected = process.env.CRON_INGEST_SECRET
    ? 'CRON_INGEST_SECRET'
    : process.env.CRON_SUBMIT_SECRET
    ? 'CRON_SUBMIT_SECRET'
    : 'NONE';
  const allowDevBypass = process.env.NODE_ENV !== 'production' && !expected;

  // Detailed auth diagnostics
  const mask = (v?: string | null) =>
    v
      ? `${String(v).slice(0, 3)}***${String(v).slice(-2)} (len:${
          String(v).length
        })`
      : 'null';
  console.log(
    `🔐 [promote:${requestId}] Auth check | expectedFrom=${whichExpected} | allowDevBypass=${allowDevBypass} | headerSecret=${Boolean(
      headerSecret
    )} | querySecret=${Boolean(querySecret)} | provided=${mask(
      secret
    )} | expected=${mask(expected)}`
  );

  if (!allowDevBypass) {
    if (!expected || secret !== expected) {
      console.warn(
        `🟡 [promote:${requestId}] Unauthorized: mismatch (provided != expected). Ensure ?secret matches ${whichExpected}`
      );
      return NextResponse.json(
        {
          error: 'Unauthorized',
          details: {
            reason: 'secret_mismatch',
            expectedFrom: whichExpected,
            hasExpected: Boolean(expected),
            hasHeaderSecret: Boolean(headerSecret),
            hasQuerySecret: Boolean(querySecret),
          },
        },
        { status: 401 }
      );
    }
  }

  if (!invoice) {
    return NextResponse.json({ error: 'Missing invoice' }, { status: 400 });
  }

  if (!user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Load the latest row per required type for this invoice from parsed_documents
  const required: DocType[] = ['invoice', 'eft_receipt', 'e-way-bill'];
  try {
    const { data, error } = await supa
      .from('parsed_documents')
      .select('id, document_type, file_url, created_at, raw_json, user_id')
      .in('document_type', required)
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Also get city from matched_records if available
    let matchedRecordCity: string | null = null;
    const { data: matchedData } = await supa
      .from('matched_records')
      .select('city')
      .eq('user_id', user_id)
      .eq('invoice_number', invoice)
      .single();

    if (matchedData?.city) {
      matchedRecordCity = matchedData.city;
      console.log(
        `🌍 [promote:${requestId}] Found city from matched_records: ${matchedRecordCity}`
      );
    }

    // Filter rows that match the invoice in raw_json (anchor_key or invoice or second/third invoice for EFT)
    type ParsedRow = {
      id: string;
      document_type: DocType;
      file_url: string | null;
      created_at: string;
      raw_json: Record<string, unknown>;
      user_id: string;
    };
    // Import the invoice matching utilities
    const { isSameInvoice } = await import('@/lib/invoiceUtils');

    const rows = (data || []).filter((row: ParsedRow) => {
      const rj = (row?.raw_json || {}) as Record<string, unknown>;
      const candidates: string[] = [];
      const ak = rj['anchor_key'];
      const inv = rj['invoice'];
      const s2 = rj['second_invoice'];
      const s3 = rj['third_invoice'];

      // Add all potential invoice numbers to candidates
      if (ak) candidates.push(String(ak));
      if (inv) candidates.push(String(inv));
      if (s2) candidates.push(String(s2));
      if (s3) candidates.push(String(s3));

      // Check if any candidate matches the target invoice using the same logic as frontend
      return candidates.some((candidate) =>
        isSameInvoice(candidate.trim(), invoice)
      );
    }) as Array<ParsedRow>;

    console.log(
      `🔵 [promote:${requestId}] Candidates fetched for user '${user_id}': ${
        (data || []).length
      }, matching invoice '${invoice}': ${rows.length}`
    );
    const latestByType = new Map<DocType, (typeof rows)[number]>();
    for (const t of required) {
      const r = rows.find((x) => x.document_type === t);
      if (r) latestByType.set(t, r);
    }

    console.log(
      `🔵 [promote:${requestId}] Document types found: ${Array.from(
        latestByType.keys()
      ).join(', ')}`
    );

    // Build payload for recycling_docs
    const invRow = latestByType.get('invoice');
    const eftRow = latestByType.get('eft_receipt');
    const ewbRow = latestByType.get('e-way-bill');

    // ========== EXTRACT COUNTRY AND RECYCLER COMPANY EARLY ==========
    const ewbJson = (ewbRow?.raw_json || {}) as Record<string, unknown>;
    const invJson = (invRow?.raw_json || {}) as Record<string, unknown>;

    const country = ((ewbJson['ship_to_country_code'] as string) || '')
      .toString()
      .trim()
      .toUpperCase();

    const recyclerCompany = (
      (invJson['bill_to_company_name'] as string) ||
      (ewbJson['ship_to_company_name'] as string) ||
      ''
    )
      .toString()
      .trim();

    // ========== APPLY BUSINESS RULES BASED ON RECYCLER TYPE ==========
    const isIndian = country === 'IN' && isIndianRecycler(recyclerCompany);

    let validationError = false;
    const present = required.filter((t) => latestByType.has(t));
    const missing = required.filter((t) => !present.includes(t));

    if (isIndian) {
      // Indian recyclers: Invoice + E-way Bill required, EFT optional
      if (!invRow || !ewbRow) {
        validationError = true;
        console.warn(
          `🟠 [promote:${requestId}] Incomplete Indian group for invoice='${invoice}' (recycler: ${recyclerCompany}). Present=${present.join(
            ','
          )} Missing=${missing.join(
            ','
          )}. Indian recyclers need Invoice + E-way Bill.`
        );
      } else {
        console.log(
          `🇮🇳 [promote:${requestId}] Valid Indian recycler group for invoice='${invoice}' (recycler: ${recyclerCompany}). Present=${present.join(
            ','
          )}${
            missing.length ? `, Missing=${missing.join(',')}` : ''
          }. EFT is optional for Indian recyclers.`
        );
      }
    } else {
      // Non-Indian recyclers: All 3 documents required
      if (!invRow || !eftRow || !ewbRow) {
        validationError = true;
        console.warn(
          `🟠 [promote:${requestId}] Incomplete non-Indian group for invoice='${invoice}' (recycler: ${recyclerCompany}, country: ${country}). Present=${present.join(
            ','
          )} Missing=${missing.join(
            ','
          )}. Non-Indian recyclers need all 3 documents.`
        );
      } else {
        console.log(
          `🌍 [promote:${requestId}] Valid non-Indian recycler group for invoice='${invoice}' (recycler: ${recyclerCompany}, country: ${country}). All 3 documents present.`
        );
      }
    }

    if (validationError) {
      return NextResponse.json(
        {
          error: 'Incomplete group',
          missing,
          present,
          isIndian,
          recyclerCompany,
          country,
          businessRule: isIndian
            ? 'Indian recyclers need Invoice + E-way Bill (EFT optional)'
            : 'Non-Indian recyclers need all 3 documents',
        },
        { status: 400 }
      );
    }

    // ========== USER OWNERSHIP CHECK ==========
    const allUserIds: string[] = [];
    if (invRow) allUserIds.push(invRow.user_id);
    if (ewbRow) allUserIds.push(ewbRow.user_id);
    if (eftRow) allUserIds.push(eftRow.user_id); // Only include EFT if present
    const uniqueUserIds = [...new Set(allUserIds)];

    if (uniqueUserIds.length > 1) {
      console.error(
        `🔴 [promote:${requestId}] Data integrity violation: Documents belong to different users`,
        { invoice, userIds: allUserIds }
      );
      return NextResponse.json(
        {
          error: 'Data integrity violation',
          details: 'Documents belong to different users',
          userIds: allUserIds,
        },
        { status: 400 }
      );
    }

    const documentUserId = uniqueUserIds[0];
    console.log(
      `🔐 [promote:${requestId}] All documents belong to user: ${documentUserId}`
    );

    const inv = (invRow?.raw_json || {}) as Record<string, unknown>;
    const eft = (eftRow?.raw_json || {}) as Record<string, unknown>;
    const ewb = (ewbRow?.raw_json || {}) as Record<string, unknown>;

    // Derive fields
    const invoice_url = invRow?.file_url || '';
    const eft_url = eftRow?.file_url || ''; // EFT might be missing for Indian recyclers
    const ewaybill_url = ewbRow?.file_url || '';

    // Use recycler_company already extracted (with fallback for additional sources)
    const final_recycler_company =
      recyclerCompany ||
      (
        ((inv['recipient'] as Record<string, unknown> | undefined)?.[
          'name'
        ] as string) ||
        ((
          (ewb['address_details'] as Record<string, unknown> | undefined)?.[
            'to'
          ] as Record<string, unknown> | undefined
        )?.['name'] as string) ||
        ''
      )
        .toString()
        .trim();

    const network_operator_company = (
      (inv['bill_from_company_name'] as string) ||
      ((inv['recipient'] as Record<string, unknown> | undefined)?.[
        'name'
      ] as string) ||
      (ewb['ship_from_company_name'] as string) ||
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

    // Use country already extracted
    const final_country = country;
    // Get city from matched_records (Gemini extraction) if available, fallback to old AI extraction
    const city = (
      matchedRecordCity ||
      (inv['city'] as string) ||
      (ewb['city'] as string) ||
      ''
    )
      .toString()
      .trim();

    const currency = eftRow
      ? (
          ((
            eft['transaction_details'] as Record<string, unknown> | undefined
          )?.['currency'] as string) || ''
        )
          .toString()
          .trim() || 'INR'
      : 'INR'; // Default to INR if no EFT (for Indian recyclers)
    const upload_date = new Date().toISOString().slice(0, 10);

    const upsertRow = {
      invoice_number: invoice,
      invoice_url,
      eft_url,
      ewaybill_url,
      recycler_company: final_recycler_company || 'Unknown',
      network_operator_company: network_operator_company || 'Unknown',
      plastic_type,
      tonnage_tons: tonnage_kg / 1000,
      weight_kg: tonnage_kg, // Fixed: use weight_kg instead of tonnage_kg
      origin: final_country,
      country: final_country,
      city,
      currency,
      upload_date,
      uploaded_by: 'ocean-integrity-ai',
      status: 'updated' as const,
      user_id: documentUserId, // 👈 ADD USER OWNERSHIP
    };

    const { error: upsertError } = await supa
      .from('recycling_docs')
      .upsert(upsertRow as unknown as Record<string, unknown>, {
        onConflict: 'invoice_number',
      });

    if (upsertError) throw upsertError;

    console.log(
      `✅ [promote:${requestId}] SUCCESS: Upserted recycling_docs for invoice='${invoice}' | user_id='${documentUserId}' | recycler='${final_recycler_company}' | plastic_type='${plastic_type}' | weight_kg=${tonnage_kg}`
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
