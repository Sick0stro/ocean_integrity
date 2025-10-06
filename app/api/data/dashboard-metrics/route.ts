// Dashboard Metrics API
// Provides aggregated data for analytics dashboard
// Returns KPIs, tables, and chart data

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

export async function GET(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');

  console.log(
    `📊 [dashboard-metrics:${requestId}] Request received for user: ${userId}`
  );

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing user_id parameter' },
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
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error(
        `❌ [dashboard-metrics:${requestId}] Error fetching records:`,
        fetchError
      );
      return NextResponse.json(
        {
          error: 'Failed to fetch matched records',
          details: fetchError.message,
        },
        { status: 500 }
      );
    }

    const records = matchedRecords || [];
    console.log(
      `📊 [dashboard-metrics:${requestId}] Found ${records.length} matched records`
    );

    // ========== COMPUTE KPIs ==========
    const totalRecords = records.length;
    const totalWeightKG = records.reduce(
      (sum, r) => sum + (r.invoice_weight_kg || 0),
      0
    );
    const totalWeightMT = Math.round(totalWeightKG / 1000);
    // ✅ Compliant = verified records (auto or manual)
    const compliantRecords = records.filter(
      (r) => r.human_verified === true
    ).length;
    // ✅ Flagged = has flags AND not verified yet
    const flaggedRecords = records.filter(
      (r) => r.flagged === true && r.human_verified === false
    ).length;
    const percentageFlagged =
      totalRecords > 0
        ? ((flaggedRecords / totalRecords) * 100).toFixed(1)
        : '0.0';

    // Get unique users count
    const uniqueUsers = new Set(records.map((r) => r.user_id)).size;

    // Get date range
    const dates = records
      .map((r) => r.generated_date || r.created_at)
      .filter(Boolean)
      .map((d) => new Date(d as string));

    const dateRange =
      dates.length > 0
        ? {
            start: new Date(Math.min(...dates.map((d) => d.getTime())))
              .toISOString()
              .split('T')[0],
            end: new Date(Math.max(...dates.map((d) => d.getTime())))
              .toISOString()
              .split('T')[0],
          }
        : { start: '', end: '' };

    const kpis = {
      totalRecords,
      totalWeightMT,
      compliantRecords,
      flaggedRecords,
      percentageFlagged: parseFloat(percentageFlagged),
      activeUsers: uniqueUsers,
      dateRange,
    };

    // ========== COMPLIANCE RECORDS ==========
    // ✅ Show verified records (both auto-verified + manually-verified)
    const compliantRecordsData = records
      .filter((r) => r.human_verified === true)
      .map((r) => ({
        user_id: r.user_id,
        invoice_file_url: r.invoice_file_url,
        eway_file_url: r.eway_file_url,
        invoice_weight_mt: r.invoice_weight_kg
          ? Math.round(r.invoice_weight_kg / 1000)
          : 0,
        bill_from_company: r.bill_from_company,
        ship_to_company: r.ship_to_company,
        plastic_type: r.plastic_type,
        country: r.country,
        vehicle_number: r.eway_vehicle,
        generated_date: r.generated_date,
        created_at: r.created_at,
      }));

    // ========== FLAGGED RECORDS ==========
    // ✅ Show flagged records that need verification (not yet verified)
    const flaggedRecordsData = records
      .filter((r) => r.flagged === true && r.human_verified === false)
      .map((r) => ({
        id: r.id, // ✅ Include ID for verification
        user_id: r.user_id,
        invoice_file_url: r.invoice_file_url,
        eway_file_url: r.eway_file_url,
        invoice_weight_mt: r.invoice_weight_kg
          ? Math.round(r.invoice_weight_kg / 1000)
          : 0,
        bill_from_company: r.bill_from_company,
        ship_to_company: r.ship_to_company,
        plastic_type: r.plastic_type,
        country: r.country,
        vehicle_number: r.eway_vehicle,
        generated_date: r.generated_date,
        flag_reasons: r.flag_reasons,
        flagged_details: r.flagged_details,
        created_at: r.created_at,
      }));

    // ========== PLASTIC TYPE DISTRIBUTION ==========
    const plasticTypeMap = new Map<string, number>();
    records.forEach((r) => {
      const type = r.plastic_type || 'UNKNOWN';
      const weightMT = r.invoice_weight_kg ? r.invoice_weight_kg / 1000 : 0;
      plasticTypeMap.set(type, (plasticTypeMap.get(type) || 0) + weightMT);
    });

    const plasticTypeDistribution = Array.from(plasticTypeMap.entries())
      .map(([plastic_type, total_mt]) => ({
        plastic_type,
        total_mt: Math.round(total_mt),
      }))
      .sort((a, b) => b.total_mt - a.total_mt);

    // ========== TOP RECYCLERS (LEADERSHIP) ==========
    // Aggregate by company (both bill_from and ship_to)
    const companyStatsMap = new Map<
      string,
      { total_mt: number; flagged_count: number; compliant_count: number }
    >();

    records.forEach((r) => {
      const weightMT = r.invoice_weight_kg ? r.invoice_weight_kg / 1000 : 0;
      const isFlagged = r.flagged ? 1 : 0;
      const isCompliant = r.in_compliance ? 1 : 0;

      // Add to bill_from_company stats
      if (r.bill_from_company) {
        const stats = companyStatsMap.get(r.bill_from_company) || {
          total_mt: 0,
          flagged_count: 0,
          compliant_count: 0,
        };
        stats.total_mt += weightMT;
        stats.flagged_count += isFlagged;
        stats.compliant_count += isCompliant;
        companyStatsMap.set(r.bill_from_company, stats);
      }

      // Add to ship_to_company stats
      if (r.ship_to_company) {
        const stats = companyStatsMap.get(r.ship_to_company) || {
          total_mt: 0,
          flagged_count: 0,
          compliant_count: 0,
        };
        stats.total_mt += weightMT;
        stats.flagged_count += isFlagged;
        stats.compliant_count += isCompliant;
        companyStatsMap.set(r.ship_to_company, stats);
      }
    });

    const topRecyclers = Array.from(companyStatsMap.entries())
      .map(([company, stats]) => ({
        company,
        total_mt: Math.round(stats.total_mt),
        flagged_count: stats.flagged_count,
        compliant_pct: (
          (stats.compliant_count /
            (stats.compliant_count + stats.flagged_count + 1e-6)) *
          100
        ).toFixed(1),
      }))
      .sort((a, b) => b.total_mt - a.total_mt)
      .slice(0, 15); // Top 15

    // ========== FLAG REASON BREAKDOWN ==========
    const flagReasonMap = new Map<
      string,
      { count: number; total_mt: number }
    >();

    records.forEach((r) => {
      if (r.flagged && r.flag_reasons) {
        const weightMT = r.invoice_weight_kg ? r.invoice_weight_kg / 1000 : 0;

        r.flag_reasons.forEach((reason: string) => {
          const stats = flagReasonMap.get(reason) || { count: 0, total_mt: 0 };
          stats.count += 1;
          stats.total_mt += weightMT;
          flagReasonMap.set(reason, stats);
        });
      }
    });

    const flagReasonBreakdown = Array.from(flagReasonMap.entries())
      .map(([reason, stats]) => ({
        reason,
        count: stats.count,
        total_mt: Math.round(stats.total_mt),
      }))
      .sort((a, b) => b.count - a.count);

    // ========== MONTHLY TRENDS ==========
    const monthlyMap = new Map<
      string,
      { matched_mt: number; flagged_mt: number }
    >();

    records.forEach((r) => {
      const date = r.generated_date || r.created_at;
      if (!date) return;

      const month = new Date(date as string).toISOString().slice(0, 7); // YYYY-MM
      const weightMT = r.invoice_weight_kg ? r.invoice_weight_kg / 1000 : 0;

      const stats = monthlyMap.get(month) || { matched_mt: 0, flagged_mt: 0 };

      if (r.in_compliance) {
        stats.matched_mt += weightMT;
      }
      if (r.flagged) {
        stats.flagged_mt += weightMT;
      }

      monthlyMap.set(month, stats);
    });

    const monthlyTrends = Array.from(monthlyMap.entries())
      .map(([month, stats]) => ({
        month,
        matched_mt: Math.round(stats.matched_mt),
        flagged_mt: Math.round(stats.flagged_mt),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ========== RETURN RESPONSE ==========
    const response = {
      success: true,
      kpis,
      compliantRecords: compliantRecordsData,
      flaggedRecords: flaggedRecordsData,
      plasticTypeDistribution,
      topRecyclers,
      flagReasonBreakdown,
      monthlyTrends,
    };

    console.log(
      `✅ [dashboard-metrics:${requestId}] Response computed successfully`
    );
    return NextResponse.json(response);
  } catch (error) {
    console.error(`💥 [dashboard-metrics:${requestId}] Error:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
