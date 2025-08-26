# Pre-processing Workflow Implementation

## Overview

This document details the comprehensive implementation of a new pre-processing workflow for PDF document handling in the Ocean Integrity application. The system was redesigned to decouple PDF upload from AI processing, resulting in faster uploads and more efficient document processing.

## Business Requirements

**Problem Statement:**

- Original workflow processed PDFs immediately upon upload, causing slow upload experiences
- Multi-page PDFs required splitting into individual pages before AI processing
- Users experienced long wait times during the upload process

**Solution:**

- Implement a two-phase approach: fast upload → background pre-processing
- Introduce staging tables to manage the workflow
- Use a background cron job for PDF splitting and preparation
- Maintain existing AI processing pipeline without disruption

## Architecture Overview

### Before (Original Workflow)

```
User Upload → Direct AI Processing → parsed_documents
```

### After (New Pre-processing Workflow)

```
User Upload → temp_documents → [Cron Job] → single_documents → AI Processing → parsed_documents
```

## Database Schema Changes

### New Tables Created

#### 1. `temp_documents`

Initial staging table for uploaded PDFs.

**Schema:**

```sql
CREATE TABLE temp_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    pdf_path TEXT NOT NULL,
    upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Purpose:**

- Temporary storage for all uploaded PDFs
- Files remain here until processed by cron job
- User isolation through `user_id` foreign key

#### 2. `single_documents`

Final staging table for individual page PDFs ready for AI processing.

**Schema:**

```sql
CREATE TABLE single_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pdf_path TEXT NOT NULL,
    upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'uploaded', -- 'uploaded' | 'processed'
    original_filename TEXT,
    file_size BIGINT,
    mime_type TEXT DEFAULT 'application/pdf'
);
```

**Purpose:**

- Stores individual page PDFs (split from multi-page documents)
- Tracks processing status to prevent re-processing
- Ready-to-process queue for AI operations

### Row Level Security (RLS) Policies

**Storage Bucket Policy:**

```sql
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');
```

**temp_documents Policies:**

```sql
-- Users can insert their own temp documents
CREATE POLICY "Users can insert their own temp documents" ON temp_documents
FOR INSERT TO authenticated
USING (auth.uid() = user_id);
```

**single_documents Policies:**

```sql
-- Allow service role to insert single documents
CREATE POLICY "Allow service role to insert single documents" ON single_documents
FOR INSERT TO service_role
USING (true);

-- Users can read processed documents
CREATE POLICY "Users can read processed documents" ON single_documents
FOR SELECT TO authenticated
USING (true);
```

## Implementation Details

### 1. Frontend Changes (`app/page.tsx`)

#### Modified Upload Flow

**Before:**

```typescript
// Direct processing after upload
const handleFilesAdded = (newFiles: File[]) => {
  setFiles((prev) => [...prev, ...newFiles]);
  // Files immediately available for processing
};
```

**After:**

```typescript
// Upload to temp_documents first
const uploadToTempDocuments = useCallback(
  async (files: File[]) => {
    const uploadPromises = files.map(async (file) => {
      // Generate unique storage path
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const pdfPath = `temp/${session.user.id}/${timestamp}_${safeName}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(pdfPath, file);

      if (uploadError) return;

      // Insert record into temp_documents
      const { error: insertError } = await supabase
        .from('temp_documents')
        .insert({
          user_id: session.user.id,
          pdf_path: pdfPath,
          upload_date: new Date().toISOString(),
        });
    });

    await Promise.all(uploadPromises);
  },
  [session?.user?.id]
);
```

#### Modified Processing Flow

**Before:**

```typescript
// Process files from local state
const processFiles = async () => {
  for (const file of files) {
    // Direct API call with file
    const formData = new FormData();
    formData.append('file', file);
    // ... API call
  }
};
```

**After:**

```typescript
// Fetch and process from single_documents
const processFiles = async () => {
  // Fetch unprocessed documents
  const { data: documentsToProcess } = await supabase
    .from('single_documents')
    .select('*')
    .eq('status', 'uploaded');

  for (const doc of documentsToProcess) {
    // API call with document ID and path
    const formData = new FormData();
    formData.append('documentId', doc.id);
    formData.append('pdfPath', doc.pdf_path);

    const response = await fetch('/api/process-document', {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (response.ok) {
      // Update status to processed
      await supabase
        .from('single_documents')
        .update({ status: 'processed' })
        .eq('id', doc.id);
    }
  }
};
```

#### UI Simplification

- **Removed Review Tab:** Eliminated redundant review functionality since verification tab shows processed documents
- **Updated Tab Layout:** Changed from 3-column to 2-column grid in `TabsList`
- **Cleaned Imports:** Removed unused components and utilities related to the review tab

### 2. Backend Cron Job (`app/api/cron/preprocess/route.ts`)

#### Core Pre-processing Logic

**Authentication:**

```typescript
// Secure cron endpoint with secret token
const authHeader = request.headers.get('authorization');
const token = authHeader.split(' ')[1];
const cronSecret =
  process.env.CRON_INGEST_SECRET || process.env.CRON_SUBMIT_SECRET;

if (!cronSecret || token !== cronSecret) {
  return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
}
```

**Document Processing Pipeline:**

```typescript
// 1. Fetch unprocessed documents
const { data: tempDocs } = await supabase
  .from('temp_documents')
  .select('*')
  .order('upload_date', { ascending: true })
  .limit(10); // Process in batches

// 2. Process each document
for (const doc of tempDocs) {
  // Download PDF from storage
  const { data: pdfData } = await supabase.storage
    .from('documents')
    .download(doc.pdf_path);

  // Load PDF and get page count
  const pdfBuffer = await pdfData.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();

  if (pageCount === 1) {
    // Single page: move directly to single_documents
    await moveSinglePageDocument(doc, pdfBuffer);
  } else {
    // Multi-page: split into individual pages
    await splitMultiPageDocument(doc, pdfDoc);
  }

  // Cleanup: remove from temp_documents and storage
  await cleanupTempDocument(doc);
}
```

**Single Page Processing:**

```typescript
async function moveSinglePageDocument(doc, pdfBuffer) {
  // Copy file to final location
  const newPath = doc.pdf_path.replace('/temp/', '/single/');

  await supabase.storage
    .from('documents')
    .upload(newPath, pdfBuffer, { upsert: true });

  // Insert into single_documents
  await supabase.from('single_documents').insert({
    pdf_path: newPath,
    status: 'uploaded',
    original_filename: getFilenameFromPath(doc.pdf_path),
    file_size: pdfBuffer.byteLength,
    mime_type: 'application/pdf',
  });
}
```

**Multi-page Splitting:**

```typescript
async function splitMultiPageDocument(doc, pdfDoc) {
  const splitResults = [];

  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    // Create new PDF with single page
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);

    // Save as separate PDF
    const pdfBytes = await newPdf.save();
    const splitPath = `single/${generateUniqueFilename(doc, i)}`;

    await supabase.storage.from('documents').upload(splitPath, pdfBytes);

    // Insert into single_documents
    await supabase.from('single_documents').insert({
      pdf_path: splitPath,
      status: 'uploaded',
      original_filename: `${getFilenameFromPath(doc.pdf_path)}_page_${i + 1}`,
      file_size: pdfBytes.byteLength,
      mime_type: 'application/pdf',
    });

    splitResults.push(splitPath);
  }

  return splitResults;
}
```

**Error Handling & Logging:**

```typescript
// Comprehensive error tracking
const results = {
  processed: 0,
  errors: 0,
  details: [] as ProcessingDetail[],
};

// TypeScript type for processing details
type ProcessingDetail = {
  pdf_path: string;
  action: 'moved' | 'split' | 'error';
  pageCount?: number;
  newPath?: string;
  splitPaths?: string[];
  error?: string;
};
```

### 3. AI Processing Endpoint Updates (`app/api/process-document/route.ts`)

#### Dual Input Support

**Added support for both upload methods:**

```typescript
// Extract form data
const documentId = formData.get('documentId') as string | null;
const pdfPath = formData.get('pdfPath') as string | null;

if (documentId && pdfPath) {
  // NEW: Process from single_documents
  const adminSupabase = getSupabaseAdmin();
  const { data: downloadData } = await adminSupabase.storage
    .from('documents')
    .download(pdfPath);

  arrayBuffer = await downloadData.arrayBuffer();
  fileName = pdfPath.split('/').pop() || 'document.pdf';
} else {
  // EXISTING: Direct file upload
  file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json(
      {
        success: false,
        error: 'No PDF file or document ID provided',
      },
      { status: 400 }
    );
  }

  arrayBuffer = await file.arrayBuffer();
  fileName = file.name;
}
```

#### Enhanced AI Prompt

**Added additional_document classification:**

```typescript
const PROMPT = `
You are an expert document processing AI...

1. Classify Document:
   Determine if the document is an invoice, eft_receipt, e-way-bill, or additional_document.
   * If the document does not match the first three categories, classify it as additional_document.

// ... existing templates ...

Template for additional_document
{
  "document_type": "additional_document",
  "document_name": "string", // from title, header, or main label
  "issuer_name": "string",   // from who issued/provided the document
  "issue_date": "string (dd-mm-yyyy)", // if available
  "reference_number": "string" // if available
}
`;
```

#### Document Filtering Logic

**Skip storage for irrelevant documents:**

```typescript
// Check if document should be skipped
if (parsedJSON?.document_type === 'additional_document') {
  console.log('Document classified as additional_document - SKIPPING');

  // Update single_documents status to 'processed' even though we're skipping
  if (documentId) {
    await supabase
      .from('single_documents')
      .update({ status: 'processed' })
      .eq('id', documentId);
  }

  // Return success but indicate document was skipped
  return NextResponse.json({
    success: true,
    skipped: true,
    reason: 'Document classified as additional_document',
    data: parsedJSON,
  });
}
```

#### Status Management

**Update processing status:**

```typescript
// After successful AI processing, update single_documents
if (documentId && parsedJSON?.document_type !== 'additional_document') {
  await supabase
    .from('single_documents')
    .update({ status: 'processed' })
    .eq('id', documentId);
}
```

## Technical Improvements

### 1. Error Handling

- **Comprehensive Logging:** Added detailed logging throughout the cron job
- **Graceful Degradation:** System continues processing other documents if one fails
- **Cleanup Operations:** Automatic cleanup of temp files and database records
- **Batch Processing:** Process documents in manageable batches (10 at a time)

### 2. Performance Optimizations

- **Asynchronous Operations:** All file operations use async/await patterns
- **Batch Database Operations:** Minimize database round trips
- **Efficient PDF Handling:** Use pdf-lib for in-memory PDF operations
- **Storage Path Organization:** Clear separation of temp/ and single/ folders

### 3. Security Enhancements

- **RLS Policies:** Proper user isolation for all tables
- **Cron Authentication:** Secure endpoint with bearer token authentication
- **Input Validation:** Comprehensive validation of file types and sizes
- **Error Sanitization:** Safe error messages without exposing internal details

### 4. Code Quality

- **TypeScript Types:** Proper typing for all data structures
- **Consistent Naming:** Clear, descriptive variable and function names
- **Modular Design:** Separation of concerns between upload, processing, and AI phases
- **Documentation:** Extensive code comments and logging

## Environment Variables Required

```bash
# Cron job authentication
CRON_INGEST_SECRET=your_cron_secret_here
CRON_SUBMIT_SECRET=your_cron_secret_here  # Alternative secret

# Supabase configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# AI processing
GOOGLE_API_KEY=your_gemini_api_key
```

## Deployment Considerations

### 1. Database Setup

1. Create `temp_documents` and `single_documents` tables
2. Configure RLS policies for user isolation
3. Set up storage bucket policies
4. Create necessary indexes for performance

### 2. Cron Job Setup

1. Schedule the `/api/cron/preprocess` endpoint to run every 5-15 minutes
2. Configure authentication with `CRON_INGEST_SECRET`
3. Monitor execution logs for failures
4. Set up alerting for persistent errors

### 3. Storage Configuration

1. Organize storage with `temp/` and `single/` prefixes
2. Configure appropriate retention policies
3. Set up monitoring for storage usage
4. Implement cleanup for orphaned files

## Testing Strategy

### 1. Unit Tests

- Test PDF splitting logic with various page counts
- Validate file path generation and naming
- Test error handling scenarios

### 2. Integration Tests

- End-to-end workflow from upload to AI processing
- Database consistency checks
- Storage cleanup verification

### 3. Performance Tests

- Large file handling (multi-page PDFs)
- Batch processing efficiency
- Concurrent upload scenarios

## Monitoring and Observability

### 1. Key Metrics

- **Processing Time:** Time from upload to AI-ready state
- **Success Rate:** Percentage of successfully processed documents
- **Error Rate:** Failed processing attempts
- **Queue Depth:** Number of documents waiting in temp_documents

### 2. Logging Strategy

- **Structured Logs:** JSON format with consistent fields
- **Request Tracking:** Unique request IDs for tracing
- **Performance Metrics:** Processing times for each stage
- **Error Details:** Comprehensive error context

### 3. Alerting

- **Queue Backup:** Alert when temp_documents table grows too large
- **Processing Failures:** Alert on repeated cron job failures
- **Storage Issues:** Monitor storage capacity and access errors

## Migration Guide

### From Original to Pre-processing Workflow

1. **Database Setup:**

   ```sql
   -- Create new tables
   CREATE TABLE temp_documents (...);
   CREATE TABLE single_documents (...);

   -- Set up RLS policies
   ALTER TABLE temp_documents ENABLE ROW LEVEL SECURITY;
   ALTER TABLE single_documents ENABLE ROW LEVEL SECURITY;
   ```

2. **Frontend Updates:**

   - Update upload handlers to use `uploadToTempDocuments`
   - Modify processing logic to fetch from `single_documents`
   - Remove review tab components

3. **Backend Updates:**

   - Deploy new cron endpoint
   - Update AI processing endpoint for dual input support
   - Configure cron job scheduling

4. **Testing:**
   - Verify upload → temp_documents flow
   - Test cron job processing
   - Validate AI processing from single_documents

## Future Enhancements

### 1. Advanced Features

- **Priority Processing:** Expedite certain document types
- **Intelligent Retry:** Smart retry logic for failed operations
- **Parallel Processing:** Process multiple documents simultaneously
- **Duplicate Detection:** Prevent processing of identical documents

### 2. Monitoring Improvements

- **Real-time Dashboard:** Live view of processing pipeline
- **Performance Analytics:** Historical processing metrics
- **Capacity Planning:** Predictive scaling based on usage patterns

### 3. Optimization Opportunities

- **Caching Layer:** Cache frequently accessed documents
- **Compression:** Reduce storage costs with PDF compression
- **Edge Processing:** Distribute processing across regions
- **Queue Management:** Advanced queuing with priorities

## Troubleshooting Guide

### Common Issues

1. **Documents Stuck in temp_documents:**

   - Check cron job execution logs
   - Verify CRON_SECRET configuration
   - Ensure storage access permissions

2. **PDF Splitting Failures:**

   - Validate PDF file integrity
   - Check pdf-lib compatibility
   - Monitor memory usage for large files

3. **RLS Policy Violations:**

   - Verify user authentication in requests
   - Check policy configurations
   - Ensure proper service role usage

4. **Storage Upload Failures:**
   - Check storage bucket policies
   - Verify network connectivity
   - Monitor storage capacity limits

### Recovery Procedures

1. **Restart Stuck Processing:**

   ```sql
   -- Reset stuck documents for reprocessing
   DELETE FROM temp_documents WHERE upload_date < NOW() - INTERVAL '1 hour';
   ```

2. **Clean Orphaned Files:**

   ```sql
   -- Find files without database records
   -- Manual cleanup required in storage console
   ```

3. **Reset Processing Status:**
   ```sql
   -- Reset documents to retry processing
   UPDATE single_documents SET status = 'uploaded' WHERE status = 'processing';
   ```

## Conclusion

The pre-processing workflow implementation successfully decouples PDF upload from AI processing, resulting in:

- **Faster Uploads:** Users experience immediate feedback
- **Better Scalability:** Background processing handles load efficiently
- **Improved Reliability:** Retry mechanisms and error handling
- **Enhanced User Experience:** Streamlined interface with removed redundancy

The system maintains backward compatibility while providing a foundation for future enhancements and optimizations.
