-- Add human verification columns to recycling_docs table
ALTER TABLE public.recycling_docs 
ADD COLUMN IF NOT EXISTS human_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Add index for human verification queries
CREATE INDEX IF NOT EXISTS idx_recycling_docs_human_verified 
ON public.recycling_docs(human_verified);

-- Update existing rows to have human_verified = false if null
UPDATE public.recycling_docs 
SET human_verified = false 
WHERE human_verified IS NULL;
