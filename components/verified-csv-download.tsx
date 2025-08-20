'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { getSupabaseBrowser } from '@/utils/supabase-browser';
import { Session } from '@supabase/supabase-js';

interface VerifiedCsvDownloadProps {
  session: Session;
}

export function VerifiedCsvDownload({ session }: VerifiedCsvDownloadProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!session?.user?.id) return;

    setIsDownloading(true);

    try {
      const supabase = getSupabaseBrowser();

      // Fetch verified documents from recycling_docs
      const { data: verifiedDocs, error } = await supabase
        .from('recycling_docs')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('human_verified', true)
        .order('verified_at', { ascending: false });

      if (error) {
        console.error('Error fetching verified documents:', error);
        return;
      }

      if (!verifiedDocs || verifiedDocs.length === 0) {
        alert('No verified documents to download');
        return;
      }

      // Convert to CSV
      const headers = [
        'invoice_number',
        'recycler_company',
        'network_operator_company',
        'plastic_type',
        'tonnage_tons',
        'weight_kg',
        'country',
        'city',
        'currency',
        'verified_at',
        'invoice_url',
        'eft_url',
        'ewaybill_url',
      ];

      const csvContent = [
        headers.join(','),
        ...verifiedDocs.map((doc) =>
          [
            `"${doc.invoice_number || ''}"`,
            `"${doc.recycler_company || ''}"`,
            `"${doc.network_operator_company || ''}"`,
            `"${doc.plastic_type || ''}"`,
            doc.tonnage_tons || 0,
            doc.weight_kg || 0,
            `"${doc.country || ''}"`,
            `"${doc.city || ''}"`,
            `"${doc.currency || ''}"`,
            `"${doc.verified_at || ''}"`,
            `"${doc.invoice_url || ''}"`,
            `"${doc.eft_url || ''}"`,
            `"${doc.ewaybill_url || ''}"`,
          ].join(',')
        ),
      ].join('\n');

      // Download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `verified_recycling_docs_${new Date().toISOString().split('T')[0]}.csv`
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(
        `✅ Downloaded ${verifiedDocs.length} verified documents as CSV`
      );
    } catch (error) {
      console.error('Error downloading CSV:', error);
      alert('Error downloading CSV file');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading}
      variant='outline'
      size='sm'
      className='flex items-center gap-2'
    >
      {isDownloading ? (
        <Loader2 className='h-4 w-4 animate-spin' />
      ) : (
        <Download className='h-4 w-4' />
      )}
      {isDownloading ? 'Downloading...' : 'Download Verified CSV'}
    </Button>
  );
}
