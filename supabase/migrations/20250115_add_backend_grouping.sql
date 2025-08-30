-- Migration: Backend Document Grouping System
-- Adds document_groups and business_rules tables for country-specific business logic

-- ========================================
-- TABLE: business_rules
-- Stores country-specific document requirements
-- ========================================

CREATE TABLE IF NOT EXISTS public.business_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Rule Identity
  rule_name TEXT NOT NULL UNIQUE,
  rule_version TEXT NOT NULL DEFAULT 'v1',
  description TEXT,
  
  -- Rule Conditions
  country TEXT, -- Apply to specific country ('IN', 'US', 'BR', etc.) NULL = global default
  region TEXT, -- Apply to specific region (future use)
  business_type TEXT, -- Apply to B2B/B2C (future use)
  
  -- Rule Configuration
  required_documents TEXT[] NOT NULL, -- Required document types
  optional_documents TEXT[] DEFAULT '{}', -- Optional document types
  minimum_required INTEGER NOT NULL DEFAULT 3, -- Minimum docs needed for completion
  
  -- Rule Metadata
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100, -- Lower = higher priority for rule resolution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial business rules
INSERT INTO business_rules (rule_name, country, required_documents, optional_documents, minimum_required, description) VALUES
('indian_recyclers', 'IN', ARRAY['invoice', 'e-way-bill'], ARRAY['eft_receipt'], 2, 'Indian recyclers only need Invoice + E-way Bill'),
('global_default', NULL, ARRAY['invoice', 'eft_receipt', 'e-way-bill'], ARRAY[]::TEXT[], 3, 'Global default: All 3 documents required')
ON CONFLICT (rule_name) DO NOTHING;

-- Indexes for business_rules
CREATE INDEX IF NOT EXISTS idx_business_rules_country ON business_rules(country);
CREATE INDEX IF NOT EXISTS idx_business_rules_active ON business_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_business_rules_priority ON business_rules(priority);

-- ========================================
-- TABLE: document_groups
-- Stores pre-computed document groups with applied business rules
-- ========================================

CREATE TABLE IF NOT EXISTS public.document_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  
  -- Group Identity
  invoice_number TEXT NOT NULL,
  group_key TEXT NOT NULL, -- Computed grouping key (handles invoice variations)
  
  -- Business Context (extracted from documents)
  country TEXT, -- Detected country ('IN', 'US', 'BR', etc.)
  region TEXT, -- Future use
  plastic_type TEXT, -- Extracted plastic type
  recycler_company TEXT, -- Extracted company name
  
  -- Applied Business Rules
  applied_rule_name TEXT REFERENCES business_rules(rule_name),
  required_document_types TEXT[] NOT NULL, -- What's required for this group
  optional_document_types TEXT[] DEFAULT '{}', -- What's optional for this group  
  minimum_required INTEGER NOT NULL DEFAULT 3, -- How many docs needed for completion
  
  -- Current Status
  present_document_types TEXT[] NOT NULL DEFAULT '{}', -- What's actually uploaded
  present_document_ids UUID[] NOT NULL DEFAULT '{}', -- IDs of present parsed_documents
  completion_count INTEGER NOT NULL DEFAULT 0, -- How many required docs we have
  missing_document_types TEXT[] NOT NULL DEFAULT '{}', -- What's still missing
  
  -- Computed States
  is_complete BOOLEAN NOT NULL DEFAULT FALSE, -- completion_count >= minimum_required
  can_verify BOOLEAN NOT NULL DEFAULT FALSE, -- is_complete AND all validation passes
  completion_percentage INTEGER NOT NULL DEFAULT 0, -- (completion_count/minimum_required) * 100
  
  -- Verification Status (from recycling_docs)
  is_promoted BOOLEAN NOT NULL DEFAULT FALSE, -- Exists in recycling_docs table
  is_human_verified BOOLEAN NOT NULL DEFAULT FALSE, -- Human verification completed
  human_verified_at TIMESTAMPTZ, -- When human verification was completed
  
  -- Processing Metadata
  last_processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_version TEXT NOT NULL DEFAULT 'v1', -- For backwards compatibility
  processing_logs JSONB DEFAULT '{}', -- Detailed processing information
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_user_invoice UNIQUE(user_id, invoice_number),
  CONSTRAINT valid_completion_percentage CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  CONSTRAINT valid_completion_count CHECK (completion_count >= 0)
);

-- Indexes for document_groups (optimized for common queries)
CREATE INDEX IF NOT EXISTS idx_document_groups_user_id ON document_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_document_groups_country ON document_groups(country);
CREATE INDEX IF NOT EXISTS idx_document_groups_complete ON document_groups(is_complete);
CREATE INDEX IF NOT EXISTS idx_document_groups_can_verify ON document_groups(can_verify);
CREATE INDEX IF NOT EXISTS idx_document_groups_promoted ON document_groups(is_promoted);
CREATE INDEX IF NOT EXISTS idx_document_groups_verified ON document_groups(is_human_verified);
CREATE INDEX IF NOT EXISTS idx_document_groups_processing ON document_groups(last_processed_at);
CREATE INDEX IF NOT EXISTS idx_document_groups_user_complete ON document_groups(user_id, is_complete); -- Composite for dashboard

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================

-- Enable RLS on document_groups
ALTER TABLE document_groups ENABLE ROW LEVEL SECURITY;

-- Users can only see their own document groups
CREATE POLICY "users_own_document_groups" ON document_groups
  FOR ALL USING (auth.uid() = user_id);

-- business_rules is read-only for all authenticated users
-- (No RLS needed as rules are global configuration)

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to get applicable business rule for a country
CREATE OR REPLACE FUNCTION get_business_rule(target_country TEXT DEFAULT NULL)
RETURNS TABLE (
  rule_name TEXT,
  required_documents TEXT[],
  optional_documents TEXT[],
  minimum_required INTEGER
) 
LANGUAGE plpgsql AS $$
BEGIN
  -- First try country-specific rule
  IF target_country IS NOT NULL THEN
    RETURN QUERY 
    SELECT br.rule_name, br.required_documents, br.optional_documents, br.minimum_required
    FROM business_rules br
    WHERE br.country = target_country 
      AND br.is_active = TRUE
    ORDER BY br.priority ASC
    LIMIT 1;
    
    -- If country rule found, return it
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;
  
  -- Fallback to global default rule
  RETURN QUERY
  SELECT br.rule_name, br.required_documents, br.optional_documents, br.minimum_required
  FROM business_rules br
  WHERE br.country IS NULL 
    AND br.is_active = TRUE
  ORDER BY br.priority ASC
  LIMIT 1;
END;
$$;

-- ========================================
-- TRIGGER FOR AUTOMATIC UPDATES
-- ========================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for document_groups
CREATE TRIGGER update_document_groups_updated_at 
  BEFORE UPDATE ON document_groups
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for business_rules  
CREATE TRIGGER update_business_rules_updated_at
  BEFORE UPDATE ON business_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
