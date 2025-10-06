# Human Verification System

## Overview

The human verification system enables automated compliance verification for matched invoice-eway bill pairs, with manual review capabilities for flagged records.

## Data Flow

```
Matching Process
      ↓
matched_records created
      ↓
┌─────────────────────────────────────────┐
│ Auto-Verification (Backend)            │
│ - Records without flags → verified     │
│ - flag_reasons = [] → human_verified=true │
└─────────────────────────────────────────┘
      ↓
┌────────────────────┬────────────────────┐
│                    │                    │
│  Compliant ✅      │  Flagged 🚩        │
│  (auto-verified)   │  (needs review)    │
│                    │                    │
│  human_verified    │  human_verified    │
│  = true            │  = false           │
│                    │                    │
│  Dashboard         │  Dashboard         │
│  (read-only)       │  + Verify button   │
│                    │                    │
│                    │  User clicks       │
│                    │  "Verify" →        │
│                    │  human_verified    │
│                    │  = true            │
│                    │         ↓          │
└────────────────────┴────────────────────┘
              ↓
    ┌─────────────────────┐
    │  Blockchain Tab     │
    │                     │
    │  All verified       │
    │  records            │
    │  (auto + manual)    │
    │                     │
    │  Push to Plastiks ➡ │
    └─────────────────────┘
```

## Implementation Details

### 1. Auto-Verification (Backend)

**File:** `app/api/cron/compute-matches/route.ts`

When saving matched records from the Python API:

```typescript
const hasFlags = record.flag_reason && record.flag_reason.trim() !== '';

return {
  // ... other fields ...
  flagged: record.flagged === 'yes',
  flag_reasons: record.flag_reason ? [record.flag_reason] : [],
  human_verified: !hasFlags, // Auto-verify if no flags
  verified_at: !hasFlags ? new Date().toISOString() : null,
};
```

### 2. Dashboard Filtering

**File:** `app/api/data/dashboard-metrics/route.ts`

Records are separated based on verification status:

```typescript
// Compliant = verified records (auto or manual)
const compliantRecords = records.filter((r) => r.human_verified === true);

// Flagged = has flags AND not verified yet
const flaggedRecords = records.filter(
  (r) => r.flagged === true && r.human_verified === false
);
```

### 3. Verification API

**File:** `app/api/matched-records/verify/route.ts`

POST endpoint to verify flagged records:

```typescript
POST /api/matched-records/verify
Body: { record_id: string, user_id: string }
Response: { success: boolean }
```

Updates `human_verified` to `true` and sets `verified_at` timestamp.

### 4. Frontend UI

**File:** `components/dashboard-view.tsx`

**Compliant Records Table:**

- Shows all `human_verified=true` records
- Read-only display
- Includes both auto-verified and manually-verified records

**Flagged Records Table:**

- Shows `flagged=true` AND `human_verified=false` records
- Includes "Actions" column with "✅ Verify" button
- On click: calls verification API and refreshes dashboard

**Blockchain Tab:**

- No changes required
- Already queries `human_verified=true` records

## Database Schema

### matched_records Table

```sql
CREATE TABLE matched_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  invoice_id UUID REFERENCES parsed_documents(id),
  eway_id UUID REFERENCES parsed_documents(id),

  -- Verification fields
  human_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,

  -- Flag fields
  flagged BOOLEAN DEFAULT false,
  flag_reasons TEXT[],
  flagged_details JSONB,
  in_compliance BOOLEAN DEFAULT false,

  -- Other fields...
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## User Experience

### Workflow

1. **Upload & Process Documents**

   - User uploads PDFs
   - AI processing extracts data
   - Matching runs automatically

2. **Dashboard Tab - Compliant Records**

   - Auto-verified records appear instantly ✅
   - Ready for blockchain submission
   - No user action required

3. **Dashboard Tab - Flagged Records**

   - Records with mismatches shown with details 🚩
   - Each row has "Verify" button
   - User reviews invoice and eway bill PDFs
   - Clicks "Verify" to approve

4. **Post-Verification**

   - Record moves from Flagged → Compliant
   - Dashboard refreshes automatically
   - Record now appears in Blockchain tab

5. **Blockchain Tab**
   - Shows all verified records (auto + manual)
   - "Push to Plastiks" button available
   - Submits to blockchain

### UI States

**Compliant Records:**

```
┌─────────────────────────────────────────┐
│ ✅ Compliant Records                    │
│ Documents with exact weight match       │
├─────────────────────────────────────────┤
│ Invoice | Eway | Weight | Company ...   │
│ 📄 View | 📄 View | 25 MT | ABC Corp... │
│                                          │
│ (Read-only table)                        │
└─────────────────────────────────────────┘
```

**Flagged Records:**

```
┌─────────────────────────────────────────────────────┐
│ 🚩 Flagged Records                                  │
│ Documents with mismatches requiring review          │
├─────────────────────────────────────────────────────┤
│ Invoice | Eway | Weight | From | Flags | Actions   │
│ 📄 View | 📄 View | 25 MT | ABC | weight | [✅Verify]│
│                                                      │
│ (Interactive table with verify buttons)             │
└─────────────────────────────────────────────────────┘
```

## Testing

### Test Scenario 1: Compliant Record

1. Upload an invoice and matching eway bill
2. Wait for AI processing to complete
3. Check Dashboard tab
4. **Expected:** Record appears in "Compliant Records" table
5. Check Blockchain tab
6. **Expected:** Record is available for blockchain submission

### Test Scenario 2: Flagged Record

1. Upload an invoice and eway bill with weight mismatch
2. Wait for AI processing to complete
3. Check Dashboard tab
4. **Expected:** Record appears in "Flagged Records" table with flag reason
5. Click "✅ Verify" button
6. **Expected:**
   - Dashboard refreshes
   - Record moves to "Compliant Records"
   - Record appears in Blockchain tab

### Test Scenario 3: Blockchain Submission

1. Complete either scenario 1 or 2
2. Go to Blockchain tab
3. **Expected:** Verified record is listed
4. Click "Push to Plastiks"
5. **Expected:** Successful blockchain submission

## API Endpoints

### Verify Record

```bash
POST /api/matched-records/verify

Request:
{
  "record_id": "uuid",
  "user_id": "uuid"
}

Response:
{
  "success": true
}
```

### Dashboard Metrics

```bash
GET /api/data/dashboard-metrics?user_id=uuid

Response:
{
  "kpis": {
    "totalRecords": 100,
    "compliantRecords": 85,
    "flaggedRecords": 15,
    ...
  },
  "compliantRecords": [...],
  "flaggedRecords": [...],  // Includes 'id' field for verification
  ...
}
```

## Security

- All API endpoints verify user ownership via `user_id`
- Only users can verify their own records
- Supabase Row Level Security (RLS) enforces data isolation
- Verification timestamps are auditable

## Future Enhancements

- Add verification notes/comments
- Bulk verification for multiple records
- Undo verification action
- Verification history log
- Email notifications for flagged records
- Side-by-side PDF comparison modal
