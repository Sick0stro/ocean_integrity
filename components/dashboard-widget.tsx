'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart3,
  FileText,
  CheckCircle,
  Scale,
  Calendar,
} from 'lucide-react';
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

      // Get stats from recycling_docs for current user within date range
      const { data, error } = await supabase
        .from('recycling_docs')
        .select('tonnage_tons, human_verified, created_at')
        .eq('user_id', session.user.id)
        .gte('created_at', dateRange.from + 'T00:00:00.000Z')
        .lte('created_at', dateRange.to + 'T23:59:59.999Z');

      if (error) {
        console.error('Error fetching dashboard stats:', error);
        return;
      }

      if (data) {
        const processedCount = data.length;
        const verifiedCount = data.filter((doc) => doc.human_verified).length;
        const totalTons = data
          .filter((doc) => doc.human_verified) // Only verified documents
          .reduce((sum, doc) => sum + (Number(doc.tonnage_tons) || 0), 0); // Already in tons

        setStats({
          totalTons: Math.round(totalTons * 100) / 100, // Round to 2 decimal places
          processedCount,
          verifiedCount,
          loading: false,
        });
      }
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
      <Button variant='outline' size='sm' disabled>
        Loading...
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm' className='flex items-center gap-2'>
          <BarChart3 className='h-4 w-4' />
          Dashboard
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <BarChart3 className='h-5 w-5' />
            Dashboard Overview
          </DialogTitle>
        </DialogHeader>

        {/* Date Range Filter */}
        <div className='flex items-center gap-4 p-4 bg-muted/50 rounded-lg'>
          <Calendar className='h-4 w-4 text-muted-foreground' />
          <div className='flex items-center gap-2'>
            <label className='text-sm font-medium'>From:</label>
            <input
              type='date'
              value={dateRange.from}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, from: e.target.value }))
              }
              className='px-2 py-1 border rounded text-sm'
            />
          </div>
          <div className='flex items-center gap-2'>
            <label className='text-sm font-medium'>To:</label>
            <input
              type='date'
              value={dateRange.to}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, to: e.target.value }))
              }
              className='px-2 py-1 border rounded text-sm'
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Tons</CardTitle>
              <Scale className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>
                {stats.totalTons}t
              </div>
              <p className='text-xs text-muted-foreground'>
                From verified documents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Processed Docs
              </CardTitle>
              <FileText className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>
                {stats.processedCount}
              </div>
              <p className='text-xs text-muted-foreground'>
                Total documents processed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Verified Docs
              </CardTitle>
              <CheckCircle className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-purple-600'>
                {stats.verifiedCount}
              </div>
              <p className='text-xs text-muted-foreground'>
                Human verified documents
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className='mt-6 p-4 bg-muted/50 rounded-lg'>
          <h4 className='font-medium text-sm mb-2'>Summary</h4>
          <div className='text-sm text-muted-foreground'>
            You have processed <strong>{stats.processedCount}</strong>{' '}
            documents, of which <strong>{stats.verifiedCount}</strong> have been
            human verified, representing a total of{' '}
            <strong>{stats.totalTons} tons</strong> of recycled material.
          </div>

          {stats.processedCount > 0 && (
            <div className='mt-2 text-sm'>
              <Badge
                variant='outline'
                className='text-green-700 border-green-200 bg-green-50'
              >
                Verification Rate:{' '}
                {Math.round((stats.verifiedCount / stats.processedCount) * 100)}
                %
              </Badge>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
