import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

interface VerifyResult {
  invoice_number: string;
  status: string;
  error?: string;
}

async function markHumanVerified(invoice_number: string, user_id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('recycling_docs')
    .update({
      human_verified: true,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('invoice_number', invoice_number)
    .eq('user_id', user_id); // Ensure user can only verify their own docs

  if (error) throw error;
  return true;
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).slice(2);
  console.log(
    `🔵 [human-verify:${requestId}] Human verification request received`
  );

  try {
    // Get request data
    const url = new URL(req.url);
    const invoice = url.searchParams.get('invoice');

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing authorization' },
        { status: 401 }
      );
    }

    // Extract user info from token (you might need to decode JWT here)
    // For now, assume we can get user_id from the session
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error(`❌ [human-verify:${requestId}] Auth error:`, authError);
      return NextResponse.json(
        { error: 'Invalid authorization' },
        { status: 401 }
      );
    }

    const results: VerifyResult[] = [];

    if (invoice) {
      // Verify specific invoice
      console.log(
        `🔵 [human-verify:${requestId}] Verifying invoice: ${invoice} for user: ${user.id}`
      );

      try {
        await markHumanVerified(invoice, user.id);
        results.push({
          invoice_number: invoice,
          status: 'verified',
        });
        console.log(
          `✅ [human-verify:${requestId}] Successfully verified invoice: ${invoice}`
        );
      } catch (error) {
        console.error(
          `❌ [human-verify:${requestId}] Failed to verify invoice ${invoice}:`,
          error
        );
        results.push({
          invoice_number: invoice,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Missing invoice parameter' },
        { status: 400 }
      );
    }

    console.log(
      `🔵 [human-verify:${requestId}] Verification completed. Results:`,
      results
    );

    return NextResponse.json({
      success: true,
      results,
      message: `Verified ${
        results.filter((r) => r.status === 'verified').length
      } documents`,
    });
  } catch (error) {
    console.error(`❌ [human-verify:${requestId}] Verification failed:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Verification failed',
      },
      { status: 500 }
    );
  }
}
