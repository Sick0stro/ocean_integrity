// Base document interface with required fields from templates
interface BaseDocument {
  document_type: 'eft_receipt' | 'invoice' | 'e-way-bill';
  document_title: string;
}

// EFT Receipt
interface EFTReceipt extends BaseDocument {
  document_type: 'eft_receipt';
  // New flat fields extracted by AI prompt
  invoice?: string;
  second_invoice?: string;
  third_invoice?: string;
  etf_date?: string; // dd/mm/yyyy
  sender_name?: string;
  bank_name: string;
  reciver_name?: string;
}

// Invoice
interface Invoice extends BaseDocument {
  document_type: 'invoice';
  // New flat fields extracted by AI prompt
  invoice?: string; // like MAT/UP/12-30/054
  invoice_date?: string; // dd-mm-yyyy
  bill_to_address?: string;
  bill_to_company_name?: string;
  bill_from_company_name?: string;
  vehicle_number?: string;
  weight?: number;
  weight_unit_of_mesurement?: string; // e.g., KG
  plastic_type?: string; // PET, PP, PVC, LDPE, etc.
}

// E-Way Bill
interface EWayBill extends BaseDocument {
  document_type: 'e-way-bill';
  // New flat fields extracted by AI prompt
  invoice?: string; // e.g., MAT/UP/12-30/054
  plastic_type?: string;
  weight?: number;
  weight_unit_of_mesurement?: string; // e.g., KG
  ship_to_address?: string;
  ship_to_company_name?: string;
  ship_from_company_name?: string;
  ship_to_country_code?: string; // e.g., IN, BR, US
  vehicle_number?: string;
  eway_bill_no: string;
  generated_date: string; // dd/mm/yyyy hh:mm pm/am
  valid_upto: string; // dd/mm/yyyy
  mode: string;
  city?: string;
}

type Document = EFTReceipt | Invoice | EWayBill;

export type { BaseDocument, EFTReceipt, Invoice, EWayBill, Document };
