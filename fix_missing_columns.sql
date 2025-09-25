-- Fix Missing Database Columns for Retry Logic
-- Run this in your Supabase SQL Editor

-- Add missing retry_count and last_error columns to temp_documents
ALTER TABLE temp_documents 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Add missing retry_count and last_error columns to single_documents  
ALTER TABLE single_documents
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Add missing status columns if they don't exist
ALTER TABLE temp_documents
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'uploaded';

ALTER TABLE single_documents  
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'uploaded';

-- Add missing updated_at columns if they don't exist
ALTER TABLE temp_documents 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE single_documents
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_temp_docs_status ON temp_documents(status, user_id);
CREATE INDEX IF NOT EXISTS idx_single_docs_status ON single_documents(status, user_id);

-- Add status constraints for data integrity
ALTER TABLE temp_documents
DROP CONSTRAINT IF EXISTS temp_documents_status_check;

ALTER TABLE temp_documents
ADD CONSTRAINT temp_documents_status_check
CHECK (status IN ('uploaded', 'processing', 'processed', 'failed'));

ALTER TABLE single_documents
DROP CONSTRAINT IF EXISTS single_documents_status_check;

ALTER TABLE single_documents  
ADD CONSTRAINT single_documents_status_check
CHECK (status IN ('uploaded', 'processing', 'processed', 'failed', 'skipped_duplicate'));

-- Success message
SELECT 'Database schema updated successfully! Missing columns added.' as result;
