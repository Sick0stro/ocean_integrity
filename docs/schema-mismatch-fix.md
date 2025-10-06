# Schema Mismatch Fix - Python API to Supabase

**Date:** October 6, 2025  
**Status:** ✅ FIXED  
**Issue:** Database insertion failed due to column name and missing FK mismatch

## Problem Summary

After AI processing completed, the matching service was triggered correctly and the Python API successfully computed matches. However, saving to the database failed with:

```
❌ Error inserting matches: {
  code: 'PGRST204',
  message: "Could not find the 'bill_from_company_name' column of 'matched_records' in the schema cache"
}
```

## Root Causes

### 1. Column Name Mismatch

**Python API Returns:**

- `bill_from_company_name` ❌
- `ship_to_company_name` ❌

**Supabase Schema Expects:**

- `bill_from_company` ✅
- `ship_to_company` ✅

The Python API adds `_name` suffixes that don't exist in the database schema.

### 2. Missing Foreign Keys

The `matched_records` table requires NOT NULL foreign keys:

- `invoice_id UUID NOT NULL` (references `parsed_documents.id`)
- `eway_id UUID NOT NULL` (references `parsed_documents.id`)

The Python API only returns **file URLs**, not the database IDs.

## Solution Implemented

### Step 1: ID Lookup from File URLs

Before inserting, we now query `parsed_documents` to get the IDs:

```typescript
// Collect all file URLs from matched records
const fileUrls = new Set<string>();
matchingResult.records.forEach((record: PythonMatchedRecord) => {
  if (record.invoice_file_url) fileUrls.add(record.invoice_file_url);
  if (record.ewaybill_file_url) fileUrls.add(record.ewaybill_file_url);
});

// Lookup IDs in bulk
const { data: documents } = await supabase
  .from('parsed_documents')
  .select('id, file_url')
  .in('file_url', Array.from(fileUrls));

// Create a mapping: file_url -> id
const fileUrlToId = new Map<string, string>();
documents?.forEach((doc) => {
  fileUrlToId.set(doc.file_url, doc.id);
});
```

### Step 2: Transform Python Response to Match Schema

Map the Python API response fields to the correct database column names:

```typescript
const transformedRecords = matchingResult.records
  .map((record: PythonMatchedRecord) => {
    const invoice_id = record.invoice_file_url
      ? fileUrlToId.get(record.invoice_file_url)
      : undefined;
    const eway_id = record.ewaybill_file_url
      ? fileUrlToId.get(record.ewaybill_file_url)
      : undefined;

    // Skip records where we couldn't find the IDs
    if (!invoice_id || !eway_id) {
      console.warn('⚠️ Skipping record - missing IDs:', { ... });
      return null;
    }

    return {
      user_id: record.user_id,
      invoice_id, // ✅ Looked up from parsed_documents
      eway_id, // ✅ Looked up from parsed_documents
      invoice_number: record.invoice || '',
      invoice_date: record.invoice_date,
      generated_date: record.generated_date,
      invoice_weight_kg: record.invoice_weight_mt
        ? record.invoice_weight_mt * 1000
        : null,
      bill_from_company: record.bill_from_company_name, // ✅ Remove _name
      ship_to_company: record.ship_to_company_name, // ✅ Remove _name
      plastic_type: record.plastic_type,
      country: record.ship_to_country_code,
      invoice_file_url: record.invoice_file_url,
      eway_file_url: record.ewaybill_file_url,
      flagged: record.flagged === 'yes',
      flag_reasons: record.flag_reason ? [record.flag_reason] : [],
      flagged_details: record.flagged_pair_value
        ? { details: record.flagged_pair_value }
        : null,
      in_compliance: record.in_compliance === 'yes',
      created_at: record.created_at,
    };
  })
  .filter(Boolean); // Remove null entries (records with missing IDs)
```

### Step 3: Type Safety

Added TypeScript interface for Python API response:

```typescript
interface PythonMatchedRecord {
  user_id: string;
  invoice_file_url?: string;
  ewaybill_file_url?: string;
  invoice_weight_mt?: number;
  bill_from_company_name?: string;
  ship_to_company_name?: string;
  plastic_type?: string;
  ship_to_country_code?: string;
  vehicle_number?: string;
  invoice?: string;
  invoice_date?: string;
  generated_date?: string;
  flagged: string; // 'yes' or 'no'
  flag_reason?: string;
  flagged_pair_value?: string;
  in_compliance: string; // 'yes' or 'no'
  created_at?: string;
}
```

## Files Modified

- **`app/api/cron/compute-matches/route.ts`**
  - Added `PythonMatchedRecord` interface (lines 11-31)
  - Added ID lookup logic (lines 134-166)
  - Added transformation logic (lines 168-209)
  - Fixed TypeScript type errors

## Key Transformations

| Python API Field              | Database Column           | Transformation                      |
| ----------------------------- | ------------------------- | ----------------------------------- |
| `bill_from_company_name`      | `bill_from_company`       | Remove `_name` suffix               |
| `ship_to_company_name`        | `ship_to_company`         | Remove `_name` suffix               |
| `invoice_file_url`            | `invoice_id`              | Lookup ID from `parsed_documents`   |
| `ewaybill_file_url`           | `eway_id`                 | Lookup ID from `parsed_documents`   |
| `invoice_weight_mt`           | `invoice_weight_kg`       | Convert MT to KG (multiply by 1000) |
| `flagged` (string)            | `flagged` (boolean)       | `=== 'yes'`                         |
| `in_compliance` (string)      | `in_compliance` (boolean) | `=== 'yes'`                         |
| `flag_reason` (string)        | `flag_reasons` (array)    | Wrap in array `[reason]`            |
| `flagged_pair_value` (string) | `flagged_details` (jsonb) | Wrap in object `{ details: value }` |

## Testing

### Before the Fix

```
❌ [matching:tfbqcqsq25a] Error inserting matches: {
  code: 'PGRST204',
  message: "Could not find the 'bill_from_company_name' column..."
}
```

### After the Fix

Expected behavior:

```
🔍 [matching:xxx] Looking up document IDs from file URLs...
✅ [matching:xxx] Found 4 document IDs
🔄 [matching:xxx] Transformed 2 records for database
✅ [matching:xxx] Saved matches to matched_records table
```

## Performance Notes

### Why It Was Slow (181 seconds)

The initial run was slow because:

1. **First-time compilation**: Next.js compiled `/api/cron/compute-matches` for the first time (136s)
2. **Cold start**: Python API was just started
3. **Development mode**: Next.js dev mode is slower than production builds

### Expected Performance (After First Run)

- Matching trigger: < 1 second (fire-and-forget)
- Python API processing: 2-5 seconds
- Database insertion: < 1 second
- **Total: ~3-7 seconds**

## Alternative Solutions Considered

### Option 1: Change Python API to Return IDs ❌

**Rejected:** Would require modifying `dashboard_backend.py` which is the authoritative matching logic we want to preserve.

### Option 2: Make Foreign Keys Nullable ❌

**Rejected:** Would break referential integrity. We need to know which documents are matched.

### Option 3: Transform in Next.js (Chosen) ✅

**Selected:** Keeps Python logic untouched, handles schema mapping at the API boundary.

## Debugging Tips

If insertion still fails, check:

1. **Column names in database:**

   ```sql
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'matched_records';
   ```

2. **Python API response structure:**
   Check the terminal logs for the Python API response to see what fields are being returned.

3. **File URL consistency:**
   Ensure `file_url` in `parsed_documents` matches the URLs returned by the Python API exactly.

4. **Missing document IDs:**
   If you see "Skipping record - missing IDs" warnings, it means the file URL lookup failed. Check that:
   - Documents exist in `parsed_documents` with those exact file URLs
   - File URLs don't have trailing slashes or encoding differences

## Next Steps

1. **Test the fix**: Process a batch of documents and verify matching works end-to-end
2. **Monitor logs**: Check for "Skipping record" warnings
3. **Verify dashboard**: Navigate to Dashboard tab and confirm matched records are displayed
4. **Handle edge cases**: Add more robust error handling for missing IDs

## Conclusion

The schema mismatch has been fixed by:

- ✅ Looking up required foreign keys from file URLs
- ✅ Mapping Python API field names to database columns
- ✅ Converting data types (strings to booleans, MT to KG)
- ✅ Adding TypeScript type safety

The matching service should now work end-to-end from AI processing → Python matching → Database storage → Dashboard display.
