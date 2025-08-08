### Ocean Integrity — Ingestion and Plastiks Integration

This app ingests accounting document metadata, stores it in Supabase, and optionally submits a summarized record to the Plastiks staging API for blockchain-backed PRG (Plastic Recovery Guarantee) registration.

### What the app does

- Uploads PDFs (via UI) to Supabase Storage for your internal workflows (legacy flow; optional here).
- Accepts a JSON payload via API containing:
  - `invoice_number` (anchor key across PDFs)
  - Public PDF URLs for invoice/EFT/e‑way bill
  - Business metadata (recycler company, plastic type, tonnage, location, currency)
- Upserts rows into `recycling_docs` by `invoice_number`.
- Submits pending rows to Plastiks staging, performs Web3 signing, and stores returned identifiers/hashes.

### Environments

- Supabase: used for DB and file storage.
- Plastiks staging: `https://staging.plastiks.io` (test network).
- Local dev: `http://localhost:3000` for your Next.js server.

### Environment variables

Add these to `.env` (or `.env.local`) and restart `npm run dev`:

- Supabase
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Plastiks
  - `PLASTIKS_BASE_URL` (optional; defaults to `https://staging.plastiks.io`)
  - `API_TOKEN_CALL` (Plastiks API token, e.g. `plastiks_test_api_key_2024`)
  - `USER_ADDRESS` (checksummed EVM address that matches your private key)
  - `PRIVATE_KEY` (hex; `0x` prefix allowed)
- Route protection
  - `CRON_INGEST_SECRET` (shared secret for ingestion endpoint)
  - `CRON_SUBMIT_SECRET` (shared secret for submit endpoint)

### Database schema (table: `recycling_docs`)

One row per `invoice_number`. You can safely run this to add any missing columns.

```sql
alter table public.recycling_docs
  add column if not exists invoice_number text,
  add column if not exists invoice_url text,
  add column if not exists eft_url text,
  add column if not exists ewaybill_url text,
  add column if not exists recycler_company text,
  add column if not exists plastic_type text,
  add column if not exists tonnage_tons numeric(18,3),     -- canonical unit
  add column if not exists tonnage_kg numeric(18,3),       -- back-compat (derived)
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists origin text,
  add column if not exists currency text,
  add column if not exists upload_date date,
  add column if not exists uploaded_by text,
  add column if not exists status text default 'new',
  add column if not exists plastiks_collection_id bigint,
  add column if not exists plastiks_collection_address text,
  add column if not exists plastiks_metadata_hash text,
  add column if not exists plastiks_tx_hash text,
  add column if not exists plastiks_last_error text,
  add column if not exists plastiks_submitted_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
create index if not exists idx_recycling_docs_status on public.recycling_docs(status);
```

Notes:

- We store `tonnage_tons` as the source of truth (you send tonnes). We also fill `tonnage_kg` for deployments where the column is NOT NULL.
- `status` transitions: `new|updated` → `submitted` or `failed`.

### API endpoints (server)

- POST `/api/cron/recycling-docs`

  - Purpose: Idempotent upsert of payload rows by `invoice_number`.
  - Auth: include header `x-cron-secret: <CRON_INGEST_SECRET>` or `?secret=...` (query param allowed in dev).
  - Body: JSON array of objects, e.g.:
    ```json
    [
      {
        "invoice_number": "INV-2025-0007",
        "invoice_url": "https://…/inv.pdf",
        "eft_url": "https://…/eft.pdf",
        "ewaybill_url": "https://…/ewb.pdf",
        "recycler_company": "Green Recyclers Ltd",
        "plastic_type": "PET",
        "tonnage_value": 12.75,
        "tonnage_unit": "t",
        "country": "IN",
        "city": "Mumbai",
        "currency": "INR",
        "upload_date": "2025-08-06",
        "uploaded_by": "partner-system"
      }
    ]
    ```
  - Validation:
    - Required: `invoice_number`, all three URLs, `recycler_company`, `plastic_type`, `tonnage_value`, `country`, `city`, `currency`.
    - Plastic types allowed now: `LDPE`, `PET`, `PP`, `PVC` (case-insensitive).
    - Units: if `tonnage_unit` omitted, defaults to tonnes.
  - Behavior:
    - Stores `tonnage_tons` and also fills `tonnage_kg = tonnage_tons * 1000` (for back-compat).
    - Upsert by `invoice_number`.
  - Responses:
    - 200: `{ "success": true, "upserted": N }`
    - 400: `{ "error": "Ingestion failed", "details": "…" }` (DB validation will be surfaced here)

- POST `/api/plastiks/submit`
  - Purpose: Find rows with `status in ('new','updated')` and submit to Plastiks staging.
  - Auth: header `x-cron-secret: <CRON_SUBMIT_SECRET>` or `?secret=...`.
  - Optional: `?invoice=INV-…` to limit to one invoice.
  - Behavior:
    - Loads Plastiks blockchain config.
    - Creates a PRG collection with:
      - Name: `<recycler_company> – <invoice_number>`
      - Description: summary with type/tons/city/country
      - Plastic type mapping: `PET→"PET 1"`, `PP→"PP 5"`, `PVC→"PVC 3"`, `LDPE→"LDPE 4"`
      - `use_autogen_image=false` (avoid staging dependency)
      - Minimal non-zero token price (derived from weight) and `no_of_copies`
    - Performs Web3 signing with your `PRIVATE_KEY`:
      - sign metadata hash → save
      - sign fixed price (EIP‑712)
      - sign PRG voucher (EIP‑712)
    - On success, updates row to `submitted` with: `plastiks_collection_id`, `plastiks_collection_address`, `plastiks_metadata_hash`, `plastiks_submitted_at`.
    - On failure, sets `status='failed'` and stores `plastiks_last_error` (includes HTTP status and body).
  - Response: summary object with per-invoice status.

### Local testing

- Start dev server:

  ```bash
  npm install
  npm run dev
  ```

- Ingest (Git Bash / WSL):
  ```bash
  curl -sS -X POST "http://localhost:3000/api/cron/recycling-docs?secret=local-dev-ingest-123" \
    -H "Content-Type: application/json" \
    --data-binary @data/payload.json
  ```
- Ingest (PowerShell):
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/cron/recycling-docs?secret=local-dev-ingest-123" -Method Post -ContentType "application/json" -Body (Get-Content -Path "data/payload.json" -Raw)
  ```
- Submit (any shell):
  ```bash
  curl -sS -X POST "http://localhost:3000/api/plastiks/submit?secret=local-dev-submit-123"
  ```

### Storage URLs — public vs signed

- Current UI uses public Supabase Storage URLs via `getPublicUrl()` from the `documents` bucket.
- If needed later, you can switch to private buckets and signed URLs (server-minted, time-limited) and store `storage_path` instead.

### Troubleshooting

- 401 Unauthorized
  - Ensure header `x-cron-secret` matches `.env`, or pass `?secret=…` in dev.
  - Restart `npm run dev` after changing `.env`.
- 400 Ingestion failed
  - The response `details` includes the DB or validation error (e.g., NOT NULL on a missing column).
  - Ensure `recycling_docs` has the columns listed above.
  - Ensure the JSON body is an array, not a single object.
- Plastiks errors (500/422/etc.)
  - The response includes HTTP status and the returned body (also saved in `plastiks_last_error`).
  - Verify `API_TOKEN_CALL`, `USER_ADDRESS` (checksummed), and `PRIVATE_KEY` match.
  - Confirm plastic type mapping is correct for your case.

### Security

- Keep `PRIVATE_KEY` and secrets in server-side env only; never expose to the client.
- Use long, random secrets for ingestion/submit endpoints if exposing them beyond internal cron.

### Notes & next steps

- The legacy “serve from DB as base64” endpoints are present but not used by this flow.
- You can schedule submissions via Vercel Cron to POST `/api/plastiks/submit` on an interval.
- If multiple EFT/waybills per invoice are needed, introduce a child table; current design assumes one of each per invoice.
