# Fix Empty Invoice Numbers in matched_records

## The Problem

The Python matching API was not returning invoice numbers, causing all matched_records to have empty invoice_number fields. This causes issues in the blockchain tab where documents are keyed by invoice number.

## The Fix

### 1. Python API Fix (Already Applied)

Added the invoice field to:
- `dashboard_backend.py`: Added `"invoice": best.get("invoice", "")` to the row dictionary
- `main.py`: Added `invoice: Optional[str]` to MatchedRecord model
- `main.py`: Added `invoice=str(row.get('invoice', ''))` when creating MatchedRecord

### 2. Restart Python API

```bash
cd python_api
# Stop the current process (Ctrl+C)
# Restart it:
python main.py
```

### 3. Fix Existing Records in Database

For records that already have empty invoice numbers, you can update them by extracting the invoice number from the parsed_documents table:

```sql
-- First, check how many records have empty invoice numbers
SELECT COUNT(*) 
FROM matched_records 
WHERE invoice_number = '' OR invoice_number IS NULL;

-- View sample of affected records
SELECT mr.id, mr.invoice_number, pd.raw_json->>'invoice' as extracted_invoice
FROM matched_records mr
JOIN parsed_documents pd ON mr.invoice_id = pd.id
WHERE (mr.invoice_number = '' OR mr.invoice_number IS NULL)
LIMIT 10;

-- Update matched_records with invoice numbers from parsed_documents
UPDATE matched_records mr
SET invoice_number = pd.raw_json->>'invoice'
FROM parsed_documents pd
WHERE mr.invoice_id = pd.id
  AND (mr.invoice_number = '' OR mr.invoice_number IS NULL)
  AND pd.raw_json->>'invoice' IS NOT NULL;
```

### 4. Re-run Matching for Documents

After fixing the Python API, you can re-run the matching process to properly populate invoice numbers for new matches.

## Prevention

The frontend now has safeguards:
1. Shows "[MISSING INVOICE NUMBER]" in red when invoice number is empty
2. Prevents submission to blockchain if invoice number is empty
3. Shows an alert explaining the issue

## Testing

1. After restarting Python API, run matching on new documents
2. Check that new matched_records have proper invoice_number values
3. Verify blockchain tab shows invoice numbers correctly
4. Confirm "Push to Plastiks" button works properly
