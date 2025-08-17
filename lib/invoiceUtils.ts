interface InvoiceNumber {
  /** Original invoice string */
  original: string;
  /** Normalized format: MAT-UP-24-25-032 */
  normalized: string;
  /** Individual components for flexible comparison */
  parts: {
    prefix: string; // e.g., "MAT"
    region?: string; // e.g., "UP" or "MH"
    year: string; // e.g., "24"
    period: string; // e.g., "25"
    number: string; // e.g., "032" (padded to 3 digits)
  };
}

/**
 * Parse an invoice number into its components
 * Supports formats like:
 * - MAT/UP/24-25/032
 * - MAT-UP-24-25-032
 * - MAT/24-25/032
 */
function parseInvoiceNumber(invoice: string): InvoiceNumber | null {
  if (!invoice) return null;

  const clean = invoice.toString().trim().toUpperCase();

  // Define patterns in order of specificity
  const patterns: Array<{
    regex: RegExp;
    handler: (match: RegExpMatchArray) => InvoiceNumber;
  }> = [
    // Format: MAT/UP/24-25/032 or MAT-UP-24-25-032
    {
      regex: /^([A-Z]+)[\/\-]([A-Z]+)[\/\-](\d{2})[\/\-]?(\d{2})[\/\-](\d+)$/,
      handler: (match) => ({
        original: invoice,
        normalized: `${match[1]}-${match[2]}-${match[3]}-${
          match[4]
        }-${match[5].padStart(3, '0')}`,
        parts: {
          prefix: match[1],
          region: match[2],
          year: match[3],
          period: match[4],
          number: match[5].padStart(3, '0'),
        },
      }),
    },
    // Format: MAT/24-25/032
    {
      regex: /^([A-Z]+)[\/\-](\d{2})[\/\-]?(\d{2})[\/\-](\d+)$/,
      handler: (match) => ({
        original: invoice,
        normalized: `${match[1]}-${match[2]}-${match[3]}-${match[4].padStart(
          3,
          '0'
        )}`,
        parts: {
          prefix: match[1],
          year: match[2],
          period: match[3],
          number: match[4].padStart(3, '0'),
        },
      }),
    },
  ];

  // Try each pattern until we find a match
  for (const { regex, handler } of patterns) {
    const match = clean.match(regex);
    if (match) return handler(match);
  }

  // Fallback: Return a basic normalized version with all required fields
  const normalized = clean
    .replace(/[^A-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const parts = normalized.split('-');
  return {
    original: invoice,
    normalized,
    parts: {
      prefix: parts[0] || 'INV',
      region: parts[1],
      year: '00',
      period: '00',
      number: parts[parts.length - 1]?.padStart(3, '0') || '000',
    },
  };
}

/**
 * Compare two invoice numbers for equality
 * Handles different formats and partial matches
 */
function isSameInvoice(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const parsedA = parseInvoiceNumber(a);
  const parsedB = parseInvoiceNumber(b);

  if (!parsedA || !parsedB) return false;

  // Compare normalized versions first (fast path)
  if (parsedA.normalized === parsedB.normalized) return true;

  // Compare individual components if available
  const partsA = parsedA.parts;
  const partsB = parsedB.parts;

  return (
    partsA.prefix === partsB.prefix &&
    (!partsA.region || !partsB.region || partsA.region === partsB.region) &&
    partsA.year === partsB.year &&
    partsA.period === partsB.period &&
    partsA.number === partsB.number
  );
}

/**
 * Get a stable key for grouping invoices (with user scoping)
 */
function getInvoiceGroupKey(invoice: string, userId?: string): string {
  const parsed = parseInvoiceNumber(invoice);
  if (!parsed) return invoice; // Fallback to original

  // Create a key that groups similar invoices together
  const { parts } = parsed;
  const components = [
    parts.prefix,
    parts.region,
    parts.year,
    parts.period,
    parts.number,
  ].filter(Boolean);

  const invoiceKey = components.join('-');

  // If userId provided, create user-scoped key for isolation
  return userId ? `${userId}:${invoiceKey}` : invoiceKey;
}

export { parseInvoiceNumber, isSameInvoice, getInvoiceGroupKey };
