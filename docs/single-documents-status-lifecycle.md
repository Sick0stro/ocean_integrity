# single_documents Status Lifecycle

## Complete Status List

The `single_documents` table has the following statuses:

| Status                | Meaning                                        | Displayed In                                      | Action Available   |
| --------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------ |
| **uploaded**          | Preprocessed, ready for AI processing          | Unprocessed Documents (as "Ready for AI")         | [Process] button   |
| **processing**        | Currently being processed by AI                | Unprocessed Documents (as "Processing...")        | None (in progress) |
| **processed**         | AI completed, data saved to `parsed_documents` | ❌ NOT displayed (completed!)                     | None (success!)    |
| **failed**            | AI processing failed                           | Unprocessed Documents (as "Failed AI Processing") | [Retry] button     |
| **skipped_duplicate** | Duplicate detected and skipped                 | ❌ NOT displayed (skipped)                        | None               |

## Status Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DOCUMENT PROCESSING LIFECYCLE                     │
└─────────────────────────────────────────────────────────────────────┘

📤 UPLOAD
   │
   ├─ temp_documents (status='uploaded')
   │
   ▼
🔧 PREPROCESSING (PDF → Single Pages)
   │
   ├─ temp_documents (status='processing')
   │
   ▼
   ├── ✅ SUCCESS → single_documents (status='uploaded') ────────────┐
   │                                                                   │
   └── ❌ FAILURE → temp_documents (status='failed')                  │
                                                                       │
                                                                       │
┌──────────────────────────────────────────────────────────────────────┘
│
│   🤖 AI PROCESSING
│      │
│      ├─ single_documents (status='processing')
│      │
│      ▼
│      ├── ✅ SUCCESS → single_documents (status='processed')
│      │                 └─> parsed_documents (extracted data)
│      │                     └─> Removed from "Unprocessed Documents"
│      │
│      ├── ⏭️ SKIP → single_documents (status='skipped_duplicate')
│      │              └─> Removed from "Unprocessed Documents"
│      │
│      └── ❌ FAILURE → single_documents (status='failed')
│                       └─> Stays in "Unprocessed Documents" with [Retry]
│
└─────────────────────────────────────────────────────────────────────
```

## What You're Seeing

### Current Situation

```
📊 Your terminal shows:
   status: 'uploaded'
   doc_type: 'ready_for_ai'

✅ This is CORRECT!
```

These files are **NOT yet AI-processed**. They are:

1. ✅ **Preprocessing Complete** (PDF split into single pages)
2. ⏳ **Waiting for AI Processing** (not yet sent to OpenAI)

### Why the Confusion?

You might see "Processed Documents: 16" in the **Upload & Process** tab because:

- That count refers to **preprocessing** completion (PDF splitting)
- But these docs haven't gone through **AI processing** yet
- That's why they show in "Unprocessed Documents" with "Ready for AI" status

## Status Update Points

### 1. After Preprocessing

```typescript
// In preprocess service
await supabase.from('single_documents').insert({ status: 'uploaded' }); // ← Ready for AI
```

### 2. During AI Processing

```typescript
// In app/page.tsx processFiles()
await supabase
  .from('single_documents')
  .update({ status: 'processing' })
  .eq('id', docId);
```

### 3. After AI Success

```typescript
// In app/page.tsx after AI response
await supabase
  .from('single_documents')
  .update({ status: 'processed' }) // ← REMOVED from unprocessed view!
  .eq('id', docId);
```

### 4. After AI Failure

```typescript
// In app/page.tsx catch block
await supabase
  .from('single_documents')
  .update({
    status: 'failed',
    last_error: errorMessage,
  })
  .eq('id', docId);
```

## Data Management Tab Logic

### What Shows in "Unprocessed Documents"

```sql
-- Fetch from single_documents
SELECT * FROM single_documents
WHERE user_id = $1
  AND status IN ('uploaded', 'processing', 'failed')  -- ✅ Only these!
ORDER BY upload_date DESC;
```

### What's EXCLUDED (Won't Show)

```sql
-- These are complete/skipped
status = 'processed'           -- ✅ AI completed successfully
status = 'skipped_duplicate'   -- ⏭️ Duplicate skipped
```

## Your 16 Files

```
Status: uploaded
Display: "Ready for AI" (green badge)
Action: [Process] button available
Reason: Preprocessing done, AI pending
```

**To process them:**

1. Click "⚡ Process 16 Documents" (bulk), OR
2. Click individual green "Process" buttons

**After processing:**

- Status changes: `uploaded` → `processing` → `processed`
- They'll **disappear** from "Unprocessed Documents" (success!)
- Data will be in `parsed_documents` table

## Common Questions

### Q: Why do preprocessed files show as "unprocessed"?

**A:** Because they haven't been AI-processed yet. "Unprocessed" means "not yet extracted data with AI".

### Q: When do files disappear from this tab?

**A:** When `status='processed'` (AI succeeded) or `status='skipped_duplicate'` (duplicate).

### Q: Can I process one file at a time?

**A:** Yes! Each "Ready for AI" file now has its own green "Process" button.

### Q: What if AI processing fails?

**A:** Status becomes `'failed'`, shown as "Failed AI Processing" with [Retry] button.

## Database Schema

```sql
CREATE TABLE single_documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  -- Possible values: 'uploaded', 'processing', 'processed', 'failed', 'skipped_duplicate'
  pdf_path TEXT,
  original_filename TEXT,
  upload_date TIMESTAMPTZ,
  last_error TEXT,
  page_number INTEGER,
  total_pages INTEGER,
  ...
);

-- Index for efficient queries
CREATE INDEX idx_single_documents_status
ON single_documents(user_id, status)
WHERE status IN ('uploaded', 'processing', 'failed');
```

## Related Tables

### Lifecycle Progression

```
temp_documents          single_documents         parsed_documents
(preprocessing)         (AI processing)          (extracted data)
─────────────────────────────────────────────────────────────────
status='uploaded'   →   status='uploaded'    →   (nothing yet)
                        ⏳ Ready for AI

                        status='processing'  →   (in progress)
                        🔄 AI running

                        status='processed'   →   INSERT INTO parsed_documents
                        ✅ Complete              ✓ Invoice/Eway data extracted

                        status='failed'      →   (nothing saved)
                        ❌ Error                 × Check last_error
```

## Summary

- ✅ **System is working correctly!**
- 📊 Your 16 files are `status='uploaded'` = Ready for AI processing
- 🟢 They show as "Ready for AI" with green badges
- ⚡ Click "Process" to send them through AI extraction
- 🎯 After AI completes, they'll disappear (moved to `parsed_documents`)

The current design is intentional: only files needing attention (ready, processing, or failed) show in "Unprocessed Documents".
