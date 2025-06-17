'use client';

import React, { useState, MouseEvent } from 'react';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Download } from 'lucide-react';

// Represents each document that has been processed
interface ProcessedDocument {
  fileName: string;
  documentType: string;
  data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

// Props for the CSVDownloadBtn component
interface CSVDownloadBtnProps {
  processedDocuments: ProcessedDocument[];
  handleDownloadCSV: () => Promise<void> | void;
}

// CSVDownloadBtn: A button for exporting processed documents as a CSV file
export default function CSVDownloadBtn({
  processedDocuments,
  handleDownloadCSV,
}: CSVDownloadBtnProps) {
  // Local UI state flags
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);

  /**
   * Handle click event for downloading CSV.
   * Manages loading, success, and error states.
   */
  const onDownload = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // Reset UI flags and start loading
    setIsLoading(true);
    setIsSuccess(false);
    setIsError(false);

    try {
      // Call the provided download handler
      await Promise.resolve(handleDownloadCSV());
      // Show success feedback
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (error) {
      console.error('CSV download failed:', error);
      // Show error feedback
      setIsError(true);
      setTimeout(() => setIsError(false), 3000);
    } finally {
      // Always stop loading
      setIsLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <InteractiveHoverButton
            onClick={onDownload}
            className="gap-2 px-4 py-2"
            isLoading={isLoading}
            isSuccess={isSuccess}
            isError={isError}
            loadingText="Downloading CSV…"
            successText="Downloaded!"
            errorText="Failed to export"
          >
            {/* Default state: icon + label */}
            <span className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download CSV
            </span>
          </InteractiveHoverButton>
        </TooltipTrigger>

        <TooltipContent>
          <p>Export all successfully processed data to CSV</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
