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
  const [isSignUp, setIsSignUp] = useState(false); // Default to login for better UX - will auto-adjust
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(
    null
  );
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [checkingUser, setCheckingUser] = useState(false);
  const [userDetected, setUserDetected] = useState<boolean | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

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

  // Check if user exists when email changes
  const checkUserExists = async (emailToCheck: string) => {
    if (!emailToCheck || !emailToCheck.includes('@')) return;

    setCheckingUser(true);
    console.log('🔍 [USER_CHECK] Checking if user exists:', emailToCheck);

    try {
      // Try to sign in with a dummy password to check if user exists
      // This is a safe way to check user existence without exposing user data
      const { error } = await supabase.auth.signInWithPassword({
        email: emailToCheck,
        password: 'dummy_password_for_user_check',
      });

      if (error) {
        console.log('🔍 [USER_CHECK] Sign-in error:', error.message);

        if (error.message.includes('Invalid login credentials')) {
          // User EXISTS but wrong password - switch to login!
          console.log(
            '👋 [USER_CHECK] Existing user detected - switching to login mode'
          );
          setUserDetected(true);
          setIsSignUp(false);
          setEmailSuggestion(
            'Welcome back! This email is already registered. Please sign in.'
          );
        } else if (
          error.message.includes('Email not confirmed') ||
          error.message.includes('signup') ||
          error.message.includes('confirmation')
        ) {
          // User exists but email not confirmed
          console.log(
            '📧 [USER_CHECK] Existing user with unconfirmed email - switching to login'
          );
          setUserDetected(true);
          setIsSignUp(false);
          setEmailSuggestion(
            'Welcome back! This email is already registered. Please sign in.'
          );
        } else if (
          error.message.includes('User not found') ||
          error.message.includes('user_not_found') ||
          error.message.includes('No user found')
        ) {
          // User doesn't exist
          console.log(
            '✨ [USER_CHECK] New user detected - staying in signup mode'
          );
          setUserDetected(false);
          setIsSignUp(true);
          setEmailSuggestion(
            "Looking good! We'll create your account after you verify your email."
          );
        } else {
          // Unknown error - default to existing user to be safe
          console.log(
            '🤷 [USER_CHECK] Unknown error, defaulting to login mode for safety'
          );
          setUserDetected(true);
          setIsSignUp(false);
          setEmailSuggestion(
            'Please try signing in, or click "Sign up" if you need a new account.'
          );
        }
      } else {
        // This shouldn't happen with a dummy password, but handle it
        console.log('🎉 [USER_CHECK] User exists and signed in (unexpected)');
        setUserDetected(true);
        setIsSignUp(false);
      }
    } catch (err) {
      console.error('❌ [USER_CHECK] Error checking user:', err);
      // On error, default to signup mode
      setUserDetected(null);
    } finally {
      setCheckingUser(false);
    }
  };

  // Auto-check user when email changes
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setUserDetected(null);
      setEmailSuggestion(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      checkUserExists(email);
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [email]);

  // Smart email suggestions based on user detection
  useEffect(() => {
    if (!email || !email.includes('@') || checkingUser) {
      if (!checkingUser) setEmailSuggestion(null);
      return;
    }

    // If we've detected the user status, the suggestions are already set in checkUserExists
    if (userDetected !== null) return;

    // Fallback suggestions for when user detection hasn't completed yet
    const timeoutId = setTimeout(() => {
      if (userDetected === null && !checkingUser) {
        console.log(
          '💡 [EMAIL_HINT] Providing fallback suggestion for:',
          email
        );
        setEmailSuggestion('Checking if this email is already registered...');
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [email, isSignUp, userDetected, checkingUser]);

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
        // Double-check: if user was detected as existing, redirect to login
        if (userDetected === true) {
          console.log('🔄 [AUTH] User exists, switching to login mode');
          setIsSignUp(false);
          setMessage(
            'This email is already registered. Please sign in instead.'
          );
          setMessageType('error');
          setLoading(false);
          return;
        }

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

          // Handle specific signup errors
          if (
            error.message.includes('already registered') ||
            error.message.includes('already exists') ||
            error.message.includes('User already registered')
          ) {
            console.log('👥 [AUTH] User already exists, switching to login');
            setIsSignUp(false);
            setUserDetected(true);
            setMessage(
              'This email is already registered. Please sign in instead.'
            );
            setMessageType('error');
            setLoading(false);
            return;
          }

          throw error;
        }

        // Check if user already existed (Supabase returns user data even for existing users)
        if (
          data.user &&
          !data.user.email_confirmed_at &&
          data.user.created_at
        ) {
          const createdDate = new Date(data.user.created_at);
          const now = new Date();
          const timeDiff = now.getTime() - createdDate.getTime();

          // If user was created more than 1 minute ago, they likely already existed
          if (timeDiff > 60000) {
            console.log('👥 [AUTH] Existing user detected via timestamp');
            setIsSignUp(false);
            setUserDetected(true);
            setMessage(
              'This email is already registered. Please sign in or check your email for a previous verification link.'
            );
            setMessageType('error');
            setLoading(false);
            return;
          }
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

  const handleForgotPassword = async () => {
    if (!email || !email.includes('@')) {
      setMessage('Please enter your email address first');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');
    setMessageType(null);

    try {
      console.log('🔐 [RESET] Sending password reset email to:', email);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('❌ [RESET] Password reset failed:', error);
        throw error;
      }

      console.log('✅ [RESET] Password reset email sent');
      setResetEmailSent(true);
      setMessage(`📧 Password reset link sent to ${email}! Check your email.`);
      setMessageType('success');
      setShowForgotPassword(false);
    } catch (error: unknown) {
      console.error('💥 [RESET] Password reset error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send reset email';
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className='w-full max-w-md'>
      <CardHeader className='space-y-1'>
        <CardTitle className='text-2xl font-bold'>
          {isSignUp ? 'Create an account' : 'Welcome back'}
        </CardTitle>
        <CardDescription>
          {isSignUp
            ? 'Enter your details to create your account'
            : 'Sign in to your account'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='email'>Email</Label>
            <div className='relative'>
              <Input
                id='email'
                type='email'
                placeholder='name@example.com'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {email && email.includes('@') && (
                <div className='absolute right-2 top-1/2 transform -translate-y-1/2'>
                  {checkingUser ? (
                    <div className='h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin'></div>
                  ) : userDetected === true ? (
                    <div className='h-4 w-4 text-blue-500'>👋</div>
                  ) : userDetected === false ? (
                    <div className='h-4 w-4 text-green-500'>✨</div>
                  ) : (
                    <div className='h-4 w-4 text-green-500'>✓</div>
                  )}
                </div>
              )}
            </div>
            {emailSuggestion && (
              <p className='text-sm text-muted-foreground mt-1 px-1'>
                💡 {emailSuggestion}
              </p>
            )}
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

          {!isSignUp && !resetEmailSent && (
            <div className='text-center'>
              <button
                type='button'
                onClick={() => setShowForgotPassword(!showForgotPassword)}
                className='text-sm text-muted-foreground hover:text-primary underline'
              >
                Forgot your password?
              </button>
            </div>
          )}

          {showForgotPassword && !resetEmailSent && (
            <div className='border rounded-lg p-4 bg-muted/20'>
              <h4 className='text-sm font-medium mb-2'>Reset Password</h4>
              <p className='text-xs text-muted-foreground mb-3'>
                Enter your email address and we&apos;ll send you a link to reset
                your password.
              </p>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleForgotPassword}
                  disabled={loading || !email}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => setShowForgotPassword(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </form>

        <div className='mt-4 text-center text-sm'>
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setIsSignUp(false);
                  setEmailSuggestion(null);
                  setMessage('');
                  setMessageType(null);
                  setUserDetected(null); // Reset user detection when manually switching
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                }}
                className='underline hover:text-primary font-medium'
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => {
                  setIsSignUp(true);
                  setEmailSuggestion(null);
                  setMessage('');
                  setMessageType(null);
                  setUserDetected(null); // Reset user detection when manually switching
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                }}
                className='underline hover:text-primary font-medium'
              >
                Sign up
              </button>
            </>
          )}
        </div>

        {/* Smart user helper */}
        {!email && (
          <div className='mt-2 text-center text-xs text-muted-foreground bg-muted/50 rounded-lg p-3'>
            🌟 <strong>Smart Authentication:</strong> Enter your email and
            we&apos;ll automatically detect if you need to sign in or create an
            account!
          </div>
        )}

        {checkingUser && (
          <div className='mt-2 text-center text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 rounded-lg p-3'>
            🔍 Checking if this email is already registered...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
