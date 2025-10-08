-- Fix empty invoice numbers in matched_records by extracting from parsed_documents raw_json

-- First, let's see what we're dealing with
SELECT 
    mr.id,
    mr.invoice_number as current_invoice_number,
    pd.raw_json->>'invoice' as invoice_from_json,
    pd.raw_json->>'document_type' as doc_type
FROM matched_records mr
JOIN parsed_documents pd ON mr.invoice_id = pd.id
WHERE (mr.invoice_number = '' OR mr.invoice_number IS NULL)
  AND pd.raw_json->>'document_type' = 'invoice'
LIMIT 10;

-- Update matched_records with invoice numbers from parsed_documents
UPDATE matched_records mr
SET invoice_number = pd.raw_json->>'invoice'
FROM parsed_documents pd
WHERE mr.invoice_id = pd.id
  AND (mr.invoice_number = '' OR mr.invoice_number IS NULL)
  AND pd.raw_json->>'document_type' = 'invoice'
  AND pd.raw_json->>'invoice' IS NOT NULL
  AND pd.raw_json->>'invoice' != '';

-- Verify the update
SELECT 
    COUNT(*) as updated_count,
    COUNT(CASE WHEN invoice_number != '' AND invoice_number IS NOT NULL THEN 1 END) as non_empty_count
FROM matched_records;
