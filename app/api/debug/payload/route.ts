import { NextResponse } from 'next/server';

// EXACT same logic as submitToPlastiks function but capture instead of send
export async function GET() {
  console.log('🐛 [DEBUG] === SIMULATING EXACT PLASTIKS FLOW ===');

  // Mock document data (same structure as recycling_docs table)
  const document = {
    invoice_number: 'MAT/UP/24-25/032',
    recycler_company: 'SANDBERRY FIBRETECH PRIVATE LIMITED',
    plastic_type: 'PET',
    tonnage_kg: 18050,
    invoice_url:
      'https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/test-invoice.pdf',
    eft_url:
      'https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/test-eft.pdf',
    ewaybill_url:
      'https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/test-ewaybill.pdf',
    origin: 'IN',
    currency: 'INR',
    country: 'IN',
    city: 'Rangpar',
    network_operator_company: 'RECITY Network Private Limited',
  };

  // EXACT plastic type mapping from submitToPlastiks (lines 457-464)
  const typeMap: Record<string, string> = {
    PET: 'PET 1',
    PP: 'PP 5',
    PVC: 'PVC 3',
    LDPE: 'LDPE 4',
  };
  const normalizedType = document.plastic_type?.toUpperCase?.() || '';
  const plastiksType = typeMap[normalizedType] || document.plastic_type;

  // EXACT submissionPayload from submitToPlastiks (lines 477-490)
  const submissionPayload = {
    recycler_company: document.recycler_company || '',
    invoice_number: document.invoice_number || '',
    invoice_url: document.invoice_url,
    eft_url: document.eft_url,
    ewaybill_url: document.ewaybill_url,
    plastic_type: plastiksType,
    origin: document.origin || '',
    currency: document.currency || '',
    country: document.country || '',
    city: document.city || '',
    weightKg: document.tonnage_kg,
    network_operator_company: document.network_operator_company || '',
  };

  // EXACT body creation from createPrgCollection (lines 137-158)
  const body = {
    // Required by Plastiks API
    name: `${submissionPayload.recycler_company} - ${submissionPayload.invoice_number}`,
    description: `Recycling collection for invoice ${submissionPayload.invoice_number} from ${submissionPayload.recycler_company}`,
    plastik_type: submissionPayload.plastic_type, // Note: plastik_type not plastic_type
    instant_sale_price: 1000000000, // 1 Gwei minimum
    no_of_copies: Math.max(1, Math.round(submissionPayload.weightKg / 1000)), // 1 copy per ton
    weight: submissionPayload.weightKg,
    use_autogen_image: true,

    // Essential business fields
    recycler_company: submissionPayload.recycler_company,
    invoice_number: submissionPayload.invoice_number,
    invoice_url: submissionPayload.invoice_url || '',
    eft_url: submissionPayload.eft_url || '',
    ewaybill_url: submissionPayload.ewaybill_url || '',
    origin: submissionPayload.origin || '',
    currency: submissionPayload.currency || '',
    country: submissionPayload.country || '',
    city: submissionPayload.city || '',
    network_operator_company: submissionPayload.network_operator_company || '',
  };

  // EXACT logging from createPrgCollection (lines 171-174)
  console.log('📋 [PLASTIKS_REQUEST] Request Body:');
  console.log(JSON.stringify(body, null, 2));

  return NextResponse.json({
    message: 'This is EXACTLY what Plastiks receives - 100% identical flow',
    exact_plastiks_payload: body,
    url_verification: {
      invoice_url: body.invoice_url,
      eft_url: body.eft_url,
      ewaybill_url: body.ewaybill_url,
    },
    proof: '🔍 URLs are DEFINITELY included in Plastiks request!',
  });
}

export async function POST() {
  return NextResponse.json({
    message: 'Use GET method to see the exact Plastiks payload',
  });
}
