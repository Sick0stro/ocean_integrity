-- Document Lifecycle Tracking Migration
-- Adds relationship tracking, status columns, and retry metadata

-- Phase 1: Add relationship tracking to single_documents
ALTER TABLE single_documents
ADD COLUMN IF NOT EXISTS temp_document_id UUID REFERENCES temp_documents(id),
ADD COLUMN IF NOT EXISTS page_number INTEGER,
ADD COLUMN IF NOT EXISTS total_pages INTEGER;

-- Phase 2: Add/restore status columns with proper constraints
ALTER TABLE temp_documents
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'uploaded';

ALTER TABLE single_documents
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'uploaded';

-- Phase 3: Add retry and error tracking metadata
ALTER TABLE temp_documents
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

ALTER TABLE single_documents
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Phase 4: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_single_docs_temp_id ON single_documents(temp_document_id);
CREATE INDEX IF NOT EXISTS idx_temp_docs_status ON temp_documents(status, user_id);
CREATE INDEX IF NOT EXISTS idx_single_docs_status ON single_documents(status, user_id);
CREATE INDEX IF NOT EXISTS idx_single_docs_unparsed ON single_documents(user_id, status)
  WHERE status != 'processed';

-- Phase 5: Add status value constraints (optional, for data integrity)
ALTER TABLE temp_documents
ADD CONSTRAINT IF NOT EXISTS temp_documents_status_check
CHECK (status IN ('uploaded', 'processing', 'processed', 'failed'));

ALTER TABLE single_documents
ADD CONSTRAINT IF NOT EXISTS single_documents_status_check
CHECK (status IN ('uploaded', 'processing', 'processed', 'failed', 'skipped_duplicate'));

-- Phase 6: Create helper function for getting document groups
CREATE OR REPLACE FUNCTION get_document_groups(p_user_id UUID)
RETURNS TABLE (
  temp_document_id UUID,
  original_filename TEXT,
  upload_date TIMESTAMPTZ,
  temp_status TEXT,
  total_pages INTEGER,
  pages_uploaded INTEGER,
  pages_processed INTEGER,
  pages_failed INTEGER,
  pages_skipped_duplicate INTEGER,
  can_retry BOOLEAN,
  overall_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as temp_document_id,
    t.pdf_path as original_filename,
    t.upload_date,
    t.status as temp_status,
    COALESCE(MAX(s.total_pages), 1) as total_pages,
    COUNT(s.id)::INTEGER as pages_uploaded,
    COUNT(CASE WHEN s.status = 'processed' THEN 1 END)::INTEGER as pages_processed,
    COUNT(CASE WHEN s.status = 'failed' THEN 1 END)::INTEGER as pages_failed,
    COUNT(CASE WHEN s.status = 'skipped_duplicate' THEN 1 END)::INTEGER as pages_skipped_duplicate,
    (
      t.status = 'failed' OR
      COUNT(CASE WHEN s.status IN ('failed', 'uploaded') THEN 1 END) > 0
    ) as can_retry,
    CASE
      WHEN t.status = 'failed' THEN 'preprocessing_failed'
      WHEN t.status = 'uploaded' THEN 'preprocessing_pending'
      WHEN t.status = 'processing' THEN 'preprocessing'
      WHEN COUNT(s.id) = 0 THEN 'preprocessing_complete_no_pages'
      WHEN COUNT(CASE WHEN s.status = 'uploaded' THEN 1 END) > 0 THEN 'ai_processing_pending'
      WHEN COUNT(CASE WHEN s.status = 'processing' THEN 1 END) > 0 THEN 'ai_processing'
      WHEN COUNT(CASE WHEN s.status = 'failed' THEN 1 END) > 0 THEN 'ai_processing_failed'
      WHEN COUNT(CASE WHEN s.status IN ('processed', 'skipped_duplicate') THEN 1 END) = COUNT(s.id) THEN 'complete'
      ELSE 'partial'
    END as overall_status
  FROM temp_documents t
  LEFT JOIN single_documents s ON s.temp_document_id = t.id
  WHERE t.user_id = p_user_id
  GROUP BY t.id, t.pdf_path, t.upload_date, t.status
  ORDER BY t.upload_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Phase 7: Create helper function for getting unprocessed documents
CREATE OR REPLACE FUNCTION get_unprocessed_documents(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  pdf_path TEXT,
  original_filename TEXT,
  upload_date TIMESTAMPTZ,
  status TEXT,
  last_error TEXT,
  retry_count INTEGER,
  source_table TEXT,
  temp_document_id UUID,
  page_number INTEGER,
  total_pages INTEGER
) AS $$
BEGIN
  RETURN QUERY
  -- Unprocessed single_documents
  SELECT
    s.id,
    s.user_id,
    s.pdf_path,
    s.original_filename,
    s.upload_date,
    s.status,
    s.last_error,
    s.retry_count,
    'single_documents'::TEXT as source_table,
    s.temp_document_id,
    s.page_number,
    s.total_pages
  FROM single_documents s
  WHERE s.user_id = p_user_id
  AND s.status IN ('uploaded', 'failed')
  AND NOT EXISTS (
    SELECT 1 FROM parsed_documents p
    WHERE p.file_url LIKE '%' || s.pdf_path
    AND p.user_id = s.user_id
  )

  UNION ALL

  -- Failed temp_documents
  SELECT
    t.id,
    t.user_id,
    t.pdf_path,
    t.pdf_path as original_filename,
    t.upload_date,
    t.status,
    t.last_error,
    t.retry_count,
    'temp_documents'::TEXT as source_table,
    NULL::UUID as temp_document_id,
    NULL::INTEGER as page_number,
    NULL::INTEGER as total_pages
  FROM temp_documents t
  WHERE t.user_id = p_user_id
  AND t.status IN ('uploaded', 'failed')

  ORDER BY upload_date DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Phase 8: Comments for documentation
COMMENT ON COLUMN single_documents.temp_document_id IS 'Links to the original temp_document that was split into this page';
COMMENT ON COLUMN single_documents.page_number IS 'Page number within the original PDF (1, 2, 3...)';
COMMENT ON COLUMN single_documents.total_pages IS 'Total number of pages in the original PDF';
COMMENT ON COLUMN temp_documents.status IS 'Processing status: uploaded, processing, processed, failed';
COMMENT ON COLUMN single_documents.status IS 'Processing status: uploaded, processing, processed, failed, skipped_duplicate';
COMMENT ON FUNCTION get_document_groups(UUID) IS 'Returns grouped document status for data management UI';
COMMENT ON FUNCTION get_unprocessed_documents(UUID, INTEGER, INTEGER) IS 'Returns all unprocessed documents for cleanup/retry operations';