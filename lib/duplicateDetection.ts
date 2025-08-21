interface DocumentData {
  invoice_number?: string;
  invoice?: string;
  anchor_key?: string;
  bill_from_company_name?: string;
  bill_to_company_name?: string;
  weight?: number | string;
  tonnage_tons?: number | string;
  weight_kg?: number | string;
  invoice_date?: string;
  document_date?: string;
  total_invoice_amount?: number | string;
  transaction_amount?: number | string;
  amount?: number | string;
}

function normalizeString(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .toString()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumber(value: number | string | undefined | null): string {
  if (!value) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '0' : num.toFixed(2);
}

function extractWeight(data: DocumentData): string {
  const weight = data.weight || data.tonnage_tons || data.weight_kg;
  return normalizeNumber(weight);
}

function extractInvoiceNumber(data: DocumentData): string {
  const invoice = data.invoice_number || data.invoice || data.anchor_key;
  return normalizeString(invoice);
}

function extractAmount(data: DocumentData): string {
  const amount =
    data.total_invoice_amount || data.transaction_amount || data.amount;
  return normalizeNumber(amount);
}

function extractDate(data: DocumentData): string {
  const date = data.invoice_date || data.document_date;
  if (!date) return '';

  try {
    const parsedDate = new Date(date.toString());
    if (isNaN(parsedDate.getTime())) return '';
    return parsedDate.toISOString().split('T')[0];
  } catch {
    return normalizeString(date.toString());
  }
}

export function generateBusinessFingerprint(data: DocumentData): string {
  const invoice = extractInvoiceNumber(data);
  const weight = extractWeight(data);
  const billFrom = normalizeString(data.bill_from_company_name);
  const billTo = normalizeString(data.bill_to_company_name);
  const date = extractDate(data);
  const amount = extractAmount(data);

  const components = [
    `inv:${invoice}`,
    `wgt:${weight}`,
    `from:${billFrom}`,
    `to:${billTo}`,
    `date:${date}`,
    `amt:${amount}`,
  ];

  return components.join('|');
}

export function parseFingerprintForDisplay(fingerprint: string) {
  const parts = fingerprint.split('|');
  const parsed: Record<string, string> = {};

  parts.forEach((part) => {
    const [key, value] = part.split(':');
    parsed[key] = value || '';
  });

  return {
    invoice: parsed.inv || 'N/A',
    weight: parsed.wgt || 'N/A',
    billFrom: parsed.from || 'N/A',
    billTo: parsed.to || 'N/A',
    date: parsed.date || 'N/A',
    amount: parsed.amt || 'N/A',
  };
}
