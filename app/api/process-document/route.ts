import { NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { getSupabaseClient } from '@/utils/supabase';

export async function POST(req: Request) {
  const supabase = getSupabaseClient();
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);

  console.log(`🚀 [${requestId}] === DOCUMENT PROCESSING STARTED ===`);
  console.log(`⏰ [${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    // ========== STEP 1: EXTRACT & VALIDATE FILE ==========
    console.log(`📁 [${requestId}] Step 1: Extracting form data...`);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      console.error(`❌ [${requestId}] ERROR: No PDF file provided`);
      return NextResponse.json(
        { success: false, error: 'No PDF file provided' },
        { status: 400 }
      );
    }

    console.log(`📄 [${requestId}] File received:`);
    console.log(`   📝 Name: ${file.name}`);
    console.log(`   📊 Size: ${(file.size / 1024).toFixed(2)} KB`);
    console.log(`   🔖 Type: ${file.type}`);

    if (file.type !== 'application/pdf') {
      console.error(
        `❌ [${requestId}] ERROR: Invalid file type - ${file.type}`
      );
      return NextResponse.json(
        { success: false, error: 'Invalid file format. PDF only' },
        { status: 400 }
      );
    }

    // ========== STEP 2: CONVERT TO BASE64 ==========
    console.log(`🔄 [${requestId}] Step 2: Converting PDF to base64...`);
    const conversionStart = Date.now();

    const arrayBuffer = await file.arrayBuffer();
    const base64 = (globalThis.Buffer || Buffer)
      .from(arrayBuffer)
      .toString('base64');

    const conversionTime = Date.now() - conversionStart;
    console.log(
      `✅ [${requestId}] Base64 conversion completed in ${conversionTime}ms`
    );
    console.log(`📏 [${requestId}] Base64 length: ${base64.length} characters`);

    // ========== STEP 3: VALIDATE API KEY ==========
    console.log(`🔑 [${requestId}] Step 3: Validating Gemini API key...`);
    const API_KEY = process.env.GOOGLE_API_KEY;

    if (!API_KEY) {
      console.error(
        `❌ [${requestId}] ERROR: GOOGLE_API_KEY environment variable not set`
      );
      return NextResponse.json(
        { success: false, error: 'GOOGLE_API_KEY is not set' },
        { status: 500 }
      );
    }

    console.log(
      `✅ [${requestId}] API key validated (length: ${API_KEY.length})`
    );

    // ========== STEP 4: PREPARE GEMINI REQUEST ==========
    console.log(`🤖 [${requestId}] Step 4: Preparing Gemini AI request...`);
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
  "sender_details": { "name": "string", "agst_ref": "string",},
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
  "document_details": "string",
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

    const geminiPayload = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: base64 } },
            { text: PROMPT },
          ],
        },
      ],
    };

    console.log(`📦 [${requestId}] Gemini request payload prepared:`);
    console.log(`   🎯 Model: gemini-2.5-flash`);
    console.log(`   📄 Document: ${file.name}`);
    console.log(`   💬 Prompt length: ${PROMPT.length} characters`);

    // ========== STEP 5: CALL GEMINI API ==========
    console.log(`🌐 [${requestId}] Step 5: Calling Gemini API...`);
    const geminiStart = Date.now();

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      }
    );

    const geminiTime = Date.now() - geminiStart;
    console.log(
      `⏱️ [${requestId}] Gemini API call completed in ${geminiTime}ms`
    );
    console.log(
      `📊 [${requestId}] Response status: ${geminiResponse.status} ${geminiResponse.statusText}`
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`❌ [${requestId}] Gemini API Error:`);
      console.error(`   Status: ${geminiResponse.status}`);
      console.error(`   Response: ${errorText}`);
      return NextResponse.json(
        { success: false, error: 'Gemini API Error', details: errorText },
        { status: 500 }
      );
    }

    // ========== STEP 6: PARSE GEMINI RESPONSE ==========
    console.log(`🔍 [${requestId}] Step 6: Parsing Gemini response...`);
    const geminiData = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    console.log(`📋 [${requestId}] Raw Gemini response structure:`);
    console.log(`   Candidates count: ${geminiData.candidates?.length || 0}`);

    let parsedResponse =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (parsedResponse) {
      console.log(
        `📝 [${requestId}] Raw AI response (first 200 chars): ${parsedResponse.substring(
          0,
          200
        )}...`
      );

      // Remove code block markers if present
      const originalLength = parsedResponse.length;
      parsedResponse = parsedResponse.replace(/^```json|^```|```$/g, '').trim();

      if (parsedResponse.length !== originalLength) {
        console.log(
          `🧹 [${requestId}] Cleaned code block markers from response`
        );
      }
    }

    // ========== STEP 7: PARSE JSON ==========
    console.log(`🔄 [${requestId}] Step 7: Parsing extracted JSON...`);
    let parsedJSON = null;

    try {
      parsedJSON = JSON.parse(parsedResponse ?? '');
      console.log(`✅ [${requestId}] JSON parsing successful!`);
      console.log(`📊 [${requestId}] Extracted document details:`);
      console.log(`   📋 Document type: ${parsedJSON.document_type}`);
      console.log(
        `   📄 Title/Name: ${
          parsedJSON.document_title ||
          parsedJSON.invoice_title ||
          parsedJSON.document_details ||
          'N/A'
        }`
      );

      // Log key extracted fields based on document type
      if (parsedJSON.document_type === 'invoice' && parsedJSON.total_summary) {
        console.log(
          `   💰 Total amount: ${parsedJSON.total_summary.total_invoice_amount}`
        );
        console.log(`   🏢 Supplier: ${parsedJSON.supplier?.name || 'N/A'}`);
      } else if (
        parsedJSON.document_type === 'eft_receipt' &&
        parsedJSON.transaction_details
      ) {
        console.log(`   💰 Amount: ${parsedJSON.transaction_details.amount}`);
        console.log(`   🏦 Bank: ${parsedJSON.bank_name || 'N/A'}`);
      } else if (parsedJSON.document_type === 'e-way-bill') {
        console.log(`   🚛 E-way Bill No: ${parsedJSON.eway_bill_no || 'N/A'}`);
        console.log(
          `   📍 From: ${parsedJSON.address_details?.from?.name || 'N/A'}`
        );
      }
    } catch (parseError) {
      console.error(`❌ [${requestId}] JSON parsing failed!`);
      console.error(`   Error: ${parseError}`);
      console.error(`   Raw response: ${parsedResponse}`);
      return NextResponse.json(
        { success: false, error: 'JSON parsing failed!', raw: parsedResponse },
        { status: 500 }
      );
    }

    // ========== STEP 8: UPLOAD TO SUPABASE ==========
    console.log(`☁️ [${requestId}] Step 8: Uploading file to Supabase...`);
    const uploadStart = Date.now();

    const filePath = `documents/${file.name}`;
    console.log(`📁 [${requestId}] Upload path: ${filePath}`);

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    const uploadTime = Date.now() - uploadStart;

    if (uploadError) {
      console.error(`❌ [${requestId}] Supabase upload failed:`);
      console.error(`   Error: ${uploadError.message}`);
      console.error(`   Details:`, uploadError);
      return NextResponse.json(
        { success: false, error: 'Failed to upload file to Supabase' },
        { status: 500 }
      );
    }

    console.log(
      `✅ [${requestId}] File uploaded successfully in ${uploadTime}ms`
    );

    // ========== STEP 9: GET PUBLIC URL ==========
    console.log(`🔗 [${requestId}] Step 9: Generating public URL...`);
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);
    console.log(`🌐 [${requestId}] Public URL generated: ${urlData.publicUrl}`);

    // ========== SUCCESS RESPONSE ==========
    const totalTime = Date.now() - startTime;
    console.log(`🎉 [${requestId}] === PROCESSING COMPLETED SUCCESSFULLY ===`);
    console.log(`⏰ [${requestId}] Total processing time: ${totalTime}ms`);
    console.log(`📊 [${requestId}] Performance breakdown:`);
    console.log(`   🔄 Base64 conversion: ${conversionTime}ms`);
    console.log(`   🤖 Gemini API call: ${geminiTime}ms`);
    console.log(`   ☁️ Supabase upload: ${uploadTime}ms`);
    console.log(
      `   ⚡ Other operations: ${
        totalTime - conversionTime - geminiTime - uploadTime
      }ms`
    );

    return NextResponse.json({
      success: true,
      data: parsedJSON,
      fileUrl: urlData.publicUrl,
      meta: {
        requestId,
        processingTime: totalTime,
        fileSize: file.size,
        fileName: file.name,
      },
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`💥 [${requestId}] === PROCESSING FAILED ===`);
    console.error(`⏰ [${requestId}] Failed after: ${totalTime}ms`);
    console.error(`❌ [${requestId}] Error:`, error);
    console.error(`📍 [${requestId}] Stack trace:`, (error as Error).stack);

    return NextResponse.json(
      {
        success: false,
        error: 'Server Error',
        details: String(error),
        meta: {
          requestId,
          processingTime: totalTime,
          failedAt: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }
}
