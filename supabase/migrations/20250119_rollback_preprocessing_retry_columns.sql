-- Rollback retry tracking columns from temp_documents and single_documents
-- Migration: 20250119_rollback_preprocessing_retry_columns.sql

-- Drop indexes first (if they exist)
DROP INDEX IF EXISTS idx_temp_documents_status_retry;
DROP INDEX IF EXISTS idx_temp_documents_duplicate;

-- Drop the columns that were added to temp_documents (if they exist)
ALTER TABLE temp_documents 
DROP COLUMN IF EXISTS status,
DROP COLUMN IF EXISTS error_message,
DROP COLUMN IF EXISTS last_attempt,
DROP COLUMN IF EXISTS retry_count,
DROP COLUMN IF EXISTS is_duplicate,
DROP COLUMN IF EXISTS error_category,
DROP COLUMN IF EXISTS final_error_message;

-- Drop the columns that were added to single_documents (if they exist)
ALTER TABLE single_documents 
DROP COLUMN IF EXISTS error_category,
DROP COLUMN IF EXISTS retry_count,
DROP COLUMN IF EXISTS source_temp_document_id,
DROP COLUMN IF EXISTS page_number;
