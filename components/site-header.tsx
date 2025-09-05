'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser, clearSupabaseClient } from '@/utils/supabase-browser';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardWidget } from '@/components/dashboard-widget';
import type { Session } from '@supabase/supabase-js';

export function SiteHeader() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
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

    // Subscribe to auth state changes
    const { data: { subscription } } = getSupabaseBrowser().auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setIsLoading(false);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <header className='sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm'>
      <div className='container flex h-14 items-center justify-between px-4'>
        {/* Left side - Dashboard Stats */}
        <div className='flex-1'>
          {session && <DashboardWidget session={session} />}
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
                onClick={async () => {
                  await getSupabaseBrowser().auth.signOut();
                  clearSupabaseClient();
                }}
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
