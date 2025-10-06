# Data Management UI Improvements

## Overview

Enhanced the Data Management dashboard to provide better real-time tracking of document processing status and improved user experience for failed documents.

## Key Features Implemented

### 1. **Real-Time Status Tracking**

- Documents now show "Processing..." status with animated spinner badge when actively being processed
- Status updates automatically via **polling** (every 3 seconds) during active processing
- Successfully processed documents are **automatically removed** from the view
- Failed documents remain visible with clear "Failed AI Processing" status

### 2. **Smart Document Categorization**

The dashboard now shows precise counts in the description:

- **Ready for AI**: Documents preprocessed and waiting for AI processing
- **Currently Processing**: Documents actively being processed by AI
- **Failed**: Documents that failed and need retry

Example: `"5 ready for AI processing • 3 currently processing • 2 failed (needs retry)"`

### 3. **Improved "Process Documents" Button**

- Only visible when there are documents **ready** for AI processing (not counting processing or failed)
- Shows loading spinner during processing: "Processing..."
- Updates in real-time as processing progresses
- Large, prominent green button for better UX

### 4. **Retry Functionality for Failed Documents**

- **Retry button** only shows for truly failed documents
- **Hidden during processing** (no action needed while actively processing)
- Smart retry options based on failure type (preprocessing vs AI)
- Visual feedback with error details in the document details dialog

### 5. **Processing Status Badge**

New "Processing..." badge with:

- Animated spinning icon
- Pulsing blue background
- Clear visual indication of active processing

## Status Flow

```
┌─────────────────┐
│  Ready for AI   │  status='uploaded' in single_documents
│  (show Process  │
│   button)       │
└────────┬────────┘
         │ Click "Process Documents"
         ▼
┌─────────────────┐
│   Processing    │  status='processing' in single_documents
│  (show spinner, │
│   hide button)  │
└────────┬────────┘
         │
         ├─Success─────► Removed from view (status='processed')
         │
         └─Failure─────► Show Retry button (status='failed')
```

## User Experience Flow

### Before Processing

```
Unprocessed Documents
16 ready for AI processing

[File 1]  Failed AI Processing  [Retry]
[File 2]  Failed AI Processing  [Retry]
[File 3]  Ready                 [Retry]
...

[⚡ Process 16 Documents] ← Large green button
```

### During Processing

```
Unprocessed Documents
10 ready for AI processing • 6 currently processing

[File 1]  Processing...  [no button]  ← Animated spinner
[File 2]  Processing...  [no button]
[File 3]  Processing...  [no button]
...

[⚡ Processing...] ← Disabled, showing spinner
```

### After Processing (All Success)

```
Unprocessed Documents
All documents processed successfully! 🎉

[Empty table]
```

### After Processing (Some Failed)

```
Unprocessed Documents
3 failed (needs retry)

[File 8]  Failed AI Processing  [Retry] ← Only failed docs
[File 12] Failed AI Processing  [Retry]
[File 15] Failed AI Processing  [Retry]
```

## Technical Implementation

### 1. API Changes

**File**: `app/api/data-management/route.ts`

- Fetch documents with `status IN ('uploaded', 'processing')` from `single_documents`
- Fetch failed documents from both `temp_documents` and `single_documents`
- Documents with `status='processed'` are automatically excluded

### 2. Frontend Changes

**File**: `components/data-management-dashboard.tsx`

#### State Management

```typescript
const [readyForAICount, setReadyForAICount] = useState(0);
const [processingCount, setProcessingCount] = useState(0);
const [failedCount, setFailedCount] = useState(0);
```

#### Status Mapping

```typescript
type ProcessingStatus =
  | 'processing' // NEW: Active AI processing
  | 'failed_preprocessing'
  | 'failed_ai_processing'
  | 'successfully_parsed'
  | 'successfully_pushed_blockchain';
```

#### Polling Strategy

```typescript
// Poll every 3 seconds while processing is active
useEffect(() => {
  if (!isProcessing) return;
  const interval = setInterval(() => {
    fetchUnprocessedDocuments();
  }, 3000);
  return () => clearInterval(interval);
}, [isProcessing, fetchUnprocessedDocuments]);

// Refresh 2 seconds after processing completes
useEffect(() => {
  if (!isProcessing) {
    const timer = setTimeout(() => {
      fetchUnprocessedDocuments();
    }, 2000);
    return () => clearTimeout(timer);
  }
}, [isProcessing, fetchUnprocessedDocuments]);
```

#### Button Visibility Logic

```typescript
// Only show Process button when ready documents exist
{
  readyForAICount > 0 && onProcessDocuments && (
    <Button
      onClick={onProcessDocuments}
      disabled={isProcessing}
      className='bg-green-600 hover:bg-green-700'
      size='lg'
    >
      {isProcessing ? (
        <>
          <RefreshCw className='animate-spin' />
          Processing...
        </>
      ) : (
        <>⚡ Process {readyForAICount} Documents</>
      )}
    </Button>
  );
}

// Hide Retry button for processing files
const canRetry = !(
  item.status === 'processing' ||
  item.status === 'successfully_processed' ||
  item.status === 'successfully_pushed_blockchain'
);
```

### 3. Status Badge Configuration

```typescript
const statusConfig = {
  processing: {
    label: 'Processing...',
    variant: 'default',
    className: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse',
    icon: <RefreshCw className='animate-spin' />,
  },
  failed_ai_processing: {
    label: 'Failed AI Processing',
    variant: 'secondary',
  },
  // ... other statuses
};
```

## Benefits

1. **Clear Visual Feedback**: Users can see exactly which files are being processed in real-time
2. **No Confusion**: Successfully processed files disappear automatically
3. **Focused Retry**: Only failed documents show retry buttons
4. **Accurate Counts**: Separate counts for ready, processing, and failed documents
5. **Better UX**: Large, prominent action buttons that hide when not needed
6. **Performance**: Smart polling only during active processing

## Testing Checklist

- [x] Process multiple documents and verify status updates in real-time
- [x] Verify successfully processed documents disappear from view
- [x] Confirm failed documents remain with Retry button
- [x] Check that Processing status shows animated spinner
- [x] Verify counts update correctly (ready, processing, failed)
- [x] Test that Process button only shows when documents are ready
- [x] Confirm button hides during processing
- [ ] Test retry functionality for failed documents
- [ ] Verify polling stops when processing completes

## Future Enhancements

1. **WebSocket Real-time**: Replace polling with WebSocket for instant updates
2. **Progress Bar**: Show X of Y documents processed
3. **Individual File Progress**: Show processing percentage per file
4. **Batch Operations**: Select multiple failed files for bulk retry
5. **Error Details**: Expand inline error details without opening dialog
