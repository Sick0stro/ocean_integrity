import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const exportType = searchParams.get('type'); // 'processed' or 'tonnage'

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    if (exportType === 'processed') {
      // Export all processed documents with tonnage data
      const { data: processedDocs, error } = await supabase
        .from('recycling_docs')
        .select(`
          id,
          invoice_number,
          recycler_company,
          network_operator_company,
          plastic_type,
          tonnage_tons,
          country,
          status,
          human_verified,
          verified_at,
          created_at,
          updated_at
        `)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching processed docs:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        data: processedDocs,
        type: 'processed_documents_export'
      });

    } else if (exportType === 'tonnage') {
      // Get tonnage summary for processed groups (before human verification)
      const { data: groups, error: groupsError } = await supabase
        .from('document_groups')
        .select(`
          invoice_number,
          group_key,
          is_complete,
          completion_percentage,
          last_processed_at,
          human_verified
        `)
        .eq('user_id', userId)
        .eq('is_complete', true)
        .order('last_processed_at', { ascending: false });

      if (groupsError) {
        console.error('Error fetching groups:', groupsError);
        return NextResponse.json({ error: groupsError.message }, { status: 500 });
      }

      // Get corresponding recycling docs for tonnage
      const invoiceNumbers = groups?.map(g => g.invoice_number) || [];
      const { data: recyclingDocs, error: recyclingError } = await supabase
        .from('recycling_docs')
        .select(`
          invoice_number,
          tonnage_tons,
          plastic_type,
          recycler_company,
          human_verified
        `)
        .eq('user_id', userId)
        .in('invoice_number', invoiceNumbers);

      if (recyclingError) {
        console.error('Error fetching recycling docs:', recyclingError);
        return NextResponse.json({ error: recyclingError.message }, { status: 500 });
      }

      // Calculate tonnage summaries
      const totalTonnage = recyclingDocs?.reduce((sum, doc) => sum + (doc.tonnage_tons || 0), 0) || 0;
      const verifiedTonnage = recyclingDocs?.filter(doc => doc.human_verified)
        .reduce((sum, doc) => sum + (doc.tonnage_tons || 0), 0) || 0;
      const unverifiedTonnage = totalTonnage - verifiedTonnage;

      // Group by plastic type
      const tonnageByType = recyclingDocs?.reduce((acc, doc) => {
        const type = doc.plastic_type || 'Unknown';
        acc[type] = (acc[type] || 0) + (doc.tonnage_tons || 0);
        return acc;
      }, {} as Record<string, number>) || {};

      return NextResponse.json({
        summary: {
          totalGroups: groups?.length || 0,
          completeGroups: groups?.filter(g => g.is_complete).length || 0,
          humanVerifiedGroups: groups?.filter(g => g.human_verified).length || 0,
          totalTonnage,
          verifiedTonnage,
          unverifiedTonnage,
          tonnageByType
        },
        groups,
        recyclingDocs,
        type: 'tonnage_summary'
      });
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
