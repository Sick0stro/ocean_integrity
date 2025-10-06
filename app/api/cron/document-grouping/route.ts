// ⚠️ DEPRECATION WARNING ⚠️
// This service is DEPRECATED and replaced by the new matching system.
// New route: /api/cron/compute-matches
//
// This file is kept for:
// 1. Rollback safety during transition
// 2. Historical reference
// 3. Migration script compatibility
//
// DO NOT use this for new features. Use the matching system instead.
// See: docs/matching-system-overview.md
//
// Backend Document Grouping Service (LEGACY)
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

interface CompositeIdentifiers {
  compositeKey: string;
  invoiceDigits: string | null;
  vehicleNumber: string | null;
  invoiceDate: string | null;
  rawInvoice: string | null;
  quality: number;
}

interface GroupMetadata extends CompositeIdentifiers {
  primaryInvoice: string | null;
  needsHumanVerification?: boolean;
  verificationReason?: string | null;
  groupingPhase?: 'exact' | 'fuzzy';
}

interface DuplicateRecord {
  compositeKey: string;
  originalId: string;
  duplicateId: string;
  documentType: DocumentType;
}

interface GroupEntry {
  documents: ParsedDocument[];
  metadata: GroupMetadata;
  duplicates: DuplicateRecord[];
}

interface GroupingStats {
  totalDocuments: number;
  groupedDocuments: number;
  skippedMissingKey: number;
  skippedDuplicates: number;
  duplicateRecords: DuplicateRecord[];
  phase1Groups: number;
  phase2Groups: number;
  verifyGroups: number;
}

interface GroupingMapResult {
  groups: Record<string, GroupEntry>;
  stats: GroupingStats;
}

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
  duplicates_skipped: number;
  duplicate_details: DuplicateRecord[];
  phase1_groups: number;
  phase2_groups: number;
  verification_groups: number;
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();

  console.warn(`
⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
⚠️ DEPRECATION WARNING: This endpoint is DEPRECATED!
⚠️ Use /api/cron/compute-matches instead
⚠️ This legacy grouping service will be removed in a future release
⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
  `);

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

    // ========== GROUP DOCUMENTS BY COMPOSITE SHIPMENT KEY ==========
    console.log(
      `🔄 [grouping:${requestId}] Grouping documents by composite shipment key...`
    );
    const { groups: documentGroups, stats: groupingStats } =
      groupDocumentsTwoPhase(parsedDocs, requestId);

    console.log(
      `📊 [grouping:${requestId}] Created ${
        Object.keys(documentGroups).length
      } composite groups (processed ${groupingStats.groupedDocuments}/${
        groupingStats.totalDocuments
      } docs; skipped missing key: ${
        groupingStats.skippedMissingKey
      }; skipped duplicates: ${groupingStats.skippedDuplicates})`
    );
    Object.entries(documentGroups).forEach(([groupKey, entry]) => {
      console.log(
        `   📄 [grouping:${requestId}] Group "${groupKey}": ${
          entry.documents.length
        } documents (${entry.documents
          .map((d) => d.document_type)
          .join(', ')}) phase=${entry.metadata.groupingPhase || 'unknown'}$${
          entry.metadata.needsHumanVerification ? ' (needs verification)' : ''
        }`
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
      duplicates_skipped: groupingStats.skippedDuplicates,
      duplicate_details: groupingStats.duplicateRecords,
      phase1_groups: groupingStats.phase1Groups,
      phase2_groups: groupingStats.phase2Groups,
      verification_groups: groupingStats.verifyGroups,
    };

    for (const [groupKey, entry] of Object.entries(documentGroups)) {
      try {
        console.log(`🎯 [grouping:${requestId}] Processing group: ${groupKey}`);

        const groupResult = await processDocumentGroup(
          groupKey,
          entry,
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
          invoice:
            groupResult.primaryInvoice ||
            entry.metadata.primaryInvoice ||
            entry.metadata.rawInvoice ||
            entry.metadata.compositeKey,
          country: groupResult.country,
          rule_applied: groupResult.rule_applied,
          completion: `${groupResult.completion_count}/${groupResult.minimum_required}`,
          status: groupResult.created ? 'created' : 'updated',
        });

        console.log(
          `✅ [grouping:${requestId}] Group "${groupKey}" processed successfully`
        );
      } catch (error) {
        console.error(
          `❌ [grouping:${requestId}] Error processing group "${groupKey}":`,
          error
        );
        results.errors.push(
          `${groupKey}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );

        results.details.push({
          invoice:
            entry.metadata.primaryInvoice ||
            entry.metadata.rawInvoice ||
            entry.metadata.compositeKey,
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

    if (groupingStats.skippedDuplicates > 0) {
      console.log(
        `⚠️ [grouping:${requestId}] Duplicates skipped: ${groupingStats.skippedDuplicates}`
      );
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

function groupDocumentsTwoPhase(
  documents: ParsedDocument[],
  requestId: string
): GroupingMapResult {
  const groups: Record<string, GroupEntry> = {};
  const stats: GroupingStats = {
    totalDocuments: documents.length,
    groupedDocuments: 0,
    skippedMissingKey: 0,
    skippedDuplicates: 0,
    duplicateRecords: [],
    phase1Groups: 0,
    phase2Groups: 0,
    verifyGroups: 0,
  };

  const dedupeTracker = new Map<string, string>();
  const groupedDocsPhase1 = new Set<string>();

  console.log(
    `🔄 [grouping:${requestId}] Phase 1: Exact invoice + date matching...`
  );

  documents.forEach((doc) => {
    const invoiceNormalized = normalizeInvoiceNumber(
      (doc.raw_json?.invoice as string) || doc.anchor_key
    );
    const invoiceDate = normalizeInvoiceDate(
      doc.raw_json?.invoice_date as string
    );

    if (!invoiceNormalized || !invoiceDate) {
      return;
    }

    const groupKey = `EXACT_${invoiceNormalized}_${invoiceDate}`;
    const dedupeKey = `${groupKey}:${doc.document_type}`;

    if (dedupeTracker.has(dedupeKey)) {
      const originalId = dedupeTracker.get(dedupeKey)!;
      stats.skippedDuplicates++;
      const duplicateRecord: DuplicateRecord = {
        compositeKey: groupKey,
        originalId,
        duplicateId: doc.id,
        documentType: doc.document_type,
      };
      stats.duplicateRecords.push(duplicateRecord);

      if (!groups[groupKey]) {
        groups[groupKey] = {
          documents: [],
          metadata: {
            compositeKey: groupKey,
            invoiceDigits: null,
            vehicleNumber: null,
            invoiceDate,
            rawInvoice: invoiceNormalized,
            quality: 95,
            primaryInvoice: invoiceNormalized,
            groupingPhase: 'exact',
          },
          duplicates: [],
        };
      }

      groups[groupKey].duplicates.push(duplicateRecord);
      return;
    }

    dedupeTracker.set(dedupeKey, doc.id);
    groupedDocsPhase1.add(doc.id);

    if (!groups[groupKey]) {
      groups[groupKey] = {
        documents: [],
        metadata: {
          compositeKey: groupKey,
          invoiceDigits: null,
          vehicleNumber: null,
          invoiceDate,
          rawInvoice: invoiceNormalized,
          quality: 95,
          primaryInvoice: invoiceNormalized,
          groupingPhase: 'exact',
        },
        duplicates: [],
      };
      stats.phase1Groups++;
    }

    groups[groupKey].documents.push(doc);
    stats.groupedDocuments++;
  });

  const remainingDocs = documents.filter(
    (doc) => !groupedDocsPhase1.has(doc.id)
  );

  console.log(
    `🔄 [grouping:${requestId}] Phase 2: Fuzzy matching for ${remainingDocs.length} documents...`
  );

  for (const doc of remainingDocs) {
    const identifiers = createFuzzyCompositeIdentifiers(doc, requestId);

    if (!identifiers) {
      stats.skippedMissingKey++;
      continue;
    }

    const missingVehicle = !identifiers.vehicleNumber;
    const missingDate = !identifiers.invoiceDate;
    const needsVerification = missingVehicle || missingDate;

    const groupKey = identifiers.compositeKey;
    const dedupeKey = `${groupKey}:${doc.document_type}`;

    if (dedupeTracker.has(dedupeKey)) {
      const originalId = dedupeTracker.get(dedupeKey)!;
      stats.skippedDuplicates++;
      const duplicateRecord: DuplicateRecord = {
        compositeKey: groupKey,
        originalId,
        duplicateId: doc.id,
        documentType: doc.document_type,
      };
      stats.duplicateRecords.push(duplicateRecord);

      if (!groups[groupKey]) {
        groups[groupKey] = {
          documents: [],
          metadata: {
            ...identifiers,
            primaryInvoice: identifiers.rawInvoice,
            groupingPhase: 'fuzzy',
            needsHumanVerification: needsVerification,
            verificationReason: needsVerification
              ? `Missing: ${missingVehicle ? 'vehicle' : ''} ${
                  missingDate ? 'date' : ''
                }`.trim()
              : null,
          },
          duplicates: [],
        };
      }

      groups[groupKey].duplicates.push(duplicateRecord);
      continue;
    }

    dedupeTracker.set(dedupeKey, doc.id);

    if (!groups[groupKey]) {
      groups[groupKey] = {
        documents: [],
        metadata: {
          ...identifiers,
          primaryInvoice: identifiers.rawInvoice,
          groupingPhase: 'fuzzy',
          needsHumanVerification: needsVerification,
          verificationReason: needsVerification
            ? `Missing: ${missingVehicle ? 'vehicle' : ''} ${
                missingDate ? 'date' : ''
              }`.trim()
            : null,
        },
        duplicates: [],
      };

      if (needsVerification) {
        stats.verifyGroups++;
      } else {
        stats.phase2Groups++;
      }
    }

    groups[groupKey].documents.push(doc);
    stats.groupedDocuments++;
  }

  console.log(
    `✅ [grouping:${requestId}] Phase 1 groups: ${stats.phase1Groups}`
  );
  console.log(
    `✅ [grouping:${requestId}] Phase 2 groups: ${stats.phase2Groups}`
  );
  console.log(
    `✅ [grouping:${requestId}] Verification groups: ${stats.verifyGroups}`
  );
  console.log(
    `✅ [grouping:${requestId}] Total groups formed: ${
      Object.keys(groups).length
    }`
  );

  return { groups, stats };
}

function createFuzzyCompositeIdentifiers(
  doc: ParsedDocument,
  requestId: string
): CompositeIdentifiers | null {
  const raw = doc.raw_json || {};
  const primaryInvoice = normalizeInvoiceNumber(
    (doc.anchor_key || (raw.invoice as string) || '') as string
  );
  const last4 = extractInvoiceLastFour(primaryInvoice);
  const vehicle = normalizeVehicleNumber(
    (raw.vehicle_number as string) || (raw.vehicleNo as string) || ''
  );
  const date = normalizeInvoiceDate((raw.invoice_date as string) || '');

  const hasInvoiceDigits = Boolean(last4);
  const hasVehicle = Boolean(vehicle);
  const hasDate = Boolean(date);

  let compositeKey = '';
  let quality = 0;

  if (hasInvoiceDigits && hasVehicle && hasDate) {
    compositeKey = `${last4}_${vehicle}_${date}`;
    quality = 100;
  } else if (hasInvoiceDigits && hasVehicle) {
    compositeKey = `${last4}_${vehicle}_NODATE`;
    quality = 80;
  } else if (hasInvoiceDigits && hasDate) {
    compositeKey = `${last4}_NOVEHICLE_${date}`;
    quality = 70;
  } else if (hasVehicle && hasDate) {
    compositeKey = `NOINV_${vehicle}_${date}`;
    quality = 60;
  } else if (hasInvoiceDigits) {
    compositeKey = `INVONLY_${last4}`;
    quality = 40;
  } else if (hasVehicle) {
    compositeKey = `VEHONLY_${vehicle}`;
    quality = 30;
  } else if (hasDate) {
    compositeKey = `DATEONLY_${date}`;
    quality = 20;
  }

  if (!compositeKey) {
    console.warn(
      `⚠️ [grouping:${requestId}] Could not derive composite key for document ${doc.id}`
    );
    return null;
  }

  console.log(
    `🔑 [grouping:${requestId}] Document ${doc.id} composite key: ${compositeKey} (quality ${quality})`
  );

  return {
    compositeKey,
    invoiceDigits: last4 || null,
    vehicleNumber: vehicle || null,
    invoiceDate: date || null,
    rawInvoice: primaryInvoice || null,
    quality,
  };
}

function extractInvoiceLastFour(invoice: string | undefined | null): string {
  if (!invoice) return '';
  const cleaned = invoice.replace(/[^a-zA-Z0-9]/g, '');
  const digitsOnly = cleaned.replace(/\D/g, '');

  if (digitsOnly.length >= 4) {
    return digitsOnly.slice(-4);
  }

  if (digitsOnly.length > 0) {
    return digitsOnly.padStart(4, '0');
  }

  if (cleaned.length >= 4) {
    return cleaned.slice(-4);
  }

  return cleaned.padStart(4, '0');
}

function normalizeInvoiceNumber(invoice: string | undefined | null): string {
  if (!invoice) return '';
  return invoice.replace(/[\s\-_.\/]/g, '').toUpperCase();
}

function normalizeVehicleNumber(vehicle: string | undefined | null): string {
  if (!vehicle) return '';

  let normalized = vehicle.toUpperCase();
  const segments = normalized.trim().split(/[\s-]+/);
  if (segments.length > 4) {
    normalized = segments.slice(0, 4).join(' ');
  }

  const statePattern =
    /^([A-Z]{2})\s*([A-Z0-9]{1,2})\s*([A-Z]{1,2})\s*(\d{3,4})/;
  const match = normalized.match(statePattern);
  if (match) {
    return `${match[1]}${match[2]}${match[3]}${match[4]}`;
  }

  return normalized.replace(/[^A-Z0-9]/g, '');
}

function normalizeInvoiceDate(dateString: string | undefined | null): string {
  if (!dateString) return '';

  const trimmed = dateString.trim();
  const patterns: RegExp[] = [
    /(\d{1,2})-(\d{1,2})-(\d{4})/, // DD-MM-YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    if (pattern === patterns[0] || pattern === patterns[2]) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      return `${year}-${month}-${day}`;
    }

    if (pattern === patterns[1]) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  const normalized = new Date(trimmed);
  if (!Number.isNaN(normalized.getTime())) {
    const iso = normalized.toISOString().slice(0, 10);
    return iso;
  }

  return trimmed.replace(/[^0-9-]/g, '');
}

async function processDocumentGroup(
  groupKey: string,
  entry: GroupEntry,
  user_id: string,
  requestId: string,
  supabase: SupabaseClient
) {
  console.log(
    `🎯 [grouping:${requestId}] Processing group "${groupKey}" with ${entry.documents.length} documents`
  );

  const documents = entry.documents;
  const primaryInvoice =
    entry.metadata.primaryInvoice || entry.metadata.rawInvoice;

  // ========== EXTRACT COUNTRY ==========
  const country = extractCountryFromDocuments(documents, requestId);
  console.log(
    `🌍 [grouping:${requestId}] Detected country for "${groupKey}": ${
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
    `📊 [grouping:${requestId}] Completion status for "${groupKey}":`,
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
    `💾 [grouping:${requestId}] Upserting document group "${groupKey}"...`
  );

  const groupData = {
    user_id,
    invoice_number: primaryInvoice || entry.metadata.rawInvoice || groupKey,
    group_key: groupKey,
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
        composite_identifiers: entry.metadata,
      },
    },
  };

  const { data: upsertResult, error: upsertError } = await supabase
    .from('document_groups')
    .upsert(groupData, {
      onConflict: 'user_id,group_key',
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
    `✅ [grouping:${requestId}] Document group "${groupKey}" ${
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
    primaryInvoice: primaryInvoice || null,
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
