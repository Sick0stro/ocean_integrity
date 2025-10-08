import json
from supabase import create_client
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Supabase client
url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

print("🔍 Debugging Invoice Number Issues\n")

# 1. Check parsed_documents for invoice data
print("1. Checking parsed_documents table:")
parsed_docs = supabase.table('parsed_documents')\
    .select('id, document_type, raw_json')\
    .eq('document_type', 'invoice')\
    .limit(5)\
    .execute()

for doc in parsed_docs.data:
    raw_json = json.loads(doc['raw_json'])
    print(f"  ID: {doc['id']}")
    print(f"  Invoice from raw_json: {raw_json.get('invoice', 'NOT FOUND')}")
    print(f"  Bill from: {raw_json.get('bill_from_company_name', 'N/A')}")
    print()

# 2. Check matched_records for empty invoice numbers
print("\n2. Checking matched_records with empty invoice_number:")
matched = supabase.table('matched_records')\
    .select('id, invoice_number, invoice_id')\
    .or_('invoice_number.eq.,invoice_number.is.null')\
    .limit(5)\
    .execute()

print(f"  Found {len(matched.data)} records with empty invoice_number")

# 3. Join to see what invoice data is available
print("\n3. Checking if we can fix by joining with parsed_documents:")
for record in matched.data[:3]:
    if record['invoice_id']:
        # Get the parsed document
        parsed = supabase.table('parsed_documents')\
            .select('raw_json')\
            .eq('id', record['invoice_id'])\
            .single()\
            .execute()
        
        if parsed.data:
            raw_json = json.loads(parsed.data['raw_json'])
            print(f"  Matched Record ID: {record['id']}")
            print(f"  Current invoice_number: '{record['invoice_number']}'")
            print(f"  Invoice from parsed_doc: '{raw_json.get('invoice', 'NOT FOUND')}'")
            print(f"  Can be fixed: {'YES' if raw_json.get('invoice') else 'NO'}")
            print()

# 4. Show the SQL to fix this
print("\n4. SQL to fix empty invoice numbers:")
print("""
UPDATE matched_records mr
SET invoice_number = pd.raw_json->>'invoice'
FROM parsed_documents pd
WHERE mr.invoice_id = pd.id
  AND (mr.invoice_number = '' OR mr.invoice_number IS NULL)
  AND pd.raw_json->>'document_type' = 'invoice'
  AND pd.raw_json->>'invoice' IS NOT NULL
  AND pd.raw_json->>'invoice' != '';
""")

print("\n5. For the button issue:")
print("The button persists because matched_records have empty invoice_number fields.")
print("This causes documents to be keyed by empty string in verifiedDocs state.")
print("After fixing invoice numbers, the button logic will work correctly.")
