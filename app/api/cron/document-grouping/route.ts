// Backend Document Grouping Service
// Processes parsed_documents and applies country-specific business rules
// Called immediately after AI processing completes

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// Types
type DocumentType = 'invoice' | 'eft_receipt' | 'e-way-bill';

interface ParsedDocument {
  id: string;
  user_id: string;
  document_type: DocumentType;
  raw_json: Record<string, unknown>;
  anchor_key: string;
  file_url: string | null;
  created_at: string;
}

interface BusinessRule {
  rule_name: string;
  required_documents: string[];
  optional_documents: string[];
  minimum_required: number;
}

// Removed unused DocumentGroup interface

interface GroupingResult {
  groups_processed: number;
  groups_created: number;
  groups_updated: number;
  rules_applied: Record<string, number>;
  errors: string[];
  processing_time_ms: number;
  details: Array<{
    invoice: string;
    country: string | null;
    rule_applied: string;
    completion: string;
    status: 'created' | 'updated' | 'error';
  }>;
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();

  console.log(
    `🚀 [grouping:${requestId}] ========================================`
  );
  console.log(
    `🚀 [grouping:${requestId}] BACKEND DOCUMENT GROUPING SERVICE STARTED`
  );
  console.log(
    `🚀 [grouping:${requestId}] ========================================`
  );
  console.log(
    `⏰ [grouping:${requestId}] Start time: ${new Date().toISOString()}`
  );

  try {
    // ========== AUTHENTICATION & REQUEST PARSING ==========
    const authResult = await authenticateRequest(req, requestId);
    if (!authResult.success) {
      return authResult.response;
    }

    const { user_id, trigger_source } = authResult.data!;
    console.log(`🔐 [grouping:${requestId}] Authenticated user: ${user_id}`);
    console.log(`📍 [grouping:${requestId}] Trigger source: ${trigger_source}`);

    const supabase = getSupabaseAdmin();

    // ========== FETCH PARSED DOCUMENTS ==========
    console.log(
      `📊 [grouping:${requestId}] Fetching parsed documents for processing...`
    );

    const { data: parsedDocs, error: fetchError } = await supabase
      .from('parsed_documents')
      .select(
        'id, user_id, document_type, raw_json, anchor_key, file_url, created_at'
      )
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error(
        `❌ [grouping:${requestId}] Failed to fetch parsed documents:`,
        fetchError
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch parsed documents',
          details: fetchError.message,
        },
        { status: 500 }
      );
    }

    console.log(
      `📊 [grouping:${requestId}] Found ${
        parsedDocs?.length || 0
      } parsed documents`
    );

    if (!parsedDocs || parsedDocs.length === 0) {
      console.log(
        `ℹ️ [grouping:${requestId}] No parsed documents to process - exiting normally`
      );
      return NextResponse.json({
        success: true,
        message: 'No documents to process',
        groups_processed: 0,
      });
    }

    // ========== GROUP DOCUMENTS BY INVOICE ==========
    console.log(
      `🔄 [grouping:${requestId}] Grouping documents by invoice number...`
    );
    const documentGroups = await groupDocumentsByInvoice(parsedDocs, requestId);

    console.log(
      `📊 [grouping:${requestId}] Created ${
        Object.keys(documentGroups).length
      } invoice groups`
    );
    Object.entries(documentGroups).forEach(([invoice, docs]) => {
      console.log(
        `   📄 [grouping:${requestId}] Invoice "${invoice}": ${
          docs.length
        } documents (${docs.map((d) => d.document_type).join(', ')})`
      );
    });

    // ========== APPLY BUSINESS RULES TO EACH GROUP ==========
    console.log(
      `🔧 [grouping:${requestId}] Applying business rules to each group...`
    );
    const results: GroupingResult = {
      groups_processed: 0,
      groups_created: 0,
      groups_updated: 0,
      rules_applied: {},
      errors: [],
      processing_time_ms: 0,
      details: [],
    };

    for (const [invoiceNumber, documents] of Object.entries(documentGroups)) {
      try {
        console.log(
          `🎯 [grouping:${requestId}] Processing group: ${invoiceNumber}`
        );

        const groupResult = await processDocumentGroup(
          invoiceNumber,
          documents,
          user_id,
          requestId,
          supabase
        );

        results.groups_processed++;
        if (groupResult.created) results.groups_created++;
        if (groupResult.updated) results.groups_updated++;

        if (!results.rules_applied[groupResult.rule_applied]) {
          results.rules_applied[groupResult.rule_applied] = 0;
        }
        results.rules_applied[groupResult.rule_applied]++;

        results.details.push({
          invoice: invoiceNumber,
          country: groupResult.country,
          rule_applied: groupResult.rule_applied,
          completion: `${groupResult.completion_count}/${groupResult.minimum_required}`,
          status: groupResult.created ? 'created' : 'updated',
        });

        console.log(
          `✅ [grouping:${requestId}] Group "${invoiceNumber}" processed successfully`
        );
      } catch (error) {
        console.error(
          `❌ [grouping:${requestId}] Error processing group "${invoiceNumber}":`,
          error
        );
        results.errors.push(
          `${invoiceNumber}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );

        results.details.push({
          invoice: invoiceNumber,
          country: null,
          rule_applied: 'error',
          completion: 'error',
          status: 'error',
        });
      }
    }

    // ========== FINAL RESULTS ==========
    results.processing_time_ms = Date.now() - startTime;

    console.log(
      `🎉 [grouping:${requestId}] ========================================`
    );
    console.log(
      `🎉 [grouping:${requestId}] DOCUMENT GROUPING COMPLETED SUCCESSFULLY`
    );
    console.log(
      `🎉 [grouping:${requestId}] ========================================`
    );
    console.log(`📊 [grouping:${requestId}] PROCESSING SUMMARY:`);
    console.log(`   📈 Total groups processed: ${results.groups_processed}`);
    console.log(`   ✨ New groups created: ${results.groups_created}`);
    console.log(`   🔄 Groups updated: ${results.groups_updated}`);
    console.log(`   ⏱️ Processing time: ${results.processing_time_ms}ms`);
    console.log(`   🚨 Errors: ${results.errors.length}`);

    console.log(`🔧 [grouping:${requestId}] BUSINESS RULES APPLIED:`);
    Object.entries(results.rules_applied).forEach(([rule, count]) => {
      console.log(`   📋 ${rule}: ${count} groups`);
    });

    if (results.errors.length > 0) {
      console.log(`❌ [grouping:${requestId}] ERRORS ENCOUNTERED:`);
      results.errors.forEach((error) => console.log(`   🚨 ${error}`));
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.groups_processed} document groups`,
      ...results,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(
      `💥 [grouping:${requestId}] CRITICAL ERROR in document grouping:`,
      error
    );
    console.error(
      `⏱️ [grouping:${requestId}] Failed after ${processingTime}ms`
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
        processing_time_ms: processingTime,
      },
      { status: 500 }
    );
  }
}

// ========== HELPER FUNCTIONS ==========

async function authenticateRequest(req: Request, requestId: string) {
  console.log(`🔐 [grouping:${requestId}] Authenticating request...`);

  // Parse request body for user context
  let user_id: string | null = null;
  let trigger_source = 'unknown';

  try {
    const body = await req.json().catch(() => ({}));
    user_id = body.user_id;
    trigger_source = body.trigger || 'manual';
    console.log(`📍 [grouping:${requestId}] Request body parsed:`, {
      user_id,
      trigger_source,
    });
  } catch {
    console.log(`📍 [grouping:${requestId}] No JSON body provided`);
  }

  // Check authentication header for additional validation
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    console.log(
      `🔑 [grouping:${requestId}] Bearer token provided: ${token.substring(
        0,
        20
      )}...`
    );

    // You can add additional token validation here if needed
    // For now, we trust the user_id from the request body
  }

  if (!user_id) {
    console.error(`❌ [grouping:${requestId}] No user_id provided in request`);
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Missing user_id in request body' },
        { status: 400 }
      ),
    };
  }

  console.log(
    `✅ [grouping:${requestId}] Authentication successful for user: ${user_id}`
  );
  return {
    success: true,
    data: { user_id, trigger_source },
  };
}

async function groupDocumentsByInvoice(
  documents: ParsedDocument[],
  requestId: string
): Promise<Record<string, ParsedDocument[]>> {
  console.log(
    `🔄 [grouping:${requestId}] Grouping ${documents.length} documents by invoice...`
  );

  const groups: Record<string, ParsedDocument[]> = {};

  for (const doc of documents) {
    const invoiceKey = extractInvoiceKey(doc, requestId);

    if (!invoiceKey) {
      console.warn(
        `⚠️ [grouping:${requestId}] Document ${doc.id} has no invoice key - skipping`
      );
      continue;
    }

    if (!groups[invoiceKey]) {
      groups[invoiceKey] = [];
    }

    groups[invoiceKey].push(doc);
  }

  console.log(
    `✅ [grouping:${requestId}] Grouped into ${
      Object.keys(groups).length
    } invoice groups`
  );
  return groups;
}

function extractInvoiceKey(
  doc: ParsedDocument,
  requestId: string
): string | null {
  const raw_json = doc.raw_json || {};

  // Try anchor_key first (most reliable)
  if (doc.anchor_key) {
    console.log(
      `📋 [grouping:${requestId}] Document ${doc.id}: Using anchor_key "${doc.anchor_key}"`
    );
    return doc.anchor_key;
  }

  // Fallback to invoice field in raw_json
  const invoice = raw_json.invoice as string;
  if (invoice) {
    console.log(
      `📋 [grouping:${requestId}] Document ${doc.id}: Using raw_json.invoice "${invoice}"`
    );
    return invoice;
  }

  console.warn(
    `⚠️ [grouping:${requestId}] Document ${doc.id}: No invoice key found in anchor_key or raw_json.invoice`
  );
  return null;
}

async function processDocumentGroup(
  invoiceNumber: string,
  documents: ParsedDocument[],
  user_id: string,
  requestId: string,
  supabase: SupabaseClient
) {
  console.log(
    `🎯 [grouping:${requestId}] Processing group "${invoiceNumber}" with ${documents.length} documents`
  );

  // ========== EXTRACT COUNTRY ==========
  const country = extractCountryFromDocuments(documents, requestId);
  console.log(
    `🌍 [grouping:${requestId}] Detected country for "${invoiceNumber}": ${
      country || 'Unknown'
    }`
  );

  // ========== GET BUSINESS RULES ==========
  console.log(
    `🔧 [grouping:${requestId}] Fetching business rules for country: ${
      country || 'global'
    }`
  );
  const { data: ruleData, error: ruleError } = await supabase.rpc(
    'get_business_rule',
    { target_country: country }
  );

  if (ruleError) {
    console.error(
      `❌ [grouping:${requestId}] Error fetching business rule:`,
      ruleError
    );
    throw new Error(`Failed to fetch business rule: ${ruleError.message}`);
  }

  const rule = ruleData[0] as BusinessRule;
  if (!rule) {
    console.error(
      `❌ [grouping:${requestId}] No business rule found for country: ${country}`
    );
    throw new Error(`No business rule found for country: ${country}`);
  }

  console.log(`📋 [grouping:${requestId}] Applied rule "${rule.rule_name}":`, {
    required: rule.required_documents,
    optional: rule.optional_documents,
    minimum: rule.minimum_required,
  });

  // ========== CALCULATE COMPLETION STATUS ==========
  const present_types = documents.map((doc) => doc.document_type);
  const present_ids = documents.map((doc) => doc.id);

  // Helper function to check if document type is valid
  const isValidDocumentType = (type: string): type is DocumentType => {
    return ['invoice', 'eft_receipt', 'e-way-bill'].includes(type);
  };

  const completion_count = rule.required_documents.filter((req_doc) => {
    if (isValidDocumentType(req_doc)) {
      return present_types.includes(req_doc);
    }
    return false;
  }).length;

  const missing_types = rule.required_documents.filter((req_doc) => {
    if (isValidDocumentType(req_doc)) {
      return !present_types.includes(req_doc);
    }
    return true;
  });
  const is_complete = completion_count >= rule.minimum_required;
  const completion_percentage = Math.round(
    (completion_count / rule.minimum_required) * 100
  );

  console.log(
    `📊 [grouping:${requestId}] Completion status for "${invoiceNumber}":`,
    {
      present: present_types,
      completion_count,
      minimum_required: rule.minimum_required,
      missing: missing_types,
      is_complete,
      percentage: completion_percentage,
    }
  );

  // ========== EXTRACT ADDITIONAL METADATA ==========
  const recycler_company = extractRecyclerCompany(documents, requestId);
  const plastic_type = extractPlasticType(documents, requestId);

  // ========== UPSERT DOCUMENT GROUP ==========
  console.log(
    `💾 [grouping:${requestId}] Upserting document group "${invoiceNumber}"...`
  );

  const groupData = {
    user_id,
    invoice_number: invoiceNumber,
    group_key: invoiceNumber, // Simple implementation, could be more sophisticated
    country,
    recycler_company,
    plastic_type,
    applied_rule_name: rule.rule_name,
    required_document_types: rule.required_documents,
    optional_document_types: rule.optional_documents,
    minimum_required: rule.minimum_required,
    present_document_types: present_types,
    present_document_ids: present_ids,
    completion_count,
    missing_document_types: missing_types,
    is_complete,
    can_verify: is_complete, // Basic implementation - could add more complex logic
    completion_percentage,
    last_processed_at: new Date().toISOString(),
    processing_logs: {
      request_id: requestId,
      processed_at: new Date().toISOString(),
      document_count: documents.length,
      rule_applied: rule.rule_name,
      completion_details: {
        present_types,
        missing_types,
        completion_count,
        minimum_required: rule.minimum_required,
      },
    },
  };

  const { data: upsertResult, error: upsertError } = await supabase
    .from('document_groups')
    .upsert(groupData, {
      onConflict: 'user_id,invoice_number',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (upsertError) {
    console.error(
      `❌ [grouping:${requestId}] Error upserting document group:`,
      upsertError
    );
    throw new Error(`Failed to upsert document group: ${upsertError.message}`);
  }

  const wasCreated =
    !upsertResult.created_at ||
    new Date(upsertResult.created_at).getTime() ===
      new Date(upsertResult.updated_at).getTime();

  console.log(
    `✅ [grouping:${requestId}] Document group "${invoiceNumber}" ${
      wasCreated ? 'created' : 'updated'
    } successfully`
  );

  return {
    created: wasCreated,
    updated: !wasCreated,
    country,
    rule_applied: rule.rule_name,
    completion_count,
    minimum_required: rule.minimum_required,
    is_complete,
  };
}

function extractCountryFromDocuments(
  documents: ParsedDocument[],
  requestId: string
): string | null {
  console.log(
    `🌍 [grouping:${requestId}] Extracting country from ${documents.length} documents...`
  );

  // Priority 1: E-way bill ship_to_country_code (most reliable)
  for (const doc of documents) {
    if (doc.document_type === 'e-way-bill') {
      const raw_json = doc.raw_json || {};
      const country = raw_json.ship_to_country_code as string;
      if (country) {
        console.log(
          `🎯 [grouping:${requestId}] Found country "${country}" from e-way-bill ship_to_country_code`
        );
        return country.toUpperCase();
      }
    }
  }

  // Priority 2: Any document with country field
  for (const doc of documents) {
    const raw_json = doc.raw_json || {};
    const country = raw_json.country as string;
    if (country) {
      console.log(
        `🎯 [grouping:${requestId}] Found country "${country}" from document country field`
      );
      return country.toUpperCase();
    }
  }

  // Priority 3: Extract from address fields (basic implementation)
  for (const doc of documents) {
    const raw_json = doc.raw_json || {};
    const address =
      (raw_json.ship_to_address as string) ||
      (raw_json.bill_to_address as string);
    if (address && address.toLowerCase().includes('india')) {
      console.log(
        `🎯 [grouping:${requestId}] Detected India from address: "${address}"`
      );
      return 'IN';
    }
  }

  console.log(
    `⚠️ [grouping:${requestId}] No country detected from documents - will use global default rules`
  );
  return null;
}

function extractRecyclerCompany(
  documents: ParsedDocument[],
  requestId: string
): string | null {
  for (const doc of documents) {
    const raw_json = doc.raw_json || {};
    const company =
      (raw_json.bill_to_company_name as string) ||
      (raw_json.ship_to_company_name as string) ||
      (raw_json.recycler_company as string);
    if (company) {
      console.log(
        `🏢 [grouping:${requestId}] Found recycler company: "${company}"`
      );
      return company;
    }
  }
  return null;
}

function extractPlasticType(
  documents: ParsedDocument[],
  requestId: string
): string | null {
  for (const doc of documents) {
    const raw_json = doc.raw_json || {};
    const plastic_type = raw_json.plastic_type as string;
    if (plastic_type) {
      console.log(
        `🔬 [grouping:${requestId}] Found plastic type: "${plastic_type}"`
      );
      return plastic_type;
    }
  }
  return null;
}
