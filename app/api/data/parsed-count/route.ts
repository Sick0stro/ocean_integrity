import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

/**
 * GET /api/data/parsed-count
 *
 * Quick check to see if a user has parsed_documents.
 * Used by dashboard to detect if matching might be in progress.
 *
 * Query params:
 *  - user_id: Required. User ID to check.
 *
 * Returns:
 *  { count: number }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user_id parameter' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { count, error } = await supabase
      .from('parsed_documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      console.error('Error counting parsed documents:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error('Unexpected error in parsed-count endpoint:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
