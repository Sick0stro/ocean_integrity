import type { EFTReceipt, Invoice, EWayBill } from '@/types/document-types';

type DocumentTemplates = {
  eft_receipt: Omit<EFTReceipt, 'document_type'>;
  invoice: Omit<Invoice, 'document_type'>;
  'e-way-bill': Omit<EWayBill, 'document_type'>;
};

export const documentTemplates: DocumentTemplates = {
  eft_receipt: {
    // Flat fields extracted by new AI schema
    invoice: '',
    second_invoice: '',
    third_invoice: '',
    etf_date: '',
    sender_name: '',
    document_title: '',
    bank_name: '',
    transaction_details: {
      transaction_date_time: '',
      value_date: '',
      amount: 0,
      currency: '',
      payment_type: '',
      description: '',
    },
    sender_details: {
      name: '',
      agst_ref: '',
    },
    recipient_details: {
      name: '',
      customer_no: '',
      account_no: '',
      iban: '',
    },
    reference_numbers: {
      inquiry_no: '',
      transaction_ref: '',
      document_no: '',
      ettn: '',
    },
  },
  invoice: {
    // Flat fields extracted by new AI schema
    invoice: '',
    invoice_date: '',
    bill_to_address: '',
    bill_to_company_name: '',
    vehicle_number: '',
    weight: 0,
    weight_unit_of_mesurement: '',
    plastic_type: '',
    document_title: '',
    invoice_title: '',
    irn: '',
    ack_no: '',
    ack_date: '',
    document_no: '',
    document_date: '',
    supplier: {
      name: '',
      gstin: '',
      address: '',
      phone: '',
    },
    recipient: {
      name: '',
      gstin: '',
      address: '',
    },
    items: [],
    total_summary: {
      taxable_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total_invoice_amount: 0,
    },
  },
  'e-way-bill': {
    // Flat fields extracted by new AI schema
    invoice: '',
    plastic_type: '',
    weight: 0,
    weight_unit_of_mesurement: '',
    ship_to_address: '',
    ship_to_company_name: '',
    ship_to_country_code: '',
    vehicle_number: '',
    document_title: '',
    document_details: '',
    eway_bill_no: '',
    generated_date: '',
    generated_by: '',
    valid_upto: '',
    mode: '',
    approx_distance: '',
    address_details: {
      from: {
        gstin: '',
        name: '',
        address: '',
      },
      to: {
        gstin: '',
        name: '',
        address: '',
      },
      ship_to: {
        gstin: '',
        name: '',
        address: '',
      },
    },
  },
};
