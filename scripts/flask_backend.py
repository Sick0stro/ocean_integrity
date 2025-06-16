from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os
import tempfile
import json
import traceback

# --- Configuration ---

# Load environment variables from a .env file
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

# Ensure the API key is available
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found. Please create a .env file and set your API key.")

# Initialize the Gemini Client
# This is the correct way to set up for making API calls as per your reference.
client = genai.Client(api_key=api_key)

# --- Flask App Initialization ---

app = Flask(__name__)
# Enable Cross-Origin Resource Sharing (CORS) for all routes
CORS(app)

# --- AI Prompt Definition ---

# This detailed prompt guides the AI to correctly classify the document
# and extract data into the specified JSON format.
prompt = """
You are an expert document processing AI. Your task is to analyze the provided document, identify its type, and extract the data into a precise JSON format.

**Instructions:**

1.  **Classify Document:** Determine if the document is an `invoice`, `eft_receipt`, or `e-way-bill`.
2.  **Extract Data:** Populate the corresponding JSON template with data extracted from the document.
3.  **Strict Formatting:**
    * Use the exact field names and data types from the templates.
    * If a field's value is not found in the document, you **MUST** use `null`.
    * Your output **MUST** be only the JSON object. Do not include any extra text, explanations, or markdown formatting like ```json.

---
**JSON TEMPLATES**

**Template for `eft_receipt`**
{
  "document_type": "eft_receipt",
  "bank_name": "string",
  "document_title": "string",
  "transaction_details": {
    "transaction_date_time": "string (dd/mm/yyyy hh:mm:ss)",
    "value_date": "string (dd/mm/yyyy)",
    "amount": "number",
    "currency": "string",
    "payment_type": "string",
    "description": "string"
  },
  "sender_details": { "name": "string", "bank": "string", "branch": "string" },
  "recipient_details": { "name": "string", "customer_no": "string", "account_no": "string", "iban": "string" },
  "reference_numbers": { "inquiry_no": "string", "transaction_ref": "string", "document_no": "string", "ettn": "string" }
}

**Template for `invoice`**
{
  "document_type": "invoice",
  "invoice_title": "string",
  "irn": "string",
  "ack_no": "string",
  "ack_date": "string (dd-mm-yyyy)",
  "document_no": "string",
  "document_date": "string (dd/mm/yyyy)",
  "supplier": { "name": "string", "gstin": "string", "address": "string", "phone": "string" },
  "recipient": { "name": "string", "gstin": "string", "address": "string" },
  "items": [
    {
      "sino": "number",
      "product_description": "string",
      "hsn_code": "string",
      "quantity": "number",
      "uqc": "string",
      "unit_price": "number",
      "discount": "number",
      "taxable_amount": "number",
      "total": "number"
    }
  ],
  "total_summary": {
    "taxable_amount": "number",
    "cgst_amount": "number",
    "sgst_amount": "number",
    "igst_amount": "number",
    "total_invoice_amount": "number"
  }
}

**Template for `e-way-bill`**
{
  "document_type": "e-way-bill",
  "eway_bill_no": "string",
  "generated_date": "string (dd/mm/yyyy hh:mm pm/am)",
  "generated_by": "string",
  "valid_upto": "string (dd/mm/yyyy)",
  "mode": "string",
  "approx_distance": "string",
  "address_details": {
    "from": { "gstin": "string", "name": "string", "address": "string" },
    "to": { "gstin": "string", "name": "string", "address": "string" },
    "ship_to": { "gstin": "string", "name": "string", "address": "string" }
  }
}
---
"""

# --- API Endpoints ---

@app.route('/health', methods=['GET'])
def health_check():
    """A simple endpoint to confirm that the Flask server is running."""
    return jsonify({"status": "healthy", "message": "Flask backend is running"})

@app.route('/process-document', methods=['POST'])
def process_document():
    """
    Handles the file upload, processes it with the Gemini AI model,
    and returns the extracted JSON data.
    """
    if 'file' not in request.files:
        return jsonify(success=False, error="No file part in the request"), 400

    file = request.files['file']
    filename = request.form.get('filename', file.filename or 'unknown.pdf')

    if not filename.lower().endswith('.pdf'):
        return jsonify(success=False, error="Only PDF files are supported"), 400

    print(f"Received file: {filename}")
    temp_file_path = None
    try:
        # Save the file to a temporary location to read its bytes
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file_path = temp_file.name
            file.save(temp_file_path)

        print(f"File saved temporarily to: {temp_file_path}")

        # Read the bytes from the temporary file
        with open(temp_file_path, 'rb') as f:
            pdf_bytes = f.read()

        # Process the file with the AI model using the Client SDK
        print("Generating content with the AI model...")
        response = client.models.generate_content(
            model="gemini-1.5-flash-latest", # A modern and capable model
            contents=[
                types.Part.from_bytes(
                    data=pdf_bytes,
                    mime_type='application/pdf',
                ),
                prompt
            ]
        )
        print("Received response from AI.")

        # Parse the response and send it back to the client
        ai_response_text = response.text.strip()
        
        # Clean the response just in case the model adds markdown wrappers
        if ai_response_text.startswith("```json"):
            ai_response_text = ai_response_text[7:-3].strip()
        
        try:
            extracted_data = json.loads(ai_response_text)
            print("Successfully parsed AI response as JSON.")
            return jsonify({
                "success": True,
                "filename": filename,
                "data": extracted_data
            })
        except json.JSONDecodeError as json_err:
            print(f"JSONDecodeError: {json_err}")
            print(f"Raw AI Response that failed to parse:\n{ai_response_text}")
            return jsonify({
                "success": False,
                "error": "AI response was not valid JSON.",
                "raw_response": ai_response_text
            }), 500

    except Exception as e:
        print("An unexpected error occurred during processing!")
        print(traceback.format_exc())
        return jsonify(success=False, error=str(e)), 500

    finally:
        # **Crucially**, delete the temporary file from the local server
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
            print(f"Temporary file {temp_file_path} deleted.")


# --- Main Execution ---

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
