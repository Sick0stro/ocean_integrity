-- Add batch tracking columns to temp_documents and single_documents

-- Ensure pgcrypto extension available for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- temp_documents: add upload_batch_id and timestamps
ALTER TABLE public.temp_documents
  ADD COLUMN IF NOT EXISTS upload_batch_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.temp_documents
SET upload_batch_id = COALESCE(upload_batch_id, gen_random_uuid())
WHERE upload_batch_id IS NULL;

ALTER TABLE public.temp_documents
  ALTER COLUMN upload_batch_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN upload_batch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_temp_documents_upload_batch
  ON public.temp_documents (upload_batch_id, user_id);

-- single_documents: add upload_batch_id, timestamps, processed_at
ALTER TABLE public.single_documents
  ADD COLUMN IF NOT EXISTS upload_batch_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

UPDATE public.single_documents
SET upload_batch_id = COALESCE(upload_batch_id, gen_random_uuid())
WHERE upload_batch_id IS NULL;

ALTER TABLE public.single_documents
  ALTER COLUMN upload_batch_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN upload_batch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_single_documents_upload_batch_status
  ON public.single_documents (upload_batch_id, status, user_id);


