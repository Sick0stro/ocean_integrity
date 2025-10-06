// CSV Export API for Dashboard
// Exports compliant or flagged matched records as CSV

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

export async function GET(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const type = searchParams.get('type'); // 'compliant' or 'flagged'

  console.log(
    `📥 [export-csv:${requestId}] Request received: type=${type}, user=${userId}`
  );

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing user_id parameter' },
      { status: 400 }
    );
  }

  if (!type || !['compliant', 'flagged'].includes(type)) {
    return NextResponse.json(
      { error: 'Invalid type parameter. Must be "compliant" or "flagged"' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // ========== FETCH MATCHED RECORDS ==========
    const { data: matchedRecords, error: fetchError } = await supabase
      .from('matched_records')
      .select('*')
      .eq('user_id', userId)
      .eq(type === 'compliant' ? 'in_compliance' : 'flagged', true)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error(
        `❌ [export-csv:${requestId}] Error fetching records:`,
        fetchError
      );
      return NextResponse.json(
        { error: 'Failed to fetch records', details: fetchError.message },
        { status: 500 }
      );
    }

    const records = matchedRecords || [];
    console.log(
      `📊 [export-csv:${requestId}] Found ${records.length} ${type} records`
    );

    // ========== GENERATE CSV ==========
    const csv = generateCSV(records, type);

    const filename = `${type}_records_${
      new Date().toISOString().split('T')[0]
    }.csv`;

    console.log(
      `✅ [export-csv:${requestId}] CSV generated: ${filename} (${csv.length} bytes)`
    );

    // ========== RETURN CSV ==========
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error(`💥 [export-csv:${requestId}] Error:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ========== CSV GENERATION ==========

function generateCSV(
  records: Array<Record<string, unknown>>,
  type: string
): string {
  if (records.length === 0) {
    return 'No records found\n';
  }

  // Define columns based on type
  const baseColumns = [
    'user_id',
    'invoice_file_url',
    'eway_file_url',
    'invoice_weight_mt',
    'bill_from_company',
    'ship_to_company',
    'plastic_type',
    'country',
    'vehicle_number',
    'generated_date',
    'created_at',
  ];

  const flaggedColumns = ['flag_reasons', 'flagged_pair_value'];

  const columns =
    type === 'flagged' ? [...baseColumns, ...flaggedColumns] : baseColumns;

  // Generate header row
  const header = columns.join(',');

  // Generate data rows
  const rows = records.map((record) => {
    const values = columns.map((col) => {
      let value = '';

      // Special handling for computed/nested fields
      if (col === 'invoice_weight_mt') {
        const weightKG = record.invoice_weight_kg as number | null;
        value = weightKG ? String(Math.round(weightKG / 1000)) : '0';
      } else if (col === 'vehicle_number') {
        value = (record.eway_vehicle as string) || '';
      } else if (col === 'flag_reasons') {
        const reasons = record.flag_reasons as string[] | null;
        value = reasons ? reasons.join('; ') : '';
      } else if (col === 'flagged_pair_value') {
        // Extract flagged details as readable text
        const details = record.flagged_details as Record<string, string> | null;
        if (details) {
          value = Object.entries(details)
            .map(([key, val]) => `${key}: ${val}`)
            .join('; ');
        }
      } else {
        value = String(record[col] || '');
      }

      // Escape CSV value (handle commas, quotes, newlines)
      return escapeCSVValue(value);
    });

    return values.join(',');
  });

  // Combine header and rows
  return [header, ...rows].join('\n') + '\n';
}

function escapeCSVValue(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
