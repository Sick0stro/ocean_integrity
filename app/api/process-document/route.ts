// route.ts - Enhanced version with comprehensive diagnostics and logging
import { NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { getSupabaseAdmin, getSupabaseClient } from '@/utils/supabase';

// Diagnostics removed

export async function POST(req: Request) {
  const supabase = getSupabaseClient();
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);

  console.log(`🚀 [${requestId}] === DOCUMENT PROCESSING STARTED ===`);
  console.log(`⏰ [${requestId}] Timestamp: ${new Date().toISOString()}`);

  // Diagnostics removed from hot path for reliability

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

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`📄 [${requestId}] File received:`);
    console.log(`   📝 Name: ${file.name}`);
    console.log(`   📊 Size: ${fileSizeMB} MB`);
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

    // Check file size and warn if large
    if (file.size > 10 * 1024 * 1024) {
      // 10MB
      console.warn(`⚠️ [${requestId}] Large file detected: ${fileSizeMB} MB`);
    }

    // ========== STEP 2: CONVERT TO BASE64 ==========
    console.log(`🔄 [${requestId}] Step 2: Converting PDF to base64...`);
    const conversionStart = Date.now();

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

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
  "invoice": "string",// generate invoice from Agst Ref, exsample MAT/UP/12-30/054
  "second_invoice": "string",// generate second_invoice from Agst Ref, exsample MAT/UP/12-30/054, generate "second_invoice" only if its avelible.
  "third_invoice": "string",// generate third_invoice from Agst Ref, exsample MAT/UP/12-30/054, generate "third_invoice" only if its avelible.    
  "bank_name": "string",
  "etf_date": "string (dd/mm/yyyy)",
  "sender_name": "string",
}

**Template for \`invoice\`**
{
  "document_type": "invoice",
  "invoice": "string",// generate invoice from invoice #, like exsample MAT/UP/12-30/054 not like this exsample MAT-UP-12-30-054
  "invoice_date": "string (dd-mm-yyyy)",
  "bill_to_address": "string", 
  "bill_to_company_name": "string",
  "vehicle_number": "string",
  "weight": "number",// generate weight from Qty
  "weight_unit_of_mesurement": "string", // exsample KG
  "plastic_type": "string",// generate plastic type from items, exsample  PET, HDPE , PVC , LDPE , PP , PS , OTHER , MIXED , ALU , PAP , GLASS , PAPER , TP , TEX , TEXN , TEX 
}

**Template for \`e-way-bill\`**
{
  "document_type": "e-way-bill",
  "eway_bill_no": "string",
  "invoice": "string",// exsample MAT/UP/12-30/054 and do not add date (dd-mm-yyyy) and do not add Tax Invoice in the begining  
  "generated_date": "string (dd/mm/yyyy hh:mm pm/am)",
  "plastic_type": "string",// generate plastic type from product name and discription, exsample  PET, HDPE , PVC , LDPE , PP , PS , OTHER , MIXED , ALU , PAP , GLASS , PAPER , TP , TEX , TEXN , TEX 
  "weight": "number",
  "weight_unit_of_mesurement": "string", // exsample KG
  "mode": "string",
  "city": "string",// generate city from ship_to_address,
  "ship_to_address": "string", 
  "ship_to_company_name": "string",
  "ship_to_country_code": "string",// generate country code from ship to address, exsample IN,BR,US,CA,GB
  "vehicle_number": "string",
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

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`❌ [${requestId}] Gemini API Error:`, errorText);
      return NextResponse.json(
        { success: false, error: 'Gemini API Error', details: errorText },
        { status: 500 }
      );
    }

    // ========== STEP 6: PARSE GEMINI RESPONSE ==========
    console.log(`🔍 [${requestId}] Step 6: Parsing Gemini response...`);
    const geminiData = (await geminiResponse.json()) as {
      candidates: {
        content: {
          parts: { text: string }[];
        };
      }[];
    };

    let parsedResponse =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (parsedResponse) {
      parsedResponse = parsedResponse.replace(/^```json|^```|```$/g, '').trim();
    }

    // ========== STEP 7: PARSE JSON ==========
    console.log(`🔄 [${requestId}] Step 7: Parsing extracted JSON...`);
    let parsedJSON = null;

    try {
      parsedJSON = JSON.parse(parsedResponse ?? '');
      console.log(`✅ [${requestId}] JSON parsing successful!`);
      console.log(
        `📊 [${requestId}] Document type: ${parsedJSON.document_type}`
      );
    } catch (parseError) {
      console.error(`❌ [${requestId}] JSON parsing failed!`, parseError);
      return NextResponse.json(
        { success: false, error: 'JSON parsing failed!', raw: parsedResponse },
        { status: 500 }
      );
    }

    // ========== STEP 8: STORAGE STRATEGY BASED ON FILE SIZE ==========
    console.log(`☁️ [${requestId}] Step 8: Determining storage strategy...`);
    const uploadStart = Date.now();

    let storageResult = {
      success: false,
      publicUrl: null as string | null,
      storageType: 'none' as 'storage' | 'database' | 'hybrid' | 'none',
      databaseId: null as string | null,
    };

    // Add timestamp to prevent duplicate file conflicts
    const timestamp = Date.now();

    // ENHANCED STORAGE WITH MULTIPLE UPLOAD METHODS AND COMPREHENSIVE LOGGING
    console.log(
      `📤 [${requestId}] Testing multiple upload methods for Supabase Storage (${fileSizeMB} MB)`
    );

    // Prepare different data formats to test (ordered by reliability based on logs)
    const uploadFormats = [
      {
        name: 'ArrayBuffer (Reliable)',
        data: arrayBuffer,
        options: { contentType: 'application/pdf', upsert: true },
      },
      {
        name: 'File Object',
        data: file,
        options: { contentType: 'application/pdf', upsert: true },
      },
      {
        name: 'Buffer',
        data: Buffer.from(arrayBuffer),
        options: { contentType: 'application/pdf', upsert: true },
      },
      {
        name: 'Blob',
        data: new Blob([arrayBuffer], { type: 'application/pdf' }),
        options: { contentType: 'application/pdf', upsert: true },
      },
      {
        name: 'ArrayBuffer (With Duplex)',
        data: arrayBuffer,
        options: {
          contentType: 'application/pdf',
          upsert: true,
          duplex: 'half' as const,
        },
      },
    ];

    // Try with admin client as well
    const adminClient = getSupabaseAdmin();
    const clients = [
      { name: 'Anon Client', client: supabase },
      { name: 'Admin Client', client: adminClient },
    ];

    let uploadError = null as unknown;
    let successfulMethod = null;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const maxRetriesPerAttempt = 3;

    // Test each client with each upload format
    for (const clientTest of clients) {
      if (storageResult.success) break; // Exit if we already succeeded

      console.log(`🔄 [${requestId}] Testing ${clientTest.name}...`);

      for (
        let formatIndex = 0;
        formatIndex < uploadFormats.length;
        formatIndex++
      ) {
        if (storageResult.success) break; // Exit if we already succeeded

        const format = uploadFormats[formatIndex];
        const currentFilePath = `documents/${timestamp}-${formatIndex}-${file.name}`;

        console.log(
          `   🧪 [${requestId}] Method ${formatIndex + 1}/${
            uploadFormats.length
          }: ${format.name}`
        );
        console.log(`   📋 [${requestId}] Options:`, format.options);
        console.log(`   📊 [${requestId}] Data type:`, typeof format.data);
        console.log(
          `   📏 [${requestId}] Data size:`,
          format.data instanceof File
            ? format.data.size
            : format.data instanceof ArrayBuffer
            ? format.data.byteLength
            : format.data instanceof Buffer
            ? format.data.length
            : format.data instanceof Blob
            ? format.data.size
            : 'unknown'
        );

        try {
          let attempt = 0;
          while (attempt < maxRetriesPerAttempt && !storageResult.success) {
            try {
              const uploadStart = Date.now();
              const { error, data: uploadData } =
                await clientTest.client.storage
                  .from('documents')
                  .upload(currentFilePath, format.data, format.options);
              const uploadDuration = Date.now() - uploadStart;
              console.log(
                `   ⏱️ [${requestId}] Upload attempt ${
                  attempt + 1
                } took ${uploadDuration}ms`
              );

              if (!error) {
                console.log(
                  `   ✅ [${requestId}] SUCCESS with ${clientTest.name} + ${format.name}!`
                );
                console.log(`   📄 [${requestId}] Upload result:`, uploadData);
                const { data: urlData } = clientTest.client.storage
                  .from('documents')
                  .getPublicUrl(currentFilePath);
                console.log(
                  `   🔗 [${requestId}] Public URL generated:`,
                  urlData.publicUrl
                );
                storageResult = {
                  success: true,
                  publicUrl: urlData.publicUrl,
                  storageType: 'storage',
                  databaseId: null,
                };
                successfulMethod = `${clientTest.name} + ${format.name}`;
                break;
              }

              uploadError = error;
              console.error(
                `   ❌ [${requestId}] ${clientTest.name} + ${format.name} failed: ${error?.message}`
              );
            } catch (e) {
              uploadError = e;
              console.error(
                `   💥 [${requestId}] ${clientTest.name} + ${format.name} exception:`,
                (e as Error).message
              );
            }

            attempt += 1;
            const backoff =
              Math.min(1500, 300 * attempt) + Math.floor(Math.random() * 200);
            console.log(`   🔁 [${requestId}] Retrying in ${backoff}ms...`);
            await sleep(backoff);
          }
        } catch (loopErr) {
          uploadError = loopErr;
        }
      }
    }

    if (storageResult.success) {
      console.log(
        `🎉 [${requestId}] Upload successful using: ${successfulMethod}`
      );
    }

    // If all storage attempts failed, try a final signed-url fallback
    if (!storageResult.success) {
      console.warn(`🟠 [${requestId}] Falling back to signed upload url...`);
      try {
        const admin = getSupabaseAdmin();
        const signedPath = `documents/${timestamp}-signed-${file.name}`;
        let signedAttempt = 0;
        while (!storageResult.success && signedAttempt < maxRetriesPerAttempt) {
          const { data: signed, error: signErr } = await admin.storage
            .from('documents')
            .createSignedUploadUrl(signedPath);
          if (signErr || !signed?.signedUrl) {
            uploadError = signErr || new Error('createSignedUploadUrl failed');
            signedAttempt += 1;
            await sleep(300 * (signedAttempt + 1));
            continue;
          }
          const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
          const { error: uploadSignedErr } = await admin.storage
            .from('documents')
            .uploadToSignedUrl(signedPath, signed.signedUrl, blob, {
              contentType: 'application/pdf',
              upsert: true,
              cacheControl: '3600',
              duplex: 'half'
            });
          if (!uploadSignedErr) {
            const { data: urlData } = admin.storage
              .from('documents')
              .getPublicUrl(signedPath);
            storageResult = {
              success: true,
              publicUrl: urlData.publicUrl,
              storageType: 'storage',
              databaseId: null,
            };
            successfulMethod = `Admin + SignedUrl`;
            console.log(`🟢 [${requestId}] Signed upload succeeded`);
          } else {
            uploadError = uploadSignedErr;
            signedAttempt += 1;
            const backoff = 400 * signedAttempt;
            console.log(
              `   🔁 [${requestId}] Signed upload retry in ${backoff}ms...`
            );
            await sleep(backoff);
          }
        }
      } catch (signedEx) {
        uploadError = signedEx;
      }

      // If still failed after fallback, mark as none
      if (!storageResult.success) {
        console.error(
          `❌ [${requestId}] ALL STORAGE ATTEMPTS FAILED! File will not have URL`
        );
        console.error(`📝 [${requestId}] Final error:`, uploadError);
        storageResult = {
          success: false,
          publicUrl: null,
          storageType: 'none',
          databaseId: null,
        };
        if (uploadError && typeof uploadError === 'object') {
          const errorObj = uploadError as {
            originalError?: { cause?: { code?: string } };
          };
          if (errorObj.originalError?.cause?.code === 'UND_ERR_SOCKET') {
            console.error(
              `🔌 [${requestId}] Socket error detected - network connection dropped`
            );
          }
        }
      }
    }

    const uploadTime = Date.now() - uploadStart;

    // ========== STEP 9: SAVE AI RESULT TO DB (parsed_documents) ==========
    console.log(
      `🗄️ [${requestId}] Step 9: Saving parsed result to database...`
    );

    try {
      const db = getSupabaseAdmin();
      // Align with existing schema: anchor_key, document_type, raw_json, file_url
      const anchorKey =
        (parsedJSON?.anchor_key || parsedJSON?.invoice || '')
          .toString()
          .trim() || null;
      // Only insert when storage succeeded to keep strict consistency
      if (!storageResult.success || !storageResult.publicUrl) {
        console.warn(
          `⚠️ [${requestId}] Skipping DB insert due to storage failure`
        );
      } else {
        const insertPayload = {
          anchor_key: anchorKey,
          document_type: parsedJSON?.document_type ?? null,
          raw_json: parsedJSON ?? null,
          file_url: storageResult.publicUrl,
        } as const;

        const { error: insertError } = await db
          .from('parsed_documents')
          .insert(insertPayload);

        if (insertError) {
          console.warn(
            `⚠️ [${requestId}] Failed to insert into parsed_documents:`,
            insertError
          );
        } else {
          console.log(
            `✅ [${requestId}] Saved parsed document to parsed_documents`
          );
        }
      }
    } catch (e) {
      console.warn(
        `⚠️ [${requestId}] Exception while inserting into parsed_documents:`,
        e
      );
    }

    // ========== SUCCESS RESPONSE ==========
    const totalTime = Date.now() - startTime;
    console.log(`🎉 [${requestId}] === PROCESSING COMPLETED ===`);
    console.log(`⏰ [${requestId}] Total processing time: ${totalTime}ms`);
    console.log(`📊 [${requestId}] Performance breakdown:`);
    console.log(`   🔄 Base64 conversion: ${conversionTime}ms`);
    console.log(`   🤖 Gemini API call: ${geminiTime}ms`);
    console.log(`   ☁️ Storage operation: ${uploadTime}ms`);
    console.log(`   📦 Storage type: ${storageResult.storageType}`);
    console.log(`   ✅ Storage success: ${storageResult.success}`);
    console.log(
      `   🔗 File URL: ${storageResult.publicUrl || 'None (using database)'}`
    );
    console.log(
      `   🆔 Database ID: ${storageResult.databaseId || 'None (using storage)'}`
    );

    // Ensure we're returning the correct response structure
    // Success should only be true if BOTH AI processing AND storage succeeded
    const response = {
      success: storageResult.success, // Changed from hardcoded 'true' to actual storage result
      data: parsedJSON,
      fileUrl: storageResult.publicUrl,
      storageType: storageResult.storageType,
      databaseId: storageResult.databaseId,
      uploadSuccess: storageResult.success,
      error: !storageResult.success
        ? `Storage failed: All upload attempts failed. ${
            (uploadError as { message?: string })?.message ||
            'Network connectivity issue'
          }`
        : undefined,
      meta: {
        requestId,
        processingTime: totalTime,
        fileSize: file.size,
        fileSizeMB: parseFloat(fileSizeMB),
        fileName: file.name,
        storageStrategy: storageResult.storageType,
      },
    };

    console.log(`📤 [${requestId}] Sending response:`, {
      success: response.success,
      fileUrl: response.fileUrl,
      databaseId: response.databaseId,
      storageType: response.storageType,
      error: response.error,
    });

    // Log warning if storage failed
    if (!storageResult.success) {
      console.warn(
        `⚠️ [${requestId}] WARNING: Returning failure response due to storage error`
      );
      console.warn(
        `⚠️ [${requestId}] AI processing succeeded but file storage failed`
      );
    }

    // Return 500 if storage failed to signal the UI to retry
    return NextResponse.json(response, {
      status: storageResult.success ? 200 : 500,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`💥 [${requestId}] === PROCESSING FAILED ===`);
    console.error(`❌ [${requestId}] Error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: 'Server Error',
        details: String(error),
        meta: {
          requestId,
          processingTime: totalTime,
        },
      },
      { status: 500 }
    );
  }
}

// ============ SEPARATE ENDPOINT TO RETRIEVE FILES FROM DATABASE ============
export async function GET(req: Request) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(req.url);
  const databaseId = searchParams.get('id');

  if (!databaseId) {
    return NextResponse.json(
      { error: 'Database ID required' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('document_storage')
      .select('file_base64, file_name, extracted_data')
      .eq('id', databaseId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Return base64 data for frontend to display
    return NextResponse.json({
      success: true,
      fileName: data.file_name,
      fileData: data.file_base64,
      extractedData: data.extracted_data,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to retrieve document' },
      { status: 500 }
    );
  }
}
