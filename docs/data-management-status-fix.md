# Data Management Status Display Fix

## Problem

Documents with `status='uploaded'` in `single_documents` (ready for AI processing) were incorrectly displayed as "Failed AI Processing" in the Unprocessed Documents table.

### Root Cause

The status mapping function had this incorrect logic:

```typescript
if (dbStatus === 'uploaded') return 'failed_ai_processing'; // ❌ WRONG!
```

This made ALL documents waiting for AI processing appear as "failed", causing confusion.

## Solution

### 1. Added New Status Type: `ready_for_ai`

```typescript
type ProcessingStatus =
  | 'ready_for_ai' // ✅ NEW: Documents ready for AI processing
  | 'processing' // Currently being processed
  | 'failed_preprocessing'
  | 'failed_ai_processing'
  | 'successfully_parsed'
  | 'successfully_pushed_blockchain';
```

### 2. Fixed Status Mapping

```typescript
if (dbStatus === 'uploaded') return 'ready_for_ai'; // ✅ Correctly identifies ready docs
```

### 3. Added Green "Ready for AI" Badge

```typescript
ready_for_ai: {
  label: 'Ready for AI',
  variant: 'outline',
  className: 'bg-green-50 text-green-700 border-green-200',
  icon: <FileText className='h-3 w-3 mr-1' />,
}
```

### 4. Individual "Process" Buttons per Row

Each document ready for AI now has its own green "Process" button:

```typescript
if (isReadyForAI) {
  return (
    <Button
      variant='default'
      size='sm'
      onClick={() => handleRetry(item.id, 'auto')}
      className='bg-green-600 hover:bg-green-700 text-white'
      title='Process this document with AI'
    >
      <RefreshCw className='h-3 w-3 mr-1' />
      Process
    </Button>
  );
}
```

## Status Flow (Updated)

```
Database Status             →    UI Display             →    Action Button
─────────────────────────────────────────────────────────────────────────────
status='uploaded'           →    "Ready for AI"        →    [Process] (green)
  (single_documents)             (green badge)

status='processing'         →    "Processing..."       →    [none]
  (single_documents)             (blue pulsing)

status='processed'          →    Removed from view     →    [none]
  (single_documents)             (success!)

status='failed'             →    "Failed AI Processing" →   [Retry] (outline)
  (single_documents)             (orange badge)

status='failed'             →    "Failed Preprocessing" →   [Retry] (outline)
  (temp_documents)               (red badge)
```

## UI Changes

### Before Fix

```
❌ Unprocessed Documents
16 ready for AI processing

[File 1.pdf]  Failed AI Processing  [Retry]  ← WRONG! Not failed
[File 2.pdf]  Failed AI Processing  [Retry]  ← WRONG! Not failed
...
```

### After Fix

```
✅ Unprocessed Documents
16 ready for AI processing

[File 1.pdf]  Ready for AI  [Process]  ← Correct status
[File 2.pdf]  Ready for AI  [Process]  ← Clear action
...

[⚡ Process 16 Documents]  ← Bulk process option
```

## Processing Options

Users now have **two ways** to process documents:

### Option 1: Bulk Processing (Top Button)

- Click the large "⚡ Process 16 Documents" button in the card header
- Processes all ready documents at once
- Shows loading spinner and progress updates

### Option 2: Individual Processing (Row Button)

- Click the green "Process" button on any specific row
- Processes just that one document
- Useful for selective processing or testing

## Benefits

1. **Clear Status Communication**: Documents are no longer misrepresented as "failed"
2. **Visual Hierarchy**: Green badges clearly indicate ready documents
3. **Flexible Processing**: Bulk or individual processing options
4. **Reduced Confusion**: Failed documents are only those that actually failed
5. **Better UX**: Users can process specific documents without bulk action

## Technical Details

### Files Modified

- `components/data-management-dashboard.tsx`
  - Added `'ready_for_ai'` status type
  - Updated `mapDatabaseStatusToUIStatus()` function
  - Added green badge configuration
  - Added individual "Process" button logic

### API Response (Correct)

```json
{
  "status": "uploaded",
  "source_table": "single_documents",
  "doc_type": "ready_for_ai"
}
```

This now correctly maps to:

- UI Status: `'ready_for_ai'`
- Badge: "Ready for AI" (green)
- Button: "Process" (green)

## Testing

- [x] Documents with `status='uploaded'` show "Ready for AI" badge
- [x] Green "Process" button appears on each ready document
- [x] Individual "Process" button triggers AI processing
- [x] Bulk "Process Documents" button still works
- [x] Failed documents show "Failed AI Processing" with "Retry" button
- [x] Status descriptions update correctly (e.g., "16 ready for AI processing")
- [x] No linter errors

## Next Steps

After clicking "Process" on a document:

1. Status changes to `'processing'` → UI shows "Processing..." badge
2. Document is processed by AI
3. On success: status → `'processed'` → document removed from view
4. On failure: status → `'failed'` → shows "Failed AI Processing" with "Retry" button
