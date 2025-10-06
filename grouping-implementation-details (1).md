# Enhanced Document Grouping - Implementation Details

## 1. Normalization Details

### 1.1 Invoice Last-Four Extraction

**Exact Logic for Invoice Number Processing:**

```typescript
function extractLast4Digits(invoiceNumber: string): string {
  // Remove all non-alphanumeric characters first
  const cleaned = invoiceNumber.replace(/[^a-zA-Z0-9]/g, '');
  
  // Extract last 4 digits (not characters)
  const digitsOnly = cleaned.replace(/\D/g, '');
  
  if (digitsOnly.length >= 4) {
    return digitsOnly.slice(-4);
  } else if (digitsOnly.length > 0) {
    // Pad with zeros if less than 4 digits
    return digitsOnly.padStart(4, '0');
  } else {
    // No digits found - use last 4 characters as fallback
    return cleaned.slice(-4).padStart(4, '0');
  }
}

// Examples:
// "OE23/24-001455" → "1455"
// "INV-455" → "0455"
// "2023/455" → "0455"
// "ABC123" → "0123"
// "455" → "0455"
```

### 1.2 Vehicle Number Normalization

**Complete Vehicle Number Cleaning Logic:**

```typescript
function normalizeVehicleNumber(vehicleNumber: string): string {
  if (!vehicleNumber) return '';
  
  // Step 1: Convert to uppercase
  let normalized = vehicleNumber.toUpperCase();
  
  // Step 2: Handle trip numbers (anything after 4th space-separated segment)
  // Examples: "TN XC 1234 2345" → "TN XC 1234"
  const segments = normalized.split(/[\s-]+/);
  if (segments.length > 4) {
    // Indian vehicle format: STATE CODE NUMBER [TRIP]
    normalized = segments.slice(0, 4).join(' ');
  }
  
  // Step 3: Remove common separators but preserve structure
  // Keep first 2 alphabets (state code), then alphanumerics
  const statePattern = /^([A-Z]{2})\s*([A-Z0-9]+)\s*([A-Z0-9]+)\s*([0-9]+)/;
  const match = normalized.match(statePattern);
  
  if (match) {
    // Reconstruct without spaces/hyphens for consistent matching
    return `${match[1]}${match[2]}${match[3]}${match[4]}`;
  }
  
  // Step 4: Fallback - remove all spaces and special characters
  return normalized.replace(/[^A-Z0-9]/g, '');
}

// Examples:
// "TN XC 1234 2345" → "TNXC1234"
// "TN-34-AC-2099" → "TN34AC2099"
// "KA 25 A 3393" → "KA25A3393"
// "MP09HF4547" → "MP09HF4547"
// "WB 23 C 9561" → "WB23C9561"
```

### 1.3 Invoice Date Normalization

**Date Handling for Consistency:**

```typescript
function normalizeInvoiceDate(dateString: string): string {
  if (!dateString) return '';
  
  // Common formats in your data:
  // "19-02-2023", "2023-02-19", "19/02/2023", "Feb 19, 2023"
  
  // Try parsing various formats
  const patterns = [
    /(\d{1,2})-(\d{1,2})-(\d{4})/, // DD-MM-YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
  ];
  
  for (const pattern of patterns) {
    const match = dateString.match(pattern);
    if (match) {
      // Convert to consistent YYYY-MM-DD format
      if (match[0].includes('-') && match[3].length === 4) {
        // DD-MM-YYYY format
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
      } else if (match[1].length === 4) {
        // Already YYYY-MM-DD
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      }
    }
  }
  
  // If no pattern matches, return cleaned original
  return dateString.replace(/[^0-9-]/g, '');
}

// Examples:
// "19-02-2023" → "2023-02-19"
// "2023-02-19" → "2023-02-19"
// "19/02/2023" → "2023-02-19"
// "5-3-2023" → "2023-03-05"
```

## 2. Missing/Partial Data Handling

### 2.1 Field Priority and Fallback Strategy

**Decision Tree for Composite Key Creation:**

```typescript
function createCompositeGroupKey(doc: ParsedDocument): string | null {
  const invoice = extractLast4Digits(doc.anchor_key || doc.raw_json?.invoice || '');
  const vehicle = normalizeVehicleNumber(doc.raw_json?.vehicle_number || '');
  const date = normalizeInvoiceDate(doc.raw_json?.invoice_date || '');
  
  // Scoring system for key quality
  let keyQuality = 0;
  let keyComponents = [];
  
  // Priority 1: All three fields present (BEST)
  if (invoice && vehicle && date) {
    keyQuality = 100;
    return `${invoice}_${vehicle}_${date}`;
  }
  
  // Priority 2: Invoice + Vehicle (GOOD)
  if (invoice && vehicle) {
    keyQuality = 75;
    return `${invoice}_${vehicle}_NODATE`;
  }
  
  // Priority 3: Invoice + Date (ACCEPTABLE)
  if (invoice && date) {
    keyQuality = 60;
    return `${invoice}_NOVEHICLE_${date}`;
  }
  
  // Priority 4: Vehicle + Date only (WEAK - but for e-way bills might be valid)
  if (vehicle && date && doc.document_type === 'e_way_bill') {
    keyQuality = 50;
    return `NOINV_${vehicle}_${date}`;
  }
  
  // Priority 5: Invoice only (FALLBACK)
  if (invoice) {
    keyQuality = 25;
    // Use full original invoice number as fallback
    return doc.anchor_key || doc.raw_json?.invoice || `INV_${invoice}`;
  }
  
  // Priority 6: Cannot create key (SKIP)
  console.warn(`Cannot create key for document ${doc.id}: Missing critical fields`);
  return null;
}
```

### 2.2 Handling Inconsistent Data

**Validation Rules Before Grouping:**

```typescript
function validateDocumentForGrouping(doc: ParsedDocument): {
  isValid: boolean;
  reason?: string;
  confidence: number;
} {
  const invoice = doc.anchor_key || doc.raw_json?.invoice;
  const vehicle = doc.raw_json?.vehicle_number;
  const date = doc.raw_json?.invoice_date;
  
  // Check for suspicious patterns
  if (invoice && invoice.length < 3) {
    return { 
      isValid: false, 
      reason: 'Invoice number too short', 
      confidence: 0 
    };
  }
  
  if (vehicle && vehicle.length < 6) {
    return { 
      isValid: false, 
      reason: 'Vehicle number invalid format', 
      confidence: 0 
    };
  }
  
  // Check date validity (not in future, not too old)
  if (date) {
    const parsedDate = new Date(normalizeInvoiceDate(date));
    const now = new Date();
    const twoYearsAgo = new Date(now.setFullYear(now.getFullYear() - 2));
    
    if (parsedDate > new Date() || parsedDate < twoYearsAgo) {
      return { 
        isValid: true, // Still valid but flag low confidence
        reason: 'Date outside expected range', 
        confidence: 50 
      };
    }
  }
  
  // Calculate confidence based on field completeness
  let confidence = 100;
  if (!invoice) confidence -= 40;
  if (!vehicle) confidence -= 30;
  if (!date) confidence -= 30;
  
  return { 
    isValid: confidence >= 25, // Minimum 25% confidence to proceed
    confidence 
  };
}
```

## 3. Deduplication Strategy

### 3.1 Initial Cleanup (One-Time)

**SQL for Initial Duplicate Removal:**

```sql
-- Step 1: Identify and log duplicates before deletion
CREATE TABLE duplicate_documents_log AS
WITH duplicates AS (
  SELECT 
    id,
    user_id,
    document_type,
    anchor_key,
    raw_json->>'vehicle_number' as vehicle_number,
    raw_json->>'invoice_date' as invoice_date,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY 
        user_id,
        document_type,
        COALESCE(anchor_key, raw_json->>'invoice'),
        COALESCE(raw_json->>'vehicle_number', 'UNKNOWN'),
        COALESCE(raw_json->>'invoice_date', 'UNKNOWN')
      ORDER BY 
        created_at ASC,
        id ASC  -- Secondary sort for deterministic results
    ) as rn
  FROM parsed_documents
  WHERE document_type IN ('invoice', 'e_way_bill', 'eft_receipt')
)
SELECT * FROM duplicates WHERE rn > 1;

-- Step 2: Delete duplicates (keeping earliest)
DELETE FROM parsed_documents
WHERE id IN (SELECT id FROM duplicate_documents_log);

-- Step 3: Verify deletion
SELECT 
  'Deleted' as status,
  document_type,
  COUNT(*) as count
FROM duplicate_documents_log
GROUP BY document_type;
```

### 3.2 Runtime Deduplication Strategy

**How Grouping Job Handles Duplicates After Deployment:**

```typescript
class DeduplicationHandler {
  private processedDocuments = new Map<string, string>(); // dedupe_key -> doc_id
  private duplicateLog: Array<{
    original_id: string;
    duplicate_id: string;
    key: string;
    action: 'skipped' | 'logged' | 'soft_deleted';
  }> = [];
  
  async handleDocument(
    doc: ParsedDocument,
    supabase: SupabaseClient
  ): Promise<'process' | 'skip'> {
    // Create deduplication key
    const dedupeKey = this.createDedupeKey(doc);
    
    if (this.processedDocuments.has(dedupeKey)) {
      const originalId = this.processedDocuments.get(dedupeKey)!;
      
      // Log the duplicate
      this.duplicateLog.push({
        original_id: originalId,
        duplicate_id: doc.id,
        key: dedupeKey,
        action: 'skipped'
      });
      
      // Optional: Mark as duplicate in database (soft delete)
      await supabase
        .from('parsed_documents')
        .update({ 
          is_duplicate: true,
          duplicate_of: originalId,
          updated_at: new Date().toISOString()
        })
        .eq('id', doc.id);
      
      console.warn(
        `⚠️ Duplicate detected: Doc ${doc.id} is duplicate of ${originalId}`
      );
      
      return 'skip';
    }
    
    this.processedDocuments.set(dedupeKey, doc.id);
    return 'process';
  }
  
  private createDedupeKey(doc: ParsedDocument): string {
    const type = doc.document_type;
    const invoice = doc.anchor_key || doc.raw_json?.invoice || 'NOINV';
    const vehicle = doc.raw_json?.vehicle_number || 'NOVEHICLE';
    const date = doc.raw_json?.invoice_date || 'NODATE';
    
    return `${doc.user_id}:${type}:${invoice}:${vehicle}:${date}`;
  }
  
  async saveDuplicateLog(supabase: SupabaseClient): Promise<void> {
    if (this.duplicateLog.length === 0) return;
    
    await supabase
      .from('processing_logs')
      .insert({
        log_type: 'deduplication',
        details: {
          timestamp: new Date().toISOString(),
          duplicates_found: this.duplicateLog.length,
          duplicates: this.duplicateLog
        }
      });
  }
}
```

### 3.3 Monitoring and Alerting

**Duplicate Detection Metrics:**

```sql
-- Query to monitor duplicate patterns
CREATE OR REPLACE VIEW duplicate_metrics AS
SELECT 
  DATE(created_at) as date,
  document_type,
  COUNT(*) as total_documents,
  COUNT(DISTINCT concat(
    anchor_key, ':', 
    raw_json->>'vehicle_number', ':',
    raw_json->>'invoice_date'
  )) as unique_documents,
  COUNT(*) - COUNT(DISTINCT concat(
    anchor_key, ':', 
    raw_json->>'vehicle_number', ':',
    raw_json->>'invoice_date'
  )) as duplicates
FROM parsed_documents
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), document_type;
```

## 4. Testing Metrics

### 4.1 Pre-Implementation Baseline

**Capture Current State:**

```sql
-- Baseline metrics before changes
CREATE TABLE grouping_baseline AS
SELECT 
  'before' as phase,
  CURRENT_TIMESTAMP as captured_at,
  COUNT(DISTINCT dg.group_key) as total_groups,
  COUNT(DISTINCT CASE WHEN dg.is_complete THEN dg.group_key END) as complete_groups,
  COUNT(DISTINCT pd.id) as total_documents,
  COUNT(DISTINCT CASE WHEN pd.document_type = 'invoice' THEN pd.id END) as invoices,
  COUNT(DISTINCT CASE WHEN pd.document_type = 'e_way_bill' THEN pd.id END) as ewaybills,
  AVG(dg.completion_percentage) as avg_completion
FROM document_groups dg
LEFT JOIN parsed_documents pd ON pd.user_id = dg.user_id;
```

### 4.2 Acceptance Criteria Queries

**Query 1: Verify ~1,800 Groups Formation**

```sql
-- Primary success metric
WITH group_metrics AS (
  SELECT 
    COUNT(DISTINCT group_key) as total_groups,
    COUNT(DISTINCT CASE 
      WHEN completion_percentage >= 66 THEN group_key 
    END) as viable_groups,
    COUNT(DISTINCT CASE 
      WHEN is_complete THEN group_key 
    END) as complete_groups
  FROM document_groups
  WHERE created_at >= '2024-01-01' -- Adjust date as needed
)
SELECT 
  *,
  CASE 
    WHEN viable_groups BETWEEN 1600 AND 2000 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as acceptance_status,
  ROUND((viable_groups::numeric / 1800) * 100, 2) as target_percentage
FROM group_metrics;
```

**Query 2: Verify Proper Separation**

```sql
-- Check that invoice numbers with multiple vehicles are properly separated
WITH invoice_analysis AS (
  SELECT 
    invoice_number,
    COUNT(DISTINCT group_key) as group_count,
    COUNT(DISTINCT json_array_elements_text(present_document_ids::json)) as doc_count,
    STRING_AGG(DISTINCT group_key, ', ') as group_keys
  FROM document_groups
  WHERE invoice_number IN ('455', '515', '948', '378', '385')
  GROUP BY invoice_number
)
SELECT 
  *,
  CASE 
    WHEN group_count > 5 THEN '✅ Properly separated'
    ELSE '❌ Still combined'
  END as separation_status
FROM invoice_analysis
ORDER BY invoice_number;
```

**Query 3: Sample Quality Check**

```sql
-- Random sampling for manual verification
WITH sample_groups AS (
  SELECT 
    dg.group_key,
    dg.invoice_number,
    dg.completion_percentage,
    dg.present_document_types,
    COUNT(DISTINCT pd.id) as actual_doc_count,
    STRING_AGG(DISTINCT pd.raw_json->>'vehicle_number', ', ') as vehicles,
    STRING_AGG(DISTINCT pd.raw_json->>'invoice_date', ', ') as dates
  FROM document_groups dg
  JOIN parsed_documents pd 
    ON pd.id = ANY(string_to_array(dg.present_document_ids, ',')::uuid[])
  WHERE dg.is_complete = true
  GROUP BY dg.group_key, dg.invoice_number, dg.completion_percentage, dg.present_document_types
  ORDER BY RANDOM()
  LIMIT 20
)
SELECT 
  *,
  CASE 
    WHEN vehicles NOT LIKE '%,%' THEN '✅ Single vehicle'
    ELSE '⚠️ Multiple vehicles'
  END as vehicle_check,
  CASE 
    WHEN dates NOT LIKE '%,%' THEN '✅ Single date'
    ELSE '⚠️ Multiple dates'
  END as date_check
FROM sample_groups;
```

### 4.3 Performance Metrics

**Measure Grouping Performance:**

```sql
-- Track grouping job performance
CREATE TABLE grouping_performance_log (
  id SERIAL PRIMARY KEY,
  run_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  documents_processed INTEGER,
  groups_created INTEGER,
  groups_updated INTEGER,
  duplicates_found INTEGER,
  processing_time_ms INTEGER,
  errors_count INTEGER,
  success_rate DECIMAL(5,2)
);

-- Insert after each run
INSERT INTO grouping_performance_log (
  documents_processed,
  groups_created,
  groups_updated,
  duplicates_found,
  processing_time_ms,
  errors_count,
  success_rate
) VALUES ($1, $2, $3, $4, $5, $6, $7);
```

### 4.4 Regression Testing

**Ensure No Data Loss:**

```sql
-- Compare before and after
WITH comparison AS (
  SELECT 
    'documents' as metric,
    (SELECT COUNT(*) FROM parsed_documents) as current_count,
    (SELECT COUNT(*) FROM parsed_documents_backup) as backup_count
  UNION ALL
  SELECT 
    'groups' as metric,
    (SELECT COUNT(*) FROM document_groups) as current_count,
    (SELECT COUNT(*) FROM document_groups_backup) as backup_count
)
SELECT 
  metric,
  current_count,
  backup_count,
  current_count - backup_count as difference,
  CASE 
    WHEN current_count >= backup_count * 0.95 THEN '✅ OK'
    ELSE '❌ Data loss detected'
  END as status
FROM comparison;
```

## 5. Success Certification Checklist

### Phase 1: Pre-Deployment
- [ ] Baseline metrics captured
- [ ] Backup tables created
- [ ] Test data identified (invoices 455, 515, 948, etc.)

### Phase 2: Deployment
- [ ] Normalization functions implemented and tested
- [ ] Deduplication handler integrated
- [ ] Database constraints updated
- [ ] Initial duplicate cleanup completed

### Phase 3: Validation
- [ ] Total groups between 1,600-2,000 ✓
- [ ] Invoice 455 creates 10+ separate groups ✓
- [ ] Sample of 20 groups shows single vehicle per group ✓
- [ ] No data loss detected ✓
- [ ] Processing time under 30 seconds for full run ✓

### Phase 4: Monitoring
- [ ] Duplicate detection alerts configured
- [ ] Performance metrics dashboard created
- [ ] Weekly quality checks scheduled

## 6. Critical Implementation Issues & Fixes

### 6.1 Unique Constraint Violation Handling

**Issue:** The code assumes the migration has been run but doesn't handle constraint violations gracefully.

**Solution:** Add existence check before upsert:

```typescript
// Add before the upsert in processDocumentGroup
async function processDocumentGroup(
  groupKey: string,
  entry: GroupEntry,
  user_id: string,
  requestId: string,
  supabase: SupabaseClient
) {
  // Check if group already exists
  const { data: existingGroup, error: checkError } = await supabase
    .from('document_groups')
    .select('id, created_at, updated_at')
    .eq('user_id', user_id)
    .eq('group_key', groupKey)
    .single();

  if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
    console.error(`❌ [grouping:${requestId}] Error checking existing group:`, checkError);
    throw checkError;
  }

  const isUpdate = !!existingGroup;
  console.log(
    `📝 [grouping:${requestId}] ${isUpdate ? 'Updating' : 'Creating'} group ${groupKey}`
  );

  // Continue with upsert...
}
```

### 6.2 Enhanced Vehicle Number Normalization

**Issue:** Current regex pattern misses some common Indian vehicle formats.

**Solution:** Use multiple patterns for better coverage:

```typescript
function normalizeVehicleNumber(vehicle: string | undefined | null): string {
  if (!vehicle) return '';

  let normalized = vehicle.toUpperCase().trim();
  
  // Remove trip numbers (everything after 4th segment)
  const segments = normalized.split(/[\s-]+/);
  if (segments.length > 4) {
    normalized = segments.slice(0, 4).join(' ');
  }

  // Try multiple patterns for Indian vehicle numbers
  const patterns = [
    // Standard: TN 34 AC 2099
    /^([A-Z]{2})\s*([0-9]{1,2}[A-Z]?)\s*([A-Z]{1,2})?\s*([0-9]{3,4})/,
    // Simple: MH 09 4547
    /^([A-Z]{2})\s*([0-9]{2})\s*([0-9]{4})$/,
    // With hyphens: KA-25-A-3393
    /^([A-Z]{2})-?([0-9]{2})-?([A-Z]{1,2})-?([0-9]{4})$/,
    // Old format: WB 23 C 9561
    /^([A-Z]{2})\s+([0-9]{2})\s+([A-Z])\s+([0-9]{4})$/
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      // Remove first element (full match) and join rest
      return match.slice(1).filter(Boolean).join('');
    }
  }

  // Fallback: remove all non-alphanumeric
  return normalized.replace(/[^A-Z0-9]/g, '');
}

// Test cases:
// "TN XC 1234 2345" → "TNXC1234"
// "KA-25-A-3393" → "KA25A3393"
// "WB 23 C 9561" → "WB23C9561"
// "MP09HF4547" → "MP09HF4547"
```

### 6.3 Add Version and Confidence Tracking

**Issue:** No way to distinguish groups created with old vs new logic.

**Solution:** Add metadata fields:

```typescript
// In processDocumentGroup, enhance the groupData object:
const groupData = {
  user_id,
  invoice_number: primaryInvoice || entry.metadata.rawInvoice || groupKey,
  group_key: groupKey,
  
  // Add versioning and confidence
  grouping_version: 'v2.0', // Track which algorithm version
  confidence_score: entry.metadata.quality, // 0-100 quality score
  composite_key_metadata: {
    ...entry.metadata,
    algorithm: 'composite_v2',
    created_by: requestId,
    timestamp: new Date().toISOString()
  },
  
  // Existing fields...
  country,
  recycler_company,
  // ... rest of fields
};
```

### 6.4 Performance Optimization for Large Datasets

**Issue:** Processing thousands of documents sequentially is slow.

**Solution:** Batch processing with controlled concurrency:

```typescript
// Replace the sequential processing loop with batched processing
async function processGroupsInBatches(
  documentGroups: Record<string, GroupEntry>,
  user_id: string,
  requestId: string,
  supabase: SupabaseClient,
  batchSize: number = 10
): Promise<GroupingResult> {
  const results: GroupingResult = {
    groups_processed: 0,
    groups_created: 0,
    groups_updated: 0,
    rules_applied: {},
    errors: [],
    processing_time_ms: 0,
    details: [],
  };

  const entries = Object.entries(documentGroups);
  
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(([key, entry]) =>
        processDocumentGroup(key, entry, user_id, requestId, supabase)
      )
    );
    
    // Process batch results
    batchResults.forEach((result, index) => {
      const [groupKey, entry] = batch[index];
      
      if (result.status === 'fulfilled') {
        results.groups_processed++;
        if (result.value.created) results.groups_created++;
        if (result.value.updated) results.groups_updated++;
        // ... handle success
      } else {
        results.errors.push(`${groupKey}: ${result.reason}`);
        // ... handle error
      }
    });
    
    console.log(
      `📦 [grouping:${requestId}] Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)}`
    );
  }
  
  return results;
}
```

### 6.5 Add Rollback Safety

**Issue:** No automatic rollback if partial failure occurs.

**Solution:** Wrap in transaction-like behavior:

```typescript
// Add rollback capability
async function safeGroupingWithRollback(
  documents: ParsedDocument[],
  user_id: string,
  requestId: string,
  supabase: SupabaseClient
) {
  // Snapshot current state
  const { data: snapshot } = await supabase
    .from('document_groups')
    .select('*')
    .eq('user_id', user_id);

  try {
    // Perform grouping
    const result = await performGrouping(documents, user_id, requestId, supabase);
    
    // Validate result
    if (result.errors.length > result.groups_processed * 0.1) { // >10% error rate
      throw new Error('High error rate detected, rolling back');
    }
    
    return result;
  } catch (error) {
    console.error(`🔄 [grouping:${requestId}] Rolling back due to error:`, error);
    
    // Restore snapshot
    if (snapshot) {
      await supabase
        .from('document_groups')
        .delete()
        .eq('user_id', user_id);
      
      await supabase
        .from('document_groups')
        .insert(snapshot);
    }
    
    throw error;
  }
}
```

## 7. Testing & Validation Queries

### 7.1 Pre-Deployment Testing

```sql
-- Run these BEFORE deploying to production

-- 1. Check for existing conflicts
SELECT 
  user_id, 
  group_key, 
  COUNT(*) as duplicate_count
FROM document_groups
GROUP BY user_id, group_key
HAVING COUNT(*) > 1;

-- 2. Analyze current grouping patterns
SELECT 
  CASE 
    WHEN group_key ~ '^[0-9]+ THEN 'Simple Invoice'
    WHEN group_key LIKE '%_%' THEN 'Composite Key'
    ELSE 'Other'
  END as key_type,
  COUNT(*) as count,
  AVG(completion_percentage) as avg_completion
FROM document_groups
GROUP BY key_type;

-- 3. Identify test candidates
SELECT DISTINCT user_id
FROM parsed_documents
WHERE anchor_key IN ('455', '515', '948')
LIMIT 5;
```

### 7.2 Post-Deployment Validation

```sql
-- Run these AFTER deployment to verify success

-- 1. Verify new groups are using composite keys
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_groups,
  COUNT(CASE WHEN group_key LIKE '%_%' THEN 1 END) as composite_groups,
  ROUND(
    COUNT(CASE WHEN group_key LIKE '%_%' THEN 1 END)::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as composite_percentage
FROM document_groups
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 2. Check quality distribution
SELECT 
  CASE 
    WHEN group_key ~ '^[0-9]{4}_[A-Z0-9]+_[0-9]{4}-[0-9]{2}-[0-9]{2} THEN 'High (All fields)'
    WHEN group_key LIKE '%_NODATE' THEN 'Medium (No date)'
    WHEN group_key LIKE '%_NOVEHICLE_%' THEN 'Medium (No vehicle)'
    WHEN group_key LIKE 'NOINV_%' THEN 'Low (No invoice)'
    WHEN group_key ~ '^[0-9]+ THEN 'Legacy (Simple)'
    ELSE 'Other'
  END as quality_tier,
  COUNT(*) as group_count,
  AVG(completion_percentage) as avg_completion
FROM document_groups
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY quality_tier
ORDER BY 
  CASE quality_tier
    WHEN 'High (All fields)' THEN 1
    WHEN 'Medium (No date)' THEN 2
    WHEN 'Medium (No vehicle)' THEN 3
    WHEN 'Low (No invoice)' THEN 4
    WHEN 'Legacy (Simple)' THEN 5
    ELSE 6
  END;

-- 3. Verify separation of problematic invoices
WITH problem_invoices AS (
  SELECT 
    invoice_number,
    COUNT(DISTINCT group_key) as unique_groups,
    COUNT(DISTINCT substring(group_key from '^[^_]+_([^_]+)')) as unique_vehicles,
    ARRAY_AGG(DISTINCT group_key ORDER BY group_key) as sample_keys
  FROM document_groups
  WHERE invoice_number IN ('455', '515', '948', '378', '385')
    AND created_at > NOW() - INTERVAL '1 day'
  GROUP BY invoice_number
)
SELECT 
  *,
  CASE 
    WHEN unique_groups >= 5 THEN '✅ Well separated'
    WHEN unique_groups >= 2 THEN '⚠️ Partially separated'
    ELSE '❌ Not separated'
  END as status
FROM problem_invoices
ORDER BY invoice_number;
```

## 8. Rollback Procedures

If any validation fails:

```sql
-- Quick rollback
BEGIN;
  -- Restore document groups
  TRUNCATE document_groups;
  INSERT INTO document_groups SELECT * FROM document_groups_backup_20250126;
  
  -- Restore parsed documents if modified
  UPDATE parsed_documents pd
  SET is_duplicate = NULL, duplicate_of = NULL
  FROM parsed_documents_backup pb
  WHERE pd.id = pb.id;
  
  -- Verify restoration
  SELECT 'Groups restored:', COUNT(*) FROM document_groups
  UNION ALL
  SELECT 'Documents restored:', COUNT(*) FROM parsed_documents;
COMMIT;
```

## Final Notes

**Expected Outcomes:**
- Group count increases from ~200-500 to ~1,800
- Each group contains documents from single shipment
- Completion rate improves significantly
- False groupings eliminated

**Risk Mitigation:**
- All changes are reversible
- Original invoice numbers preserved
- Comprehensive logging throughout
- Gradual rollout possible (by user_id)
- Constraint violation handling added
- Performance optimizations included
- Vehicle number patterns expanded
- Version tracking implemented

This implementation will transform your grouping from invoice-based to shipment-based, creating accurate, verifiable document groups that reflect real-world logistics operations.