# Two-Phase Document Grouping Implementation Guide

## Overview

This document outlines the enhanced two-phase document grouping logic that addresses the requirements identified by Shees Ali for proper shipment-based grouping of invoice and e-way bill documents.

## Key Requirements

Based on discussions with Shees Ali (September 26, 2025):

1. **Two-stage matching approach**: First exact matching, then fuzzy matching for ungrouped documents
2. **Proper duplicate detection**: Using normalized e-way bill numbers and invoice matching criteria
3. **Human verification flags**: For groups missing critical matching fields
4. **Target outcome**: ~1,800 properly separated groups for high-volume users

## Implementation Components

### 1. Enhanced Normalization Functions

```typescript
// File: /app/api/cron/document-grouping/route.ts

/**
 * Normalize invoice numbers by removing spaces, dashes, and special characters
 */
function normalizeInvoiceNumber(invoice: string | undefined | null): string {
  if (!invoice) return '';
  // Remove spaces, dashes, underscores, dots, forward slashes and uppercase
  return invoice.replace(/[\s\-\_\.\/]/g, '').toUpperCase();
}

/**
 * Normalize e-way bill numbers for consistent comparison
 */
function normalizeEwayBillNumber(ewayBillNo: string | undefined | null): string {
  if (!ewayBillNo) return '';
  // Remove spaces and dashes, keep alphanumeric characters only
  return ewayBillNo.replace(/[\s\-]/g, '').toUpperCase();
}

/**
 * Enhanced vehicle number normalization
 */
function normalizeVehicleNumber(vehicle: string | undefined | null): string {
  if (!vehicle) return '';
  // Remove ALL non-alphanumeric characters
  return vehicle.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Existing date normalization (keep as is)
 */
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

  return trimmed.replace(/[^0-9-]/g, '');
}
```

### 2. Two-Phase Grouping Logic

```typescript
interface GroupMetadata extends CompositeIdentifiers {
  primaryInvoice: string | null;
  needsHumanVerification?: boolean;
  verificationReason?: string | null;
  groupingPhase?: 'exact' | 'fuzzy';
}

/**
 * Two-phase document grouping implementation
 * Phase 1: Exact invoice + date matching
 * Phase 2: Fuzzy matching with last 4 digits + vehicle + date
 */
function groupDocumentsByCompositeKey(
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
  };

  const dedupeTracker = new Map<string, string>();
  const phase1Grouped = new Set<string>();

  // ========== PHASE 1: EXACT MATCHING ==========
  console.log(`🔄 [grouping:${requestId}] Phase 1: Exact invoice + date matching...`);
  
  for (const doc of documents) {
    const invoice = normalizeInvoiceNumber(
      doc.anchor_key || (doc.raw_json?.invoice as string)
    );
    const date = normalizeInvoiceDate(doc.raw_json?.invoice_date as string);
    
    if (invoice && date) {
      const phase1Key = `EXACT_${invoice}_${date}`;
      const dedupeKey = `${phase1Key}:${doc.document_type}`;
      
      // Check for duplicates
      if (dedupeTracker.has(dedupeKey)) {
        const originalId = dedupeTracker.get(dedupeKey)!;
        console.warn(
          `⚠️ [grouping:${requestId}] Phase 1 duplicate: ${doc.id} (original: ${originalId})`
        );
        stats.skippedDuplicates++;
        stats.duplicateRecords.push({
          compositeKey: phase1Key,
          originalId,
          duplicateId: doc.id,
          documentType: doc.document_type,
        });
        continue;
      }
      
      dedupeTracker.set(dedupeKey, doc.id);
      phase1Grouped.add(doc.id);
      
      // Create or update group
      if (!groups[phase1Key]) {
        groups[phase1Key] = {
          documents: [],
          metadata: {
            compositeKey: phase1Key,
            invoiceDigits: null, // Not used in exact match
            vehicleNumber: null, // Not used in exact match
            invoiceDate: date,
            rawInvoice: invoice,
            quality: 90, // High quality for exact matches
            primaryInvoice: invoice,
            groupingPhase: 'exact'
          },
          duplicates: []
        };
      }
      
      groups[phase1Key].documents.push(doc);
      stats.groupedDocuments++;
    }
  }

  const phase1Count = phase1Grouped.size;
  console.log(`✅ [grouping:${requestId}] Phase 1 grouped ${phase1Count} documents into ${Object.keys(groups).length} groups`);

  // ========== PHASE 2: FUZZY MATCHING ==========
  console.log(`🔄 [grouping:${requestId}] Phase 2: Fuzzy matching for ${documents.length - phase1Count} remaining documents...`);
  
  for (const doc of documents) {
    // Skip documents already grouped in Phase 1
    if (phase1Grouped.has(doc.id)) continue;
    
    // Create composite identifiers for fuzzy matching
    const identifiers = createFuzzyCompositeIdentifiers(doc, requestId);
    
    if (!identifiers) {
      console.warn(
        `⚠️ [grouping:${requestId}] Cannot create identifiers for document ${doc.id}`
      );
      stats.skippedMissingKey++;
      continue;
    }
    
    // Check if needs human verification (missing vehicle or date)
    const missingVehicle = !identifiers.vehicleNumber;
    const missingDate = !identifiers.invoiceDate;
    const needsVerification = missingVehicle || missingDate;
    
    if (needsVerification) {
      // Prefix key to identify groups needing verification
      identifiers.compositeKey = `VERIFY_${identifiers.compositeKey}`;
      identifiers.quality = Math.min(identifiers.quality, 50);
      
      console.log(
        `🚨 [grouping:${requestId}] Document ${doc.id} needs verification - Missing: ${
          missingVehicle ? 'vehicle' : ''
        } ${missingDate ? 'date' : ''}`
      );
    }
    
    const dedupeKey = `${identifiers.compositeKey}:${doc.document_type}`;
    
    // Check for duplicates
    if (dedupeTracker.has(dedupeKey)) {
      const originalId = dedupeTracker.get(dedupeKey)!;
      stats.skippedDuplicates++;
      stats.duplicateRecords.push({
        compositeKey: identifiers.compositeKey,
        originalId,
        duplicateId: doc.id,
        documentType: doc.document_type,
      });
      continue;
    }
    
    dedupeTracker.set(dedupeKey, doc.id);
    
    // Create or update group
    if (!groups[identifiers.compositeKey]) {
      groups[identifiers.compositeKey] = {
        documents: [],
        metadata: {
          ...identifiers,
          primaryInvoice: identifiers.rawInvoice,
          needsHumanVerification: needsVerification,
          verificationReason: needsVerification ? 
            `Missing: ${missingVehicle ? 'vehicle' : ''} ${missingDate ? 'date' : ''}`.trim() : 
            null,
          groupingPhase: 'fuzzy'
        },
        duplicates: []
      };
    }
    
    groups[identifiers.compositeKey].documents.push(doc);
    stats.groupedDocuments++;
  }

  // ========== FINAL STATISTICS ==========
  const verificationGroups = Object.keys(groups).filter(k => k.startsWith('VERIFY_')).length;
  const exactGroups = Object.keys(groups).filter(k => k.startsWith('EXACT_')).length;
  const fuzzyGroups = Object.keys(groups).length - exactGroups - verificationGroups;
  
  console.log(`📊 [grouping:${requestId}] Grouping complete:`);
  console.log(`   - Total groups: ${Object.keys(groups).length}`);
  console.log(`   - Exact match groups: ${exactGroups}`);
  console.log(`   - Fuzzy match groups: ${fuzzyGroups}`);
  console.log(`   - Needs verification: ${verificationGroups}`);
  console.log(`   - Documents grouped: ${stats.groupedDocuments}`);
  console.log(`   - Duplicates skipped: ${stats.skippedDuplicates}`);
  
  return { groups, stats };
}

/**
 * Create fuzzy composite identifiers (last 4 + vehicle + date)
 */
function createFuzzyCompositeIdentifiers(
  doc: ParsedDocument,
  requestId: string
): CompositeIdentifiers | null {
  const raw = doc.raw_json || {};
  const primaryInvoice = (doc.anchor_key || raw.invoice || '') as string;
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

  // Build composite key based on available fields
  if (hasInvoiceDigits && hasVehicle && hasDate) {
    compositeKey = `${last4}_${vehicle}_${date}`;
    quality = 100;
  } else if (hasInvoiceDigits && hasVehicle) {
    compositeKey = `${last4}_${vehicle}_NODATE`;
    quality = 70;
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
    return null;
  }

  console.log(
    `🔑 [grouping:${requestId}] Fuzzy key for ${doc.id}: ${compositeKey} (quality: ${quality})`
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
```

### 3. Database Schema Updates

```sql
-- Migration: Add verification and phase tracking fields
-- Date: 2025-09-27

BEGIN;

-- Add columns for verification tracking
ALTER TABLE document_groups 
ADD COLUMN IF NOT EXISTS needs_human_verification BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_reason TEXT,
ADD COLUMN IF NOT EXISTS grouping_phase VARCHAR(20) DEFAULT 'unknown';

-- Add index for finding groups needing verification
CREATE INDEX IF NOT EXISTS idx_document_groups_needs_verification 
ON document_groups(needs_human_verification) 
WHERE needs_human_verification = true;

-- Add index for grouping phase analysis
CREATE INDEX IF NOT EXISTS idx_document_groups_phase 
ON document_groups(grouping_phase);

-- Add composite index for verification workflow
CREATE INDEX IF NOT EXISTS idx_document_groups_verification_workflow
ON document_groups(user_id, needs_human_verification, created_at)
WHERE needs_human_verification = true;

COMMIT;
```

### 4. Update processDocumentGroup Function

```typescript
// In processDocumentGroup, update the groupData object:

const groupData = {
  user_id,
  invoice_number: primaryInvoice || entry.metadata.rawInvoice || groupKey,
  group_key: groupKey,
  
  // Add new fields for verification and phase tracking
  needs_human_verification: entry.metadata.needsHumanVerification || false,
  verification_reason: entry.metadata.verificationReason || null,
  grouping_phase: entry.metadata.groupingPhase || 'unknown',
  
  // Existing fields
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
  can_verify: is_complete && !entry.metadata.needsHumanVerification,
  completion_percentage,
  last_processed_at: new Date().toISOString(),
  
  // Enhanced processing logs
  processing_logs: {
    request_id: requestId,
    processed_at: new Date().toISOString(),
    document_count: documents.length,
    rule_applied: rule.rule_name,
    grouping_phase: entry.metadata.groupingPhase,
    needs_verification: entry.metadata.needsHumanVerification,
    verification_reason: entry.metadata.verificationReason,
    completion_details: {
      present_types,
      missing_types,
      completion_count,
      minimum_required: rule.minimum_required,
      composite_identifiers: entry.metadata,
    },
  },
};
```

## Duplicate Detection Queries

### Invoice Duplicate Detection

```sql
-- Detect invoice duplicates using Shees's logic
WITH invoice_analysis AS (
  SELECT 
    raw_json->>'invoice' as invoice_number,
    raw_json->>'invoice_date' as invoice_date,
    raw_json->>'weight' as weight,
    CASE 
      WHEN raw_json->>'invoice_date' IS NULL AND raw_json->>'weight' IS NULL THEN 
        'FLAG_MISSING_BOTH'
      WHEN raw_json->>'invoice_date' IS NULL THEN 
        raw_json->>'invoice' || '_' || raw_json->>'weight'
      WHEN raw_json->>'weight' IS NULL THEN 
        raw_json->>'invoice' || '_' || raw_json->>'invoice_date'
      ELSE 
        raw_json->>'invoice' || '_' || raw_json->>'invoice_date' || '_' || raw_json->>'weight'
    END as dedup_key,
    id
  FROM parsed_documents
  WHERE document_type = 'invoice'
    AND user_id = 'USER_ID_HERE'
)
SELECT 
  COUNT(*) as total_invoices,
  COUNT(DISTINCT dedup_key) as unique_invoices,
  COUNT(CASE WHEN dedup_key = 'FLAG_MISSING_BOTH' THEN 1 END) as flagged_invoices,
  COUNT(*) - COUNT(DISTINCT dedup_key) as duplicate_invoices
FROM invoice_analysis;
```

### E-Way Bill Duplicate Detection

```sql
-- Detect e-way bill duplicates with normalization
WITH ewaybill_analysis AS (
  SELECT 
    UPPER(REPLACE(REPLACE(
      COALESCE(raw_json->>'eway_bill_no', raw_json->>'e_way_bill_number', anchor_key), 
      ' ', ''), '-', '')) as normalized_eway_no,
    id
  FROM parsed_documents
  WHERE document_type IN ('e-way-bill', 'e_way_bill')
    AND user_id = 'USER_ID_HERE'
)
SELECT 
  COUNT(*) as total_ewaybills,
  COUNT(DISTINCT normalized_eway_no) as unique_ewaybill_numbers,
  COUNT(*) - COUNT(DISTINCT normalized_eway_no) as duplicate_count
FROM ewaybill_analysis;
```

## Verification Workflow Queries

### Find Groups Needing Verification

```sql
-- Get all groups requiring human verification
SELECT 
  group_key,
  invoice_number,
  verification_reason,
  completion_percentage,
  present_document_types,
  created_at
FROM document_groups
WHERE needs_human_verification = true
  AND user_id = 'USER_ID_HERE'
ORDER BY created_at DESC;
```

### Verification Statistics

```sql
-- Summary of verification needs by reason
SELECT 
  verification_reason,
  COUNT(*) as group_count,
  AVG(completion_percentage) as avg_completion
FROM document_groups
WHERE needs_human_verification = true
GROUP BY verification_reason
ORDER BY group_count DESC;
```

### Phase Distribution Analysis

```sql
-- Analyze grouping phase distribution
SELECT 
  grouping_phase,
  COUNT(*) as group_count,
  AVG(completion_percentage) as avg_completion,
  COUNT(CASE WHEN is_complete THEN 1 END) as complete_groups,
  COUNT(CASE WHEN needs_human_verification THEN 1 END) as needs_verification
FROM document_groups
WHERE user_id = 'USER_ID_HERE'
GROUP BY grouping_phase
ORDER BY group_count DESC;
```

## Testing & Validation

### Pre-Deployment Checklist

1. **Database Migration**
   - [ ] Run schema update migration
   - [ ] Verify new columns exist
   - [ ] Confirm indexes are created

2. **Code Deployment**
   - [ ] Update normalization functions
   - [ ] Deploy two-phase grouping logic
   - [ ] Update processDocumentGroup with new fields

3. **Testing**
   - [ ] Test with user having known duplicates
   - [ ] Verify Phase 1 exact matching works
   - [ ] Verify Phase 2 fuzzy matching works
   - [ ] Confirm verification flags are set correctly

### Expected Outcomes

After implementing this two-phase approach:

1. **Phase 1 (Exact)**: ~30-40% of documents matched with high confidence
2. **Phase 2 (Fuzzy)**: ~50-60% additional documents matched
3. **Verification Needed**: ~10-20% flagged for human review
4. **Total Groups**: Closer to expected ~1,800 for high-volume users
5. **Duplicate Reduction**: Significant decrease in false duplicates

### Success Metrics Query

```sql
-- Comprehensive success metrics
WITH metrics AS (
  SELECT 
    COUNT(DISTINCT group_key) as total_groups,
    COUNT(DISTINCT CASE WHEN grouping_phase = 'exact' THEN group_key END) as exact_groups,
    COUNT(DISTINCT CASE WHEN grouping_phase = 'fuzzy' THEN group_key END) as fuzzy_groups,
    COUNT(DISTINCT CASE WHEN needs_human_verification THEN group_key END) as verification_groups,
    AVG(completion_percentage) as avg_completion,
    COUNT(DISTINCT CASE WHEN is_complete THEN group_key END) as complete_groups
  FROM document_groups
  WHERE user_id = 'USER_ID_HERE'
    AND created_at > '2025-09-27'
)
SELECT 
  total_groups,
  ROUND(exact_groups::numeric / NULLIF(total_groups, 0) * 100, 1) as exact_pct,
  ROUND(fuzzy_groups::numeric / NULLIF(total_groups, 0) * 100, 1) as fuzzy_pct,
  ROUND(verification_groups::numeric / NULLIF(total_groups, 0) * 100, 1) as verification_pct,
  ROUND(avg_completion, 1) as avg_completion,
  complete_groups
FROM metrics;
```

## Rollback Plan

If issues occur after deployment:

```sql
-- Rollback procedure
BEGIN;

-- Remove verification columns (if needed)
ALTER TABLE document_groups 
DROP COLUMN IF EXISTS needs_human_verification,
DROP COLUMN IF EXISTS verification_reason,
DROP COLUMN IF EXISTS grouping_phase;

-- Drop new indexes
DROP INDEX IF EXISTS idx_document_groups_needs_verification;
DROP INDEX IF EXISTS idx_document_groups_phase;
DROP INDEX IF EXISTS idx_document_groups_verification_workflow;

-- Restore from backup if critical issues
-- INSERT INTO document_groups SELECT * FROM document_groups_backup_20250927;

COMMIT;
```

## Summary

This two-phase grouping implementation addresses all key requirements:

1. ✅ **Exact matching first** - High-confidence groups from invoice + date
2. ✅ **Fuzzy fallback** - Last 4 digits + vehicle + date for remaining documents
3. ✅ **Human verification flags** - Clear identification of incomplete groups
4. ✅ **Proper normalization** - Consistent handling of invoice/vehicle/e-way bill numbers
5. ✅ **Duplicate detection** - Accurate identification using normalized keys
6. ✅ **Performance tracking** - Phase and quality metrics for monitoring

The system now properly separates shipments that were incorrectly combined, resulting in more accurate document grouping that reflects real-world logistics operations.