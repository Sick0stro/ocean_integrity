-- Create recycling_docs table
create table if not exists public.recycling_docs (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  invoice_url text not null,
  eft_url text not null,
  ewaybill_url text not null,
  recycler_company text not null,
  plastic_type text not null,
  tonnage_kg numeric(18,3) not null,
  origin text not null,
  currency text not null,
  upload_date date,
  uploaded_by text,
  status text not null default 'new',
  plastiks_collection_id bigint,
  plastiks_collection_address text,
  plastiks_metadata_hash text,
  plastiks_tx_hash text,
  plastiks_last_error text,
  plastiks_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful index
create index if not exists idx_recycling_docs_status on public.recycling_docs(status);
