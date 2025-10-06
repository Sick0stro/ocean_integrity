-- Migration: Add weight normalization column to parsed_documents
-- Stores weight converted to KG using smart decimal rule logic
-- This allows matching service to compare weights consistently

-- ========================================
-- ADD COLUMN
-- ========================================

ALTER TABLE parsed_documents
ADD COLUMN IF NOT EXISTS weight_kg_normalized NUMERIC;

-- ========================================
-- INDEX
-- ========================================

-- Index for faster matching queries (comparing weights between documents)
CREATE INDEX IF NOT EXISTS idx_parsed_documents_weight 
ON parsed_documents(weight_kg_normalized) 
WHERE weight_kg_normalized IS NOT NULL;

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON COLUMN parsed_documents.weight_kg_normalized IS 
'Weight normalized to KG using smart decimal rule: 
- If decimal exists and 55-550: (value/10)*1000 (e.g., 55.5 → 5550 kg)
- If > 550: return as-is (already KG)
- If < 55 with decimal: value*1000 (tons to KG)
- Applied during matching service processing';
