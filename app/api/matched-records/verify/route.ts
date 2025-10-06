import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

export async function POST(req: Request) {
  try {
    const { record_id, user_id } = await req.json();

    if (!record_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing record_id or user_id' },
        { status: 400 }
      );
    }

    console.log(
      `✅ [verify] Verifying record ${record_id} for user ${user_id}`
    );

    const supabase = getSupabaseAdmin();

    // Update matched_records
    const { error } = await supabase
      .from('matched_records')
      .update({
        human_verified: true,
        verified_at: new Date().toISOString(),
      })
      .eq('id', record_id)
      .eq('user_id', user_id); // Security: only verify own records

    if (error) {
      console.error('❌ [verify] Verification failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ [verify] Record ${record_id} verified successfully`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [verify] Verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
