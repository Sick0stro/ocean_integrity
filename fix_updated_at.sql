-- Add missing updated_at columns to fix preprocessing errors
ALTER TABLE temp_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE single_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create triggers to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language plpgsql;

-- Add triggers for both tables
DROP TRIGGER IF EXISTS update_temp_documents_updated_at ON temp_documents;
CREATE TRIGGER update_temp_documents_updated_at
    BEFORE UPDATE ON temp_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_single_documents_updated_at ON single_documents;
CREATE TRIGGER update_single_documents_updated_at
    BEFORE UPDATE ON single_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();