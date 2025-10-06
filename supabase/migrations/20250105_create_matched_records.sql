-- Migration: Create matched_records table for invoice-eway bill pairing
-- This table stores validated pairs with compliance tracking and flagging

-- ========================================
-- TABLE: matched_records
-- ========================================

CREATE TABLE IF NOT EXISTS public.matched_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Document References (link to parsed_documents)
  invoice_id UUID NOT NULL REFERENCES parsed_documents(id) ON DELETE CASCADE,
  eway_id UUID NOT NULL REFERENCES parsed_documents(id) ON DELETE CASCADE,
  eft_id UUID REFERENCES parsed_documents(id) ON DELETE SET NULL,
  
  -- Core Identifiers
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  generated_date TIMESTAMPTZ, -- From eway bill
  
  -- Weight Comparison (normalized to KG)
  invoice_weight_kg NUMERIC,
  eway_weight_kg NUMERIC,
  weight_difference_kg NUMERIC GENERATED ALWAYS AS (ABS(COALESCE(invoice_weight_kg, 0) - COALESCE(eway_weight_kg, 0))) STORED,
  weight_match BOOLEAN DEFAULT false,
  
  -- Vehicle Comparison
  invoice_vehicle TEXT,
  eway_vehicle TEXT,
  vehicle_match BOOLEAN DEFAULT false,
  
  -- Company Comparison
  bill_from_company TEXT, -- From invoice
  ship_from_company TEXT, -- From eway bill
  company_match BOOLEAN DEFAULT false,
  
  -- Aggregated Display Fields (for dashboard)
  ship_to_company TEXT,
  plastic_type TEXT,
  country TEXT,
  city TEXT,
  
  -- File URLs (for quick access)
  invoice_file_url TEXT,
  eway_file_url TEXT,
  eft_file_url TEXT,
  
  -- Compliance & Flagging
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reasons TEXT[] DEFAULT '{}',
  flagged_details JSONB, -- Stores mismatch details like {"vehicle": "UP14HT6208 vs UP14HT6209"}
  in_compliance BOOLEAN NOT NULL DEFAULT false, -- Only true if weights match exactly
  
  -- Human Verification
  human_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verification_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  matching_quality_score INTEGER DEFAULT 100,
  
  -- Constraints
  CONSTRAINT unique_user_invoice_eway UNIQUE(user_id, invoice_id, eway_id),
  CONSTRAINT valid_quality_score CHECK (matching_quality_score >= 0 AND matching_quality_score <= 100),
  CONSTRAINT valid_weight_difference CHECK (weight_difference_kg >= 0)
);

-- ========================================
-- INDEXES
-- ========================================

-- Primary lookups
CREATE INDEX idx_matched_records_user_id ON matched_records(user_id);
CREATE INDEX idx_matched_records_invoice_number ON matched_records(invoice_number);

-- Filtering by status
CREATE INDEX idx_matched_records_flagged ON matched_records(flagged) WHERE flagged = true;
CREATE INDEX idx_matched_records_compliance ON matched_records(in_compliance, user_id);
CREATE INDEX idx_matched_records_verified ON matched_records(user_id, human_verified);

-- Dashboard queries
CREATE INDEX idx_matched_records_user_created ON matched_records(user_id, created_at DESC);
CREATE INDEX idx_matched_records_user_compliance ON matched_records(user_id, in_compliance, flagged);

-- Time-based queries
CREATE INDEX idx_matched_records_generated_date ON matched_records(generated_date DESC) WHERE generated_date IS NOT NULL;

-- Document lookups
CREATE INDEX idx_matched_records_invoice_id ON matched_records(invoice_id);
CREATE INDEX idx_matched_records_eway_id ON matched_records(eway_id);

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================

ALTER TABLE matched_records ENABLE ROW LEVEL SECURITY;

-- Users can only see their own matched records
CREATE POLICY "users_own_matched_records" ON matched_records
  FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- TRIGGERS
-- ========================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_matched_records_updated_at 
  BEFORE UPDATE ON matched_records
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE matched_records IS 'Invoice-eway bill pairs with validation, flagging, and compliance tracking. Replaces document_groups for matching workflow.';

COMMENT ON COLUMN matched_records.invoice_id IS 'Reference to invoice in parsed_documents';
COMMENT ON COLUMN matched_records.eway_id IS 'Reference to e-way bill in parsed_documents';
COMMENT ON COLUMN matched_records.eft_id IS 'Optional reference to EFT receipt (NULL for Indian recyclers with 2-doc rule)';

COMMENT ON COLUMN matched_records.weight_difference_kg IS 'Computed column: absolute difference between invoice and eway weights';
COMMENT ON COLUMN matched_records.in_compliance IS 'TRUE only if weights match exactly (0 difference) - strict compliance rule';

COMMENT ON COLUMN matched_records.flagged IS 'TRUE if any mismatch detected (vehicle, company, weight)';
COMMENT ON COLUMN matched_records.flag_reasons IS 'Array of flag reasons: vehicle_mismatch, company_from_mismatch, weight_mismatch';
COMMENT ON COLUMN matched_records.flagged_details IS 'JSON with mismatch details for display in review modal';

COMMENT ON COLUMN matched_records.human_verified IS 'TRUE after manual review via dashboard (for flagged records or auto-verified compliant records)';
COMMENT ON COLUMN matched_records.matching_quality_score IS '0-100 score based on match confidence (exact=100, fuzzy=lower)';
