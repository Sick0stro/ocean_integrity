// Base document interface with required fields from templates
interface BaseDocument {
  document_type: 'eft_receipt' | 'invoice' | 'e-way-bill';
  document_title: string;
}

// EFT Receipt
interface EFTReceipt extends BaseDocument {
  document_type: 'eft_receipt';
  bank_name: string;
  transaction_details: {
    transaction_date_time: string; // dd/mm/yyyy hh:mm:ss
    value_date: string; // dd/mm/yyyy
    amount: number;
    currency: string;
    payment_type: string;
    description: string;
  };
  sender_details: {
    name: string;
    agst_ref: string;
  };
  recipient_details: {
    name: string;
    customer_no: string;
    account_no: string;
    iban: string;
  };
  reference_numbers: {
    inquiry_no: string;
    transaction_ref: string;
    document_no: string;
    ettn: string;
  };
}

// Invoice
interface Invoice extends BaseDocument {
  document_type: 'invoice';
  invoice_title: string;
  irn: string;
  ack_no: string;
  ack_date: string; // dd-mm-yyyy
  document_no: string;
  document_date: string; // dd/mm/yyyy
  supplier: {
    name: string;
    gstin: string;
    address: string;
    phone: string;
  };
  recipient: {
    name: string;
    gstin: string;
    address: string;
  };
  items: Array<{
    sino: number;
    product_description: string;
    hsn_code: string;
    quantity: number;
    uqc: string;
    unit_price: number;
    discount: number;
    taxable_amount: number;
    total: number;
  }>;
  total_summary: {
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_invoice_amount: number;
  };
}

// E-Way Bill
interface EWayBill extends BaseDocument {
  document_type: 'e-way-bill';
  document_details: string;
  eway_bill_no: string;
  generated_date: string; // dd/mm/yyyy hh:mm pm/am
  generated_by: string;
  valid_upto: string; // dd/mm/yyyy
  mode: string;
  approx_distance: string;
  address_details: {
    from: {
      gstin: string;
      name: string;
      address: string;
    };
    to: {
      gstin: string;
      name: string;
      address: string;
    };
    ship_to: {
      gstin: string;
      name: string;
      address: string;
    };
  };
}

type Document = EFTReceipt | Invoice | EWayBill;

export type { BaseDocument, EFTReceipt, Invoice, EWayBill, Document };
