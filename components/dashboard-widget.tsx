'use client';

import React, { useState, useEffect, useCallback } from 'react';

import { FileText, CheckCircle, Scale, Calendar } from 'lucide-react';
import { getSupabaseBrowser } from '@/utils/supabase-browser';
import { Session } from '@supabase/supabase-js';

interface DashboardStats {
  totalTons: number;
  processedCount: number;
  verifiedCount: number;
  loading: boolean;
}

interface DateRange {
  from: string;
  to: string;
}

interface DashboardWidgetProps {
  session: Session;
}

export function DashboardWidget({ session }: DashboardWidgetProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalTons: 0,
    processedCount: 0,
    verifiedCount: 0,
    loading: true,
  });

  // Default to last 30 days
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const fetchStats = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const supabase = getSupabaseBrowser();

      // Orange (Total Processed Tons) - from recycling_docs
      const { data: recyclingData } = await supabase
        .from('recycling_docs')
        .select('tonnage_tons, created_at')
        .eq('user_id', session.user.id)
        .gte('created_at', dateRange.from + 'T00:00:00.000Z')
        .lte('created_at', dateRange.to + 'T23:59:59.999Z');

      // Green (Processed Docs) - from parsed_documents
      const { data: parsedData } = await supabase
        .from('parsed_documents')
        .select('id, created_at')
        .eq('user_id', session.user.id)
        .gte('created_at', dateRange.from + 'T00:00:00.000Z')
        .lte('created_at', dateRange.to + 'T23:59:59.999Z');

      // Blue (Verified Credits) - from document_groups
      const { data: verifiedGroupsData } = await supabase
        .from('document_groups')
        .select('id, created_at')
        .eq('user_id', session.user.id)
        .eq('human_verified', true)
        .gte('created_at', dateRange.from + 'T00:00:00.000Z')
        .lte('created_at', dateRange.to + 'T23:59:59.999Z');

      // Silently handle parsed_documents errors - continue with stats calculation

      // Calculate stats
      const totalTons =
        recyclingData?.reduce(
          (sum, doc) => sum + (Number(doc.tonnage_tons) || 0),
          0
        ) || 0;
      const verifiedCount = verifiedGroupsData?.length || 0;
      const processedCount = parsedData?.length || 0;

      setStats({
        totalTons: Math.round(totalTons * 100) / 100, // Round to 2 decimal places
        processedCount,
        verifiedCount,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
    }
  }, [session?.user?.id, dateRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Refresh stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (stats.loading) {
    return (
      <div className='flex items-center gap-4 text-sm'>
        <div className='text-muted-foreground'>Loading...</div>
      </div>
    );
  }

  return (
    <>
      {/* Navbar Stats */}
      <div className='flex items-center gap-4'>
        {/* Stats Boxes - Left to Right: Total Tons, Processed Docs, Verified Credits */}
        <div className='flex items-center gap-3'>
          {/* Orange - Total Tons */}
          <div className='flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 rounded-md border border-orange-200'>
            <Scale className='h-4 w-4 text-orange-600' />
            <span className='font-semibold text-orange-700'>
              Total Processed Tons: {stats.totalTons}
            </span>
          </div>

          {/* Green - Processed Docs */}
          <div className='flex items-center gap-1.5 px-3 py-1.5 bg-green-100 rounded-md border border-green-200'>
            <FileText className='h-4 w-4 text-green-600' />
            <span className='font-semibold text-green-700'>
              Processed Docs: {stats.processedCount}
            </span>
          </div>

          {/* Blue - Verified Credit */}
          <div className='flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 rounded-md border border-blue-200'>
            <CheckCircle className='h-4 w-4 text-blue-600' />
            <span className='font-semibold text-blue-700'>
              Verified Credit: {stats.verifiedCount}
            </span>
          </div>
        </div>

        {/* Date Range Filter - After stats */}
        <div className='flex items-center gap-2 text-sm'>
          <Calendar className='h-4 w-4 text-muted-foreground' />
          <input
            type='date'
            value={dateRange.from}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, from: e.target.value }))
            }
            className='px-2 py-1 border rounded text-xs'
          />
          <span className='text-muted-foreground'>to</span>
          <input
            type='date'
            value={dateRange.to}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, to: e.target.value }))
            }
            className='px-2 py-1 border rounded text-xs'
          />
        </div>
      </div>
    </>
  );
}
