-- Migration: Move human verification from recycling_docs to document_groups
-- Moves human_verified and verified_at columns from recycling_docs to document_groups

-- ========================================
-- ADD COLUMNS TO document_groups
-- ========================================

-- Add human verification columns to document_groups
ALTER TABLE public.document_groups 
ADD COLUMN IF NOT EXISTS human_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Add index for human verification queries on document_groups
CREATE INDEX IF NOT EXISTS idx_document_groups_human_verified 
ON public.document_groups(human_verified);

CREATE INDEX IF NOT EXISTS idx_document_groups_user_verified 
ON public.document_groups(user_id, human_verified);

-- Update existing document_groups rows to have human_verified = false if null
UPDATE public.document_groups 
SET human_verified = false 
WHERE human_verified IS NULL;

-- ========================================
-- REMOVE COLUMNS FROM recycling_docs
-- ========================================

-- Remove human verification columns from recycling_docs (they belong in document_groups)
ALTER TABLE public.recycling_docs 
DROP COLUMN IF EXISTS human_verified,
DROP COLUMN IF EXISTS verified_at;

-- Drop the old index from recycling_docs
DROP INDEX IF EXISTS idx_recycling_docs_human_verified;

-- ========================================
-- COMMENTS FOR CLARITY
-- ========================================

COMMENT ON COLUMN public.document_groups.human_verified IS 'Human verification status - handled in document_groups, not recycling_docs';
COMMENT ON COLUMN public.document_groups.verified_at IS 'Timestamp when human verification was completed';
COMMENT ON TABLE public.recycling_docs IS 'Blockchain submission data only - populated when Push to Plastiks is clicked';
