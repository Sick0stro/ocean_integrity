import { NextResponse } from 'next/server';
import fetch from 'node-fetch';

export async function POST(req: Request) {
  try {
    // Extract form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No PDF file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'Invalid file format. PDF only' }, { status: 400 });
    }

    // Read the PDF file into base64
    const arrayBuffer = await file.arrayBuffer();
    // Use Buffer from globalThis for compatibility
    const base64 = (globalThis.Buffer || Buffer).from(arrayBuffer).toString('base64');

    // Your Gemini API key
    const API_KEY = process.env.GOOGLE_API_KEY;

    console.log("API KEY:", process.env.GOOGLE_API_KEY);

    if (!API_KEY) {
      return NextResponse.json({ success: false, error: 'GOOGLE_API_KEY is not set' }, { status: 500 });
    }

    // The custom Gemini prompt
    const PROMPT = `
You are an expert document processing AI. Your task is to analyze the provided document, identify its type, and extract the data into a precise JSON format.

**Instructions:**

1.  **Classify Document:** Determine if the document is an \`invoice\`, \`eft_receipt\`, or \`e-way-bill\`.
2.  **Extract Data:** Populate the corresponding JSON template with data extracted from the document.
3.  **Strict Formatting:**
    * Use the exact field names and data types from the templates.
    * If a field's value is not found in the document, you **MUST** use \`null\`.
    * Your output **MUST** be only the JSON object. Do not include any extra text, explanations, or markdown formatting like \`\`\`json.

---
**JSON TEMPLATES**

**Template for \`eft_receipt\`**
{
  "document_type": "eft_receipt",
  "bank_name": "string",
  "document_title": "string",
  "transaction_details": {
    "transaction_date_time": "string (dd/mm/yyyy hh:mm:ss)",
    "value_date": "string (dd/mm/yyyy)",
    "amount": "number",
    "currency": "string",
    "payment_type": "string",
    "description": "string"
  },
  "sender_details": { "name": "string", "bank": "string", "branch": "string" },
  "recipient_details": { "name": "string", "customer_no": "string", "account_no": "string", "iban": "string" },
  "reference_numbers": { "inquiry_no": "string", "transaction_ref": "string", "document_no": "string", "ettn": "string" }
}

**Template for \`invoice\`**
{
  "document_type": "invoice",
  "invoice_title": "string",
  "irn": "string",
  "ack_no": "string",
  "ack_date": "string (dd-mm-yyyy)",
  "document_no": "string",
  "document_date": "string (dd/mm/yyyy)",
  "supplier": { "name": "string", "gstin": "string", "address": "string", "phone": "string" },
  "recipient": { "name": "string", "gstin": "string", "address": "string" },
  "items": [
    {
      "sino": "number",
      "product_description": "string",
      "hsn_code": "string",
      "quantity": "number",
      "uqc": "string",
      "unit_price": "number",
      "discount": "number",
      "taxable_amount": "number",
      "total": "number"
    }
  ],
  "total_summary": {
    "taxable_amount": "number",
    "cgst_amount": "number",
    "sgst_amount": "number",
    "igst_amount": "number",
    "total_invoice_amount": "number"
  }
}

**Template for \`e-way-bill\`**
{
  "document_type": "e-way-bill",
  "eway_bill_no": "string",
  "generated_date": "string (dd/mm/yyyy hh:mm pm/am)",
  "generated_by": "string",
  "valid_upto": "string (dd/mm/yyyy)",
  "mode": "string",
  "approx_distance": "string",
  "address_details": {
    "from": { "gstin": "string", "name": "string", "address": "string" },
    "to": { "gstin": "string", "name": "string", "address": "string" },
    "ship_to": { "gstin": "string", "name": "string", "address": "string" }
  }
}
---`;

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "application/pdf", data: base64 } },
                { text: PROMPT }
              ],
            },
          ],
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(errorText);
      return NextResponse.json({ success: false, error: 'Gemini API Error', details: errorText }, { status: 500 });
    }

    const geminiData = await geminiResponse.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    // Extract parsed response
    let parsedResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    // Remove code block markers if present
    if (parsedResponse) {
      parsedResponse = parsedResponse.replace(/^```json|^```|```$/g, '').trim();
    }

    let parsedJSON = null;

    try {
      parsedJSON = JSON.parse(parsedResponse ?? '');
    } catch {
      console.error('JSON parsing failed!', parsedResponse);
      return NextResponse.json({ success: false, error: 'JSON parsing failed!', raw: parsedResponse }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: parsedJSON });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Server Error', details: String(error) }, { status: 500 });
  }
}

