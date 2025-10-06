'use client';

import React, { useState, useEffect, useCallback } from 'react';

import { FileText, Scale, Calendar } from 'lucide-react';
import { getSupabaseBrowser } from '@/utils/supabase-browser';
import { Session } from '@supabase/supabase-js';

interface DashboardStats {
  totalTons: number;
  processedCount: number;
  groupsCount: number;
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
    groupsCount: 0,
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

      // Orange (Total Processed Tons) - from matched_records
      const { data: matchedRecordsData, error: matchedError } = await supabase
        .from('matched_records')
        .select('invoice_weight_kg, created_at')
        .eq('user_id', session.user.id)
        .gte('created_at', dateRange.from + 'T00:00:00.000Z')
        .lte('created_at', dateRange.to + 'T23:59:59.999Z');

      // Calculate total tons from matched records (convert kg to metric tons)
      const tonnageData = matchedRecordsData || [];

      // Green (Processed Docs) - from parsed_documents
      const { data: parsedData, error: parsedError } = await supabase
        .from('parsed_documents')
        .select('id, created_at')
        .eq('user_id', session.user.id)
        .gte('created_at', dateRange.from + 'T00:00:00.000Z')
        .lte('created_at', dateRange.to + 'T23:59:59.999Z');

      // Handle database connection errors gracefully
      if (matchedError) {
        console.warn(
          '⚠️ Dashboard: Could not fetch matched records - using fallback values'
        );
      }
      if (parsedError) {
        console.warn(
          '⚠️ Dashboard: Could not fetch parsed documents - using fallback values'
        );
      }

      // Calculate stats
      // Extract tonnage from matched records (invoice_weight_kg is in kg)
      const totalTons =
        tonnageData.reduce((sum, record) => {
          const weightKg = Number(record.invoice_weight_kg || 0);
          return sum + weightKg;
        }, 0) / 1000; // Convert from kg to metric tonnes
      const processedCount = parsedData?.length || 0;

      setStats({
        totalTons: Math.round(totalTons * 100) / 100, // Round to 2 decimal places
        processedCount,
        groupsCount: 0, // Remove groups count (deprecated)
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
      {/* Navbar Stats - Responsive */}
      <div className='flex flex-wrap items-center gap-2 lg:gap-3'>
        {/* Stats Boxes */}
        <div className='flex items-center gap-2'>
          {/* Orange - Total Tons */}
          <div className='flex items-center gap-1 px-2 py-1 bg-orange-50 rounded border border-orange-200'>
            <Scale className='h-3.5 w-3.5 text-orange-600 flex-shrink-0' />
            <span className='text-xs font-medium text-orange-700 whitespace-nowrap'>
              <span className='hidden sm:inline'>Matched: </span>
              {stats.totalTons.toFixed(2)} MT
            </span>
          </div>

          {/* Green - Processed Docs */}
          <div className='flex items-center gap-1 px-2 py-1 bg-green-50 rounded border border-green-200'>
            <FileText className='h-3.5 w-3.5 text-green-600 flex-shrink-0' />
            <span className='text-xs font-medium text-green-700 whitespace-nowrap'>
              <span className='hidden sm:inline'>Docs: </span>
              {stats.processedCount}
            </span>
          </div>
        </div>

        {/* Date Range Filter - Hidden on small screens */}
        <div className='hidden md:flex items-center gap-1.5 text-xs ml-2'>
          <Calendar className='h-3.5 w-3.5 text-gray-400' />
          <input
            type='date'
            value={dateRange.from}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, from: e.target.value }))
            }
            className='px-1.5 py-0.5 border rounded text-xs w-28'
          />
          <span className='text-gray-400'>-</span>
          <input
            type='date'
            value={dateRange.to}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, to: e.target.value }))
            }
            className='px-1.5 py-0.5 border rounded text-xs w-28'
          />
        </div>
      </div>
    </>
  );
}
