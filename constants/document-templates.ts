import type { EFTReceipt, Invoice, EWayBill } from '@/types/document-types';

type DocumentTemplates = {
  eft_receipt: Omit<EFTReceipt, 'document_type'>;
  invoice: Omit<Invoice, 'document_type'>;
  'e-way-bill': Omit<EWayBill, 'document_type'>;
};

export const documentTemplates: DocumentTemplates = {
  eft_receipt: {
    document_title: 'EFT Receipt',
    invoice: '',
    second_invoice: '',
    third_invoice: '',
    etf_date: '',
    sender_name: '',
    bank_name: '',
    reciver_name: '',
  },
  invoice: {
    document_title: 'Invoice',
    invoice: '',
    invoice_date: '',
    bill_to_address: '',
    bill_to_company_name: '',
    bill_from_company_name: '',
    vehicle_number: '',
    weight: undefined,
    weight_unit_of_mesurement: '',
    plastic_type: '',
  },
  'e-way-bill': {
    document_title: 'E-Way Bill',
    invoice: '',
    plastic_type: '',
    weight: undefined,
    weight_unit_of_mesurement: '',
    ship_to_address: '',
    ship_to_company_name: '',
    ship_from_company_name: '',
    ship_to_country_code: '',
    vehicle_number: '',
    eway_bill_no: '',
    generated_date: '',
    valid_upto: '',
    mode: '',
    city: '',
  },
};
