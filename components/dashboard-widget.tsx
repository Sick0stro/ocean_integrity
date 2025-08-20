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
import { BarChart3, FileText, CheckCircle, Scale } from 'lucide-react';
import { getSupabaseBrowser } from '@/utils/supabase-browser';
import { Session } from '@supabase/supabase-js';

interface DashboardStats {
  totalTons: number;
  processedCount: number;
  verifiedCount: number;
  loading: boolean;
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

  const fetchStats = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const supabase = getSupabaseBrowser();

      // Get stats from recycling_docs for current user
      const { data, error } = await supabase
        .from('recycling_docs')
        .select('tonnage_tons, human_verified')
        .eq('user_id', session.user.id);

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
  }, [session?.user?.id]);

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
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-center justify-center'>
            <BarChart3 className='h-5 w-5' />
            Dashboard
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-6 py-4'>
          {/* Total Tons - Large Display */}
          <div className='text-center'>
            <div className='flex items-center justify-center gap-2 mb-2'>
              <Scale className='h-6 w-6 text-blue-600' />
            </div>
            <div className='text-4xl font-bold text-blue-600 mb-1'>
              {stats.totalTons}t
            </div>
            <div className='text-sm text-muted-foreground'>verified</div>
          </div>

          {/* Stats Row */}
          <div className='flex justify-center gap-8'>
            {/* Processed */}
            <div className='text-center'>
              <div className='flex items-center justify-center gap-1 mb-1'>
                <FileText className='h-5 w-5 text-green-600' />
              </div>
              <div className='text-2xl font-bold text-green-600'>
                {stats.processedCount}
              </div>
              <div className='text-xs text-muted-foreground'>processed</div>
            </div>

            {/* Verified */}
            <div className='text-center'>
              <div className='flex items-center justify-center gap-1 mb-1'>
                <CheckCircle className='h-5 w-5 text-purple-600' />
              </div>
              <div className='text-2xl font-bold text-purple-600'>
                {stats.verifiedCount}
              </div>
              <div className='text-xs text-muted-foreground'>verified</div>
            </div>
          </div>

          {/* Verification Rate */}
          {stats.processedCount > 0 && (
            <div className='text-center pt-4 border-t'>
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
