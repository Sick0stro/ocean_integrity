'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { CheckCircle2, AlertCircle, GalleryVerticalEnd } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(
    null
  );
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if we have the necessary parameters
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    if (accessToken && refreshToken) {
      console.log('🔐 [RESET] Valid reset tokens found');
      setIsValidToken(true);

      // Set the session with the tokens
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } else {
      console.log('❌ [RESET] Missing reset tokens');
      setIsValidToken(false);
      setMessage('Invalid or expired reset link. Please request a new one.');
      setMessageType('error');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType(null);

    // Validate passwords
    if (!password || password.length < 6) {
      setMessage('Password must be at least 6 characters long');
      setMessageType('error');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match');
      setMessageType('error');
      setLoading(false);
      return;
    }

    try {
      console.log('🔐 [RESET] Updating password...');

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error('❌ [RESET] Password update failed:', error);
        throw error;
      }

      console.log('✅ [RESET] Password updated successfully');
      setMessage('✅ Password updated successfully! Redirecting to login...');
      setMessageType('success');

      // Redirect to home after 2 seconds
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (error: unknown) {
      console.error('💥 [RESET] Password update error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update password';
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-lg'>Validating reset link...</div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className='bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10'>
        <div className='flex w-full max-w-sm flex-col gap-6'>
          <Link
            href='/'
            className='flex items-center gap-2 self-center font-medium'
          >
            <div className='bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md'>
              <GalleryVerticalEnd className='size-4' />
            </div>
            Ocean Integrity AI
          </Link>
          <Card className='w-full max-w-md'>
            <CardHeader className='space-y-1'>
              <CardTitle className='text-2xl font-bold'>
                Invalid Reset Link
              </CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              <div className='mt-4'>
                <Button onClick={() => router.push('/')} className='w-full'>
                  Return to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10'>
      <div className='flex w-full max-w-sm flex-col gap-6'>
        <Link
          href='/'
          className='flex items-center gap-2 self-center font-medium'
        >
          <div className='bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md'>
            <GalleryVerticalEnd className='size-4' />
          </div>
          Ocean Integrity AI
        </Link>
        <Card className='w-full max-w-md'>
          <CardHeader className='space-y-1'>
            <CardTitle className='text-2xl font-bold'>Reset Password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='password'>New Password</Label>
                <Input
                  id='password'
                  type='password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='confirmPassword'>Confirm New Password</Label>
                <Input
                  id='confirmPassword'
                  type='password'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
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
                  {messageType === 'error' && (
                    <AlertCircle className='h-4 w-4' />
                  )}
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
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>

            <div className='mt-4 text-center text-sm'>
              <button
                onClick={() => router.push('/')}
                className='underline hover:text-primary font-medium'
              >
                Back to Login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
