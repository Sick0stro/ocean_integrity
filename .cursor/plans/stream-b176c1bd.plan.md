<!-- b176c1bd-9c26-45a9-940e-95eda741113a 17f432f2-297b-4598-bf92-e9368bb656bf -->

# Automatic Matching Integration

## Current Status

### Already Implemented

- Dashboard tab with DashboardView component
- Interactive charts (recharts: bar charts, pie charts, time trends)
- KPI cards displaying 6 metrics
- Compliance and flagged record tables
- CSV download buttons for compliant/flagged data
- /api/data/dashboard-metrics endpoint (fetches from matched_records)
- Python API (python_api/main.py) with dashboard_backend.py
- /api/cron/compute-matches proxy endpoint
- Dashboard displays data perfectly when matched_records has data

### What's Missing

The automatic trigger to populate matched_records after AI processing completes.

## Architecture

```
AI Batch Complete → Trigger Python API → matched_records → Dashboard Shows Data
  (app/page.tsx)     (silent background)     (Supabase)    (already works!)
```

## Implementation

### 1. Add Silent Matching Trigger

**File:** `app/page.tsx`

**Location:** In `processFiles()` function after line ~3280 where batch completes

**Code to add:**

```typescript
// After: if (successfulProcessed === totalToProcess)
console.log('✅ All documents processed! Triggering matching...');

// Silent background matching (fire-and-forget)
fetch('/api/cron/compute-matches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: session.user.id }),
})
  .then((response) => {
    if (response.ok) {
      console.log('✅ Matching completed successfully');
    } else {
      console.error('⚠️ Matching failed with status:', response.status);
    }
  })
  .catch((error) => {
    console.error('❌ Matching service unreachable:', error);
  });

setIsProcessing(false);
```

**Why:** Automatically triggers Python matching after all documents are AI-processed, without blocking UI.

### 2. Enhance Error Handling in Proxy

**File:** `app/api/cron/compute-matches/route.ts`

**Current issue:** Generic error messages don't help debug Python API failures

**Changes:**
Add detailed error logging and structured responses:

```typescript
// Replace existing try-catch with:
try {
  const pythonResponse = await fetch(`${PYTHON_API_URL}/api/compute-matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id,
      supabase_url: supabaseUrl,
      supabase_key: supabaseKey,
    }),
  });

  if (!pythonResponse.ok) {
    const errorText = await pythonResponse.text();
    console.error(
      `❌ [matching:${requestId}] Python API error (${pythonResponse.status}):`,
      errorText
    );
    return NextResponse.json(
      {
        error: 'Matching service failed',
        details: errorText,
        python_api_status: pythonResponse.status,
      },
      { status: 500 }
    );
  }

  // Continue with existing success logic...
} catch (error) {
  // Python API unreachable
  console.error(`❌ [matching:${requestId}] Python API unreachable:`, error);
  return NextResponse.json(
    {
      error: 'Matching service unreachable',
      details: 'Python API is not running on port 8000',
      suggestion: 'Start Python API: python python_api/main.py',
    },
    { status: 503 }
  );
}
```

### 3. Add Dashboard Status Detection

**File:** `components/dashboard-view.tsx`

**Current issue:** If matched_records is empty but parsed_documents exist, dashboard shows "No Data" without context

**Changes:**

Modify `fetchDashboardMetrics` function:

```typescript
const fetchDashboardMetrics = async () => {
  try {
    setIsLoading(true);
    setError(null);

    const response = await fetch(
      `/api/data/dashboard-metrics?user_id=${session.user.id}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard metrics');
    }

    const data = await response.json();

    // Detect if matching is needed
    if (data.kpis.totalRecords === 0) {
      const parsedCheck = await fetch(
        `/api/data/parsed-count?user_id=${session.user.id}`
      );
      const parsedData = await parsedCheck.json();

      if (parsedData.count > 0) {
        setError('Matching in progress. Refresh in a moment to see results.');
      }
    }

    setMetrics(data);
  } catch (err) {
    console.error('Error fetching dashboard metrics:', err);
    setError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    setIsLoading(false);
  }
};
```

Update error display (already exists, just ensure it's yellow warning style):

```typescript
if (error) {
  return (
    <Card className='border-yellow-200 bg-yellow-50'>
      <CardHeader>
        <CardTitle className='text-yellow-700'>Dashboard Status</CardTitle>
        <CardDescription className='text-yellow-600'>{error}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={fetchDashboardMetrics} variant='outline'>
          Refresh Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 4. Create Parsed Count Helper

**New File:** `app/api/data/parsed-count/route.ts`

**Purpose:** Quick check if user has parsed documents (to detect matching state)

```typescript
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('parsed_documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: count || 0 });
}
```

## Testing Steps

1. Ensure Python API is running: `python python_api/main.py` (port 8000)
2. Ensure Next.js is running: `npx next dev` (port 3000)
3. Upload batch of invoices + eway bills
4. Process with AI
5. Check browser console: should see "Matching completed successfully"
6. Go to Dashboard tab: should show matched data with charts
7. Test error case: Stop Python API, process new batch, check error handling

## Error Scenarios

1. Python API down: Dashboard shows clear message with retry button
2. Python API returns error: Detailed logs in console, generic error to user
3. Matching in progress: Dashboard detects and shows "refresh" message
4. No documents: Dashboard shows "No Data Available" (normal state)

## Files Modified

1. `app/page.tsx` - Add matching trigger (~3 lines)
2. `app/api/cron/compute-matches/route.ts` - Better error handling (~20 lines)
3. `components/dashboard-view.tsx` - Status detection (~10 lines)
4. `app/api/data/parsed-count/route.ts` - NEW file (~20 lines)

### To-dos

- [x] Create matched_records table and add weight normalization to parsed_documents
- [x] Port Python normalization functions to TypeScript - REPLACED WITH PYTHON API
- [x] Implement matching algorithm - REPLACED WITH PYTHON API
- [x] Create compute-matches cron job API endpoint
- [x] Build dashboard-metrics API endpoint with aggregations
- [x] Create CSV export endpoints for compliant and flagged records
- [x] Create DashboardView component structure
- [x] Build KPI cards component with 6 metrics
- [x] Create compliance and flagged data tables with pagination
- [x] Build side-by-side review modal for flagged records
- [x] Implement charts using recharts library
- [x] Update app/page.tsx tab structure to include dashboard tab
- [x] Remove grouping state and functions from app/page.tsx
- [x] Replace grouping trigger with matching service trigger
- [x] Delete obsolete components (verified-csv-download.tsx)
- [x] Update blockchain tab to use matched_records data source
- [x] Create data migration script for existing document_groups
- [x] Add deprecation warnings to old grouping service
- [x] Update documentation with new architecture
- [x] Add automatic matching trigger after AI processing completes
- [x] Enhanced error handling in compute-matches API
- [x] Add intelligent status detection in dashboard
- [x] Create parsed-count helper endpoint
- [ ] Backend and frontend testing with edge cases
- [ ] Performance tuning and query optimization
