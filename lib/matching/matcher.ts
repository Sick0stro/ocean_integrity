/**
 * Core matching algorithm for invoice-eway bill pairing
 * Ported from Python dashboard_backend.py recompute_matches()
 */

import {
  normalizeInvoiceNumberInv,
  normalizeInvoiceNumberEway,
  normalizeDate,
  normalizeVehicleNumber,
  normalizeCompanyName,
  vehicleFuzzyMatch,
  companyFuzzyMatch,
  normalizePlasticType,
} from './normalization';

// ========================================
// TYPES
// ========================================

export interface ParsedDoc {
  id: string;
  user_id: string;
  document_type: 'invoice' | 'e-way-bill' | 'eft_receipt';
  raw_json: Record<string, unknown>;
  file_url: string | null;
  created_at: string;
  weight_kg_normalized?: number | null;
}

export interface InvoiceDoc extends ParsedDoc {
  document_type: 'invoice';
  invoice_norm: string;
  date_norm: string;
  vehicle_norm: string;
  company_norm: string;
}

export interface EwayDoc extends ParsedDoc {
  document_type: 'e-way-bill';
  invoice_norm: string;
  date_norm: string;
  vehicle_norm: string;
  company_norm: string;
  eway_norm: string;
}

export interface MatchedPair {
  invoice: InvoiceDoc;
  eway: EwayDoc;
  eft?: ParsedDoc | null;

  // Matching metadata
  weight_difference: number | null;
  vehicle_match: boolean;
  company_match: boolean;
  weight_match: boolean;

  // Flagging
  flagged: boolean;
  flag_reasons: string[];
  flagged_details: Record<string, string>;
  in_compliance: boolean;

  // Aggregated fields
  plastic_type: string;
  ship_to_company: string;
  ship_to_country_code: string;
  city: string;
}

// ========================================
// MAIN MATCHING FUNCTION
// ========================================

/**
 * Match invoices with eway bills for a single user
 * Returns array of matched pairs with compliance/flagging info
 */
export function matchInvoicesWithEways(
  invoices: ParsedDoc[],
  eways: ParsedDoc[],
  userId: string
): MatchedPair[] {
  const results: MatchedPair[] = [];
  const usedInvoiceIds = new Set<string>();

  // Normalize invoices
  const invoicesNorm: InvoiceDoc[] = invoices.map((inv) => ({
    ...inv,
    document_type: 'invoice' as const,
    invoice_norm: normalizeInvoiceNumberInv(
      inv.raw_json.invoice as string | undefined
    ),
    date_norm: normalizeDate(inv.raw_json.invoice_date as string | undefined),
    vehicle_norm: normalizeVehicleNumber(
      inv.raw_json.vehicle_number as string | undefined
    ),
    company_norm: normalizeCompanyName(
      inv.raw_json.bill_from_company_name as string | undefined
    ),
  }));

  // Normalize eways
  const ewaysNorm: EwayDoc[] = eways.map((eway) => ({
    ...eway,
    document_type: 'e-way-bill' as const,
    invoice_norm: normalizeInvoiceNumberEway(
      eway.raw_json.invoice as string | undefined
    ),
    date_norm: normalizeDate(
      eway.raw_json.generated_date as string | undefined
    ),
    vehicle_norm: normalizeVehicleNumber(
      eway.raw_json.vehicle_number as string | undefined
    ),
    company_norm: normalizeCompanyName(
      eway.raw_json.ship_from_company_name as string | undefined
    ),
    eway_norm: (eway.raw_json.eway_bill_no as string | undefined) || '',
  }));

  // Build invoice index by (user_id, invoice_norm, date_norm)
  const invoiceIndex = buildInvoiceIndex(invoicesNorm, userId);

  console.log(
    `🔍 Built invoice index with ${
      Object.keys(invoiceIndex).length
    } unique keys for ${invoicesNorm.length} invoices`
  );

  // For each eway, find matching invoice
  for (const eway of ewaysNorm) {
    const key = `${userId}:${eway.invoice_norm}:${eway.date_norm}`;
    const candidates = invoiceIndex[key] || [];

    if (candidates.length === 0) {
      console.log(
        `⚠️ No invoice candidates found for eway ${eway.id} (invoice: ${eway.invoice_norm}, date: ${eway.date_norm})`
      );
      continue;
    }

    // Filter candidates by vehicle OR company match
    const filtered = filterByVehicleOrCompany(eway, candidates);

    const pool = filtered.length > 0 ? filtered : candidates;

    // Find best match by scoring
    const bestMatch = findBestMatch(eway, pool, usedInvoiceIds);

    if (!bestMatch) {
      console.log(`⚠️ No valid match found for eway ${eway.id}`);
      continue;
    }

    // Create matched pair with flags
    const matchedPair = createMatchedPair(eway, bestMatch, usedInvoiceIds);
    results.push(matchedPair);
  }

  console.log(
    `✅ Matched ${results.length} invoice-eway pairs (${
      results.filter((p) => p.in_compliance).length
    } compliant, ${results.filter((p) => p.flagged).length} flagged)`
  );

  return results;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Build index: (user_id, invoice_norm, date_norm) -> [invoices]
 */
function buildInvoiceIndex(
  invoices: InvoiceDoc[],
  userId: string
): Record<string, InvoiceDoc[]> {
  const index: Record<string, InvoiceDoc[]> = {};

  for (const inv of invoices) {
    const key = `${userId}:${inv.invoice_norm}:${inv.date_norm}`;
    if (!index[key]) {
      index[key] = [];
    }
    index[key].push(inv);
  }

  return index;
}

/**
 * Filter candidates by vehicle OR company fuzzy match
 */
function filterByVehicleOrCompany(
  eway: EwayDoc,
  candidates: InvoiceDoc[]
): InvoiceDoc[] {
  const filtered: InvoiceDoc[] = [];

  for (const inv of candidates) {
    let matched = false;

    // Try vehicle match if both have vehicle numbers
    if (eway.vehicle_norm && inv.vehicle_norm) {
      const vehMatch = vehicleFuzzyMatch(
        eway.raw_json.vehicle_number as string | undefined,
        inv.raw_json.vehicle_number as string | undefined
      );
      if (vehMatch) {
        matched = true;
      }
    } else {
      // Fallback to company match
      const companyMatch = companyFuzzyMatch(
        eway.raw_json.ship_from_company_name as string | undefined,
        inv.raw_json.bill_from_company_name as string | undefined
      );
      if (companyMatch) {
        matched = true;
      }
    }

    if (matched) {
      filtered.push(inv);
    }
  }

  return filtered;
}

/**
 * Find best match from pool using scoring
 * Score tuple: (vehicle_match, weight_match, weight_diff)
 */
function findBestMatch(
  eway: EwayDoc,
  pool: InvoiceDoc[],
  usedInvoiceIds: Set<string>
): InvoiceDoc | null {
  let best: InvoiceDoc | null = null;
  let bestScore: [number, number, number] | null = null;

  for (const inv of pool) {
    // Skip already used invoices
    if (usedInvoiceIds.has(inv.id)) continue;

    // Calculate weight difference
    const weightDiff = calculateWeightDiff(
      eway.weight_kg_normalized,
      inv.weight_kg_normalized
    );

    // Weight match: true if both null OR diff == 0
    const withinTol =
      eway.weight_kg_normalized == null || inv.weight_kg_normalized == null
        ? true
        : weightDiff === 0;

    // Vehicle/company match (if in filtered set, this is 1, else 0)
    const vehCompanyMatched = doesVehicleOrCompanyMatch(eway, inv);

    // Score tuple (lower is better)
    const scoreTuple: [number, number, number] = [
      vehCompanyMatched ? 0 : 1,
      withinTol ? 0 : 1,
      weightDiff !== null ? weightDiff : 1e9,
    ];

    // Compare scores
    if (best === null || compareScores(scoreTuple, bestScore!) < 0) {
      best = inv;
      bestScore = scoreTuple;
    }
  }

  return best;
}

/**
 * Calculate weight difference (absolute value)
 */
function calculateWeightDiff(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

/**
 * Check if vehicle OR company matches
 */
function doesVehicleOrCompanyMatch(eway: EwayDoc, inv: InvoiceDoc): boolean {
  // Try vehicle first
  if (eway.vehicle_norm && inv.vehicle_norm) {
    return vehicleFuzzyMatch(
      eway.raw_json.vehicle_number as string | undefined,
      inv.raw_json.vehicle_number as string | undefined
    );
  }

  // Fallback to company
  return companyFuzzyMatch(
    eway.raw_json.ship_from_company_name as string | undefined,
    inv.raw_json.bill_from_company_name as string | undefined
  );
}

/**
 * Compare two score tuples (returns -1 if a < b, 0 if equal, 1 if a > b)
 */
function compareScores(
  a: [number, number, number],
  b: [number, number, number]
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/**
 * Create matched pair with flagging logic
 */
function createMatchedPair(
  eway: EwayDoc,
  invoice: InvoiceDoc,
  usedInvoiceIds: Set<string>
): MatchedPair {
  const flags: string[] = [];
  const flaggedDetails: Record<string, string> = {};

  // Vehicle mismatch check
  const vehicleMatch = vehicleFuzzyMatch(
    eway.raw_json.vehicle_number as string | undefined,
    invoice.raw_json.vehicle_number as string | undefined
  );
  if (!vehicleMatch) {
    flags.push('vehicle_mismatch');
    flaggedDetails.vehicle = `${eway.raw_json.vehicle_number || 'N/A'} vs ${
      invoice.raw_json.vehicle_number || 'N/A'
    }`;
  }

  // Company mismatch check
  const companyMatch = companyFuzzyMatch(
    eway.raw_json.ship_from_company_name as string | undefined,
    invoice.raw_json.bill_from_company_name as string | undefined
  );
  if (!companyMatch) {
    flags.push('company_from_mismatch');
    if (!flaggedDetails.company) {
      flaggedDetails.company = `${
        eway.raw_json.ship_from_company_name || 'N/A'
      } vs ${invoice.raw_json.bill_from_company_name || 'N/A'}`;
    }
  }

  // Weight mismatch check
  const weightDiff = calculateWeightDiff(
    eway.weight_kg_normalized,
    invoice.weight_kg_normalized
  );

  let inCompliance = true;
  let weightMatch = true;

  if (
    eway.weight_kg_normalized != null &&
    invoice.weight_kg_normalized != null
  ) {
    if (weightDiff !== 0) {
      flags.push('weight_mismatch');
      flaggedDetails.weight = `${eway.weight_kg_normalized} kg vs ${invoice.weight_kg_normalized} kg (diff: ${weightDiff} kg)`;
      inCompliance = false;
      weightMatch = false;
    }
  }

  // Mark invoice as used only if compliant (weight matches)
  if (inCompliance) {
    usedInvoiceIds.add(invoice.id);
  }

  // Aggregate fields
  const plasticInvoice = normalizePlasticType(
    invoice.raw_json.plastic_type as string | undefined
  );
  const plasticEway = normalizePlasticType(
    eway.raw_json.plastic_type as string | undefined
  );
  const plasticType = plasticInvoice || plasticEway || '';

  return {
    invoice,
    eway,
    eft: null, // Will be linked separately if needed

    weight_difference: weightDiff,
    vehicle_match: vehicleMatch,
    company_match: companyMatch,
    weight_match: weightMatch,

    flagged: flags.length > 0,
    flag_reasons: flags,
    flagged_details: flaggedDetails,
    in_compliance: inCompliance,

    plastic_type: plasticType,
    ship_to_company:
      (eway.raw_json.ship_to_company_name as string | undefined) || '',
    ship_to_country_code: (
      (eway.raw_json.ship_to_country_code as string | undefined) || ''
    ).toUpperCase(),
    city: (eway.raw_json.city as string | undefined) || '',
  };
}
