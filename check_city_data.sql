"SELECT id, document_type, (raw_json::json->>'city') as city FROM parsed_documents WHERE user_id = 'c9c61043-ce21-4303-bb16-61f883f2f619' AND document_type LIKE '%way%';" 
