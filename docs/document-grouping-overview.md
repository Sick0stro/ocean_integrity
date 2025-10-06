# Document Grouping Architecture

This document explains how Ocean Integrity groups related documents (invoice, EFT receipt, e-way bill) into cohesive packages that feed human verification, Plastiks submission, and downstream reporting.

## Why Grouping Matters

- Normalises AI output into a stable data model for verification and submission flows.
- Captures country-specific requirements so completeness checks reflect local regulations.
- Avoids re-processing by storing computed state (`document_groups`) that can be reused by the frontend and cron jobs.

## End-to-End Pipeline

1. **Upload & Preprocess** – PDFs are uploaded to `temp_documents` and processed by `/api/cron/preprocess` which splits multi-page files into `single_documents`.
2. **AI Extraction** – `/api/process-document` reads from `single_documents`, calls Gemini, and inserts AI output into `parsed_documents` (skipping duplicates and auxiliary files).
3. **Grouping Trigger** – The UI calls `/api/cron/document-grouping` whenever new AI results are available (e.g., after batch processing).
4. **Document Groups** – The grouping service runs a two-phase matcher (exact invoice/date first, then composite keys with vehicle/last-four/date), applies business rules, and upserts rows in `document_groups`.
5. **Verification & Submission** – Human verification updates `document_groups.human_verified`; Plastiks submission promotes verified groups into `recycling_docs` and the blockchain pipeline.

## Backend Grouping Service

The POST handler in `/api/cron/document-grouping` orchestrates grouping:

- **Authentication** – Requires a bearer token and `user_id` payload.
- **Fetch Documents** – Pulls all `parsed_documents` for the user ordered by `created_at`.
- **Two-Phase Matching** – Phase one groups by normalized invoice + date; phase two falls back to last-four digits + normalized vehicle + date, flagging missing fields for human verification.
- **Composite Key Derivation** – Normalises invoice numbers, vehicle plates, and dates to build composite identifiers with quality scoring and fallbacks.
- **Grouping** – Buckets documents by phase/identifier, skipping duplicates detected during the run and tracking `needs_human_verification` when data is incomplete.
- **Country Detection** – Uses `ship_to_country_code`, generic `country` fields, or address heuristics to select the applicable rule.
- **Business Rule Resolution** – Invokes `get_business_rule(target_country)` to retrieve required/optional types and minimum counts from `business_rules`.
- **Completion Metrics** – Computes `present_document_types`, `missing_document_types`, `completion_count`, and `completion_percentage`. Indian rules allow completion with invoice + e-way bill; the global default expects all three documents.
- **Upsert** – Writes to `document_groups` with composite metadata (`grouping_phase`, verification flags, quality score), processing logs, and business-rule stats. Upserts are keyed by `(user_id, group_key)`.

### Processing Logs

Each group stores structured logs (`processing_logs`) containing:

- Request ID and timestamp.
- Document count and rule name applied.
- Completion details (present vs missing types).

These logs support debugging and allow the frontend to show when a group was last processed.

## Database Entities

### `business_rules`

- Stores rule name, description, target country, required and optional documents, and `minimum_required` count.
- `priority` and `is_active` flags let future rules override defaults.
- Seed data provides `indian_recyclers` and `global_default`.

### `document_groups`

- Primary storage for grouping results.
- Key columns: `invoice_number`, `group_key`, `present_document_types`, `present_document_ids`, `missing_document_types`, `completion_count`, `completion_percentage`, `is_complete`, `can_verify`, `last_processed_at`, `processing_logs`.
- Verification flags: `is_promoted`, `is_human_verified`, `human_verified_at` (moved from `recycling_docs`).
- RLS: users only see their own groups.

### Supporting Tables

- `parsed_documents` – Raw AI output powering grouping.
- `temp_documents` / `single_documents` – Preprocessing staging tables that feed AI processing and expose lifecycle metrics via `get_document_groups()`.
- `recycling_docs` – Downstream destination when groups are promoted after verification.

## Frontend Integration

The dashboard (`app/page.tsx`) coordinates user interactions:

- **Lazy Loading** – When users open the Groups or Blockchain tabs, the client fetches `document_groups` rows and associated `parsed_documents` for hydration.
- **InvoiceGroup Shape** – The UI converts backend rows into rich objects with document metadata, completion status badges, and processing logs.
- **Statistics** – Derived totals show complete vs incomplete groups and highlight ungrouped parsed documents.
- **Triggering Grouping** – After AI processing, the UI POSTs to `/api/cron/document-grouping` with the session token to recompute groups.
- **Fallback Logic** – Legacy client-side grouping remains as a safety net but should be deprecated once backend coverage is universal.

## Verification and Submission

- `/api/human-verify` updates `document_groups.human_verified` and timestamps.
- `/api/plastiks/submit` filters for groups where `is_complete` and `human_verified` are true, then calls `/api/recycling-docs/promote` to create `recycling_docs` records before blockchain submission.
- Group state is the single source of truth for eligibility to submit or mint proof on Plastiks.

## Monitoring & Operations

- Cron logs include request IDs, group counts, and rule usage to trace processing runs.
- `processing_logs` help correlate backend actions with frontend refreshes.
- Supabase indexes (`idx_document_groups_user_id`, `idx_document_groups_complete`, etc.) keep lookups efficient as data grows.
- The lifecycle helper `get_document_groups(user_id)` powers operational dashboards for preprocessing progress.

## Improvement Opportunities

- **Incremental Grouping** – Process only documents created since the last run instead of fetching all rows per user.
- **Rule Authoring Tools** – Expose admin UI to manage `business_rules` without SQL migrations.
- **Backend Triggers** – Replace manual frontend trigger with Supabase functions or background jobs on `parsed_documents` inserts.
- **Deprecate Frontend Fallback** – Remove client-side grouping once confidence in backend groups is complete to avoid state divergence.
- **Expand Metadata** – Capture plastic tonnage or recycler certifications in `document_groups` for richer validation rules.

## Reference Files

- `/app/api/cron/document-grouping/route.ts`
- `/app/api/process-document/route.ts`
- `/app/page.tsx`
- `/supabase/migrations/20250115_add_backend_grouping.sql`
- `/database/migrations/001_document_lifecycle_tracking.sql`
- `/app/api/plastiks/submit/route.ts`
- `/docs/recycling-docs-promote-route.md`
