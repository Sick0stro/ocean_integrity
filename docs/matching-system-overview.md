# Matching System Overview

## Introduction

The **Matching System** is a new intelligent document validation framework that replaces the legacy grouping/verification workflow. It automatically pairs invoices with e-way bills, detects mismatches, flags anomalies, and provides rich analytics dashboards.

## Architecture

### Data Flow

```
┌─────────────────────┐
│  PDF Upload         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Processing      │  (Extracts raw_json)
│  parsed_documents   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Matching Service   │  (/api/cron/compute-matches)
│  - Normalize data   │
│  - Pair docs        │
│  - Detect flags     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  matched_records    │  (Stores pairs + flags)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Dashboard          │  (KPIs, tables, charts)
│  Human Verification │  (For flagged records)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Blockchain Tab     │  (Verified records)
│  Plastiks Submit    │
└─────────────────────┘
```

### Legacy vs New Flow

| **Aspect**             | **Legacy (document_groups)** | **New (matched_records)**      |
| ---------------------- | ---------------------------- | ------------------------------ |
| Grouping Logic         | Two-phase fuzzy matching     | Smart normalization + scoring  |
| Data Structure         | Groups of documents          | Invoice-Eway pairs             |
| Validation             | Basic completeness checks    | Multi-dimensional flags        |
| Human Verification     | Group-level                  | Record-level with side-by-side |
| Analytics              | Limited                      | Rich dashboards with KPIs      |
| Weight Handling        | Manual entry                 | Auto-normalize to KG           |
| OCR Error Handling     | Limited                      | Fuzzy vehicle/company matching |
| Blockchain Integration | Via recycling_docs           | Direct from matched_records    |

## Core Components

### 1. Normalization Functions (`lib/matching/normalization.ts`)

| Function                       | Purpose                             | Example                        |
| ------------------------------ | ----------------------------------- | ------------------------------ |
| `normalizeCompanyName()`       | Remove suffixes, fuzzy 90% match    | "ABC Pvt Ltd" → "ABC"          |
| `normalizeVehicleNumber()`     | Fix OCR errors (O→0, I→1, L→1, S→5) | "MH12AB345O" → "MH12AB3450"    |
| `vehicleFuzzyMatch()`          | 85% similarity threshold            | "MH12AB3450" ≈ "MH12AB345O"    |
| `normalizeWeightDecimalRule()` | Smart KG conversion (decimal logic) | "55.5" → 5550 kg (not 55.5 kg) |
| `normalizePlasticType()`       | Map to standard types               | "polyethylene" → "LDPE"        |
| `normalizeInvoiceNumber()`     | Remove special chars, uppercase     | "INV-2023/001" → "INV2023001"  |
| `normalizeDate()`              | Parse to YYYY-MM-DD                 | "01/12/2023" → "2023-12-01"    |

### 2. Matching Algorithm (`lib/matching/matcher.ts`)

#### Core Logic

```typescript
matchInvoicesWithEways(invoices: ParsedDoc[], eways: ParsedDoc[]): MatchedPair[]
```

**Steps:**

1. **Build Invoice Index**: Group invoices by `(invoice_norm, date_norm)`
2. **For Each E-Way Bill**:
   - Find candidate invoices with same invoice number + date
   - Score each candidate:
     - Primary: Vehicle match (fuzzy 85%)
     - Fallback: Company match (fuzzy 90%)
     - Tie-breaker: Weight match (exact)
   - Select best match
3. **Flag Mismatches**:
   - **Vehicle Mismatch**: Vehicles don't match (fuzzy)
   - **Company Mismatch**: Companies don't match (fuzzy)
   - **Weight Mismatch**: Weights differ by >1 kg
4. **Determine Compliance**:
   - `in_compliance = true` **only if** no flags
   - Exact weight match required for compliance

### 3. Database Schema (`matched_records`)

```sql
CREATE TABLE matched_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Document References
  invoice_id UUID NOT NULL REFERENCES parsed_documents(id),
  eway_id UUID NOT NULL REFERENCES parsed_documents(id),
  eft_id UUID REFERENCES parsed_documents(id),

  -- Key Fields
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  generated_date TIMESTAMPTZ,

  -- Weights
  invoice_weight_kg NUMERIC,
  eway_weight_kg NUMERIC,
  weight_match BOOLEAN DEFAULT false,

  -- Vehicle
  invoice_vehicle TEXT,
  eway_vehicle TEXT,
  vehicle_match BOOLEAN DEFAULT false,

  -- Company
  bill_from_company TEXT,
  ship_from_company TEXT,
  company_match BOOLEAN DEFAULT false,

  -- Business Fields
  ship_to_company TEXT,
  plastic_type TEXT,
  country TEXT,
  city TEXT,

  -- File URLs
  invoice_file_url TEXT,
  eway_file_url TEXT,
  eft_file_url TEXT,

  -- Flags & Compliance
  flagged BOOLEAN DEFAULT false,
  flag_reasons TEXT[] DEFAULT '{}',
  flagged_details JSONB,
  in_compliance BOOLEAN DEFAULT false,

  -- Human Verification
  human_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  verification_notes TEXT,

  -- Metadata
  matching_quality_score INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_matched_records_user ON matched_records(user_id);
CREATE INDEX idx_matched_records_flagged ON matched_records(user_id, flagged) WHERE flagged = true;
CREATE INDEX idx_matched_records_compliance ON matched_records(user_id, in_compliance);
CREATE INDEX idx_matched_records_verified ON matched_records(user_id, human_verified) WHERE human_verified = true;
```

### 4. API Endpoints

#### `/api/cron/compute-matches` (POST)

**Triggered**: After AI processing completes (replaces old grouping service)

**Input**:

```json
{
  "user_id": "uuid",
  "trigger_source": "ai_processing" | "manual" | "cron"
}
```

**Process**:

1. Fetch `parsed_documents` for user
2. Separate invoices vs e-ways
3. Deduplicate (invoice by invoice+date+weight, eway by eway_bill_no)
4. Normalize weights → store in `weight_kg_normalized`
5. Run matching algorithm
6. Upsert `matched_records` with flags
7. Return stats

**Output**:

```json
{
  "success": true,
  "stats": {
    "totalDocuments": 150,
    "invoiceCount": 50,
    "ewayCount": 50,
    "eftCount": 50,
    "matchedPairs": 48,
    "compliantPairs": 42,
    "flaggedPairs": 6,
    "unmatchedInvoices": 2,
    "unmatchedEways": 2
  },
  "processing_time_ms": 3421
}
```

#### `/api/data/dashboard-metrics` (GET)

**Query**: `?user_id=uuid`

**Returns**:

```json
{
  "kpis": {
    "totalRecords": 100,
    "totalWeightMT": 5000,
    "compliantRecords": 85,
    "flaggedRecords": 15,
    "percentageFlagged": "15.0",
    "activeUsers": 12,
    "dateRange": {
      "start": "2023-01-01",
      "end": "2023-12-31"
    }
  },
  "compliantRecords": [...],
  "flaggedRecords": [...],
  "plasticTypeDistribution": [
    { "plastic_type": "PET", "total_mt": 2000 },
    { "plastic_type": "HDPE", "total_mt": 1500 }
  ],
  "topRecyclers": [
    {
      "company": "ABC Recycling",
      "total_mt": 1200,
      "flagged_count": 3,
      "compliant_pct": "97.5"
    }
  ],
  "flagReasonBreakdown": [
    { "reason": "weight_mismatch", "count": 8, "total_mt": 400 },
    { "reason": "vehicle_mismatch", "count": 5, "total_mt": 250 }
  ],
  "monthlyTrends": [
    { "month": "2023-01", "matched_mt": 400, "flagged_mt": 20 }
  ]
}
```

#### `/api/data/export-csv` (GET)

**Query**: `?type=compliant&user_id=uuid` or `?type=flagged&user_id=uuid`

**Returns**: CSV file with filtered matched_records

### 5. Frontend Components

#### Dashboard View (`components/dashboard-view.tsx`)

**Sections**:

1. **KPI Cards**: 6 colored metric cards (Total Records, Total Weight, Compliant, Flagged, % Flagged, Active Users)
2. **Compliance Table**: Top 10 compliant records with file links
3. **Flagged Table**: Top 10 flagged records with "Review" button
4. **BI & Insights**:
   - Leadership Table (top 15 recyclers by weight)
   - Plastic Type Distribution (bar chart)
   - Top Recyclers by Weight (bar chart)
5. **Flag Analysis**:
   - Flagged Records table
   - Flag Reasons Breakdown (counts + weights)
   - Monthly Trends (matched vs flagged)

#### Review Modal (Future: `components/dashboard/review-modal.tsx`)

**Purpose**: Side-by-side comparison of flagged invoice-eway pairs

**Layout**:

```
┌─────────────────────────────────────────────────┐
│         Flagged Record Review                   │
├───────────────────┬─────────────────────────────┤
│ Invoice Details   │ E-Way Bill Details          │
├───────────────────┼─────────────────────────────┤
│ Invoice #: INV001 │ Invoice #: INV001           │
│ Date: 2023-01-15  │ Date: 2023-01-15            │
│ Weight: 5500 kg   │ Weight: 5510 kg ❌          │
│ Vehicle: MH12AB34 │ Vehicle: MH12AB35 ❌        │
│ Company: ABC Ltd  │ Company: ABC Pvt Ltd ✅     │
├───────────────────┴─────────────────────────────┤
│ ⚠️ Flags:                                       │
│   • Weight Mismatch (Δ 10 kg)                  │
│   • Vehicle Mismatch (MH12AB34 vs MH12AB35)    │
├─────────────────────────────────────────────────┤
│  [Accept] [Reject] [Add Note]                  │
└─────────────────────────────────────────────────┘
```

## Flagging Logic

### Flag Reasons

| Flag Reason        | Condition                                            | Example                         |
| ------------------ | ---------------------------------------------------- | ------------------------------- |
| `weight_mismatch`  | `abs(inv_weight - eway_weight) > 1`                  | Invoice: 5500 kg, Eway: 5510 kg |
| `vehicle_mismatch` | `vehicleFuzzyMatch(inv_vehicle, eway_vehicle) < 85%` | "MH12AB34" vs "MH12CD56"        |
| `company_mismatch` | `companyFuzzyMatch(inv_company, eway_company) < 90%` | "ABC Ltd" vs "XYZ Corp"         |

### Compliance Rules

```typescript
in_compliance =
  flag_reasons.length === 0 &&
  weight_match === true &&
  vehicle_match === true &&
  company_match === true;
```

**Auto-Verification**: Compliant records are automatically marked `human_verified = true` after matching service runs.

**Manual Verification**: Flagged records require human review via the Review Modal.

## Human Verification Workflow

### For Compliant Records

1. Matching service runs → `in_compliance = true` → `human_verified = true` (automatic)
2. Appears in Dashboard "Compliance Table"
3. Eligible for blockchain submission immediately

### For Flagged Records

1. Matching service runs → `flagged = true`, `in_compliance = false`, `human_verified = false`
2. Appears in Dashboard "Flagged Records" table
3. User clicks **"Review"** button
4. Review Modal opens with side-by-side comparison
5. User can:
   - **Accept**: Set `human_verified = true`, add note
   - **Reject**: Keep `human_verified = false`, add rejection reason
6. Accepted flagged records eligible for blockchain

## CSV Exports

### Compliant CSV

**Columns**: Invoice Number, Date, Weight (MT), Vehicle, Bill From Company, Ship To Company, Plastic Type, Country, Invoice URL, Eway URL

**Filter**: `in_compliance = true`

### Flagged CSV

**Columns**: (same as compliant) + Flag Reasons, Flagged Details

**Filter**: `flagged = true`

## Migration from Legacy System

### Data Migration Script (`scripts/migrate-groups-to-matches.ts`)

**Purpose**: Convert existing `document_groups` data to `matched_records`

**Process**:

1. For each `document_group`:
   - Extract invoice, eway, eft IDs from `present_document_ids`
   - Run matching algorithm on those documents
   - Create `matched_records` entry
2. Preserve human verification status
3. Log unmigrated groups (incomplete/invalid)

**Run Command**:

```bash
npm run migrate:groups-to-matches
```

### Rollback Plan

1. Keep old grouping service endpoint active (with deprecation warnings)
2. Maintain `document_groups` table structure
3. If issues arise:
   - Switch AI processing trigger back to `/api/cron/document-grouping`
   - Revert frontend tab changes
   - Restore grouping state variables

## Configuration & Environment

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Matching Service
MATCHING_SERVICE_SECRET=your-matching-secret # For cron authentication
```

### Feature Flags (Future)

```typescript
// config/features.ts
export const FEATURES = {
  USE_MATCHING_SYSTEM: true, // Toggle between old/new system
  AUTO_VERIFY_COMPLIANT: true, // Auto-verify compliant records
  ENABLE_REVIEW_MODAL: true, // Show review modal for flagged
  EXPORT_CSV_ENABLED: true,
};
```

## Testing

### Backend Tests

```bash
# Test normalization functions
npm run test:matching:normalization

# Test matching algorithm
npm run test:matching:algorithm

# Test end-to-end matching
npm run test:matching:e2e
```

### Test Cases

1. **OCR Error Handling**: Vehicle "MH12AB345O" matches "MH12AB3450"
2. **Weight Conversion**: "55.5" → 5550 kg (not 55.5 kg)
3. **Company Fuzzy Match**: "ABC Pvt Ltd" matches "ABC Private Limited"
4. **Multiple Eways**: 2 eways for same invoice → best match selected
5. **Missing Data**: Null vehicle → company match used instead
6. **Duplicate Detection**: Duplicate invoices → deduplicated by invoice+date+weight

### Frontend Tests

```bash
npm run test:dashboard
```

## Performance Considerations

### Indexing Strategy

```sql
-- Fast user-scoped queries
CREATE INDEX idx_matched_records_user ON matched_records(user_id);

-- Fast flagged record lookups
CREATE INDEX idx_matched_records_flagged ON matched_records(user_id, flagged) WHERE flagged = true;

-- Fast compliance filtering
CREATE INDEX idx_matched_records_compliance ON matched_records(user_id, in_compliance);

-- Fast blockchain tab queries
CREATE INDEX idx_matched_records_verified ON matched_records(user_id, human_verified) WHERE human_verified = true;
```

### Query Optimization

- Use `EXPLAIN ANALYZE` for slow queries
- Consider materialized views for heavy aggregations (top recyclers, monthly trends)
- Batch upserts in matching service (single transaction)

### Caching Strategy (Future)

```typescript
// Cache dashboard metrics for 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
```

## Monitoring & Logging

### Log Levels

| Level | Example                                         |
| ----- | ----------------------------------------------- |
| INFO  | `✅ Matched 45 pairs (40 compliant, 5 flagged)` |
| WARN  | `⚠️ DEPRECATION: Using old grouping service`    |
| ERROR | `❌ Failed to normalize weight: invalid value`  |

### Key Metrics

- Matching success rate (matched / total documents)
- Flagged record rate (flagged / matched)
- Human verification speed (avg time per review)
- Matching service execution time

### Alerts (Future)

- Flag rate >20% (potential data quality issue)
- Matching service >10s execution (performance degradation)
- Unmatched documents >10% (missing eways/invoices)

## FAQ

### Q: What happens if an invoice has multiple e-ways?

A: The matching algorithm scores all candidate eways and selects the best match based on vehicle/company/weight similarity.

### Q: Can a flagged record be accepted for blockchain?

A: Yes! After human verification via the Review Modal, flagged records with `human_verified = true` are eligible.

### Q: How does weight normalization work?

A: Uses decimal logic: "55.5" → 5550 kg (assumes missing multiplier), "5500" → 5500 kg, "5.5" → 5500 kg if context suggests tons.

### Q: What if vehicle numbers are completely different?

A: Falls back to company name matching (90% fuzzy threshold). If company also doesn't match, flags both mismatches.

### Q: Can I export historical data?

A: Yes! Use the "Data Management" tab to export all matched_records (compliant + flagged) as CSV.

### Q: How to re-run matching for specific documents?

A: Call `/api/cron/compute-matches` with `trigger_source=manual` and the user_id. It will reprocess all parsed_documents for that user.

## Glossary

- **Matched Pair**: An invoice-eway pair created by the matching algorithm
- **Flagged Record**: A matched pair with detected mismatches
- **Compliant Record**: A matched pair with no flags (weight/vehicle/company all match)
- **Human Verification**: Manual review of flagged records via side-by-side comparison
- **Auto-Verification**: Automatic `human_verified = true` for compliant records
- **Normalization**: Data cleaning (remove suffixes, fix OCR errors, standardize formats)
- **Fuzzy Matching**: String similarity algorithms (Levenshtein distance, 85-90% thresholds)
- **Weight Decimal Rule**: Smart KG conversion logic that handles missing decimal points

## References

- [Implementation Plan](../plan.md)
- [Database Migrations](../supabase/migrations/)
- [Matching Algorithm](../lib/matching/matcher.ts)
- [Normalization Functions](../lib/matching/normalization.ts)
- [Dashboard Component](../components/dashboard-view.tsx)
- [Plastiks Integration](./plastiks-submit-route.md)

## Changelog

### v2.0.0 - 2025-01-05 (Matching System Launch)

- ✅ Replaced document_groups with matched_records
- ✅ Implemented intelligent invoice-eway pairing
- ✅ Added multi-dimensional flagging (weight/vehicle/company)
- ✅ Created rich analytics dashboard
- ✅ Auto-verification for compliant records
- ✅ CSV exports (compliant & flagged)
- ✅ Blockchain integration with matched_records
- ⚠️ Deprecated old grouping service (kept for rollback)

### v1.0.0 - 2024-12-01 (Legacy Grouping System)

- Two-phase document grouping
- Basic business rules validation
- Manual group verification
- Limited analytics

---

**Last Updated**: 2025-01-05  
**Maintainer**: Ocean Integrity Team  
**Status**: Production Ready ✅
