# Ocean Integrity

A comprehensive document processing and management system for handling invoices, EFT receipts, and e-way bills with human verification workflow and real-time dashboard analytics.

## Recent Updates

### 🚀 Major Workflow Update: Human Verification System (January 2025)

- **✅ Human Verification Workflow**: Replaced Plastiks submission with human verification process for document quality control
- **✅ Real-Time Dashboard**: Added sticky header with live stats (Total Tons, Processed Docs, Verified Credits) that stay visible when scrolling
- **✅ Date Range Filtering**: Dashboard stats can be filtered by date range based on document processing date
- **✅ Verified CSV Export**: New CSV export feature specifically for human-verified documents
- **✅ Smart Badge System**: Updated status badges to show Incomplete → Complete → Verified workflow
- **✅ Combined Verification UI**: Streamlined verification status display with dynamic visual feedback
- **✅ Database Enhancements**: Added `human_verified` and `verified_at` columns for tracking verification status
- **✅ New API Endpoint**: `/api/human-verify` for secure human verification with user authentication

### 🚀 Performance & Stability Improvements

- **✅ Sticky Header Navigation**: Dashboard stats remain visible during scrolling for better user experience
- **✅ Smart File Processing**: Prevents re-processing of already completed files when new files are uploaded
- **✅ Collapsible Groups**: Groups are now collapsible and collapsed by default for better UX and performance
- **✅ Infinite Loop Fixes**: Eliminated infinite polling loops and re-render issues for dramatically improved performance
- **✅ Production Ready**: All critical bugs resolved - system is now stable for production use

### 🔐 Authentication System (January 2025)

- **Complete User Authentication**: Full sign-up/sign-in system with Supabase Auth
- **Email Verification**: Users must verify their email before accessing the application
- **Password Reset**: Secure forgot password flow with email token verification
- **User Isolation**: Strict data separation - each user only sees their own documents
- **Smart UX**: Intelligent login form that detects first-time vs returning users
- **Beautiful UI**: Modern shadcn/ui login forms with contextual suggestions and success alerts
- **Session Management**: Optimized session handling with eliminated infinite loops

### 🛡️ Security & Data Protection

- **Row Level Security (RLS)**: Database-level user isolation with Supabase RLS policies
- **API Authentication**: All endpoints now require valid JWT tokens
- **User-Specific Operations**: Document processing, promotion, and Plastiks submission are user-scoped
- **Data Integrity**: Cross-user data access prevention with comprehensive validation

### 🚀 Performance Improvements

- **Lazy Loading**: Implemented lazy loading for Push to Plastiks tab - data now loads only when needed, reducing initial page load time from 3-5 seconds to instant
- **Optimized Data Loading**: Reduced document query limit from 1000 to 500 for better performance
- **Smart Caching**: Tab switching is now instant after initial load
- **Eliminated Infinite Loops**: Completely resolved auth-related re-render loops, infinite polling, and React dependency cycles
- **Smart File Processing**: Only processes new files, preventing unnecessary re-processing of completed documents
- **Optimized State Management**: Singleton Supabase client and proper dependency management prevent multiple instances and loops
- **Efficient Grouping**: User-scoped document grouping with collapsible UI reduces render overhead

### 🔧 Human Verification Implementation

- **✅ Manual Verification Workflow**: Replaced automated Plastiks submission with human verification for quality control
- **✅ Real-Time Dashboard**: Added live statistics showing verified tonnage, document counts, and processing metrics
- **✅ Date Range Analytics**: Dashboard can filter data by processing date with real-time updates every 30 seconds
- **✅ Verification API**: Secure `/api/human-verify` endpoint with user authentication and audit trails
- **✅ Status Badge System**: Updated UI to show Incomplete → Complete → Verified workflow progression
- **✅ CSV Export**: Export verified documents with all data fields for external system integration
- **✅ Sticky Navigation**: Dashboard stats remain visible in header when scrolling for better user experience
- **✅ Combined UI**: Streamlined verification status display with dynamic visual feedback based on verification state

### 🎨 UI/UX Improvements & Dashboard Features

- **✅ Real-Time Dashboard**: Sticky header with live statistics (Total Tons, Processed Docs, Verified Credits) that stay visible when scrolling
- **✅ Date Range Filtering**: Dashboard analytics can be filtered by processing date with intuitive date picker interface
- **✅ Smart Status Badges**: Three-state badge system showing Incomplete (missing files) → Complete (all files present) → Verified (human verified)
- **✅ Combined Verification Display**: Single dynamic box showing document data with color-coded verification status
- **✅ Collapsible Groups**: Groups are now collapsible with toggle buttons and collapsed by default for better performance and cleaner UI
- **✅ CSV Export Integration**: "Download CSV" button for verified documents placed strategically in the Group & Verify tab header
- **✅ Enhanced Button States**: Human Verify button shows appropriate state (disabled for incomplete, enabled for complete, success for verified)
- **✅ Smart Document Processing**: Status indicators show which files are new vs already processed
- **✅ Tab Layout**: Clean 3-tab layout (Upload & Process → Review & Export → Group & Verify) for logical workflow progression
- **✅ Smart Login Experience**: First-time users get guided sign-up flow, returning users get streamlined sign-in with forgot password option

## Overview

Ocean Integrity is a **production-ready** modern web application that streamlines the processing and management of financial documents with human verification workflow. **All critical bugs have been resolved** and the system is now stable for production use. It provides:

- **🔐 User Authentication**: Secure sign-up/sign-in with email verification, password reset, and complete user isolation
- **📄 Document Processing**: Upload and process invoices, EFT receipts, and e-way bills using Google Gemini 2.0 Flash
- **📊 Smart Grouping**: Automatically groups related documents by invoice number with collapsible UI and real-time updates
- **🛡️ User Data Isolation**: Each user only sees and manages their own documents with strict privacy controls
- **✅ Human Verification**: Manual verification workflow to ensure document accuracy before final processing
- **📈 Real-Time Dashboard**: Live statistics in sticky header showing total tonnage, processed documents, and verified credits
- **📅 Date Range Analytics**: Filter dashboard statistics by processing date with real-time updates
- **📊 CSV Export**: Export verified documents to CSV for external systems integration
- **💾 Secure Storage**: All documents are securely stored in Supabase Storage with user-specific access controls
- **🚀 Performance Optimized**: Eliminated infinite loops, smart file processing, and optimized state management

## Key Features

### 🔐 Authentication & Security

- **User Authentication**: Complete sign-up/sign-in system with email verification
- **Smart UX**: Intelligent login forms that detect first-time vs returning users
- **Session Management**: Secure JWT-based authentication with React Context
- **Data Isolation**: Each user's documents are completely isolated from others
- **Row Level Security**: Database-level security policies prevent cross-user data access
- **API Protection**: All endpoints require authentication and validate user ownership

### 📄 Document Processing

- **Multi-Document Support**: Handles invoices, EFT receipts, and e-way bills
- **AI-Powered Parsing**: Extracts key information using Google Gemini 2.0 Flash
- **User-Scoped Processing**: Documents are automatically associated with the authenticated user
- **Validation**: Ensures all required documents are present before human verification
- **Duplicate Prevention**: Prevents processing of duplicate or invalid documents

### 📊 Real-Time Dashboard & Analytics

- **Sticky Header Dashboard**: Live statistics remain visible when scrolling for constant progress monitoring
- **Three Key Metrics**:
  - **Total Tons**: Cumulative weight from verified documents only
  - **Processed Docs**: Count of all AI-processed documents from `parsed_documents` table
  - **Verified Credits**: Count of human-verified documents from `recycling_docs` table
- **Date Range Filtering**: Filter all statistics by processing date (created_at) with intuitive date picker
- **Real-Time Updates**: Statistics refresh automatically every 30 seconds without page reload
- **User-Specific Data**: All statistics are scoped to the logged-in user only
- **Color-Coded Display**: Orange (Total Tons), Green (Processed Docs), Blue (Verified Credits) for easy identification

### 📊 Invoice Management & Verification

- **Automatic Grouping**: Groups related documents by invoice number within user's data
- **Reference Validation**: Validates invoice references in EFT receipts
- **Status Tracking**: Tracks processing status of each document group (Incomplete → Complete → Verified)
- **Human Verification**: Manual verification process to ensure data accuracy and completeness
- **Real-Time Analytics**: Dashboard shows verified tonnage, processed documents, and verification counts
- **User-Specific Views**: Each user only sees their own document groups and statistics

### 🔮 Upcoming Features

- **⏳ Blockchain Integration** *(Coming Soon)*  
  Verified credits will be pushed to the blockchain for immutable, transparent tracking.

- **📈 Advanced Analytics Dashboard**  
  Material breakdown, regional insights, time-based trends, and impact scoring.

- **🎯 Goal Tracking & Smart Insights**  
  Set plastic credit goals, monitor progress, and highlight top contributors.

- **📊 Interactive Visuals**  
  Dynamic charts, filters, drill-downs, and exportable reports (PDF/CSV).

- **🧾 Digital Certificate Issuance**  
  Generate tamper-proof certificates for verified credits.

- **🌍 Geo-Tagged Verification**  
  Link recycling actions to specific locations for enhanced traceability.

- **🔄 API Access for Partners**  
  Seamless integration with ERP and supply chain platforms.

- **🗣️ Multilingual Document Support**  
  Upload and process documents in multiple languages.

- **🧠 AI-Powered Fraud Detection**  
  Detect anomalies and flag suspicious entries.

- **🪙 Tokenized Plastic Credits** *(Future-Ready)*  
  Convert verified credits into tradable tokens for carbon markets.

### 💡 Use Cases  
- **Recyclers**: Automate credit validation and reporting.  
- **Manufacturers**: Track product lifecycle and earn credits.  
- **Auditors**: Access tamper-proof records for ESG compliance.  
- **NGOs**: Monitor impact and ensure accountability.

### 🔗 Integration & Analytics

- **Supabase Backend**: Secure storage and database operations with user authentication
- **Real-Time Dashboard**: Live statistics with date range filtering and automatic updates
- **CSV Export**: Export verified documents for integration with external systems
- **Human Verification API**: Secure verification workflow with user authentication and audit trails

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account
- Plastiks API credentials (for blockchain integration)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/ocean_integrity.git
   cd ocean_integrity
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables (see Environment Variables section)

4. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

### Required Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google AI (for document processing)
GOOGLE_API_KEY=your_google_gemini_api_key

# Security
CRON_INGEST_SECRET=your_ingest_secret
CRON_SUBMIT_SECRET=your_submit_secret

# Optional: Plastiks Integration (commented out - replaced with human verification)
# NEXT_PUBLIC_PLASTIKS_BASE_URL=https://staging.plastiks.io
# NEXT_PUBLIC_API_TOKEN_CALL=your_plastiks_api_token
# NEXT_PUBLIC_USER_ADDRESS=your_ethereum_address
# PRIVATE_KEY=your_private_key
```

## Document Processing Flow

1. **Authentication**: Users sign up/sign in with email verification
2. **Upload**: Authenticated users upload documents through the web interface
3. **Processing**: Documents are processed to extract key information and associated with the user
4. **Grouping**: Related documents are grouped by invoice number within the user's data
5. **Validation**: Each group is validated for completeness (3 files required: invoice, EFT receipt, e-way bill)
6. **Human Verification**: Users manually verify document data accuracy and completeness
7. **Analytics**: Real-time dashboard tracks verified tonnage and document counts
8. **Export**: Verified documents can be exported to CSV for external system integration

## API Endpoints

### 🔐 Authentication Required

All API endpoints now require valid JWT authentication tokens passed via `Authorization: Bearer <token>` header.

### Document Processing

- `POST /api/process-document` - Process uploaded documents using Google Gemini 2.0 Flash
  - **Authentication**: Required - documents are associated with the authenticated user
  - **User Isolation**: Only processes documents for the authenticated user
  - **Headers**: `Authorization: Bearer <jwt_token>`

### Document Promotion

- `POST /api/recycling-docs/promote` - Promote parsed documents to recycling_docs table for verification workflow
  - **Authentication**: Via cron secrets for automated processing
  - **User Isolation**: Ensures all documents in a group belong to the same user
  - **Data Integrity**: Validates user ownership before promotion

### Human Verification

- `POST /api/human-verify` - Mark documents as human-verified
  - **Authentication**: Required - JWT token via `Authorization: Bearer <token>` header
  - **User Isolation**: Users can only verify their own documents
  - **Audit Trail**: Records verification timestamp and user ID
  - **Parameters**: `?invoice=<invoice_number>` to specify which invoice to verify
  - **Response**: Returns verification status and details for the specified invoice

### Data Ingestion

- `POST /api/cron/recycling-docs` - Ingest recycling document data (with authentication)
  - **Authentication**: Via cron secrets (`x-cron-secret` header or `?secret=` query param)

### Debug & Testing

- `GET /api/debug/payload` - Debug endpoint to verify exact Plastiks payload structure
  - **Purpose**: Shows exactly what data gets sent to Plastiks API without authentication
  - **No Authentication**: Simple debug endpoint for payload verification
  - **Response**: Returns the exact payload structure that would be sent to Plastiks
  - **Usage**: `curl -X GET "http://localhost:3000/api/debug/payload"`
  - **Key Features**:
    - ✅ **100% Identical Payload**: Uses exact same logic as real Plastiks submission
    - ✅ **URL Verification**: Confirms all attachment URLs (invoice, EFT, e-way bill) are included
    - ✅ **Mock Data Testing**: Uses realistic test data matching production structure
    - ✅ **Debugging Support**: Helps verify payload structure for Plastiks team communication
  - **Use Case**: When Plastiks team claims they're not receiving attachment URLs, use this to prove the URLs are definitely included in your requests

## Development

### Tech Stack

- **Frontend**: Next.js 15 with React 19 and TypeScript
- **UI**: Radix UI, Tailwind CSS with optimized lazy loading and sticky navigation
- **AI Processing**: Google Gemini 2.0 Flash (experimental) for document extraction
- **State Management**: React hooks with real-time subscriptions and analytics
- **Backend**: Next.js API Routes with human verification workflow
- **Database**: Supabase (PostgreSQL) with optimized queries and verification tracking
- **Storage**: Supabase Storage with public URL access
- **Analytics**: Real-time dashboard with date range filtering and CSV export

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Database Schema

#### User Authentication & Isolation

The application uses Supabase Auth with Row Level Security (RLS) for complete user data isolation.

#### Table: `parsed_documents`

```sql
-- Add user ownership and enable RLS
alter table public.parsed_documents
  add column if not exists user_id uuid references auth.users(id) not null;

-- Enable Row Level Security
alter table public.parsed_documents enable row level security;

-- Create RLS policies for user isolation
create policy "users_own_parsed_documents" on public.parsed_documents
  for all using (auth.uid() = user_id);
```

#### Table: `recycling_docs`

One row per `invoice_number` per user. You can safely run this to add any missing columns.

```sql
-- Add all required columns including user ownership and human verification
alter table public.recycling_docs
  add column if not exists invoice_number text,
  add column if not exists invoice_url text,
  add column if not exists eft_url text,
  add column if not exists ewaybill_url text,
  add column if not exists recycler_company text,
  add column if not exists network_operator_company text,
  add column if not exists plastic_type text,
  add column if not exists tonnage_tons numeric(18,3),     -- canonical unit
  add column if not exists weight_kg numeric(18,3),        -- back-compat (derived)
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists origin text,
  add column if not exists currency text,
  add column if not exists upload_date date,
  add column if not exists uploaded_by text,
  add column if not exists status text default 'new',
  add column if not exists human_verified boolean default false,  -- HUMAN VERIFICATION
  add column if not exists verified_at timestamptz,               -- VERIFICATION TIMESTAMP
  add column if not exists plastiks_collection_id bigint,
  add column if not exists plastiks_collection_address text,
  add column if not exists plastiks_metadata_hash text,
  add column if not exists plastiks_tx_hash text,
  add column if not exists plastiks_last_error text,
  add column if not exists plastiks_submitted_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists user_id uuid references auth.users(id) not null; -- USER OWNERSHIP

-- Enable Row Level Security
alter table public.recycling_docs enable row level security;

-- Create RLS policies for user isolation
create policy "users_own_recycling_docs" on public.recycling_docs
  for all using (auth.uid() = user_id);

-- Create indexes
create index if not exists idx_recycling_docs_status on public.recycling_docs(status);
create index if not exists idx_recycling_docs_user_id on public.recycling_docs(user_id);
create index if not exists idx_parsed_documents_user_id on public.parsed_documents(user_id);
```

Notes:

- We store `tonnage_tons` as the source of truth (you send tonnes). We also fill `weight_kg` for deployments where the column is NOT NULL.
- `status` transitions: `new|updated` → `submitted` or `failed`.
- `human_verified` tracks manual verification status for quality control workflow.
- `verified_at` records the timestamp when human verification was completed.
- Dashboard analytics are calculated from verified documents only (`human_verified = true`).

### API endpoints (server)

- POST `/api/cron/recycling-docs`

  - Purpose: Idempotent upsert of payload rows by `invoice_number`.
  - Auth: include header `x-cron-secret: <CRON_INGEST_SECRET>` or `?secret=...` (query param allowed in dev).
  - Body: JSON array of objects, e.g.:
    ```json
    [
      {
        "invoice_number": "INV-2025-0007",
        "invoice_url": "https://…/inv.pdf",
        "eft_url": "https://…/eft.pdf",
        "ewaybill_url": "https://…/ewb.pdf",
        "recycler_company": "Green Recyclers Ltd",
        "plastic_type": "PET",
        "tonnage_value": 12.75,
        "tonnage_unit": "t",
        "country": "IN",
        "city": "Mumbai",
        "currency": "INR",
        "upload_date": "2025-08-06",
        "uploaded_by": "partner-system"
      }
    ]
    ```
  - Validation:
    - Required: `invoice_number`, all three URLs, `recycler_company`, `plastic_type`, `tonnage_value`, `country`, `city`, `currency`.
    - Plastic types allowed now: `LDPE`, `PET`, `PP`, `PVC` (case-insensitive).
    - Units: if `tonnage_unit` omitted, defaults to tonnes.
  - Behavior:
    - Stores `tonnage_tons` and also fills `weight_kg = tonnage_tons * 1000` (for back-compat).
    - Upsert by `invoice_number`.
  - Responses:
    - 200: `{ "success": true, "upserted": N }`
    - 400: `{ "error": "Ingestion failed", "details": "…" }` (DB validation will be surfaced here)

- POST `/api/plastiks/submit`

  - Purpose: Find rows with `status in ('new','updated')` and submit to Plastiks staging with full attachment support.
  - Auth: header `x-cron-secret: <CRON_SUBMIT_SECRET>` or `?secret=...`.
  - Optional: `?invoice=INV-…` to limit to one invoice.
  - **Current Request to Plastiks API**:

    - **URL**: `POST https://stage-app.plastiks.io/api/collections/prg`
    - **Headers**:
      ```json
      {
        "API-key": "[YOUR_PLASTIKS_API_KEY]",
        "User-Address": "0x155398F860C1B19CBb243496D2e6B932eD4aD143",
        "Content-Type": "application/json"
      }
      ```
    - **Payload**:
      ```json
      {
        "name": "SANDBERRY FIBRETECH PRIVATE LIMITED - MAT/UP/24-25/032",
        "description": "Recycling collection for invoice MAT/UP/24-25/032 from SANDBERRY FIBRETECH PRIVATE LIMITED",
        "plastik_type": "PET 1",
        "instant_sale_price": 1000000000,
        "no_of_copies": 18,
        "weight": 18050,
        "use_autogen_image": true,
        "recycler_company": "SANDBERRY FIBRETECH PRIVATE LIMITED",
        "invoice_number": "MAT/UP/24-25/032",
        "invoice_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/documents/...",
        "eft_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/documents/...",
        "ewaybill_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/documents/...",
        "origin": "IN",
        "currency": "INR",
        "country": "IN",
        "city": "Rangpar",
        "network_operator_company": "RECITY Network Private Limited"
      }
      ```

  - Behavior:
    - Loads Plastiks blockchain config.
    - Creates a PRG collection with:
      - **✅ All Required Fields**: `name`, `description`, `plastik_type`, `instant_sale_price`, `no_of_copies`, `weight`, `use_autogen_image`
      - Name: `<recycler_company> - <invoice_number>`
      - Description: `"Recycling collection for invoice <invoice_number> from <recycler_company>"`
      - Plastic type mapping: `PET→"PET 1"`, `PP→"PP 5"`, `PVC→"PVC 3"`, `LDPE→"LDPE 4"`
      - **Attachment URLs**: `invoice_url`, `eft_url`, `ewaybill_url` (now properly included in Plastiks submission)
      - `instant_sale_price`: 1000000000 (1 Gwei minimum)
      - `no_of_copies`: Math.max(1, Math.round(weightKg / 1000)) (1 copy per ton)
      - `use_autogen_image`: true
    - **Advanced Logging**: Comprehensive logging of all request data and Plastiks API responses
    - Performs Web3 signing with your `PRIVATE_KEY`:
      - sign metadata hash → save
      - sign fixed price (EIP‑712)
      - sign PRG voucher (EIP‑712)
    - On success, updates row to `submitted` with: `plastiks_collection_id`, `plastiks_collection_address`, `plastiks_metadata_hash`, `plastiks_submitted_at`.
    - On failure, sets `status='failed'` and stores `plastiks_last_error` (includes HTTP status and body).
  - **Successful Plastiks Response** (HTTP 201):
    ```json
    {
      "success": true,
      "collection": {
        "id": 3414,
        "address": "82e88f70587dc2154096e616dcbacbad",
        "name": "SANDBERRY FIBRETECH PRIVATE LIMITED - MAT/UP/24-25/032",
        "instant_sale_price": "1000000000.0",
        "no_of_copies": 18,
        "weight": 18050,
        "guarantee_connected": null,
        "image_hash": "QmZEC68egdUSixnM9wtBpjxw7wTXkcdUkioPQrLxKS71N8",
        "metadata_hash": "QmWGyCNsLhUM4cuvYJCMhB6X9KiFgcGcNueJPHzyVLPkKQ"
      }
    }
    ```
  - Response: summary object with per-invoice status.

### Local testing

- Start dev server:

  ```bash
  npm install
  npm run dev
  ```

- Ingest (Git Bash / WSL):
  ```bash
  curl -sS -X POST "http://localhost:3000/api/cron/recycling-docs?secret=local-dev-ingest-123" \
    -H "Content-Type: application/json" \
    --data-binary @data/payload.json
  ```
- Ingest (PowerShell):
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/cron/recycling-docs?secret=local-dev-ingest-123" -Method Post -ContentType "application/json" -Body (Get-Content -Path "data/payload.json" -Raw)
  ```
- Submit (any shell):
  ```bash
  curl -sS -X POST "http://localhost:3000/api/plastiks/submit?secret=local-dev-submit-123"
  ```

### Storage URLs — public vs signed

- Current UI uses public Supabase Storage URLs via `getPublicUrl()` from the `documents` bucket.
- If needed later, you can switch to private buckets and signed URLs (server-minted, time-limited) and store `storage_path` instead.

### Troubleshooting

- **✅ Dashboard Stats Not Loading - COMMON ISSUE**

  - **Issue**: Dashboard shows "Loading..." or zero values for all statistics
  - **Solution**: Check browser console for authentication errors or database connection issues
  - **Common Causes**:
    - Invalid session token (sign out and sign back in)
    - Database column mismatch (ensure `human_verified` and `verified_at` columns exist)
    - Network connectivity issues
  - **Status**: ✅ User authentication required for all dashboard queries

- **✅ Human Verification Not Working - FIXED**

  - **Issue**: "Human Verify" button shows errors or doesn't update status
  - **Solution**: Ensure proper authentication headers and database schema
  - **Status**: ✅ Resolved in latest version with proper JWT token handling

- **✅ Infinite polling loops - FIXED**

  - **Issue**: Console showed endless polling messages
  - **Solution**: Polling now stops correctly, replaced Plastiks polling with dashboard stats refresh
  - **Status**: ✅ Resolved in latest version

- **401 Unauthorized**

  - Ensure header `x-cron-secret` matches `.env`, or pass `?secret=…` in dev.
  - Restart `npm run dev` after changing `.env`.

- **400 Ingestion failed**

  - The response `details` includes the DB or validation error (e.g., NOT NULL on a missing column).
  - Ensure `recycling_docs` has the columns listed above.
  - Ensure the JSON body is an array, not a single object.

- **Plastiks errors (500/422/etc.)**

  - The response includes HTTP status and the returned body (also saved in `plastiks_last_error`).
  - Verify `API_TOKEN_CALL`, `USER_ADDRESS` (checksummed), and `PRIVATE_KEY` match.
  - Confirm plastic type mapping is correct for your case.
  - Check browser console for advanced logging showing exact request data sent to Plastiks.

- **Performance Issues**

  - Monitor console for performance logs: `⏱️ [PERFORMANCE] Groups data loading: Xs`
  - Slow tab switching may indicate database query issues or large dataset processing.
  - Check browser Network tab for long-running requests.
  - **Note**: Most infinite loop issues have been resolved in the latest version.

- **Column Mismatch Errors**

  - Ensure database schema matches code expectations (e.g., `weight_kg` vs `tonnage_kg`).
  - Run the database migration script provided above to add missing columns.

- **UI Issues**
  - If buttons appear incorrectly, check for JavaScript errors in browser console.
  - **Note**: Infinite polling and subscription cleanup issues have been resolved.
  - Missing tabs or layout issues may be due to CSS grid misconfigurations.
  - Use collapsible groups feature to improve UI performance with large datasets.

### Security

- Keep `PRIVATE_KEY` and secrets in server-side env only; never expose to the client.
- Use long, random secrets for ingestion/submit endpoints if exposing them beyond internal cron.

### Notes & next steps

- **Performance Optimized**: The UI now uses lazy loading for better user experience - data loads only when needed.
- **Real-time Updates**: Supabase subscriptions provide real-time document status updates without manual refresh.
- **Comprehensive Logging**: All Plastiks submissions include detailed logging for debugging and monitoring.
- The legacy "serve from DB as base64" endpoints are present but not used by this flow.
- You can schedule submissions via Vercel Cron to POST `/api/plastiks/submit` on an interval.
- If multiple EFT/waybills per invoice are needed, introduce a child table; current design assumes one of each per invoice.

## Authentication Setup

### 1. Supabase Auth Configuration

Ensure your Supabase project has email authentication enabled:

1. Go to **Authentication > Settings** in your Supabase dashboard
2. Enable **Email** provider
3. Configure **Email Templates** for verification emails
4. Set **Site URL** to your application URL (e.g., `http://localhost:3001` for development)

### 2. User Experience

#### First-Time Users

- See "Create Account" form by default
- Get contextual email suggestions based on domain
- Receive green success alert: "📧 Check your email to verify your account!"
- Must click verification link in email before accessing the app

#### Returning Users

- Can easily toggle to "Sign in" mode
- Get helpful suggestions if they're in the wrong mode
- Automatic login after email verification

### 3. Security Features

- **Email Verification Required**: Users cannot access the app until they verify their email
- **JWT-Based Sessions**: Secure token-based authentication
- **Automatic Session Management**: Handles token refresh and expiration
- **Row Level Security**: Database-level user isolation
- **API Protection**: All endpoints validate user tokens

## Development Notes

### Authentication Flow

1. **User Registration**: New users sign up with email/password
2. **Email Verification**: Verification email sent automatically
3. **Account Activation**: Users click link to verify and auto-login
4. **Session Management**: JWT tokens handle ongoing authentication
5. **Data Association**: All user actions are tied to their user ID
6. **Secure Access**: RLS policies ensure users only see their own data

### Testing Authentication

1. **Sign Up**: Create a new account with a real email address
2. **Check Email**: Look for verification email (check spam folder)
3. **Verify**: Click the verification link
4. **Upload Documents**: Test that documents are user-specific
5. **Sign Out/In**: Verify session persistence

## Current Workflow Summary

### 1. Upload & Process Tab

- Upload PDF documents (invoices, EFT receipts, e-way bills)
- AI processes documents using Google Gemini 2.0 Flash
- Real-time processing status with progress indicators

### 2. Review

- Review extracted data from AI processing
- Preview PDF documents alongside extracted information
- Export processed data to CSV

### 3. Group & Verify Tab

- Documents automatically grouped by invoice number
- Status badges: Incomplete → Complete → Verified
- Human verification button for quality control
- Combined verification status display with dynamic visual feedback
- CSV export for verified documents only

### 4. Dashboard Analytics

- **Sticky Header**: Always visible statistics during scrolling
- **Real-Time Updates**: Refreshes every 30 seconds automatically
- **Date Range Filtering**: Filter by document processing date
- **Three Key Metrics**: Total verified tons, processed document count, verified document count

### Change Log

- **v4.0 **: 🚀 **HUMAN VERIFICATION WORKFLOW** - Replaced Plastiks with human verification, added real-time dashboard with sticky header, date range analytics, CSV export for verified docs, and streamlined 3-tab UI
- **v3.1 **: 🚀 **PRODUCTION READY** - Fixed all critical Plastiks submission issues, eliminated infinite loops, added password reset, collapsible groups, smart file processing, and comprehensive error handling
- **v3.0 **: Complete authentication system with user isolation, smart UX, and security features
- **v2.1 **: Performance optimizations, Plastiks attachment support, UI/UX improvements
- **v2.0**: Initial Plastiks integration with Web3 signing
- **v1.0**: Core document processing with Google Gemini AI
