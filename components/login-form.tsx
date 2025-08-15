'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle } from 'lucide-react';

// Create supabase client with logging
console.log('🔧 [SUPABASE] Initializing client...');
console.log('🌐 [SUPABASE] URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(
  '🔑 [SUPABASE] Anon Key exists:',
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
console.log(
  '🔑 [SUPABASE] Anon Key preview:',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 10) + '...'
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

console.log('✅ [SUPABASE] Client created successfully');

export function LoginForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(
    null
  );

  // Check environment variables on component mount
  useEffect(() => {
    console.log('🔍 [ENV] Environment check:');
    console.log('  - NODE_ENV:', process.env.NODE_ENV);
    console.log(
      '  - NEXT_PUBLIC_SUPABASE_URL:',
      process.env.NEXT_PUBLIC_SUPABASE_URL
    );
    console.log(
      '  - NEXT_PUBLIC_SUPABASE_ANON_KEY exists:',
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    console.log(
      '  - Window location:',
      typeof window !== 'undefined' ? window.location.origin : 'SSR'
    );

    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('❌ [ENV] NEXT_PUBLIC_SUPABASE_URL is missing!');
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('❌ [ENV] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing!');
    }

    console.log('🔍 [ENV] Environment check completed');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType(null);

    console.log('🔐 [AUTH] Starting authentication process...');
    console.log('📧 [AUTH] Email:', email);
    console.log('🔒 [AUTH] Password length:', password.length);
    console.log('🔄 [AUTH] Mode:', isSignUp ? 'SIGN_UP' : 'SIGN_IN');
    console.log('🌐 [AUTH] Redirect URL:', `${window.location.origin}/`);
    console.log(
      '🔧 [AUTH] Supabase URL:',
      process.env.NEXT_PUBLIC_SUPABASE_URL
    );
    console.log(
      '🔑 [AUTH] Supabase Anon Key exists:',
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Validate form data
    if (!email || !email.includes('@')) {
      console.error('❌ [AUTH] Invalid email format:', email);
      setMessage('Please enter a valid email address');
      setLoading(false);
      return;
    }

    if (!password || password.length < 6) {
      console.error('❌ [AUTH] Password too short:', password.length);
      setMessage('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    console.log('✅ [AUTH] Form validation passed');

    try {
      if (isSignUp) {
        console.log('🚀 [AUTH] Attempting sign up...');
        const signUpData = {
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        };
        console.log('📤 [AUTH] Sign up payload:', {
          email: signUpData.email,
          passwordLength: signUpData.password.length,
          redirectTo: signUpData.options.emailRedirectTo,
        });

        const { data, error } = await supabase.auth.signUp(signUpData);

        console.log('📥 [AUTH] Sign up response data:', data);
        console.log('❌ [AUTH] Sign up error:', error);

        if (error) {
          console.error('🚨 [AUTH] Sign up failed:', {
            message: error.message,
            status: error.status,
            details: error,
          });
          throw error;
        }

        console.log('✅ [AUTH] Sign up successful');
        setMessage(
          '📧 Check your email to verify your account! We sent you a verification link.'
        );
        setMessageType('success');
      } else {
        console.log('🚀 [AUTH] Attempting sign in...');
        const signInData = {
          email,
          password,
        };
        console.log('📤 [AUTH] Sign in payload:', {
          email: signInData.email,
          passwordLength: signInData.password.length,
        });

        const { data, error } = await supabase.auth.signInWithPassword(
          signInData
        );

        console.log('📥 [AUTH] Sign in response data:', data);
        console.log('❌ [AUTH] Sign in error:', error);

        if (error) {
          console.error('🚨 [AUTH] Sign in failed:', {
            message: error.message,
            status: error.status,
            details: error,
          });
          throw error;
        }

        console.log('✅ [AUTH] Sign in successful');
      }
    } catch (error: unknown) {
      console.error('💥 [AUTH] Authentication error caught:', error);

      if (error && typeof error === 'object') {
        const errorObj = error as Record<string, unknown>;
        console.error('🔍 [AUTH] Error details:', {
          message: errorObj.message,
          status: errorObj.status,
          code: errorObj.code,
          details: errorObj.details,
          hint: errorObj.hint,
          fullError: error,
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : 'An error occurred';
      console.error('📝 [AUTH] Setting error message:', errorMessage);
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setLoading(false);
      console.log('🏁 [AUTH] Authentication process completed');
    }
  };

  return (
    <Card className='w-full max-w-md'>
      <CardHeader className='space-y-1'>
        <CardTitle className='text-2xl font-bold'>
          {isSignUp ? 'Create an account' : 'Sign in'}
        </CardTitle>
        <CardDescription>
          {isSignUp
            ? 'Enter your details to create your account'
            : 'Enter your email and password to sign in'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='email'>Email</Label>
            <Input
              id='email'
              type='email'
              placeholder='name@example.com'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='password'>Password</Label>
            <Input
              id='password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {message && (
            <Alert
              variant={messageType === 'error' ? 'destructive' : 'default'}
              className={
                messageType === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
                  : undefined
              }
            >
              {messageType === 'success' && (
                <CheckCircle2 className='h-4 w-4 text-green-600 dark:text-green-400' />
              )}
              {messageType === 'error' && <AlertCircle className='h-4 w-4' />}
              <AlertDescription
                className={
                  messageType === 'success'
                    ? 'text-green-800 dark:text-green-200 font-medium'
                    : undefined
                }
              >
                {message}
              </AlertDescription>
            </Alert>
          )}

          <Button type='submit' className='w-full' disabled={loading}>
            {loading ? 'Loading...' : isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <div className='mt-4 text-center text-sm'>
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setIsSignUp(false)}
                className='underline hover:text-primary'
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setIsSignUp(true)}
                className='underline hover:text-primary'
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
