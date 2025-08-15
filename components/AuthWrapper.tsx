'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { GalleryVerticalEnd } from 'lucide-react';
import { LoginForm } from '@/components/login-form';

// Create supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔄 [AUTHWRAPPER] Initializing auth state...');

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('📥 [AUTHWRAPPER] Initial session check:', {
        hasSession: !!session,
        hasError: !!error,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        accessToken: session?.access_token
          ? `${session.access_token.substring(0, 20)}...`
          : null,
        tokenType: session?.token_type,
        expiresAt: session?.expires_at,
        error: error?.message,
      });

      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 [AUTHWRAPPER] Auth state changed:', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        accessToken: session?.access_token
          ? `${session.access_token.substring(0, 20)}...`
          : null,
        tokenType: session?.token_type,
        expiresAt: session?.expires_at,
      });

      setSession(session);
      setLoading(false);
    });

    return () => {
      console.log('🔚 [AUTHWRAPPER] Cleaning up auth subscription');
      subscription.unsubscribe();
    };
  }, []);

  // Show loading spinner
  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-lg'>Loading...</div>
      </div>
    );
  }

  // Show auth UI if not logged in
  if (!session) {
    return <LoginPage />;
  }

  // Show main app if logged in
  return (
    <div>
      {/* Add sign out button */}
      <div className='absolute top-4 right-4 z-10'>
        <Button
          onClick={() => supabase.auth.signOut()}
          variant='outline'
          size='sm'
        >
          Sign Out ({session.user.email})
        </Button>
      </div>

      {/* Pass session to children for API calls */}
      <div data-session={JSON.stringify(session)}>{children}</div>
    </div>
  );
}

// Login page using shadcn/ui login-03 block
function LoginPage() {
  return (
    <div className='bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10'>
      <div className='flex w-full max-w-sm flex-col gap-6'>
        <a href='#' className='flex items-center gap-2 self-center font-medium'>
          <div className='bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md'>
            <GalleryVerticalEnd className='size-4' />
          </div>
          Ocean Integrity AI
        </a>
        <LoginForm />
      </div>
    </div>
  );
}

// Export session hook for API calls
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    console.log('🔄 [USESESSION] Hook initializing...');

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('📥 [USESESSION] Session retrieved:', {
        hasSession: !!session,
        hasError: !!error,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        hasAccessToken: !!session?.access_token,
        tokenLength: session?.access_token?.length,
        error: error?.message,
      });
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 [USESESSION] Auth state changed:', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        hasAccessToken: !!session?.access_token,
        tokenLength: session?.access_token?.length,
      });
      setSession(session);
    });

    return () => {
      console.log('🔚 [USESESSION] Cleaning up subscription');
      subscription.unsubscribe();
    };
  }, []);

  // Log when session is accessed
  useEffect(() => {
    if (session) {
      console.log('🎯 [USESESSION] Session available for API calls:', {
        userId: session.user?.id,
        userEmail: session.user?.email,
        hasAccessToken: !!session.access_token,
        tokenPreview: session.access_token
          ? `${session.access_token.substring(0, 20)}...`
          : null,
      });
    }
  }, [session]);

  return session;
}
