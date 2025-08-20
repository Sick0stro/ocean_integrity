'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/utils/supabase-browser';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface DashboardStatsData {
  totalTons: number;
  processedCount: number;
  verifiedCount: number;
  loading: boolean;
}

export function SiteHeader() {
  const [stats, setStats] = useState<DashboardStatsData>({
    totalTons: 0,
    processedCount: 0,
    verifiedCount: 0,
    loading: true,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user?.id) return;

      const { data, error } = await supabase
        .from('recycling_docs')
        .select('tonnage_tons, human_verified, created_at')
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Error fetching dashboard stats:', error);
        return;
      }

      if (data) {
        const processedCount = data.length;
        const verifiedCount = data.filter((doc) => doc.human_verified).length;
        const totalTons = data
          .filter((doc) => doc.human_verified)
          .reduce((sum, doc) => sum + (Number(doc.tonnage_tons) || 0), 0);

        setStats({
          totalTons: Math.round(totalTons * 100) / 100,
          processedCount,
          verifiedCount,
          loading: false,
        });
      }
    };

    fetchStats();
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await getSupabaseBrowser().auth.getSession();
        setSession(session);
      } catch (error) {
        console.error('Error getting session:', error);
      } finally {
        setIsLoading(false);
      }
    };
    getSession();
  }, []);

  return (
    <header className='sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm'>
      <div className='container flex h-14 items-center justify-between px-4'>
        {/* Left-aligned stats */}
        <div className='flex-1 flex items-center gap-6'>
          <div className='flex items-center gap-4 text-sm'>
            {/* Tons */}
            <div className='flex items-center gap-1.5'>
              <span className='font-medium text-muted-foreground'>Total Tons:</span>
              <span className='font-mono font-semibold'>
                {stats.loading ? '--.--' : stats.totalTons.toFixed(2)}
              </span>
            </div>
            
            {/* Documents */}
            <div className='flex items-center gap-1.5'>
              <span className='text-muted-foreground'> Proceced Docs:</span>
              <span className='font-mono font-semibold'>
                {stats.loading ? '--' : stats.processedCount}
              </span>
            </div>
            
            {/* Verified */}
            <div className='flex items-center gap-1.5'>
              <span className='text-muted-foreground'>Verified Credit:</span>
              <span className='font-mono font-semibold text-green-600'>
                {stats.loading ? '--' : stats.verifiedCount}
              </span>
            </div>
          </div>
        </div>
        
        {/* Right-aligned user info */}
        <div className='flex items-center gap-4 justify-end'>
          {isLoading ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : session ? (
            <>
              <span className='text-sm text-muted-foreground hidden sm:inline'>
                {session.user.email}
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='gap-1.5 text-sm'
                onClick={() => getSupabaseBrowser().auth.signOut()}
              >
                <LogOut className='h-3.5 w-3.5' />
                Sign out
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
