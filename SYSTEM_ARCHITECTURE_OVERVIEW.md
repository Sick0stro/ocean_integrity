# Ocean Integrity System Architecture Overview

## Executive Summary

Ocean Integrity is a **document processing and blockchain integration platform** that manages recycling documentation (invoices, EFT receipts, E-way bills) through a sophisticated multi-stage pipeline from PDF upload to blockchain submission on the Plastiks platform.

## Core System Design Pattern: **Decoupled Pipeline Architecture**

The system follows a **staged processing pipeline** pattern with clear separation of concerns:

```
User Upload → Preprocessing → AI Processing → Human Verification → Blockchain Submission
     ↓              ↓               ↓                ↓                     ↓
temp_documents → single_documents → parsed_documents → recycling_docs → Plastiks Blockchain
```

## Technology Stack

### Frontend

- **Framework**: Next.js 15 with React 19
- **UI Library**: Radix UI + Tailwind CSS (shadcn/ui components)
- **State Management**: React hooks with local state
- **Authentication**: Supabase Auth
- **PDF Handling**: react-pdf-viewer, pdf-lib

### Backend

- **Runtime**: Next.js API Routes (Server-side)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (S3-compatible)
- **AI Processing**: Google Gemini API
- **Blockchain Integration**: Ethers.js + Plastiks API
- **Authentication**: JWT tokens via Supabase Auth

### Infrastructure

- **Hosting**: Vercel (implied from configuration)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **File Storage**: Supabase Storage with organized folder structure
- **Background Processing**: Cron jobs via external scheduler or manual triggers

## Architectural Patterns

### 1. **Staged Pipeline Pattern**

Each document flows through distinct stages with dedicated database tables:

```sql
-- Stage 1: Raw uploads
temp_documents (user_id, pdf_path, upload_date)

-- Stage 2: Preprocessed single-page PDFs
single_documents (pdf_path, status, file_size, user_id)

-- Stage 3: AI-processed documents
parsed_documents (user_id, document_type, raw_json, anchor_key)

-- Stage 4: Business-ready records
recycling_docs (invoice_number, recycler_company, plastic_type, tonnage_tons, status)
```

### 2. **Row Level Security (RLS) Pattern**

Complete user data isolation at the database level:

```sql
-- Example RLS Policy
CREATE POLICY "users_own_documents" ON parsed_documents
FOR ALL USING (auth.uid() = user_id);
```

### 3. **Microservice-like API Pattern**

Specialized API endpoints for each concern:

- `/api/process-document` - AI document processing
- `/api/cron/preprocess` - PDF splitting and preparation
- `/api/plastiks/submit` - Blockchain submission
- `/api/human-verify` - Manual verification workflow

### 4. **Background Processing Pattern**

Heavy operations run asynchronously via cron jobs:

- **Preprocessing**: Splits multi-page PDFs, moves files between storage folders
- **AI Processing**: Extracts document data using LLM
- **Blockchain Submission**: Submits verified documents to Plastiks

## Database Schema Architecture

### Core Tables

#### 1. Document Processing Pipeline

```sql
-- Stage 1: Initial uploads
temp_documents (
    id UUID,
    user_id UUID → auth.users(id),
    pdf_path TEXT,
    upload_date TIMESTAMPTZ
);

-- Stage 2: Preprocessed documents
single_documents (
    id UUID,
    pdf_path TEXT,
    status 'uploaded'|'processed',
    user_id UUID → auth.users(id),
    original_filename TEXT,
    file_size BIGINT
);

-- Stage 3: AI-processed data
parsed_documents (
    id UUID,
    user_id UUID → auth.users(id),
    document_type 'invoice'|'eft_receipt'|'e-way-bill',
    raw_json JSONB,
    anchor_key TEXT,
    file_url TEXT
);

-- Stage 4: Business records
recycling_docs (
    id UUID,
    user_id UUID → auth.users(id),
    invoice_number TEXT UNIQUE,
    document_type TEXT,
    recycler_company TEXT,
    network_operator_company TEXT,
    plastic_type TEXT,
    tonnage_tons NUMERIC(18,3),
    country TEXT,
    status 'new'|'updated'|'submitted'|'failed',
    human_verified BOOLEAN,
    verified_at TIMESTAMPTZ,
    plastiks_collection_id BIGINT,
    plastiks_collection_address TEXT,
    plastiks_metadata_hash TEXT,
    plastiks_submitted_at TIMESTAMPTZ
);
```

#### 2. Authentication & User Management

- Uses Supabase Auth (`auth.users`) with JWT tokens
- All tables reference `user_id` for complete data isolation
- RLS policies enforce user-level access control

### Storage Architecture

```
documents/
├── temp/
│   └── {user_id}/
│       └── {timestamp}_{filename}.pdf
├── single/
│   └── {user_id}/
│       └── {timestamp}_{page}_{filename}.pdf
└── processed/
    └── {user_id}/
        └── {processed_filename}.pdf
```

## Data Flow Architecture

### 1. Upload & Preprocessing Flow

```
1. User uploads PDFs → temp_documents table + temp/ folder
2. Cron job processes temp_documents:
   - Single-page PDFs: Move to single/ folder
   - Multi-page PDFs: Split pages, create multiple files in single/
   - Create records in single_documents table
   - Delete from temp_documents
```

### 2. AI Processing Flow

```
1. User triggers "Process Documents"
2. Frontend fetches unprocessed single_documents
3. For each document:
   - Call /api/process-document
   - Download PDF from storage
   - Send to Google Gemini API with structured prompt
   - Parse JSON response
   - Save to parsed_documents table
   - Update single_documents.status = 'processed'
```

### 3. Business Logic Flow

```
1. Cron job processes parsed_documents:
   - Group by invoice_number (business key)
   - Combine related documents (invoice + EFT + E-way bill)
   - Calculate business metrics (tonnage, companies)
   - Upsert into recycling_docs table
```

### 4. Verification & Submission Flow

```
1. Human verification:
   - Users review recycling_docs in "Verify & Submit" tab
   - Mark records as human_verified = true

2. Blockchain submission:
   - Cron job finds verified records with status = 'new'|'updated'
   - Submit to Plastiks API
   - Update with blockchain transaction details
   - Set status = 'submitted'
```

## Key Components Architecture

### Frontend Components (`/components`)

- **FileUploader**: Handles multi-file PDF uploads with validation
- **DocumentTypeCard**: Displays processed document data in structured format
- **PdfPreview**: Renders PDF documents with react-pdf-viewer
- **VerifiedCsvDownload**: Exports verified business records
- **LoginForm**: Supabase Auth integration

### Backend Services (`/app/api`)

- **process-document**: AI document processing with Google Gemini
- **cron/preprocess**: PDF splitting and file organization
- **cron/recycling-docs**: Business logic processing
- **plastiks/submit**: Blockchain integration
- **human-verify**: Manual verification workflows

### Utility Libraries (`/lib`, `/utils`)

- **supabase.ts**: Database client configuration
- **plastiks.ts**: Blockchain integration utilities
- **invoiceUtils.ts**: Business logic for grouping documents
- **duplicateDetection.ts**: Prevents duplicate document processing

## AI Processing Architecture

### Document Classification System

The AI system uses Google Gemini to classify and extract data from PDFs:

```typescript
// Supported document types
type DocumentType =
  | 'invoice'
  | 'eft_receipt'
  | 'e-way-bill'
  | 'additional_document';

// AI prompt includes templates for each document type
const PROMPT = `
You are an expert document processing AI...

Template for invoice:
{
  "document_type": "invoice",
  "invoice": "string",
  "invoice_date": "string (dd-mm-yyyy)",
  "bill_to_company_name": "string",
  "vehicle_number": "string",
  "weight": "number",
  "plastic_type": "string"
}
// ... other templates
`;
```

### Processing Logic

1. **Document Classification**: AI determines document type
2. **Data Extraction**: Structured extraction based on document type
3. **Validation**: Business rules validate extracted data
4. **Deduplication**: Prevents processing of duplicate documents
5. **Anchor Key Generation**: Creates unique identifiers for document grouping

## Blockchain Integration Architecture

### Plastiks Platform Integration

```typescript
interface PlastiksConfig {
  baseUrl: string;
  apiToken: string;
  userAddress: string;
  privateKey: string;
}

interface PlastiksCollection {
  id: number;
  address: string;
  weight: number;
  name: string;
  metadata_hash?: string;
}
```

### Submission Process

1. **Data Transformation**: Convert recycling_docs to Plastiks format
2. **Collection Creation**: Submit recycling data as NFT collection
3. **Blockchain Transaction**: Ethereum-based transaction on CELO network
4. **Metadata Storage**: IPFS-based metadata storage
5. **Status Tracking**: Track submission status and transaction hashes

## Security Architecture

### Authentication & Authorization

- **JWT Tokens**: Supabase-issued tokens for API authentication
- **Row Level Security**: Database-level user isolation
- **API Authentication**: Bearer token validation on all endpoints
- **Cron Job Security**: Secret tokens for automated processes

### Data Privacy

- **User Isolation**: Complete separation of user data at database level
- **File Isolation**: User-specific storage folders
- **Access Control**: RLS policies prevent cross-user data access

### Input Validation

- **File Type Validation**: Only PDF files accepted
- **Size Limits**: Configurable file size restrictions
- **Content Validation**: AI-based document content validation
- **Business Rule Validation**: Ensures data integrity for blockchain submission

## Performance & Scalability Patterns

### Asynchronous Processing

- **Background Jobs**: Heavy operations run via cron jobs
- **Batch Processing**: Documents processed in configurable batches
- **Status Tracking**: Granular status fields for workflow management

### Storage Optimization

- **File Organization**: Structured folder hierarchy for efficient access
- **Cleanup Procedures**: Automatic cleanup of temporary files
- **Deduplication**: Advanced duplicate detection to prevent reprocessing

### Database Performance

- **Indexes**: Strategic indexes on frequently queried columns
- **Batch Operations**: Minimize database round trips
- **Connection Pooling**: Efficient database connection management

## Error Handling & Monitoring

### Error Recovery

- **Graceful Degradation**: System continues processing when individual documents fail
- **Retry Logic**: Smart retry mechanisms for transient failures
- **Status Tracking**: Comprehensive status fields for debugging

### Logging & Diagnostics

- **Request IDs**: Unique identifiers for tracking requests across services
- **Structured Logging**: JSON-formatted logs with consistent fields
- **Performance Metrics**: Processing time tracking for optimization
- **Error Context**: Detailed error information for debugging

## Development & Deployment Patterns

### Environment Configuration

```bash
# Database
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI Processing
GOOGLE_API_KEY=

# Blockchain
PLASTIKS_BASE_URL=
API_TOKEN_CALL=
USER_ADDRESS=
PRIVATE_KEY=

# Cron Jobs
CRON_INGEST_SECRET=
CRON_SUBMIT_SECRET=
```

### Testing Strategy

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Load testing for batch operations
- **Error Scenario Testing**: Edge case and failure testing

## Future Architecture Considerations

### Scalability Enhancements

- **Queue System**: Redis/BullMQ for job processing
- **Microservices**: Split into dedicated services
- **CDN Integration**: Optimize file delivery
- **Database Sharding**: Handle large-scale user data

### Feature Extensions

- **Multi-tenant Architecture**: Support for organization-level access
- **Advanced Analytics**: Business intelligence and reporting
- **Mobile Apps**: React Native or native mobile applications
- **API Gateway**: Centralized API management and rate limiting

## Summary

Ocean Integrity implements a **sophisticated document processing pipeline** that successfully bridges traditional document management with modern blockchain technology. The architecture prioritizes:

1. **User Experience**: Fast uploads with background processing
2. **Data Integrity**: Multi-stage validation and verification
3. **Security**: Complete user data isolation and secure blockchain integration
4. **Scalability**: Asynchronous processing with batch operations
5. **Maintainability**: Clean separation of concerns and comprehensive logging

The system's strength lies in its **decoupled pipeline architecture** that allows each stage to operate independently while maintaining data consistency and user isolation throughout the entire workflow.
