## Documentation Overview

- Added two standalone docs so you have the full Plastiks flow explained end to end.
- First doc focuses on `app/api/plastiks/submit/route.ts`; second covers `app/api/recycling-docs/promote/route.ts` and how they interlock.
- Both include routes’ purpose, inputs, Supabase touch-points, Plastiks payloads, and debugging notes (including the HTTP 422 issue).

````docs/plastiks-submit-route.md
# Plastiks Submission Service (`/api/plastiks/submit`)

## Purpose
Primary orchestrator that promotes verified document groups, submits eligible `recycling_docs` rows to Plastiks, and updates blockchain-related metadata.

## Entry Point
- **HTTP Method / Path**: `POST /api/plastiks/submit`
- **Auth**: `x-cron-secret` or `x-submit-secret` header (or `?secret=` in non-prod when `CRON_SUBMIT_SECRET` unset).
- **Query Params**:
  - `invoice` _(optional)_: restrict processing to a single invoice.
  - `user_id` _(optional)_: process only rows for a specific user.

Requests without a valid secret are rejected with 401 unless in dev with no secret configured.

## High-Level Flow
1. **Request bootstrap & diagnostics**
   Logs request metadata, confirms Plastiks env vars (`PLASTIKS_BASE_URL`, `API_TOKEN_CALL`, `USER_ADDRESS`, `PRIVATE_KEY`) exist.
2. **Promotion stage**
   Calls `promoteVerifiedDocuments()` to push newly human-verified groups from `document_groups` into `recycling_docs` via `/api/recycling-docs/promote`.
3. **Pending row selection**
   `getPendingRows()` queries `recycling_docs` where `status ∈ {new, updated}` (limited to 100 rows, optionally filtered by user). Comprehensive logging lists invoices queued.
4. **Per-invoice processing** (loop):
   - Logs full row contents (document URLs, companies, tonnage, previous Plastiks metadata).
   - Normalizes weight: uses `weight_kg` if available, otherwise converts `tonnage_tons * 1000`.
   - Augments row with `tonnage_kg` before submission.
   - Calls `submitToPlastiks(submissionRow)` from `lib/plastiks.ts`.
   - On success: updates `recycling_docs` via `markSubmitted()` setting `status='submitted'`, Plastiks IDs, and `plastiks_last_error=null`.
   - On failure: records error via `markFailed()` with `status='failed'` and persists the serialized error message in `plastiks_last_error`.

5. **Response**
   Summarizes successes/failures and emits processing statistics (total duration, success rate, per-invoice result list).

## Internal Helpers

### `promoteVerifiedDocuments(userFilter?, singleInvoice?)`
- Pulls groups from `document_groups` with `human_verified = true` and `is_complete = true`.
- Calls `/api/recycling-docs/promote` per group to populate/refresh `recycling_docs`.
- Handles any failures gracefully (logs errors but continues).

### `getPendingRows(userFilter?)`
- Supabase query against `recycling_docs`.
- Rich logging for observability (row-by-row details, query duration).
- Returns `new|updated` rows waiting for Plastiks submission.

### `markSubmitted(invoice_number, data)`
- Updates `recycling_docs` with blockchain identifiers, timestamp, and sets `status='submitted'`.
- Clears previous Plastiks error message.

### `markFailed(invoice_number, errorMsg)`
- Sets `status='failed'`, stores `errorMsg` in `plastiks_last_error`, updates `updated_at`.

## Plastiks Integration (`lib/plastiks.ts`)

Submitted document travels through:
1. **`getPlastiksConfig()`**
   Reads env vars, normalizes `userAddress`, ensures private key has `0x`. Throws if any credential missing.
2. **`createPlastiksClient(config)`**
   Axios client defaulting to `baseUrl` with `API-key` and `User-Address`.
3. **`getBlockchainConfig(client)`**
   GET `/api/collections/plastic_types`; extracts CELO contract addresses and token metadata.
4. **`createPrgCollection(client, params)`**
   Builds payload:
   ```json
   {
     "name": "<Recycler> - <Invoice>",
     "description": "Recycling collection for invoice ...",
     "plastik_type": "<mapped plastic type>",
     "weight": <kg>,
     "guarantee_connected": true,
     "city": "...",
     "country": "...",
     "use_autogen_image": true,
     "invoice": "<invoice_url>",
     "proof_invoice": "<eft_url or empty>",
     "way_bill": "<ewaybill_url>",
     "receipt": "<eft_url or empty>"
   }
````

Posts to `/api/collections/prg`. Debug logs confirm presence of each document field. 5. **`signMetadataHash()`**  
 Calls `/sign_metadata_hash`, signs returned hash with wallet, posts `/save_metadata_signature`. 6. **`signFixedPrice()`**  
 Signs EIP-712 payload for fixed price sale and posts `/sign_fixed_price`. 7. **`signVoucher()`**  
 Signs EIP-712 PRG voucher and posts `/sign_voucher`.

Any failure in the chain throws with an error message formatted by `axiosErrorToString()`.

## Document Requirements & Business Rules

- Payload inherits URLs and metadata prepared by `/api/recycling-docs/promote`.
- Focus on `invoice`, `EFT`, `ewaybill` URLs:
  - Non-Indian recyclers: all three required upstream.
  - Indian recyclers: invoice + e-way bill required; EFT optional (eventually set to empty string in payload if missing).

## Known Failure: HTTP 422 “Collectible file can’t be blank”

- Appears during `createPrgCollection()` POST.
- Logs show all document URLs sent; Plastiks staging currently expects a `collectible_file` even when `use_autogen_image=true`.
- For meeting:
  - Ask Plastiks to confirm whether autogen mode works or if a manual file/IPFS hash is mandatory.
  - Verify expected property names (they may require `invoice_url`, etc.). Current implementation uses `invoice`, `proof_invoice`, `way_bill`, `receipt`.
  - Provide them with captured payload (use `GET /api/debug/payload` to show identical structure without sending to Plastiks).

## Environment Variables

- `PLASTIKS_BASE_URL`
- `API_TOKEN_CALL`
- `USER_ADDRESS`
- `PRIVATE_KEY`
- `CRON_SUBMIT_SECRET` (and possibly `CRON_INGEST_SECRET` fallback)
- `NEXTAUTH_URL` (used when promoting documents prior to submission)

## Debugging Tips

- Trigger a dry-run payload inspection: `GET /api/debug/payload`.
- Use `?invoice=<invoice_no>` to isolate a failing record.
- Check Supabase row’s `plastiks_last_error` for stored error messages.
- Validate documents exist in `parsed_documents` and `document_groups` before hitting submit.

---

# Quick Comparison with `/api/recycling-docs/promote`

| Concern           | `/api/plastiks/submit`                                | `/api/recycling-docs/promote`                           |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Role              | Orchestrates Plastiks submission & blockchain signing | Prepares `recycling_docs` rows by aggregating documents |
| Trigger           | Cron/manual POST with secret                          | POST invoked by submit route or admin tools             |
| Output            | Plastiks collection + Supabase status updates         | Upserted/updated `recycling_docs` entries               |
| Error Persistence | `plastiks_last_error` in `recycling_docs`             | HTTP 400/500 response, no DB error storage              |
| External Calls    | Plastiks API + Supabase                               | Supabase only                                           |

````

```docs/recycling-docs-promote-route.md
<code_block_to_apply_changes_from>
# Recycling Docs Promotion Service (`/api/recycling-docs/promote`)

## Purpose
Aggregates parsed documents (invoice/EFT/e-way bill) into a single business-ready record per invoice in `recycling_docs`. Enforces document rules before Plastiks submission.

## Entry Point
- **HTTP Method / Path**: `POST /api/recycling-docs/promote`
- **Auth**: `x-cron-secret`, `x-submit-secret`, or `?secret=` (dev bypass when no secret configured).
- **Parameters**:
  - Query/body must supply `invoice` and `user_id`. Either in query string or JSON body; missing values return 400.

This endpoint is usually called automatically by `/api/plastiks/submit`, but can be invoked independently for manual promotion.

## High-Level Flow
1. **Authenticate request**
   Same secret logic as submit route; logs masked secret for debugging.
2. **Parameter resolution**
   Accepts `invoice`/`user_id` from query or JSON.
3. **Document fetch**
   Queries `parsed_documents` for the latest `invoice`, `eft_receipt`, `e-way-bill` rows (ordered by `created_at DESC`) belonging to the user.
4. **Invoice matching**
   Uses `invoiceUtils.isSameInvoice()` to match candidate documents to the target invoice across possible fields (`anchor_key`, `invoice`, `second_invoice`, `third_invoice`).
5. **Business rule evaluation**
   - Extracts `country` from e-way bill (preferred) or other doc metadata.
   - Determines recycler company name from invoice/e-way bill.
   - Applies India-specific logic: if company appears Indian **and** country is `IN`, only invoice + e-way bill are required; EFT optional.
   - Non-Indian recyclers must supply all three documents.
   - If requirement not met, responds with HTTP 400 including `missing`, `present`, recycler info, and the rule applied.

6. **Ownership validation**
   Verifies all documents come from the same `user_id` to prevent cross-user aggregation.

7. **Field derivation**
   - `invoice_url`, `eft_url`, `ewaybill_url`: taken from respective document `file_url`.
   - `recycler_company`: from invoice `bill_to` or e-way bill `ship_to`.
  - `network_operator_company`: invoice `bill_from`, invoice recipient name, or e-way bill `ship_from`.
   - `plastic_type`: uppercase string from invoice or e-way bill.
   - Weight: numeric value from invoice or e-way bill converted to kg via `normalizeUnitToKg()` (supports kg/tonne).
   - `country`, `city`, `currency` (defaults to INR when EFT absent).
   - `upload_date`: current date (ISO format).

8. **Upsert into `recycling_docs`**
   - Uses `onConflict: 'invoice_number'`.
   - Sets `status='updated'`, attaches `user_id`, tonnage (tons + kg), and metadata for downstream submission.
   - Logs success with full summary payload.

## Output
- `200`: `{ success: true, invoice, upserted: true, data: <payload> }`
- `400`: for missing documents, secret mismatch, or cross-user data.
- `500`: unhandled errors (Supabase issues, etc.).

## Key Business Rules
| Scenario | Required Docs | Optional Docs | Notes |
|----------|----------------|---------------|-------|
| Indian recycler (country `IN` + name heuristic) | Invoice, E-way Bill | EFT | Currency defaults to INR; EFT URL may be empty string later. |
| Non-Indian recycler | Invoice, E-way Bill, EFT | – | Missing any document blocks promotion. |

Name heuristics detect Indian entities using city/country keywords (see `isIndianRecycler` array).

## Data Contract with `/api/plastiks/submit`
The upserted row provides the canonical fields consumed by `submitToPlastiks`:
- `invoice_number`
- `invoice_url`, `eft_url`, `ewaybill_url`
- `recycler_company`, `network_operator_company`
- `plastic_type`
- `tonnage_tons`, `weight_kg`
- `origin`, `country`, `city`, `currency`
- `status` (`updated` or `new`)
- `upload_date`, `uploaded_by`
- `user_id`

These fields feed directly into the Plastiks payload (after minor renaming/mapping).

## Failure Handling
- Promotion fails fast with a descriptive JSON error.
- No DB changes occur on failure (only logs).
- Recommended to retry after ensuring required documents exist in `parsed_documents`.

## Debugging Tips
- Inspect `parsed_documents` for the invoice/user to confirm all three document types exist and belong to the same user.
- Check `document_groups` for `is_complete` and `human_verified`; lacking completeness will prevent submit route from calling promote.
- For Indian recyclers, ensure country detection works (e-way bill `ship_to_country_code` or other metadata).
- If promotion succeeds but submit fails, inspect `recycling_docs.plastiks_last_error` after running `/api/plastiks/submit`.

---
# Relationship to `/api/plastiks/submit`
- Promotion endpoint is upstream: it normalizes and persists the data `submitToPlastiks` expects.
- Submit endpoint will **always** attempt promotion first to capture recent verifications.
- Differences:
  - Promote manipulates only Supabase data (no external calls).
  - Submit orchestrates Plastiks API, blockchain signing, and final status transitions.
  - Submit logs and stores errors; promote simply responds with HTTP errors.

Having both docs allows you to walk Plastiks through the pipeline—from document aggregation, through payload construction, to blockchain signing—and to highlight the current 422 issue.
````
