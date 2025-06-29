// Base document interface with index signature to allow dynamic properties
interface BaseDocument {
  [key: string]: unknown;
  document_type: 'eft_receipt' | 'invoice' | 'e-way-bill';
  document_title?: string;
  confidence?: number;
  content?: string;
}

// EFT Receipt
interface EFTReceipt extends BaseDocument {
  document_type: 'eft_receipt';
  bank_name: string | null;
  transaction_details: {
    transaction_date_time: string | null;
    value_date: string | null;
    amount: number | null;
    currency: string | null;
    payment_type: string | null;
    description: string | null;
  };
  sender_details: {
    name: string | null;
    bank: string | null;
    branch: string | null;
  };
  recipient_details: {
    name: string | null;
    customer_no: string | null;
    account_no: string | null;
    iban: string | null;
  };
  reference_numbers: {
    inquiry_no: string | null;
    transaction_ref: string | null;
    document_no: string | null;
    ettn: string | null;
  };
}

// Invoice
interface Invoice extends BaseDocument {
  document_type: 'invoice';
  invoice_title: string | null;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  document_no: string | null;
  document_date: string | null;
  supplier: {
    name: string | null;
    gstin: string | null;
    address: string | null;
    phone: string | null;
  };
  recipient: {
    name: string | null;
    gstin: string | null;
    address: string | null;
  };
  items: Array<{
    sino: number | null;
    product_description: string | null;
    hsn_code: string | null;
    quantity: number | null;
    uqc: string | null;
    unit_price: number | null;
    discount: number | null;
    taxable_amount: number | null;
    total: number | null;
  }>;
  total_summary: {
    taxable_amount: number | null;
    cgst_amount: number | null;
    sgst_amount: number | null;
    igst_amount: number | null;
    total_invoice_amount: number | null;
  };
}

// E-Way Bill
interface EWayBill extends BaseDocument {
  document_type: 'e-way-bill';
  eway_bill_no: string | null;
  generated_date: string | null;
  generated_by: string | null;
  valid_upto: string | null;
  mode: string | null;
  approx_distance: string | null;
  address_details: {
    from: {
      gstin: string | null;
      name: string | null;
      address: string | null;
    };
    to: {
      gstin: string | null;
      name: string | null;
      address: string | null;
    };
    ship_to: {
      gstin: string | null;
      name: string | null;
      address: string | null;
    };
  };
}

type Document = EFTReceipt | Invoice | EWayBill;

export type {
  BaseDocument,
  EFTReceipt,
  Invoice,
  EWayBill,
  Document
};
