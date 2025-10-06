# Document Lifecycle & Status Guide

## Overview

This document explains the complete lifecycle of documents in the Ocean Integrity system, from upload to blockchain submission, including all status transitions and what they mean.

## Document Flow Diagram

```
┌─────────────┐
│   UPLOAD    │ User uploads PDFs (may be multi-page)
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ temp_documents (Table 1)                                │
│ - Raw uploaded files                                    │
│ - status: 'uploaded' (initial)                          │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ PREPROCESSING (/api/cron/preprocess)                    │
│ - Splits multi-page PDFs into single pages             │
│ - Detects duplicates                                    │
│ - Validates file integrity                              │
└──────┬──────────────────────────────────────────────────┘
       │
       ├──────────────────────┬──────────────────────┐
       ▼                      ▼                      ▼
┌─────────────┐    ┌─────────────────┐    ┌──────────────┐
│temp_documents│    │single_documents │    │temp_documents│
│status:       │    │Table 2          │    │status: 'failed'
│'processed'   │    │- Single pages   │    │(if error)    │
│              │    │- status:        │    └──────────────┘
│              │    │  'uploaded'     │
│              │    │  (ready for AI) │
│              │    └────────┬────────┘
│              │             │
└──────────────┘             ▼
                   ┌─────────────────────────────┐
                   │ AI PROCESSING               │
                   │ (/api/process-document)     │
                   │ - Google Gemini extracts    │
                   │ - Invoice/Eway/EFT data     │
                   └────────┬────────────────────┘
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
       ┌────────────┐ ┌──────────────┐ ┌─────────────┐
       │single_docs │ │parsed_docs   │ │single_docs  │
       │status:     │ │Table 3       │ │status:      │
       │'processed' │ │- AI extracted│ │'failed'     │
       │            │ │- raw_json    │ │(if error)   │
       └────────────┘ └──────┬───────┘ └─────────────┘
                             │
                             ▼
                   ┌─────────────────────────────┐
                   │ MATCHING SERVICE            │
                   │ (/api/cron/compute-matches) │
                   │ - Pairs invoices + eways    │
                   │ - Detects mismatches        │
                   │ - Flags anomalies           │
                   └────────┬────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────┐
                   │ matched_records (Table 4)   │
                   │ - Invoice-Eway pairs        │
                   │ - flagged: true/false       │
                   │ - in_compliance: true/false │
                   │ - human_verified: false     │
                   └────────┬────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────┐
                   │ DASHBOARD                   │
                   │ - KPIs, Analytics           │
                   │ - Review flagged records    │
                   └────────┬────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────┐
                   │ HUMAN VERIFICATION          │
                   │ - Compliant: auto-verified  │
                   │ - Flagged: manual review    │
                   └────────┬────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────┐
                   │ matched_records             │
                   │ human_verified: true        │
                   └────────┬────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────┐
                   │ BLOCKCHAIN TAB              │
                   │ - Verified records only     │
                   │ - Push to Plastiks          │
                   └────────┬────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────┐
                   │ recycling_docs (Table 5)    │
                   │ - Blockchain submission     │
                   │ - plastiks_collection_id    │
                   └─────────────────────────────┘
```

## Table Definitions & Status Values

### Table 1: `temp_documents`

**Purpose**: Stores raw uploaded files before preprocessing

| Status       | Meaning                                                | Next Step                                         |
| ------------ | ------------------------------------------------------ | ------------------------------------------------- |
| `uploaded`   | File uploaded, waiting for preprocessing               | Preprocessing service will split/validate         |
| `processing` | Currently being preprocessed                           | Will become 'processed' or 'failed'               |
| `processed`  | Successfully preprocessed, pages in `single_documents` | No further action (kept for 24h, then cleaned up) |
| `failed`     | Preprocessing failed (corrupt PDF, unsupported format) | Visible in Data Management > Unprocessed          |

**Key Columns**:

- `pdf_path`: Storage path (e.g., `temp/user-id/batch-id_file.pdf`)
- `upload_batch_id`: Groups files uploaded together
- `last_error`: Error message if failed

---

### Table 2: `single_documents`

**Purpose**: Stores individual pages ready for AI processing

| Status       | Meaning                                            | Next Step                                           |
| ------------ | -------------------------------------------------- | --------------------------------------------------- |
| `uploaded`   | ✅ **Ready for AI processing**                     | User clicks "Process Documents" → AI extraction     |
| `processing` | Currently being processed by AI                    | Will become 'processed' or 'failed'                 |
| `processed`  | AI extraction complete, data in `parsed_documents` | No further action                                   |
| `failed`     | AI processing failed (OCR error, timeout)          | Visible in Data Management > Unprocessed, can retry |

**Key Columns**:

- `pdf_path`: Storage path (e.g., `single/user-id/file_page1.pdf`)
- `upload_batch_id`: Links back to original upload batch
- `page_number`/`total_pages`: For multi-page splits
- `last_error`: Error message if failed
- `original_filename`: User's original filename

**🔑 Important**: Status `'uploaded'` here means **"ready for AI, not yet processed by AI"**

---

### Table 3: `parsed_documents`

**Purpose**: Stores AI-extracted data (invoices, eways, EFTs)

| Column                 | Meaning                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `document_type`        | 'invoice', 'e-way-bill', or 'eft_receipt'                       |
| `raw_json`             | Extracted fields (invoice_number, vehicle_number, weight, etc.) |
| `weight_kg_normalized` | Weight converted to KG using decimal rule logic                 |
| `file_url`             | Link to PDF in storage                                          |
| `anchor_key`           | Normalized invoice number for matching                          |

**Status**: No status column - if row exists, processing succeeded

---

### Table 4: `matched_records` (NEW)

**Purpose**: Stores validated invoice-eway pairs with compliance status

| Column                            | Meaning                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| `invoice_id`, `eway_id`, `eft_id` | References to `parsed_documents`                                     |
| `weight_match`                    | Do weights match exactly?                                            |
| `vehicle_match`                   | Do vehicle numbers match (fuzzy 85%)?                                |
| `company_match`                   | Do company names match (fuzzy 90%)?                                  |
| `flagged`                         | **true** if any mismatch detected                                    |
| `flag_reasons`                    | Array: `['weight_mismatch', 'vehicle_mismatch', 'company_mismatch']` |
| `in_compliance`                   | **true** only if ALL checks pass                                     |
| `human_verified`                  | **false** (awaiting review) → **true** (accepted/rejected)           |

**🔑 Important**:

- `in_compliance = true` → auto-verified, ready for blockchain
- `flagged = true` → needs manual review in Dashboard

---

### Table 5: `recycling_docs`

**Purpose**: Tracks blockchain submissions to Plastiks

| Column                   | Meaning                         |
| ------------------------ | ------------------------------- |
| `invoice_number`         | Primary key                     |
| `human_verified`         | true after dashboard review     |
| `plastiks_submitted_at`  | Blockchain submission timestamp |
| `plastiks_collection_id` | Plastiks NFT collection ID      |
| `status`                 | 'new', 'submitted', 'failed'    |

---

## Status Transition Rules

### Preprocessing Phase

```
temp_documents.status:
  'uploaded' → 'processing' → 'processed' (success)
                           → 'failed' (error)

single_documents.status (created during preprocessing):
  'uploaded' (initial state - ready for AI)
```

### AI Processing Phase

```
single_documents.status:
  'uploaded' → 'processing' → 'processed' (success)
                           → 'failed' (error)

parsed_documents:
  (row created if AI succeeds)
```

### Matching Phase

```
parsed_documents → matching algorithm → matched_records

matched_records:
  - in_compliance = true (auto-verified) → human_verified = true
  - flagged = true (needs review) → human_verified = false
```

### Verification Phase

```
matched_records.human_verified:
  false → true (after user accepts/rejects in Dashboard review modal)
```

### Blockchain Phase

```
matched_records (human_verified=true) → recycling_docs

recycling_docs.status:
  'new' → 'submitted' (success)
       → 'failed' (Plastiks API error)
```

---

## Common Questions

### Q: What does "uploaded" mean in `single_documents`?

**A**: It means the page is **ready for AI processing** but **hasn't been AI-processed yet**. This is the state after preprocessing completes successfully.

### Q: How do I see documents that need AI processing?

**A**: Query `single_documents` where `status = 'uploaded'`. These are shown as the "ready" count in the Upload & Process tab.

### Q: What is "unprocessed" in Data Management?

**A**: Documents that are either:

1. Ready for AI but not yet processed (`single_documents.status='uploaded'`)
2. Failed during preprocessing or AI (`status='failed'` in either table)

### Q: Why do I see "16 pages ready" but uploaded only 12 files?

**A**: Some of your uploaded files were multi-page PDFs. Preprocessing splits them:

- 12 original files → 4 were 2-page PDFs → 4×2 = 8 pages + 8 single-page files = 16 total pages

### Q: What's the difference between `temp_documents` and `single_documents`?

**A**:

- `temp_documents` = Raw uploaded files (may be multi-page)
- `single_documents` = Individual pages extracted from those files (always single-page, ready for AI)

### Q: When does `temp_documents.status` change to 'processed'?

**A**: Immediately after preprocessing completes successfully and pages are moved to `single_documents`.

### Q: What happens to files after preprocessing?

**A**:

- `temp_documents` row kept with `status='processed'` for 24 hours (then cleaned up by retention job)
- Original file in storage kept for 24 hours
- Individual pages in `single_documents` persist until AI-processed

---

## Debugging Guide

### Document not appearing for AI processing?

**Check**:

1. Does it exist in `temp_documents`? What's the status?
2. Does it exist in `single_documents`? What's the status?
3. Check `upload_batch_id` matches between tables
4. Look for `last_error` messages

**Common causes**:

- Status is 'failed' → check error message
- Status is 'processed' → already AI-processed (check `parsed_documents`)
- Status is 'processing' → stuck? Check logs, may need manual reset

### Upload batch not found?

**Check**:

```sql
-- Find your latest batch ID
SELECT upload_batch_id, count(*)
FROM temp_documents
WHERE user_id = 'your-user-id'
GROUP BY upload_batch_id
ORDER BY max(created_at) DESC;

-- Check single_documents for that batch
SELECT status, count(*)
FROM single_documents
WHERE upload_batch_id = 'batch-id'
GROUP BY status;
```

### Documents stuck in "processing"?

**Reset manually**:

```sql
-- Reset to 'uploaded' to retry
UPDATE single_documents
SET status = 'uploaded', last_error = null
WHERE id = 'doc-id';
```

---

## Maintenance & Cleanup

### Retention Policy

| Table                                  | Retention          | Cleanup Job    |
| -------------------------------------- | ------------------ | -------------- |
| `temp_documents` (status='processed')  | 24 hours           | Automated cron |
| `temp_documents` (status='failed')     | 7 days             | Manual review  |
| `single_documents` (status='uploaded') | Until AI-processed | N/A            |
| `single_documents` (status='failed')   | 7 days             | Manual review  |
| `parsed_documents`                     | Permanent          | N/A            |
| `matched_records`                      | Permanent          | N/A            |

### Storage Cleanup

- `temp/` folder: Files deleted 24h after `temp_documents.status='processed'`
- `single/` folder: Files persist (needed for document preview and blockchain submission)

---

**Last Updated**: January 5, 2025  
**Version**: 2.0 (Matching System)  
**Maintainer**: Ocean Integrity Team
