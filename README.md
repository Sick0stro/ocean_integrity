# Ocean Integrity

A comprehensive document processing and management system for handling invoices, EFT receipts, and e-way bills with Plastiks integration.

## Recent Updates

### 🔐 Authentication System (January 2025)

- **Complete User Authentication**: Full sign-up/sign-in system with Supabase Auth
- **Email Verification**: Users must verify their email before accessing the application
- **User Isolation**: Strict data separation - each user only sees their own documents
- **Smart UX**: Intelligent login form that detects first-time vs returning users
- **Beautiful UI**: Modern shadcn/ui login forms with contextual suggestions and success alerts
- **Session Management**: React Context-based session sharing with optimized auth listeners

### 🛡️ Security & Data Protection

- **Row Level Security (RLS)**: Database-level user isolation with Supabase RLS policies
- **API Authentication**: All endpoints now require valid JWT tokens
- **User-Specific Operations**: Document processing, promotion, and Plastiks submission are user-scoped
- **Data Integrity**: Cross-user data access prevention with comprehensive validation

### 🚀 Performance Improvements

- **Lazy Loading**: Implemented lazy loading for Push to Plastiks tab - data now loads only when needed, reducing initial page load time from 3-5 seconds to instant
- **Optimized Data Loading**: Reduced document query limit from 1000 to 500 for better performance
- **Smart Caching**: Tab switching is now instant after initial load
- **Fixed Infinite Loops**: Resolved auth-related re-render loops for better performance

### 🔧 Plastiks Integration Fixes

- **Backend Attachment Support**: Fixed critical issue where backend submissions to Plastiks were missing attachment URLs (invoice_url, eft_url, ewaybill_url)
- **Advanced Logging**: Added comprehensive logging throughout the Plastiks submission pipeline for better debugging and monitoring
- **Database Schema Alignment**: Fixed tonnage_kg vs weight_kg column mismatch that was causing submission failures
- **User-Scoped Submissions**: Plastiks submissions now respect user ownership and isolation

### 🎨 UI/UX Improvements

- **Enhanced Button States**: Push to Plastiks button now remains visible but changes state (disabled/loading/success/error) instead of disappearing
- **Removed Problematic UI**: Eliminated confusing success card that briefly appeared with "N/A" values after submission
- **Fixed Polling Loop**: Resolved infinite polling that was causing continuous console logs and poor performance
- **Tab Layout Fix**: Corrected 3-tab layout that was previously using 4-column grid
- **Smart Login Experience**: First-time users get guided sign-up flow, returning users get streamlined sign-in

## Overview

Ocean Integrity is a modern web application that streamlines the processing and management of financial documents. It provides:

- **User Authentication**: Secure sign-up/sign-in with email verification and complete user isolation
- **Document Processing**: Upload and process invoices, EFT receipts, and e-way bills using Google Gemini 2.0 Flash
- **Smart Grouping**: Automatically groups related documents by invoice number with real-time updates
- **User Data Isolation**: Each user only sees and manages their own documents with strict privacy controls
- **Validation**: Ensures document integrity and completeness before processing
- **Plastiks Integration**: Seamless submission to Plastiks for blockchain-backed PRG (Plastic Recovery Guarantee) registration with full attachment support
- **Secure Storage**: All documents are securely stored in Supabase Storage with user-specific access controls

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
- **Validation**: Ensures all required documents are present before submission
- **Duplicate Prevention**: Prevents processing of duplicate or invalid documents

### 📊 Invoice Management

- **Automatic Grouping**: Groups related documents by invoice number within user's data
- **Reference Validation**: Validates invoice references in EFT receipts
- **Status Tracking**: Tracks processing status of each document group
- **User-Specific Views**: Each user only sees their own document groups

### 🔗 Integration

- **Supabase Backend**: Secure storage and database operations with user authentication
- **Plastiks API**: Blockchain integration for document verification with user-scoped submissions
- **Web3 Support**: Secure transaction signing for blockchain operations

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

# Plastiks Integration
NEXT_PUBLIC_PLASTIKS_BASE_URL=https://staging.plastiks.io
NEXT_PUBLIC_API_TOKEN_CALL=your_plastiks_api_token
NEXT_PUBLIC_USER_ADDRESS=your_ethereum_address
PRIVATE_KEY=your_private_key

# Security
CRON_INGEST_SECRET=your_ingest_secret
CRON_SUBMIT_SECRET=your_submit_secret
```

## Document Processing Flow

1. **Authentication**: Users sign up/sign in with email verification
2. **Upload**: Authenticated users upload documents through the web interface
3. **Processing**: Documents are processed to extract key information and associated with the user
4. **Grouping**: Related documents are grouped by invoice number within the user's data
5. **Validation**: Each group is validated for completeness
6. **Submission**: Valid groups can be submitted to Plastiks for blockchain verification (user-scoped)

## API Endpoints

### 🔐 Authentication Required

All API endpoints now require valid JWT authentication tokens passed via `Authorization: Bearer <token>` header.

### Document Processing

- `POST /api/process-document` - Process uploaded documents using Google Gemini 2.0 Flash
  - **Authentication**: Required - documents are associated with the authenticated user
  - **User Isolation**: Only processes documents for the authenticated user
  - **Headers**: `Authorization: Bearer <jwt_token>`

### Document Promotion

- `POST /api/recycling-docs/promote` - Promote parsed documents to recycling_docs table for Plastiks submission
  - **Authentication**: Via cron secrets for automated processing
  - **User Isolation**: Ensures all documents in a group belong to the same user
  - **Data Integrity**: Validates user ownership before promotion

### Plastiks Integration

- `POST /api/plastiks/submit` - Submit documents to Plastiks with full attachment support
  - **Authentication**: Via cron secrets for automated processing
  - **User Filtering**: Optional `?user_id=<uuid>` parameter to process specific user's documents
  - **User Isolation**: Respects user ownership when processing submissions
  - **Full Attachment Support**: Includes invoice, EFT, and e-way bill URLs

### Data Ingestion

- `POST /api/cron/recycling-docs` - Ingest recycling document data (with authentication)
  - **Authentication**: Via cron secrets (`x-cron-secret` header or `?secret=` query param)

## Development

### Tech Stack

- **Frontend**: Next.js 15 with React 19 and TypeScript
- **UI**: Radix UI, Tailwind CSS with optimized lazy loading
- **AI Processing**: Google Gemini 2.0 Flash (experimental) for document extraction
- **State Management**: React hooks with real-time subscriptions
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL) with optimized queries
- **Storage**: Supabase Storage with public URL access
- **Blockchain**: Ethereum (via Plastiks API) with Web3 signing

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
-- Add all required columns including user ownership
alter table public.recycling_docs
  add column if not exists invoice_number text,
  add column if not exists invoice_url text,
  add column if not exists eft_url text,
  add column if not exists ewaybill_url text,
  add column if not exists recycler_company text,
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
  - Behavior:
    - Loads Plastiks blockchain config.
    - Creates a PRG collection with:
      - Name: `<recycler_company> – <invoice_number>`
      - Description: summary with type/tons/city/country
      - Plastic type mapping: `PET→"PET 1"`, `PP→"PP 5"`, `PVC→"PVC 3"`, `LDPE→"LDPE 4"`
      - **Attachment URLs**: `invoice_url`, `eft_url`, `ewaybill_url` (now properly included in Plastiks submission)
      - `use_autogen_image=false` (avoid staging dependency)
      - Minimal non-zero token price (derived from weight) and `no_of_copies`
    - **Advanced Logging**: Comprehensive logging of all request data and Plastiks API responses
    - Performs Web3 signing with your `PRIVATE_KEY`:
      - sign metadata hash → save
      - sign fixed price (EIP‑712)
      - sign PRG voucher (EIP‑712)
    - On success, updates row to `submitted` with: `plastiks_collection_id`, `plastiks_collection_address`, `plastiks_metadata_hash`, `plastiks_submitted_at`.
    - On failure, sets `status='failed'` and stores `plastiks_last_error` (includes HTTP status and body).
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

- **Column Mismatch Errors**

  - Ensure database schema matches code expectations (e.g., `weight_kg` vs `tonnage_kg`).
  - Run the database migration script provided above to add missing columns.

- **UI Issues**
  - If buttons appear incorrectly, check for JavaScript errors in browser console.
  - Infinite polling logs indicate subscription cleanup issues - refresh the page.
  - Missing tabs or layout issues may be due to CSS grid misconfigurations.

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

### Change Log

- **v3.0 (January 2025)**: Complete authentication system with user isolation, smart UX, and security features
- **v2.1 (January 2025)**: Performance optimizations, Plastiks attachment support, UI/UX improvements
- **v2.0**: Initial Plastiks integration with Web3 signing
- **v1.0**: Core document processing with Google Gemini AI
