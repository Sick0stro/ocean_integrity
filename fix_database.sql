-- Create the missing get_unprocessed_documents function
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

  UNION ALL

  -- Unprocessed temp_documents
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
    1 as total_pages
  FROM temp_documents t
  WHERE t.user_id = p_user_id
    AND t.status IN ('uploaded', 'failed')

  ORDER BY upload_date DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Fix missing updated_at column if it doesn't exist
ALTER TABLE temp_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE single_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();