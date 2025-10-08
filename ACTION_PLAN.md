# Action Plan to Fix Invoice & City Issues

## Step 1: Update Python API (5 minutes)

```bash
cd python_api
# Stop the current process with Ctrl+C
# Restart it:
python main.py
```

**Why**: The Python API now includes invoice numbers in the response.

## Step 2: Fix Existing Data in Database (2 minutes)

Run this SQL in Supabase SQL Editor:

```sql
-- Update empty invoice numbers from parsed_documents
UPDATE matched_records mr
SET invoice_number = pd.raw_json->>'invoice'
FROM parsed_documents pd
WHERE mr.invoice_id = pd.id
  AND (mr.invoice_number = '' OR mr.invoice_number IS NULL)
  AND pd.raw_json->>'document_type' = 'invoice'
  AND pd.raw_json->>'invoice' IS NOT NULL
  AND pd.raw_json->>'invoice' != '';

-- Verify the fix
SELECT COUNT(*) as fixed_count
FROM matched_records
WHERE invoice_number IS NOT NULL AND invoice_number != '';
```

## Step 3: Restart Next.js (2 minutes)

```bash
# In your main terminal
Ctrl+C  # Stop Next.js
npx next dev  # Restart
```

## Step 4: Hard Refresh Browser (10 seconds)

Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

## What You'll See:

1. ✅ Invoice numbers properly displayed (not "[MISSING INVOICE NUMBER]")
2. ✅ "Push to Plastiks" button disappears immediately after submission
3. ✅ City data consistent between tables (using Gemini extraction)
4. ✅ Can submit documents to blockchain properly

## Verification:

1. Go to Blockchain tab
2. Documents should show actual invoice numbers
3. Click "Push to Plastiks" on any document
4. Button should disappear immediately after success
5. Check Dashboard tab - city should match between tables

## Summary of Changes:

- **Python API**: Now returns invoice field from parsed_documents
- **Frontend**: Added status field to query, added safeguards for empty invoices
- **Promote API**: Now uses city from matched_records (Gemini) instead of old AI extraction
