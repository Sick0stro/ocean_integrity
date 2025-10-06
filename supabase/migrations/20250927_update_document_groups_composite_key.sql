-- Migration: Update document_groups unique constraint for composite key support
-- Context: Backend grouping now uses composite keys (invoice digits + vehicle + date)

BEGIN;

-- Ensure the table exists before altering (safe-guard for local dev)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'document_groups'
  ) THEN
    RAISE NOTICE 'Table public.document_groups does not exist, skipping migration.';
    RETURN;
  END IF;
END
$$;

-- Drop the legacy unique constraint on (user_id, invoice_number) if present
ALTER TABLE public.document_groups
  DROP CONSTRAINT IF EXISTS document_groups_user_id_invoice_number_key;

-- Add unique constraint on (user_id, group_key) to support composite shipment keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_groups_user_id_group_key_key'
  ) THEN
    ALTER TABLE public.document_groups
      ADD CONSTRAINT document_groups_user_id_group_key_key
      UNIQUE (user_id, group_key);
  ELSE
    RAISE NOTICE 'Constraint document_groups_user_id_group_key_key already exists, skipping add.';
  END IF;
END$$;

-- Optional performance index to keep lookups efficient on the new composite key
CREATE INDEX IF NOT EXISTS idx_document_groups_user_group_key
  ON public.document_groups(user_id, group_key);

COMMIT;

-- Additional columns for two-phase grouping metadata (verification + phase tracking)
BEGIN;

ALTER TABLE public.document_groups
  ADD COLUMN IF NOT EXISTS needs_human_verification BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_reason TEXT,
  ADD COLUMN IF NOT EXISTS grouping_phase VARCHAR(20) DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_document_groups_needs_verification
  ON public.document_groups(needs_human_verification)
  WHERE needs_human_verification = true;

CREATE INDEX IF NOT EXISTS idx_document_groups_phase
  ON public.document_groups(grouping_phase);

CREATE INDEX IF NOT EXISTS idx_document_groups_verification_workflow
  ON public.document_groups(user_id, needs_human_verification, created_at)
  WHERE needs_human_verification = true;

COMMIT;