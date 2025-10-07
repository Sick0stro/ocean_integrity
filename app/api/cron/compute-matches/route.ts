// Matching Service - Proxy to Python FastAPI service
// The Python service contains the exact matching logic from dashboard_backend.py
// This ensures 100% consistency with the original algorithm

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

// Python API configuration
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// Python API response types
interface PythonMatchedRecord {
  user_id: string;
  user_name?: string;
  invoice_file_url?: string;
  ewaybill_file_url?: string;
  invoice_weight_mt?: number;
  bill_from_company_name?: string;
  ship_to_company_name?: string;
  bill_to_address?: string;
  plastic_type?: string;
  ship_to_country_code?: string;
  city?: string;
  vehicle_number?: string;
  invoice?: string;
  invoice_date?: string;
  generated_date?: string;
  flagged: string; // 'yes' or 'no'
  flag_reason?: string;
  flagged_pair_value?: string;
  in_compliance: string; // 'yes' or 'no'
  created_at?: string;
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();

  console.log(
    `🚀 [matching:${requestId}] ====================================`
  );
  console.log(`🚀 [matching:${requestId}] MATCHING SERVICE (Python Proxy)`);
  console.log(
    `🚀 [matching:${requestId}] ====================================`
  );

  try {
    // Parse request body
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    console.log(`🔐 [matching:${requestId}] User: ${user_id}`);

    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    // Call Python API
    console.log(`🐍 [matching:${requestId}] Calling Python API...`);

    const pythonResponse = await fetch(
      `${PYTHON_API_URL}/api/compute-matches`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id,
          supabase_url: supabaseUrl,
          supabase_key: supabaseKey,
        }),
      }
    );

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      console.error(
        `❌ [matching:${requestId}] Python API error (${pythonResponse.status}):`,
        errorText
      );
      console.error(
        `❌ [matching:${requestId}] Python API URL: ${PYTHON_API_URL}/api/compute-matches`
      );
      return NextResponse.json(
        {
          error: 'Matching service failed',
          details: errorText,
          python_api_status: pythonResponse.status,
          python_api_url: PYTHON_API_URL,
        },
        { status: 500 }
      );
    }

    const matchingResult = await pythonResponse.json();

    console.log(`✅ [matching:${requestId}] Python API response:`, {
      matched_count: matchingResult.matched_count,
      compliant_count: matchingResult.compliant_count,
      flagged_count: matchingResult.flagged_count,
    });

    // Save matched records to Supabase
    if (matchingResult.records && matchingResult.records.length > 0) {
      console.log(
        `💾 [matching:${requestId}] Saving ${matchingResult.records.length} matches to Supabase...`
      );

      const supabase = getSupabaseAdmin();

      // Delete existing matches for this user
      const { error: deleteError } = await supabase
        .from('matched_records')
        .delete()
        .eq('user_id', user_id);

      if (deleteError) {
        console.error(
          `⚠️ [matching:${requestId}] Error deleting old matches:`,
          deleteError
        );
      }

      // 🔍 LOOKUP: Get document IDs from file URLs
      console.log(
        `🔍 [matching:${requestId}] Looking up document IDs from file URLs...`
      );

      const fileUrls = new Set<string>();
      matchingResult.records.forEach((record: PythonMatchedRecord) => {
        if (record.invoice_file_url) fileUrls.add(record.invoice_file_url);
        if (record.ewaybill_file_url) fileUrls.add(record.ewaybill_file_url);
      });

      const { data: documents, error: lookupError } = await supabase
        .from('parsed_documents')
        .select('id, file_url')
        .in('file_url', Array.from(fileUrls));

      if (lookupError) {
        console.error(
          `❌ [matching:${requestId}] Error looking up document IDs:`,
          lookupError
        );
        throw new Error(
          `Failed to lookup document IDs: ${lookupError.message}`
        );
      }

      // Create a map of file_url -> id
      const fileUrlToId = new Map<string, string>();
      documents?.forEach((doc) => {
        fileUrlToId.set(doc.file_url, doc.id);
      });

      console.log(
        `✅ [matching:${requestId}] Found ${fileUrlToId.size} document IDs`
      );

      // 🔄 TRANSFORM: Map Python API response to Supabase schema
      const transformedRecords = matchingResult.records
        .map((record: PythonMatchedRecord) => {
          const invoice_id = record.invoice_file_url
            ? fileUrlToId.get(record.invoice_file_url)
            : undefined;
          const eway_id = record.ewaybill_file_url
            ? fileUrlToId.get(record.ewaybill_file_url)
            : undefined;

          if (!invoice_id || !eway_id) {
            console.warn(
              `⚠️ [matching:${requestId}] Skipping record - missing IDs:`,
              {
                invoice_file_url: record.invoice_file_url,
                eway_file_url: record.ewaybill_file_url,
                invoice_id,
                eway_id,
              }
            );
            return null;
          }

          // ✅ AUTO-VERIFICATION: Records without flags are auto-verified
          const hasFlags =
            record.flag_reason && record.flag_reason.trim() !== '';

          return {
            user_id: record.user_id,
            invoice_id, // ✅ Looked up from parsed_documents
            eway_id, // ✅ Looked up from parsed_documents
            invoice_number: record.invoice || '',
            invoice_date: record.invoice_date,
            generated_date: record.generated_date,
            invoice_weight_kg: record.invoice_weight_mt
              ? record.invoice_weight_mt * 1000
              : null,
            eway_weight_kg: null, // Will be computed from eway data
            invoice_vehicle: record.vehicle_number,
            eway_vehicle: record.vehicle_number,
            bill_from_company: record.bill_from_company_name, // ✅ Remove _name suffix
            ship_from_company: null, // Will be extracted from eway data
            ship_to_company: record.ship_to_company_name, // ✅ Remove _name suffix
            plastic_type: record.plastic_type,
            country: record.ship_to_country_code,
            city: record.city || null, // ✅ City from Gemini API
            invoice_file_url: record.invoice_file_url,
            eway_file_url: record.ewaybill_file_url,
            flagged: record.flagged === 'yes',
            flag_reasons: record.flag_reason ? [record.flag_reason] : [],
            flagged_details: record.flagged_pair_value
              ? { details: record.flagged_pair_value }
              : null,
            in_compliance: record.in_compliance === 'yes',
            human_verified: !hasFlags, // ✅ Auto-verify compliant records
            verified_at: !hasFlags ? new Date().toISOString() : null,
            created_at: record.created_at,
          };
        })
        .filter(Boolean); // Remove null entries

      console.log(
        `🔄 [matching:${requestId}] Transformed ${transformedRecords.length} records for database`
      );

      // Insert new matches
      const { error: insertError } = await supabase
        .from('matched_records')
        .insert(transformedRecords);

      if (insertError) {
        console.error(
          `❌ [matching:${requestId}] Error inserting matches:`,
          insertError
        );
        throw new Error(`Failed to save matches: ${insertError.message}`);
      }

      console.log(
        `✅ [matching:${requestId}] Saved matches to matched_records table`
      );
    } else {
      console.log(
        `ℹ️ [matching:${requestId}] No matches found, nothing to save`
      );
    }

    const duration = Date.now() - startTime;

    console.log(
      `✅ [matching:${requestId}] ====================================`
    );
    console.log(`✅ [matching:${requestId}] MATCHING COMPLETE`);
    console.log(`✅ [matching:${requestId}] Duration: ${duration}ms`);
    console.log(
      `✅ [matching:${requestId}] Matches: ${matchingResult.matched_count}`
    );
    console.log(
      `✅ [matching:${requestId}] Compliant: ${matchingResult.compliant_count}`
    );
    console.log(
      `✅ [matching:${requestId}] Flagged: ${matchingResult.flagged_count}`
    );
    console.log(
      `✅ [matching:${requestId}] ====================================`
    );

    return NextResponse.json({
      success: true,
      user_id,
      matched_count: matchingResult.matched_count,
      compliant_count: matchingResult.compliant_count,
      flagged_count: matchingResult.flagged_count,
      duration_ms: duration,
      source: 'python_api',
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [matching:${requestId}] Error:`, error);
    console.error(
      `❌ [matching:${requestId}] Duration before error: ${duration}ms`
    );

    // Check if it's a network/connection error
    const isConnectionError =
      error instanceof TypeError &&
      (error.message.includes('fetch') || error.message.includes('network'));

    if (isConnectionError) {
      console.error(
        `❌ [matching:${requestId}] Python API unreachable at: ${PYTHON_API_URL}`
      );
      return NextResponse.json(
        {
          error: 'Matching service unreachable',
          details: 'Python API is not running or cannot be reached',
          python_api_url: PYTHON_API_URL,
          suggestion: 'Ensure Python API is started: python python_api/main.py',
          duration_ms: duration,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration,
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  try {
    // Check if Python API is running
    const response = await fetch(`${PYTHON_API_URL}/health`, {
      method: 'GET',
    });

    if (response.ok) {
      return NextResponse.json({
        status: 'healthy',
        python_api: 'connected',
        python_api_url: PYTHON_API_URL,
      });
    } else {
      return NextResponse.json(
        {
          status: 'unhealthy',
          python_api: 'disconnected',
          python_api_url: PYTHON_API_URL,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        python_api: 'error',
        python_api_url: PYTHON_API_URL,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
