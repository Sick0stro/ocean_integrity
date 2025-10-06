/**
 * Normalization utilities for invoice-eway bill matching
 * Ported from Python dashboard_backend.py
 */

// ========================================
// COMPANY NAME NORMALIZATION
// ========================================

const COMMON_SUFFIXES = [
  'PRIVATE LIMITED',
  'PVT LTD',
  'PVT. LTD.',
  'LTD',
  'LIMITED',
  'LLP',
  'DIVISION',
  'CHEMICAL DIVISION',
  'CHEM DIVISION',
  'ENTERPRISES',
  'INDUSTRIES',
  'TRADERS',
  'TRADRES',
  'TRADER',
];

/**
 * Normalize company name for matching
 * - Removes common suffixes
 * - Removes M.S., MS prefixes
 * - Converts to uppercase
 * - Removes special characters
 */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';

  let normalized = String(name).toUpperCase();

  // Remove special characters, keep only alphanumeric and spaces
  normalized = normalized.replace(/[^A-Z0-9\s]/g, ' ');

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Remove M.S. / MS prefix
  if (normalized.startsWith('M S ')) {
    normalized = normalized.replace('M S ', '');
  }
  if (normalized.startsWith('MS ')) {
    normalized = normalized.replace('MS ', '');
  }

  // Remove common suffixes
  for (const suffix of COMMON_SUFFIXES) {
    if (normalized.endsWith(' ' + suffix)) {
      normalized = normalized.slice(0, -suffix.length).trim();
    }
  }

  return normalized;
}

/**
 * Fuzzy match two company names using normalized comparison
 * Uses Levenshtein distance ratio (similar to Python's SequenceMatcher)
 */
export function companyFuzzyMatch(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold: number = 0.9
): boolean {
  if (!a || !b) return false;

  const aNorm = normalizeCompanyName(a);
  const bNorm = normalizeCompanyName(b);

  if (aNorm === bNorm) return true;

  const ratio = levenshteinRatio(aNorm, bNorm);
  return ratio >= threshold;
}

// ========================================
// VEHICLE NUMBER NORMALIZATION
// ========================================

/**
 * Clean vehicle token - fix OCR errors
 * O→0, I→1, L→1, S→5 (common OCR mistakes)
 */
function cleanVehicleToken(s: string): string {
  if (!s) return '';

  let cleaned = s.toUpperCase();
  cleaned = cleaned.replace(/O/g, '0'); // O → 0
  cleaned = cleaned.replace(/I/g, '1'); // I → 1
  cleaned = cleaned.replace(/L/g, '1'); // L → 1
  cleaned = cleaned.replace(/S/g, '5'); // S → 5 (optional, some Indian plates use real S)

  // Remove dashes, spaces
  cleaned = cleaned.replace(/[^A-Z0-9]/g, '');

  return cleaned;
}

/**
 * Normalize vehicle number
 * - Extracts clean vehicle plate
 * - Removes dispatch numbers (e.g., "& 8261")
 * - Handles comma/ampersand-separated lists (takes first valid plate)
 */
export function normalizeVehicleNumber(
  vehicle: string | null | undefined
): string {
  if (!vehicle) return '';

  const tokens = String(vehicle).split(/[,&\/]/);
  const plates: string[] = [];

  for (let token of tokens) {
    token = token.trim();
    if (!token) continue;

    // Skip dispatch-only numbers (no letters)
    if (!/[a-zA-Z]/.test(token)) continue;

    // Skip if no digits
    if (!/\d/.test(token)) continue;

    // Clean and store
    const cleaned = cleanVehicleToken(onlyAlnumUpper(token));
    if (cleaned) {
      plates.push(cleaned);
    }
  }

  // Return first valid plate
  return plates.length > 0 ? plates[0] : '';
}

/**
 * Fuzzy match two vehicle numbers
 * Applies normalization then compares with 85% threshold
 */
export function vehicleFuzzyMatch(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold: number = 0.85
): boolean {
  const aNorm = normalizeVehicleNumber(a);
  const bNorm = normalizeVehicleNumber(b);

  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;

  const ratio = levenshteinRatio(aNorm, bNorm);
  return ratio >= threshold;
}

// ========================================
// INVOICE NUMBER NORMALIZATION
// ========================================

/**
 * Normalize invoice number for invoices
 * Takes last segment after "/" if present
 */
export function normalizeInvoiceNumberInv(
  invoice: string | null | undefined
): string {
  if (!invoice) return '';

  const str = String(invoice).trim();

  // If contains "/", take last segment with digits
  if (str.includes('/')) {
    const segments = str.split('/').reverse();
    for (const segment of segments) {
      if (/\d/.test(segment)) {
        // Return only digits from this segment
        return segment.replace(/\D/g, '');
      }
    }
  }

  return onlyAlnumUpper(str);
}

/**
 * Normalize invoice number for eway bills
 * Takes first segment after "/" if present
 */
export function normalizeInvoiceNumberEway(
  invoice: string | null | undefined
): string {
  if (!invoice) return '';

  const str = String(invoice).trim();

  // If contains "/", take first segment with digits
  if (str.includes('/')) {
    const segments = str.split('/');
    for (const segment of segments) {
      if (/\d/.test(segment)) {
        // Return only digits from this segment
        return segment.replace(/\D/g, '');
      }
    }
  }

  return onlyAlnumUpper(str);
}

/**
 * Normalize eway bill number
 */
export function normalizeEwayBillNo(ewayNo: string | null | undefined): string {
  return onlyAlnumUpper(ewayNo);
}

// ========================================
// DATE NORMALIZATION
// ========================================

/**
 * Normalize date to DDMMYYYY format
 * Handles multiple input formats
 */
export function normalizeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const str = String(dateStr).trim();

  // Try parsing with Date constructor (handles many formats)
  const parsedDayFirst = parseDate(str, true); // Day-first (DD-MM-YYYY)
  if (parsedDayFirst) {
    return formatDateDDMMYYYY(parsedDayFirst);
  }

  const parsedMonthFirst = parseDate(str, false); // Month-first (MM-DD-YYYY)
  if (parsedMonthFirst) {
    return formatDateDDMMYYYY(parsedMonthFirst);
  }

  // Fallback: extract 8 digits and try to parse
  const digits = str.replace(/\D/g, '');
  if (digits.length === 8) {
    try {
      // Try YYYYMMDD format
      if (digits.startsWith('19') || digits.startsWith('20')) {
        const year = parseInt(digits.slice(0, 4));
        const month = parseInt(digits.slice(4, 6));
        const day = parseInt(digits.slice(6, 8));
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return formatDateDDMMYYYY(date);
        }
      } else {
        // Try DDMMYYYY format
        const day = parseInt(digits.slice(0, 2));
        const month = parseInt(digits.slice(2, 4));
        const year = parseInt(digits.slice(4, 8));
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return formatDateDDMMYYYY(date);
        }
      }
    } catch {
      return '';
    }
  }

  return '';
}

function parseDate(str: string, dayFirst: boolean): Date | null {
  // Try common separators: -, /, space
  const patterns = [
    /(\d{1,2})[-\/\s](\d{1,2})[-\/\s](\d{4})/,
    /(\d{4})[-\/\s](\d{1,2})[-\/\s](\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) {
      const [, p1, p2, p3] = match;
      let year: number, month: number, day: number;

      // Determine format based on position of 4-digit year
      if (p3.length === 4) {
        // Format: DD-MM-YYYY or MM-DD-YYYY
        year = parseInt(p3);
        if (dayFirst) {
          day = parseInt(p1);
          month = parseInt(p2);
        } else {
          month = parseInt(p1);
          day = parseInt(p2);
        }
      } else if (p1.length === 4) {
        // Format: YYYY-MM-DD
        year = parseInt(p1);
        month = parseInt(p2);
        day = parseInt(p3);
      } else {
        continue;
      }

      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime()) && date.getFullYear() === year) {
        return date;
      }
    }
  }

  return null;
}

function formatDateDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}${month}${year}`;
}

// ========================================
// PLASTIC TYPE NORMALIZATION
// ========================================

/**
 * Normalize plastic type to standard categories
 */
export function normalizePlasticType(
  plasticType: string | null | undefined
): string {
  if (!plasticType) return '';

  const normalized = String(plasticType).trim().toUpperCase();

  if (normalized.includes('PET')) return 'PET';
  if (normalized.includes('HDPE')) return 'HDPE';
  if (normalized.includes('LDPE')) return 'LDPE';
  if (normalized.includes('PP') || normalized.includes('POLYPROPYLENE'))
    return 'PP';

  return 'OTHER';
}

// ========================================
// WEIGHT NORMALIZATION
// ========================================

/**
 * Smart weight normalization to KG using decimal rule
 * Logic from Python:
 * - If decimal exists and 55-550: (value/10)*1000
 * - If > 550: return as-is (already KG)
 * - If < 55 with decimal: value*1000 (tons to KG)
 * - If no decimal: return as-is
 */
export function normalizeWeightDecimalRule(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') return null;

  // Convert to number
  const strValue = String(value).replace(/,/g, '').trim();
  const numValue = parseFloat(strValue);

  if (isNaN(numValue)) return null;

  // Check if original had decimal
  const hasDecimal = String(value).includes('.');

  if (hasDecimal) {
    if (numValue >= 55.0 && numValue <= 550.0) {
      // Case: 55.5 → 5550 kg (divide by 10, multiply by 1000)
      return (numValue / 10.0) * 1000.0;
    }
    if (numValue > 550.0) {
      // Case: 5500.0 → 5500 kg (already in KG)
      return numValue;
    }
    // Case: 5.5 → 5500 kg (tons to KG)
    return numValue * 1000.0;
  }

  // No decimal: return as-is
  return numValue;
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Strip to alphanumeric uppercase
 */
function onlyAlnumUpper(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Calculate Levenshtein distance ratio (similar to Python's SequenceMatcher)
 * Returns 0-1 similarity ratio
 */
function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(a, b);
  return (maxLen - distance) / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
