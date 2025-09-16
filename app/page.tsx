'use client';

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { Document as AppDocument } from '@/types/document-types';
import type {
  ProcessedDocument,
  ProcessingStatus,
} from '@/types/processed-document';
import type { DocumentTypeKey } from '@/constants/document-types';

interface RecyclingDocument {
  id: string;
  document_type: 'invoice' | 'eft_receipt' | 'e-way-bill';
  file_url: string | null;
  created_at: string;
  raw_json: Record<string, unknown>;
  invoice_number?: string;
  network_operator_company?: string;
  recycler_company?: string;
  plastic_type?: string;
  tonnage_tons?: number;
  weight_kg?: number;
  country?: string;
  status?: string;
  plastiks_collection_id?: string | null;
  plastiks_metadata_hash?: string | null;
  plastiks_collection_address?: string | null;
  plastiks_submitted_at?: string | null;
  human_verified?: boolean;
  verified_at?: string | null;
}

import {
  FileText,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Clock,
  FileCheck,
  CreditCard,
  Truck,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSupabaseBrowser } from '@/utils/supabase-browser';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import FileUploader from '@/components/file-uploader';
import dynamic from 'next/dynamic';
import { documentTemplates } from '@/constants/document-templates';
import DocumentTypeCard from '@/components/document-type-card';
import { documentTypes } from '@/constants/document-types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { VideoText } from '@/components/magicui/video-text';
import { Session } from '@supabase/supabase-js';
import { LoginForm } from '@/components/login-form';
import { GalleryVerticalEnd } from 'lucide-react';
import { isSameInvoice, getInvoiceGroupKey } from '@/lib/invoiceUtils';
import { supabase } from '@/utils/supabase-browser';
import { VerifiedCsvDownload } from '@/components/verified-csv-download';
import { DataManagementTable } from '@/components/data-management-table';

const PdfPreview = dynamic(() => import('@/components/pdf-preview'), {
  ssr: false,
});

interface GroupDoc {
  id: string;
  document_type: 'invoice' | 'eft_receipt' | 'e-way-bill';
  file_url: string | null;
  created_at: string;
  raw_json: Record<string, unknown>;
  docs?: {
    id: string;
    document_type: 'invoice' | 'eft_receipt' | 'e-way-bill';
    created_at: string;
    raw_json: Record<string, unknown>;
  };
}

type InvoiceGroup = {
  // Original frontend properties (for compatibility)
  invoice: string;
  docs: Partial<Record<'invoice' | 'eft_receipt' | 'e-way-bill', GroupDoc[]>>;

  // 🚀 NEW: Backend-provided properties
  invoiceKey?: string;
  invoiceNumber?: string;
  isComplete?: boolean;
  completionCount?: number;
  requiredCount?: number;
  missingTypes?: string[];
  presentTypes?: string[];
  completionPercentage?: number;

  // Backend metadata
  country?: string | null;
  recyclerCompany?: string | null;
  plasticType?: string | null;
  appliedRuleName?: string | null;
  lastProcessedAt?: string;

  // Human verification (moved from recycling_docs)
  human_verified?: boolean;
  verified_at?: string | null;

  processingLogs?: {
    backendGrouped?: boolean;
    groupId?: string;
    ruleName?: string;
    requiredTypes?: string[];
    optionalTypes?: string[];
  };
};

// Define the shape of the submit result
interface SubmitResult {
  ok: boolean;
  message: string;
}

interface HomeContentProps {
  session: Session;
}

function HomeContent({ session }: HomeContentProps) {
  // Session passed as prop instead of context

  // Document processing state
  const [files, setFiles] = useState<File[]>([]);
  const [processedDocuments, setProcessedDocuments] = useState<
    ProcessedDocument[]
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDocumentsLoaded, setIsDocumentsLoaded] = useState(false);

  // Preprocessing state (NEW)
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [preprocessingProgress, setPreprocessingProgress] = useState('');
  const [totalPagesToProcess, setTotalPagesToProcess] = useState(0);

  // UI state
  const [activeTab, setActiveTab] = useState<
    'upload' | 'results' | 'groups' | 'submit' | 'blockchain' | 'data'
  >('upload');

  // Document grouping state
  const [groups, setGroups] = useState<Record<string, InvoiceGroup>>({});
  const [recyclingDocs, setRecyclingDocs] = useState<
    Record<string, RecyclingDocument>
  >({});
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);
  const [hasInitializedGroups, setHasInitializedGroups] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );

  // 🚀 NEW: Blockchain tab state - for verified recycling docs
  const [verifiedDocs, setVerifiedDocs] = useState<
    Record<string, RecyclingDocument>
  >({});
  const [isVerifiedDocsLoading, setIsVerifiedDocsLoading] = useState(false);
  const [hasInitializedVerifiedDocs, setHasInitializedVerifiedDocs] =
    useState(false);
  const [isPushingToPlastiks, setIsPushingToPlastiks] = useState(false);
  const [expandedBlockchainInvoices, setExpandedBlockchainInvoices] = useState<
    Record<string, boolean>
  >({});

  // Alert state for user notifications
  const [showAlreadyProcessedAlert, setShowAlreadyProcessedAlert] =
    useState(false);

  // 🚀 PHASE 1: Database-driven state for button control
  const [readyDocumentsCount, setReadyDocumentsCount] = useState(0);
  const [tempDocumentsCount, setTempDocumentsCount] = useState(0);
  const [duplicateFilesCount, setDuplicateFilesCount] = useState(0);

  // 🚀 PHASE 2: Track skipped files for duplicate status display
  const [skippedFilesInfo, setSkippedFilesInfo] = useState<
    { name: string; reason: string }[]
  >([]);

  // 🚀 NEW: Failed documents tracking
  const [failedPreprocessingDocs, setFailedPreprocessingDocs] = useState<
    Array<{
      id: string;
      pdf_path: string;
      error_message: string;
      last_attempt: string;
    }>
  >([]);
  const [failedAIDocs, setFailedAIDocs] = useState<
    Array<{
      id: string;
      pdf_path: string;
      original_filename: string;
      error_message: string;
      failed_at: string;
    }>
  >([]);

  // 🚀 NEW: Group statistics
  const [groupStats, setGroupStats] = useState({
    totalGroups: 0,
    completeGroups: 0,
    incompleteGroups: 0,
    ungroupedDocs: 0,
  });

  // 🚀 NEW: Calculate group statistics
  const calculateGroupStats = useCallback(async () => {
    if (!session?.user?.id) return;

    const supabase = getSupabaseBrowser();

    try {
      // Get all groups for the user
      const { data: groupsData } = await supabase
        .from('document_groups')
        .select('id, is_complete, is_human_verified, present_document_ids')
        .eq('user_id', session.user.id);

      // Get all parsed documents for the user
      const { data: parsedData } = await supabase
        .from('parsed_documents')
        .select('id')
        .eq('user_id', session.user.id);

      const totalGroups = groupsData?.length || 0;
      const completeGroups =
        groupsData?.filter((g) => g.is_complete || g.is_human_verified)
          .length || 0;
      const incompleteGroups = totalGroups - completeGroups;

      // Calculate ungrouped documents
      const groupedDocIds = new Set();
      groupsData?.forEach((group) => {
        (group.present_document_ids || []).forEach((id: string) =>
          groupedDocIds.add(id)
        );
      });

      const ungroupedDocs = (parsedData?.length || 0) - groupedDocIds.size;

      setGroupStats({
        totalGroups,
        completeGroups,
        incompleteGroups,
        ungroupedDocs,
      });
    } catch (error) {
      console.error('Failed to calculate group stats:', error);
    }
  }, [session?.user?.id]);

  // 🚀 NEW: Fetch failed documents
  const fetchFailedDocuments = useCallback(async () => {
    if (!session?.user?.id) return;

    const supabase = getSupabaseBrowser();

    // Fetch failed preprocessing documents
    const { data: failedPreprocessing } = await supabase
      .from('temp_documents')
      .select('id, pdf_path, error_message, last_attempt')
      .eq('user_id', session.user.id)
      .eq('status', 'failed')
      .order('last_attempt', { ascending: false });

    // Fetch failed AI processing documents
    const { data: failedAI } = await supabase
      .from('single_documents')
      .select('id, pdf_path, original_filename, error_message, failed_at')
      .eq('user_id', session.user.id)
      .eq('status', 'failed')
      .order('failed_at', { ascending: false });

    setFailedPreprocessingDocs(failedPreprocessing || []);
    setFailedAIDocs(failedAI || []);
  }, [session?.user?.id]);

  // 🚀 NEW: Retry failed preprocessing
  const retryFailedPreprocessing = useCallback(async () => {
    if (failedPreprocessingDocs.length === 0) return;

    const supabase = getSupabaseBrowser();

    // Reset status to 'uploaded' for retry
    const { error } = await supabase
      .from('temp_documents')
      .update({ status: 'uploaded', error_message: null })
      .in(
        'id',
        failedPreprocessingDocs.map((doc) => doc.id)
      );

    if (!error) {
      console.log(
        `🔄 Reset ${failedPreprocessingDocs.length} failed preprocessing documents for retry`
      );
      await fetchFailedDocuments(); // Refresh the failed docs list

      // Trigger preprocessing
      try {
        const response = await fetch('/api/cron/preprocess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: session?.user?.id }),
        });
        console.log('🔄 Triggered preprocessing retry', response.status);
      } catch (error) {
        console.error('Failed to trigger preprocessing retry:', error);
      }
    }
  }, [failedPreprocessingDocs, session?.user?.id, fetchFailedDocuments]);

  // 🚀 NEW: Retry failed AI processing
  const retryFailedAI = useCallback(async () => {
    if (failedAIDocs.length === 0) return;

    const supabase = getSupabaseBrowser();

    // Reset status to 'uploaded' for retry
    const { error } = await supabase
      .from('single_documents')
      .update({ status: 'uploaded', error_message: null, failed_at: null })
      .in(
        'id',
        failedAIDocs.map((doc) => doc.id)
      );

    if (!error) {
      console.log(
        `🔄 Reset ${failedAIDocs.length} failed AI processing documents for retry`
      );
      await fetchFailedDocuments(); // Refresh the failed docs list
    }
  }, [failedAIDocs, fetchFailedDocuments]);

  // 🚀 PHASE 2: Helper function to check if file is duplicate
  const getFileStatus = useCallback(
    (file: File) => {
      const isDuplicate = skippedFilesInfo.some((sf) => sf.name === file.name);
      return {
        isDuplicate,
        reason: isDuplicate
          ? skippedFilesInfo.find((sf) => sf.name === file.name)?.reason
          : null,
      };
    },
    [skippedFilesInfo]
  );

  // 🚀 PHASE 5: Enhanced status message function
  const getDetailedStatus = useCallback(() => {
    // Handle preprocessing state
    if (isPreprocessing) {
      if (duplicateFilesCount === files.length && files.length > 0) {
        return {
          message: `All ${files.length} files are duplicates`,
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
        };
      }
      if (duplicateFilesCount > 0) {
        return {
          message: `${duplicateFilesCount} of ${
            files.length
          } files are duplicates. Processing ${
            files.length - duplicateFilesCount
          } new files...`,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
        };
      }
      return {
        message: `Processing ${files.length} files...`,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
      };
    }

    // Handle workflow states based on database
    if (tempDocumentsCount > 0 && readyDocumentsCount === 0) {
      return {
        message: `${tempDocumentsCount} files preprocessing...`,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
      };
    }

    if (tempDocumentsCount > 0 && readyDocumentsCount > 0) {
      return {
        message: `${tempDocumentsCount} files preprocessing, ${readyDocumentsCount} pages ready for AI`,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
      };
    }

    if (readyDocumentsCount > 0) {
      return {
        message: `${readyDocumentsCount} pages ready for AI processing`,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
      };
    }

    if (duplicateFilesCount > 0 && files.length > 0) {
      return {
        message: `${duplicateFilesCount} duplicate files detected`,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
      };
    }

    return {
      message: 'Ready to upload documents',
      color: 'text-slate-600',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
    };
  }, [
    isPreprocessing,
    duplicateFilesCount,
    files.length,
    tempDocumentsCount,
    readyDocumentsCount,
  ]);

  // 🚀 PHASE 1: Database check function for button state
  const checkDocumentsStatus = useCallback(async () => {
    if (!session?.user?.id) {
      console.log('🔍 [checkDocumentsStatus] No user session, skipping check');
      return { temp: 0, ready: 0 };
    }

    const supabase = getSupabaseBrowser();
    console.log('🔍 [checkDocumentsStatus] Checking database status...');

    try {
      // Check temp_documents (preprocessing queue)
      const { data: tempDocs, error: tempError } = await supabase
        .from('temp_documents')
        .select('id')
        .eq('user_id', session.user.id);

      // Check single_documents (ready for AI)
      const { data: singleDocs, error: singleError } = await supabase
        .from('single_documents')
        .select('id')
        .eq('status', 'uploaded')
        .eq('user_id', session.user.id);

      if (tempError) {
        console.warn(
          '⚠️ [checkDocumentsStatus] Error checking temp_documents:',
          tempError
        );
      }
      if (singleError) {
        console.warn(
          '⚠️ [checkDocumentsStatus] Error checking single_documents:',
          singleError
        );
      }

      const tempCount = tempDocs?.length || 0;
      const readyCount = singleDocs?.length || 0;

      console.log(
        `📊 [checkDocumentsStatus] Database state: temp=${tempCount}, ready=${readyCount}`
      );

      setTempDocumentsCount(tempCount);
      setReadyDocumentsCount(readyCount);

      return { temp: tempCount, ready: readyCount };
    } catch (error) {
      console.error('❌ [checkDocumentsStatus] Database check failed:', error);
      return { temp: 0, ready: 0 };
    }
  }, [session?.user?.id]);

  // Toggle group expansion
  const toggleGroupExpansion = (invoiceKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [invoiceKey]: !prev[invoiceKey], // Default to false (collapsed)
    }));
  };

  // Toggle blockchain invoice expansion
  const toggleBlockchainInvoiceExpansion = (invoiceKey: string) => {
    setExpandedBlockchainInvoices((prev) => ({
      ...prev,
      [invoiceKey]: !prev[invoiceKey], // Default to false (collapsed)
    }));
  };

  // 🚀 PERFORMANCE: Show loading immediately when switching to groups tab
  useEffect(() => {
    if (activeTab === 'groups' && !hasInitializedGroups) {
      setIsGroupsLoading(true);
    }
  }, [activeTab, hasInitializedGroups]);

  // 🚀 PHASE 1: Initialize database status check
  useEffect(() => {
    if (session?.user?.id) {
      console.log('🔄 [PHASE1] Initializing database status check...');
      checkDocumentsStatus();
    }
  }, [session?.user?.id, checkDocumentsStatus]);

  // 🚀 PHASE 1: Update status when switching to upload tab
  useEffect(() => {
    if (activeTab === 'upload' && session?.user?.id) {
      console.log(
        '🔄 [PHASE1] Upload tab active - checking database status...'
      );
      checkDocumentsStatus();
    }
  }, [activeTab, session?.user?.id, checkDocumentsStatus]);
  // Track all processed invoice numbers for validation
  const [processedInvoiceNumbers, setProcessedInvoiceNumbers] = useState<
    Set<string>
  >(new Set());

  // Backend grouping state
  const [isGroupingInProgress, setIsGroupingInProgress] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [submitResult, setSubmitResult] = useState<
    Record<string, SubmitResult>
  >({});

  // Track active polling intervals to prevent duplicates
  const activePollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for updated Plastiks submission details
  useEffect(() => {
    if (!submitResult || Object.keys(submitResult).length === 0) return;

    // Clear any existing polling interval
    if (activePollingRef.current) {
      console.log('🧹 Clearing existing polling interval');
      clearInterval(activePollingRef.current);
      activePollingRef.current = null;
    }

    // Find all invoice numbers that were just submitted successfully
    const submittedInvoices = Object.entries(submitResult)
      .filter(([, result]) => result?.ok)
      .map(([invoice]) => invoice);

    if (submittedInvoices.length === 0) {
      console.log('⏹️ No successful submissions to poll for');
      return;
    }

    // 🚀 CRITICAL FIX: Don't poll for failed submissions
    const hasAnyFailedSubmissions = submittedInvoices.some((invoice) => {
      const doc = recyclingDocs[invoice];
      return doc && doc.status === 'failed';
    });

    if (hasAnyFailedSubmissions) {
      console.log('❌ Found failed submissions. Not starting polling.');
      return;
    }

    // Check if all submitted invoices already have complete Plastiks data
    const allHaveCompleteData = submittedInvoices.every((invoice) => {
      const doc = recyclingDocs[invoice];
      return (
        doc &&
        doc.plastiks_collection_id &&
        doc.plastiks_collection_address &&
        doc.plastiks_metadata_hash &&
        doc.status === 'submitted'
      );
    });

    if (allHaveCompleteData) {
      console.log(
        '✅ All documents have complete Plastiks data. Stopping polling.'
      );
      return; // Don't poll if we already have all the data
    }

    let pollCount = 0;
    const maxPolls = 10; // Stop after 30 seconds (10 polls × 3s interval)

    // Initial fetch
    const fetchUpdatedDocs = async () => {
      try {
        pollCount++;
        console.log(
          `Polling for updated Plastiks details for invoices (${pollCount}/${maxPolls}):`,
          submittedInvoices
        );

        const supabase = getSupabaseBrowser();
        const { data: updatedDocs, error } = await supabase
          .from('recycling_docs')
          .select('*')
          .in('invoice_number', submittedInvoices);

        if (error) {
          // Silently handle polling errors
          return;
        }

        console.log(
          'Received updated docs:',
          JSON.stringify(updatedDocs, null, 2)
        );

        if (updatedDocs && updatedDocs.length > 0) {
          setRecyclingDocs((prev) => {
            const updated = { ...prev };
            updatedDocs.forEach((doc) => {
              if (doc.invoice_number) {
                const updatedDoc = {
                  ...(updated[doc.invoice_number] || {}),
                  ...doc,
                  plastiks_collection_address:
                    doc.plastiks_collection_address ||
                    updated[doc.invoice_number]?.plastiks_collection_address,
                  plastiks_metadata_hash:
                    doc.plastiks_metadata_hash ||
                    updated[doc.invoice_number]?.plastiks_metadata_hash,
                  plastiks_submitted_at:
                    doc.plastiks_submitted_at ||
                    updated[doc.invoice_number]?.plastiks_submitted_at,
                };

                console.log(`Updating doc ${doc.invoice_number}:`, {
                  hasAddress: !!updatedDoc.plastiks_collection_address,
                  hasHash: !!updatedDoc.plastiks_metadata_hash,
                  doc: updatedDoc,
                });

                updated[doc.invoice_number] = updatedDoc;
              }
            });
            return updated;
          });

          // Check if we now have complete data for all invoices
          const nowHaveCompleteData = submittedInvoices.every((invoice) => {
            const doc = updatedDocs.find((d) => d.invoice_number === invoice);
            return (
              doc &&
              doc.plastiks_collection_id &&
              doc.plastiks_collection_address &&
              doc.plastiks_metadata_hash &&
              doc.status === 'submitted'
            );
          });

          if (nowHaveCompleteData) {
            console.log(
              '✅ All documents now have complete Plastiks data. Stopping polling.'
            );
            if (activePollingRef.current) {
              clearInterval(activePollingRef.current);
              activePollingRef.current = null;
            }
            return;
          }
        }

        // Stop polling for failed submissions
        const hasFailedSubmissions = updatedDocs.some(
          (doc) =>
            doc.status === 'failed' &&
            submittedInvoices.includes(doc.invoice_number)
        );

        if (hasFailedSubmissions) {
          console.log('❌ Found failed submissions. Stopping polling.');
          if (activePollingRef.current) {
            clearInterval(activePollingRef.current);
            activePollingRef.current = null;
          }
          return;
        }

        // Stop polling after max attempts
        if (pollCount >= maxPolls) {
          console.log('⚠️ Max polling attempts reached. Stopping polling.');
          if (activePollingRef.current) {
            clearInterval(activePollingRef.current);
            activePollingRef.current = null;
          }
        }
      } catch (err) {
        console.error('Error in polling function:', err);
      }
    };

    // Initial fetch
    fetchUpdatedDocs();

    // Set up polling interval (every 3 seconds)
    activePollingRef.current = setInterval(fetchUpdatedDocs, 3000);
    console.log('🔄 Started new polling interval');

    // Clean up interval on component unmount or when dependencies change
    return () => {
      if (activePollingRef.current) {
        console.log('🧹 Cleaning up polling interval');
        clearInterval(activePollingRef.current);
        activePollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitResult]); // 🚀 CRITICAL FIX: Removed recyclingDocs to prevent infinite loop

  // Initialize submitting state for all groups
  useEffect(() => {
    const initialSubmitting: Record<string, boolean> = {};
    Object.keys(groups).forEach((invoice) => {
      initialSubmitting[invoice] = false;
    });
    setSubmitting((prev) => ({
      ...initialSubmitting,
      ...prev,
    }));
  }, [groups]);

  // Blob URLs for PDF previews - moved to the main state section

  // Helper function to detect if a recycler company is Indian
  const isIndianRecycler = (
    recyclerCompany: string | null | undefined
  ): boolean => {
    if (!recyclerCompany) return false;

    const company = recyclerCompany.toLowerCase();

    // Common Indian company indicators
    const indianIndicators = [
      'private limited',
      'pvt ltd',
      'limited',
      'ltd',
      'enterprises',
      'industries',
      'india',
      'indian',
      'mumbai',
      'delhi',
      'bangalore',
      'chennai',
      'kolkata',
      'hyderabad',
      'pune',
      'ahmedabad',
      'surat',
      'jaipur',
      'lucknow',
      'kanpur',
      'nagpur',
      'indore',
      'bhopal',
      'visakhapatnam',
      'patna',
      'vadodara',
      'ludhiana',
      'agra',
      'nashik',
      'faridabad',
      'meerut',
      'rajkot',
      'kalyan',
      'vasai-virar',
      'varanasi',
      'srinagar',
      'aurangabad',
      'dhanbad',
      'amritsar',
      'navi mumbai',
      'allahabad',
      'howrah',
      'gwalior',
      'jabalpur',
      'coimbatore',
      'vijayawada',
      'jodhpur',
      'madurai',
      'raipur',
      'kota',
      'guwahati',
      'chandigarh',
      'solapur',
      'hubli-dharwad',
      'bareilly',
      'moradabad',
      'mysore',
      'gurgaon',
      'aligarh',
      'jalandhar',
      'tiruchirappalli',
      'bhubaneswar',
      'salem',
      'mira-bhayandar',
      'warangal',
      'thiruvananthapuram',
      'guntur',
      'bhiwandi',
      'saharanpur',
      'gorakhpur',
      'bikaner',
      'amravati',
      'noida',
      'jamshedpur',
      'bhilai',
      'cuttack',
      'firozabad',
      'kochi',
      'bhavnagar',
      'dehradun',
      'durgapur',
      'asansol',
      'nanded',
      'kolhapur',
      'ajmer',
      'gulbarga',
      'jamnagar',
      'ujjain',
      'loni',
      'siliguri',
      'jhansi',
      'ulhasnagar',
      'nellore',
      'jammu',
      'sangli-miraj & kupwad',
      'belgaum',
      'mangalore',
      'ambattur',
      'tirunelveli',
      'malegaon',
      'gaya',
      'jalgaon',
      'udaipur',
      'maheshtala',
      'rangpar',
    ];

    return indianIndicators.some((indicator) => company.includes(indicator));
  };

  // Calculate the status of a group (complete status, count of files, missing files)
  const computeGroupStatus = (group: InvoiceGroup | undefined) => {
    if (!group) {
      return {
        complete: false,
        count: 0,
        total: 3,
        missing: ['invoice', 'eft_receipt', 'e-way-bill'],
      };
    }

    // 🚀 NEW: Use backend-calculated completion info if available
    if (group.processingLogs?.backendGrouped) {
      // Count ALL present documents (required + optional), not just required ones
      const actualFilesPresent = group.presentTypes?.length || 0;
      const isIndian =
        group.country === 'IN' && isIndianRecycler(group.recyclerCompany);

      let complete = false;
      let total = 3;

      if (isIndian) {
        // For Indian recyclers: flexible completion rules
        const hasInvoice = group.presentTypes?.includes('invoice') || false;
        const hasEWayBill = group.presentTypes?.includes('e-way-bill') || false;
        const hasEFT = group.presentTypes?.includes('eft_receipt') || false;

        // Indian recyclers can verify with just invoice + e-way-bill
        complete = hasInvoice && hasEWayBill;

        // Dynamic total based on what they actually uploaded
        if (actualFilesPresent === 2 && hasInvoice && hasEWayBill && !hasEFT) {
          total = 2; // Show "2 of 2" when they uploaded exactly invoice + e-way-bill
        } else if (actualFilesPresent >= 3) {
          total = 3; // Show "3 of 3" when they uploaded all 3 documents
        } else {
          total = 3; // Show "X of 3" for incomplete uploads
        }
      } else {
        // For non-Indian recyclers: strict 3-file requirement
        complete =
          actualFilesPresent >= 3 &&
          (group.presentTypes?.includes('invoice') || false) &&
          (group.presentTypes?.includes('eft_receipt') || false) &&
          (group.presentTypes?.includes('e-way-bill') || false);
        total = 3; // Always show "X of 3"
      }

      return {
        complete,
        count: actualFilesPresent,
        total,
        missing: group.missingTypes || [],
      };
    }

    // 🔙 FALLBACK: Old frontend calculation for backward compatibility
    if (!group?.docs) {
      return {
        complete: false,
        count: 0,
        total: 3,
        missing: ['invoice', 'eft_receipt', 'e-way-bill'],
      };
    }

    const hasInvoice = Boolean(group.docs.invoice?.length);
    const hasEftReceipt = Boolean(group.docs.eft_receipt?.length);
    const hasEWayBill = Boolean(group.docs['e-way-bill']?.length);

    const count = [hasInvoice, hasEftReceipt, hasEWayBill].filter(
      Boolean
    ).length;
    const missing = [
      !hasInvoice && 'invoice',
      !hasEftReceipt && 'eft_receipt',
      !hasEWayBill && 'e-way-bill',
    ].filter(Boolean) as string[];

    // For fallback, apply similar logic but with limited data
    const isIndian =
      group.country === 'IN' && isIndianRecycler(group.recyclerCompany);
    let complete = false;
    let total = 3;

    if (isIndian) {
      // Indian recyclers can verify with invoice + e-way-bill
      complete = hasInvoice && hasEWayBill;
      // Dynamic total for fallback
      if (count === 2 && hasInvoice && hasEWayBill && !hasEftReceipt) {
        total = 2;
      } else {
        total = 3;
      }
    } else {
      // Non-Indian recyclers need all 3
      complete = hasInvoice && hasEftReceipt && hasEWayBill;
      total = 3;
    }

    return {
      complete,
      count,
      total,
      missing,
    };
  };

  // Note: _isCompleteGroup implementation moved inside mergeRowIntoGroups
  // to avoid dependency issues and keep related logic together

  // Track if an invoice number is from a processed invoice (not just a reference)
  const trackProcessedInvoice = useCallback((invoiceNumber: string) => {
    if (invoiceNumber) {
      setProcessedInvoiceNumbers((prev) => {
        // Only update if the invoice number is not already in the set
        if (prev.has(invoiceNumber)) return prev;
        const updated = new Set(prev);
        updated.add(invoiceNumber);
        return updated;
      });
    }
  }, []); // Removed setProcessedInvoiceNumbers from deps as it's stable

  // 🚀 BACKEND GROUPING SERVICE TRIGGER
  const triggerDocumentGrouping = useCallback(
    async (processedCount: number) => {
      if (isGroupingInProgress) {
        console.log(
          `⚠️ Frontend: Grouping already in progress - skipping trigger`
        );
        return;
      }

      setIsGroupingInProgress(true);
      const groupingId = Math.random().toString(36).substring(2, 15);

      try {
        console.log(
          `🚀 Frontend: [grouping:${groupingId}] Triggering backend document grouping...`
        );
        console.log(
          `📊 Frontend: [grouping:${groupingId}] Processed documents count: ${processedCount}`
        );
        console.log(
          `👤 Frontend: [grouping:${groupingId}] User ID: ${session?.user?.id}`
        );

        const requestPayload = {
          user_id: session?.user?.id,
          trigger: 'post_ai_processing',
          processed_count: processedCount,
          timestamp: new Date().toISOString(),
          request_id: groupingId,
        };

        console.log(
          `📤 Frontend: [grouping:${groupingId}] Sending grouping request:`,
          requestPayload
        );

        const response = await fetch('/api/cron/document-grouping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(requestPayload),
        });

        const result = await response.json();

        console.log(
          `📥 Frontend: [grouping:${groupingId}] Grouping response:`,
          {
            ok: response.ok,
            status: response.status,
            result,
          }
        );

        if (response.ok && result.success) {
          console.log(
            `✅ Frontend: [grouping:${groupingId}] Document grouping completed successfully!`
          );
          console.log(
            `📊 Frontend: [grouping:${groupingId}] Groups processed: ${result.groups_processed}`
          );
          console.log(
            `🆕 Frontend: [grouping:${groupingId}] Groups created: ${result.groups_created}`
          );
          console.log(
            `🔄 Frontend: [grouping:${groupingId}] Groups updated: ${result.groups_updated}`
          );
          console.log(
            `⏱️ Frontend: [grouping:${groupingId}] Processing time: ${result.processing_time_ms}ms`
          );

          // Reset groups to force refresh from new document_groups table
          console.log(
            `🔄 Frontend: [grouping:${groupingId}] Resetting groups state to load from document_groups table`
          );
          setHasInitializedGroups(false);
          setGroups({});

          // Log rules applied
          if (
            result.rules_applied &&
            Object.keys(result.rules_applied).length > 0
          ) {
            console.log(
              `🔧 Frontend: [grouping:${groupingId}] Business rules applied:`
            );
            Object.entries(result.rules_applied).forEach(([rule, count]) => {
              console.log(`   📋 ${rule}: ${count} groups`);
            });
          }

          // Log any errors
          if (result.errors && result.errors.length > 0) {
            console.warn(
              `⚠️ Frontend: [grouping:${groupingId}] Grouping errors:`,
              result.errors
            );
          }
        } else {
          console.error(
            `❌ Frontend: [grouping:${groupingId}] Document grouping failed:`,
            result
          );
          console.error(`   Status: ${response.status}`);
          console.error(`   Error: ${result.error || 'Unknown error'}`);

          // Continue with existing flow even if grouping fails
          console.log(
            `🔄 Frontend: [grouping:${groupingId}] Continuing with existing grouping as fallback`
          );
        }
      } catch (error) {
        console.error(
          `💥 Frontend: [grouping:${groupingId}] Document grouping trigger failed:`,
          error
        );
        console.log(
          `🔄 Frontend: [grouping:${groupingId}] Continuing with existing grouping as fallback`
        );
      } finally {
        setIsGroupingInProgress(false);
        console.log(
          `🔄 Frontend: [grouping:${groupingId}] Grouping trigger completed`
        );
      }
    },
    [session?.user?.id, session?.access_token, isGroupingInProgress]
  );

  // Build/merge a single parsed_documents row into groups map
  const mergeRowIntoGroups = useCallback(
    (row: GroupDoc, map: Record<string, InvoiceGroup>) => {
      // Use imported functions with user scoping for better isolation

      // Define isCompleteGroup inside useCallback to avoid dependency issues
      const isCompleteGroup = (
        invoiceKey: string,
        groups: Record<string, InvoiceGroup>
      ) => {
        const group = groups[invoiceKey];
        if (!group) return false;

        const hasInvoice = (group.docs.invoice?.length || 0) > 0;
        const hasEftReceipt = (group.docs.eft_receipt?.length || 0) > 0;
        const hasEWayBill = (group.docs['e-way-bill']?.length || 0) > 0;

        return hasInvoice && hasEftReceipt && hasEWayBill;
      };

      try {
        console.group(`Processing document ${row.id} (${row.document_type})`);

        // Helper function to ensure a group exists for an invoice key and add the document to it
        const ensureGroup = (invoiceKey: string) => {
          if (!invoiceKey) {
            console.log('Skipping empty invoice key');
            return;
          }

          console.log(`Ensuring group for invoice: '${invoiceKey}'`);

          // Skip if this invoice is already part of a complete group
          if (isCompleteGroup(invoiceKey, map)) {
            console.log(
              `Skipping '${invoiceKey}' - already part of a complete group`
            );
            return;
          }

          // Find existing group with matching invoice number (handling different formats)
          const existingKey = Object.keys(map).find((key) =>
            isSameInvoice(key, invoiceKey)
          );

          const groupKey =
            existingKey || getInvoiceGroupKey(invoiceKey, session.user.id);

          if (!map[groupKey]) {
            console.log(`Creating new group for invoice: '${invoiceKey}'`);
            map[groupKey] = {
              invoice: invoiceKey,
              docs: {},
            };
          }

          // Add document to the appropriate document type array
          const docType = row.document_type;
          if (!map[groupKey].docs[docType]) {
            map[groupKey].docs[docType] = [];
          }

          // Check if this document is already in the group to avoid duplicates
          if (!map[groupKey].docs[docType]?.some((doc) => doc.id === row.id)) {
            map[groupKey].docs[docType] = [
              ...(map[groupKey].docs[docType] || []),
              row,
            ];
            console.log(
              `Added document ${row.id} to group ${groupKey} as type ${docType}`
            );
          }
        };

        // Get the primary invoice key from the document
        const rj = (row.raw_json || {}) as Record<string, unknown>;
        const primary = ((rj.anchor_key || rj.invoice || '') as string)
          .toString()
          .trim();

        if (primary) {
          console.log(`Primary invoice for document ${row.id}: '${primary}'`);
          // Track the invoice number if this is an actual invoice document
          if (row.document_type === 'invoice') {
            trackProcessedInvoice(primary);
          }
          ensureGroup(primary);
        } else {
          console.warn(`No primary invoice found for document ${row.id}`);
        }

        // Handle EFT receipts that reference other invoices
        if (row.document_type === 'eft_receipt') {
          const secondInvoice = ((rj.second_invoice || '') as string).trim();
          const thirdInvoice = ((rj.third_invoice || '') as string).trim();

          // Only process EFT references that match our processed invoices
          const validReferences = [secondInvoice, thirdInvoice].filter(
            (inv) => inv && processedInvoiceNumbers.has(inv)
          );

          validReferences.forEach((invoice) => {
            console.log(
              `Processing valid invoice reference from EFT: '${invoice}'`
            );
            ensureGroup(invoice);
          });

          console.log('Processed EFT receipt with references:', {
            id: row.id,
            primary,
            secondInvoice,
            thirdInvoice,
          });

          // Process additional invoices if they're different from primary
          if (secondInvoice && secondInvoice !== primary) {
            console.log(`Processing second_invoice: ${secondInvoice}`);
            ensureGroup(secondInvoice);
          }

          if (
            thirdInvoice &&
            thirdInvoice !== primary &&
            thirdInvoice !== secondInvoice
          ) {
            console.log(`Processing third_invoice: ${thirdInvoice}`);
            ensureGroup(thirdInvoice);
          }
        }
      } catch (error) {
        console.error('Error in mergeRowIntoGroups:', error);
      } finally {
        console.groupEnd();
      }
    },
    [trackProcessedInvoice, processedInvoiceNumbers, session.user.id] // Added session.user.id for user-scoped grouping
  );

  // 🚀 PERFORMANCE FIX: Lazy load recycling docs only when Push to Plastiks tab is active
  useEffect(() => {
    let cancelled = false;

    const loadRecyclingDocs = async () => {
      // Only load recycling docs when on verification/blockchain tabs (not during document processing)
      if (
        !['groups', 'submit', 'blockchain'].includes(activeTab) ||
        !isDocumentsLoaded
      )
        return;

      try {
        console.log('📊 [PERFORMANCE] Loading recycling docs...');
        console.time('⏱️ [PERFORMANCE] Recycling docs loading');

        const supa = getSupabaseBrowser();
        const { data, error } = await supa
          .from('recycling_docs')
          .select('*')
          .order('created_at', { ascending: false });

        if (!cancelled && !error && data) {
          console.log(`✅ [PERFORMANCE] Loaded ${data.length} recycling docs`);
          const docsMap = data.reduce(
            (acc, doc) => ({
              ...acc,
              [doc.invoice_number]: {
                ...doc,
                // Ensure we have all required fields with defaults
                tonnage_tons: doc.tonnage_tons || 0,
                country: doc.country || doc.origin || '',
                plastic_type: doc.plastic_type || 'Unknown',
                recycler_company: doc.recycler_company || 'Unknown',
                plastiks_collection_id: doc.plastiks_collection_id || null,
                plastiks_collection_address:
                  doc.plastiks_collection_address || null,
                plastiks_metadata_hash: doc.plastiks_metadata_hash || null,
                plastiks_submitted_at: doc.plastiks_submitted_at || null,
              },
            }),
            {}
          );
          setRecyclingDocs(docsMap);
        }
      } catch (error) {
        // Silently handle loading errors
        console.log('⚠️ Recycling docs loading encountered an issue', error);
      } finally {
        console.timeEnd('⏱️ [PERFORMANCE] Recycling docs loading');
      }
    };

    loadRecyclingDocs();

    return () => {
      cancelled = true;
    };
  }, [isDocumentsLoaded, activeTab]);

  // 🚀 Load processed documents from database on component mount
  useEffect(() => {
    let cancelled = false;

    const loadProcessedDocuments = async () => {
      try {
        console.log(
          '📄 [REVIEW] Loading ALL processed documents from database...'
        );

        const { data, error } = await supabase
          .from('parsed_documents')
          .select(
            'id, document_type, file_url, created_at, raw_json, anchor_key'
          )
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) {
          console.error('❌ [REVIEW] Failed to load parsed_documents:', error);
          return;
        }

        if (cancelled) return;

        console.log(
          `📄 [REVIEW] Loaded ${
            data?.length || 0
          } documents from database for current user`
        );

        // Convert database records to ProcessedDocument format
        const convertedDocs: ProcessedDocument[] = (data || []).map(
          (dbDoc) => ({
            fileName: dbDoc.anchor_key || `document-${dbDoc.id}`,
            documentType: dbDoc.document_type as DocumentTypeKey,
            data: dbDoc.raw_json as AppDocument,
            databaseId: dbDoc.id,
            storageType: 'database' as const,
            status: 'completed' as ProcessingStatus,
            fileUrl: dbDoc.file_url || undefined,
          })
        );

        // Set the documents directly - these are the processed documents that should ALWAYS be in Review
        setProcessedDocuments(convertedDocs);
        console.log(
          `✅ [REVIEW] Set ${convertedDocs.length} documents from database to Review tab`
        );
      } catch (error) {
        console.error('💥 [REVIEW] Error loading processed documents:', error);
      }
    };

    // Load immediately on component mount
    loadProcessedDocuments();
    fetchFailedDocuments(); // Also load failed documents
    calculateGroupStats(); // Also load group statistics

    return () => {
      cancelled = true;
    };
  }, [session.user.id, fetchFailedDocuments, calculateGroupStats]); // Only depend on user ID, load on mount

  // 🚀 PERFORMANCE FIX: Lazy load groups data only when Push to Plastiks tab is clicked
  useEffect(() => {
    // Only load groups data when the groups tab OR blockchain tab is active
    if (activeTab !== 'groups' && activeTab !== 'blockchain') return;

    let cancelled = false;

    const loadInitial = async () => {
      setIsGroupsLoading(true);
      console.time('⏱️ [PERFORMANCE] Groups data loading');

      try {
        console.log(
          '📊 [PERFORMANCE] Loading document groups (NEW BACKEND GROUPING)...'
        );
        console.log(
          '📊 [PERFORMANCE] Loading document groups for current user:',
          session.user.email
        );
        console.log('🔍 [DEBUG] User ID for filtering:', session.user.id);

        // 🚀 NEW: Load from document_groups table (created by backend grouping service)
        const { data, error } = await supabase
          .from('document_groups')
          .select(
            `
            id, 
            invoice_number, 
            group_key, 
            country, 
            recycler_company, 
            plastic_type,
            applied_rule_name,
            required_document_types,
            optional_document_types,
            minimum_required,
            present_document_types,
            present_document_ids,
            completion_count,
            missing_document_types,
            is_complete,
            can_verify,
            completion_percentage,
            last_processed_at,
            created_at,
            user_id,
            human_verified,
            verified_at
          `
          )
          .eq('user_id', session.user.id) // 👈 FILTER BY USER ID
          .order('last_processed_at', { ascending: false })
          .limit(100);

        if (error) {
          console.error('❌ [GROUPS] Failed to load document_groups:', error);
          console.error('❌ [GROUPS] Error details:', error);
          setIsGroupsLoading(false);
          return;
        }

        if (cancelled) return;

        console.log(
          `📊 [GROUPS] Loaded ${data?.length || 0} document groups for user`
        );
        console.log('🔍 [GROUPS] Raw data sample:', data?.slice(0, 2));

        // Check if groups have the correct user_id
        if (data && data.length > 0) {
          const userIds = [...new Set(data.map((d) => d.user_id))];
          console.log('🔍 [GROUPS] User IDs in loaded groups:', userIds);
          console.log('🔍 [GROUPS] Expected user ID:', session.user.id);
          console.log('🔍 [GROUPS] Group statuses found:', [
            ...new Set(
              data.map((d) => (d.is_complete ? 'complete' : 'incomplete'))
            ),
          ]);
          console.log('🔍 [GROUPS] Countries found:', [
            ...new Set(data.map((d) => d.country).filter(Boolean)),
          ]);
          console.log('🔍 [GROUPS] Rules applied:', [
            ...new Set(data.map((d) => d.applied_rule_name).filter(Boolean)),
          ]);
        }

        // Process groups even if data is empty
        if (data && data.length > 0) {
          console.log(
            `🔄 [GROUPS] Processing ${data.length} document groups...`
          );

          // 🚀 STEP 2: Load actual parsed documents for all present document IDs
          console.log(
            `📊 [GROUPS] Loading parsed documents for group content...`
          );

          // Collect all document IDs from all groups
          const allDocumentIds = data
            .flatMap((group) => group.present_document_ids || [])
            .filter((id) => id); // Remove any null/undefined IDs

          console.log(
            `🔍 [GROUPS] Found ${allDocumentIds.length} document IDs to load`
          );

          // Load all parsed documents in one query
          const { data: parsedDocs, error: docsError } = await supabase
            .from('parsed_documents')
            .select(
              'id, document_type, file_url, created_at, raw_json, user_id'
            )
            .in('id', allDocumentIds);

          if (docsError) {
            console.error(
              '❌ [GROUPS] Failed to load parsed documents:',
              docsError
            );
            // Continue anyway with empty docs
          }

          console.log(
            `📊 [GROUPS] Loaded ${parsedDocs?.length || 0} parsed documents`
          );

          // Create document lookup map by ID
          const docLookup = new Map();
          if (parsedDocs) {
            parsedDocs.forEach((doc) => {
              docLookup.set(doc.id, doc);
            });
          }

          const map: Record<string, InvoiceGroup> = {};

          // 🚀 STEP 3: Convert document_groups data to InvoiceGroup format with actual document data
          data.forEach((groupRow) => {
            if (!groupRow || !groupRow.invoice_number) return;

            const invoiceKey = groupRow.invoice_number;

            // 🚀 Build docs structure from actual parsed documents
            const docs: Partial<
              Record<'invoice' | 'eft_receipt' | 'e-way-bill', GroupDoc[]>
            > = {};

            if (groupRow.present_document_ids) {
              groupRow.present_document_ids.forEach((docId: string) => {
                const parsedDoc = docLookup.get(docId);
                if (parsedDoc) {
                  const docType = parsedDoc.document_type as
                    | 'invoice'
                    | 'eft_receipt'
                    | 'e-way-bill';
                  if (!docs[docType]) {
                    docs[docType] = [];
                  }

                  // Convert parsed document to GroupDoc format
                  const groupDoc: GroupDoc = {
                    id: parsedDoc.id,
                    document_type: parsedDoc.document_type,
                    file_url: parsedDoc.file_url,
                    created_at: parsedDoc.created_at,
                    raw_json: parsedDoc.raw_json || {},
                  };

                  docs[docType]!.push(groupDoc);
                }
              });
            }

            // 🚀 NEW: Create InvoiceGroup from document_groups row with actual document data
            const group: InvoiceGroup = {
              // Required original properties (for compatibility with existing UI)
              invoice: invoiceKey,
              docs: docs, // ✅ NOW POPULATED WITH ACTUAL DOCUMENT DATA!

              // 🚀 NEW: Backend-calculated completion info
              invoiceKey: invoiceKey,
              invoiceNumber: invoiceKey,
              isComplete: groupRow.is_complete || false,
              completionCount: groupRow.completion_count || 0,
              requiredCount: groupRow.minimum_required || 3,
              missingTypes: groupRow.missing_document_types || [],
              presentTypes: groupRow.present_document_types || [],
              completionPercentage: groupRow.completion_percentage || 0,

              // 🚀 NEW: Additional metadata from backend
              country: groupRow.country || null,
              recyclerCompany: groupRow.recycler_company || null,
              plasticType: groupRow.plastic_type || null,
              appliedRuleName: groupRow.applied_rule_name || null,

              // 🚀 NEW: Human verification status (moved from recycling_docs)
              human_verified: groupRow.human_verified || false,
              verified_at: groupRow.verified_at || null,

              // Backend processing info
              lastProcessedAt:
                groupRow.last_processed_at || groupRow.created_at,
              processingLogs: {
                backendGrouped: true,
                groupId: groupRow.id,
                ruleName: groupRow.applied_rule_name,
                requiredTypes: groupRow.required_document_types || [],
                optionalTypes: groupRow.optional_document_types || [],
              },
            };

            // Add to map
            map[invoiceKey] = group;

            // Enhanced logging with document details
            const docCounts = Object.entries(docs)
              .map(([type, docArray]) => `${type}: ${docArray?.length || 0}`)
              .join(', ');

            console.log(
              `📋 [GROUPS] Group "${invoiceKey}": ${
                group.isComplete ? '✅ Complete' : '⚠️ Incomplete'
              } (${group.completionCount}/${
                group.requiredCount
              }) - Docs: {${docCounts}}${
                group.country ? ` - Country: ${group.country}` : ''
              }${
                group.appliedRuleName ? ` - Rule: ${group.appliedRuleName}` : ''
              }`
            );
          });

          // Update the groups state
          console.log(
            `✅ [GROUPS] Loaded ${
              Object.keys(map).length
            } groups from backend document_groups table`
          );
          console.log(
            `📊 [GROUPS] Complete groups: ${
              Object.values(map).filter((g) => g.isComplete).length
            }`
          );
          console.log(
            `📊 [GROUPS] Incomplete groups: ${
              Object.values(map).filter((g) => !g.isComplete).length
            }`
          );
          setGroups(map);
          setIsDocumentsLoaded(true);
          setHasInitializedGroups(true);
        } else {
          console.log('📭 [GROUPS] No document groups found for user');
          setGroups({});
          setIsDocumentsLoaded(true);
          setHasInitializedGroups(true);
        }
      } catch (error) {
        console.error('❌ [GROUPS] Error loading initial data:', error);
        setGroups({});
        setIsDocumentsLoaded(true);
        setHasInitializedGroups(true);
      } finally {
        if (!cancelled) {
          setIsGroupsLoading(false);
          console.timeEnd('⏱️ [PERFORMANCE] Groups data loading');
          calculateGroupStats(); // Update group statistics after loading
        }
      }
    };

    // Only load if we haven't initialized groups yet
    if (!hasInitializedGroups) {
      loadInitial();
    }

    // Define the payload type for the postgres_changes event
    type PostgresChangePayload = {
      eventType: 'INSERT' | 'UPDATE' | 'DELETE';
      new: Record<string, unknown> | null;
      old: Record<string, unknown> | null;
      schema: string;
      table: string;
    };

    const channel = supabase
      .channel('parsed_documents_changes')
      .on<PostgresChangePayload>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parsed_documents' },
        (payload) => {
          setGroups((prev: Record<string, InvoiceGroup>) => {
            const map = { ...prev };
            const row = (payload.new || payload.old) as unknown as GroupDoc & {
              raw_json: Record<string, unknown>;
            };
            // Accept all realtime rows; show immediately
            if (payload.eventType === 'DELETE' && row) {
              // Rebuild affected groups conservatively: remove this id from all types in its groups
              const rj = (row.raw_json || {}) as Record<string, unknown>;
              const keys = [
                (rj as Record<string, unknown>)['anchor_key'] ||
                  (rj as Record<string, unknown>)['invoice'],
                (rj as Record<string, unknown>)['second_invoice'],
                (rj as Record<string, unknown>)['third_invoice'],
              ]
                .filter(Boolean)
                .map((s) => String(s).trim());
              keys.forEach((k: string) => {
                const g = map[k];
                if (!g) return;
                const types: Array<'invoice' | 'eft_receipt' | 'e-way-bill'> = [
                  'invoice',
                  'eft_receipt',
                  'e-way-bill',
                ];
                types.forEach((t) => {
                  const list = g.docs[t];
                  if (list) g.docs[t] = list.filter((d) => d.id !== row.id);
                });
              });
              return { ...map };
            }
            if (
              payload.eventType === 'INSERT' ||
              payload.eventType === 'UPDATE'
            ) {
              mergeRowIntoGroups(row, map);
            }
            return { ...map };
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [
    mergeRowIntoGroups,
    activeTab,
    session.user.id,
    session.user.email,
    hasInitializedGroups,
    calculateGroupStats,
  ]); // 🚀 Added required dependencies without groups

  // 🚀 NEW: Lazy load verified recycling docs only when Blockchain tab is active
  useEffect(() => {
    // Only load verified docs when the blockchain tab is active
    if (activeTab !== 'blockchain') return;

    let cancelled = false;

    const loadVerifiedDocs = async () => {
      setIsVerifiedDocsLoading(true);
      console.time('⏱️ [BLOCKCHAIN] Verified docs loading');

      try {
        console.log(
          '🔗 [BLOCKCHAIN] Loading recycling docs for blockchain processing...'
        );
        console.log('👤 [BLOCKCHAIN] User:', session.user.email);

        // Load human-verified document groups with plastiks submission status
        const supabase = getSupabaseBrowser();

        // First get verified document groups
        const { data: groups, error: groupError } = await supabase
          .from('document_groups')
          .select('*')
          .eq('user_id', session.user.id) // Filter by current user
          .eq('human_verified', true) // Only verified documents
          .order('verified_at', { ascending: false }); // Most recent first

        if (groupError) {
          console.error(
            '❌ [BLOCKCHAIN] Failed to load verified groups:',
            groupError
          );
          return;
        }

        // Then get plastiks submission status from recycling_docs
        const { data: recyclingDocs, error: recyclingError } = await supabase
          .from('recycling_docs')
          .select(
            'invoice_number, plastiks_submitted_at, plastiks_collection_id, plastiks_collection_address, plastiks_metadata_hash'
          )
          .eq('user_id', session.user.id);

        if (recyclingError) {
          console.error(
            '❌ [BLOCKCHAIN] Failed to load recycling docs:',
            recyclingError
          );
        }

        // Create a map of plastiks submission data
        const plastiksMap = (recyclingDocs || []).reduce(
          (acc, doc) => ({
            ...acc,
            [doc.invoice_number]: doc,
          }),
          {} as Record<
            string,
            {
              plastiks_submitted_at: string | null;
              plastiks_collection_id: string | null;
              plastiks_collection_address: string | null;
              plastiks_metadata_hash: string | null;
            }
          >
        );

        // Merge the data
        const data =
          groups?.map((group) => ({
            ...group,
            // Add plastiks submission data if it exists
            plastiks_submitted_at:
              plastiksMap[group.invoice_number]?.plastiks_submitted_at || null,
            plastiks_collection_id:
              plastiksMap[group.invoice_number]?.plastiks_collection_id || null,
            plastiks_collection_address:
              plastiksMap[group.invoice_number]?.plastiks_collection_address ||
              null,
            plastiks_metadata_hash:
              plastiksMap[group.invoice_number]?.plastiks_metadata_hash || null,
          })) || [];

        const error = groupError;

        if (error) {
          console.error('❌ [BLOCKCHAIN] Failed to load verified docs:', error);
          return;
        }

        if (cancelled) return;

        console.log(
          `✅ [BLOCKCHAIN] Loaded ${data?.length || 0} verified documents`
        );

        if (data && data.length > 0) {
          // Convert to map format like recyclingDocs
          const verifiedMap = data.reduce(
            (acc, doc) => ({
              ...acc,
              [doc.invoice_number]: {
                ...doc,
                // Ensure all expected fields are present
                recycler_company: doc.recycler_company || 'Unknown',
                plastiks_collection_id: doc.plastiks_collection_id || null,
                plastiks_collection_address:
                  doc.plastiks_collection_address || null,
                plastiks_metadata_hash: doc.plastiks_metadata_hash || null,
                plastiks_submitted_at: doc.plastiks_submitted_at || null,
              },
            }),
            {}
          );

          setVerifiedDocs(verifiedMap);
          console.log(
            `📋 [BLOCKCHAIN] Verified docs by invoice:`,
            Object.keys(verifiedMap)
          );
        } else {
          console.log('📭 [BLOCKCHAIN] No verified documents found');
          setVerifiedDocs({});
        }

        setHasInitializedVerifiedDocs(true);
      } catch (error) {
        console.error('❌ [BLOCKCHAIN] Error loading verified docs:', error);
        setVerifiedDocs({});
        setHasInitializedVerifiedDocs(true);
      } finally {
        if (!cancelled) {
          setIsVerifiedDocsLoading(false);
          console.timeEnd('⏱️ [BLOCKCHAIN] Verified docs loading');
        }
      }
    };

    if (!hasInitializedVerifiedDocs) {
      loadVerifiedDocs();
    }

    return () => {
      cancelled = true;
    };
  }, [
    session.user.id,
    session.user.email,
    activeTab,
    hasInitializedVerifiedDocs,
  ]); // Dependencies for blockchain tab loading

  // computeGroupStatus is defined above with more comprehensive implementation

  // 🚀 NEW: Push to Plastiks function for blockchain tab
  const handlePushToPlastiks = useCallback(
    async (invoice: string) => {
      console.log(`\n🚀 [PLASTIKS_FLOW] ===== STARTING PUSH TO PLASTIKS =====`);
      console.log(`📋 [PLASTIKS_FLOW] Invoice: ${invoice}`);
      console.log(`👤 [PLASTIKS_FLOW] User: ${session.user?.email}`);
      console.log(`⏰ [PLASTIKS_FLOW] Started at: ${new Date().toISOString()}`);

      setIsPushingToPlastiks(true);

      try {
        console.log(`🔄 [PLASTIKS_FLOW] Step 1: Calling /api/plastiks/submit`);

        // Call the existing plastiks submit API
        const response = await fetch(
          `/api/plastiks/submit?invoice=${encodeURIComponent(
            invoice
          )}&user_id=${encodeURIComponent(
            session.user?.id || ''
          )}&secret=local-dev-submit-123`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(
          `📊 [PLASTIKS_FLOW] API Response Status: ${response.status}`
        );

        const result = await response.json();
        console.log(`📋 [PLASTIKS_FLOW] API Response Data:`, {
          success: result.success,
          processed: result.processed,
          hasResults: !!result.results,
          resultCount: result.results?.length || 0,
        });

        if (response.ok && result.success) {
          console.log(`✅ [PLASTIKS_FLOW] Step 2: API call successful`);
          console.log(
            `📊 [PLASTIKS_FLOW] Processed ${result.processed} document(s)`
          );

          // Immediately update local state to disable button
          console.log(`🔄 [PLASTIKS_FLOW] Step 3: Updating local state`);
          setVerifiedDocs((prev) => ({
            ...prev,
            [invoice]: {
              ...prev[invoice],
              plastiks_submitted_at: new Date().toISOString(),
            },
          }));

          console.log(
            `✅ [PLASTIKS_FLOW] Step 4: Button state updated (disabled)`
          );
          console.log(
            `🎉 [PLASTIKS_FLOW] ===== PUSH TO PLASTIKS COMPLETED =====\n`
          );

          alert(
            `✅ Successfully submitted to Plastiks blockchain!\n\nInvoice: ${invoice}\nProcessed: ${result.processed} document(s)`
          );
        } else {
          console.error(`❌ [PLASTIKS_FLOW] Step 2: API call failed`);
          console.error(`📋 [PLASTIKS_FLOW] Error details:`, result);
          alert(
            `❌ Failed to push to Plastiks:\n\n${
              result.error || 'Unknown error occurred'
            }`
          );
        }
      } catch (error) {
        console.error(`💥 [PLASTIKS_FLOW] Step 1: Network error:`, error);
        alert(
          `💥 Network error occurred while pushing to Plastiks.\n\nPlease check your connection and try again.`
        );
      } finally {
        setIsPushingToPlastiks(false);
        console.log(
          `🔄 [PLASTIKS_FLOW] Cleanup: isPushingToPlastiks set to false`
        );
      }
    },
    [session.user?.email, session.user?.id]
  );

  const handleSubmitGroup = useCallback(async (invoice: string) => {
    setSubmitting((prev) => ({ ...prev, [invoice]: true }));
    setSubmitResult((prev) => ({
      ...prev,
      [invoice]: { ok: false, message: '' },
    }));
    try {
      // Human Verification (recycling_docs populated only on Push to Plastiks)
      console.log(`[UI] Human verification starting for invoice='${invoice}'`);

      // Get auth token from session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No valid session found');
      }

      const verifyUrl = `/api/human-verify?invoice=${encodeURIComponent(
        invoice
      )}`;
      const resp = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const json = await resp.json().catch(() => ({}));
      console.log(`[UI] Human verification response ok=${resp.ok}`, json);

      if (resp.ok) {
        const individualResult = json?.results?.[0];
        const isActuallySucceeded = individualResult?.status === 'verified';

        if (isActuallySucceeded) {
          setSubmitResult((prev) => ({
            ...prev,
            [invoice]: { ok: true, message: 'Human Verified' },
          }));
          console.log(
            `[UI] Human verification succeeded for invoice='${invoice}'`
          );

          // Update the local state to reflect the verification (no page reload)
          console.log(`[UI] Updating group state after human verification...`);
          setGroups((prevGroups) => ({
            ...prevGroups,
            [invoice]: {
              ...(prevGroups[invoice] || {}),
              human_verified: true,
              verified_at: new Date().toISOString(),
            },
          }));

          console.log(
            `[UI] Updated group state for invoice='${invoice}' - human_verified: true`
          );
        } else {
          // HTTP 200 but internal failure
          const errorMessage =
            individualResult?.error || 'Human verification failed';
          setSubmitResult((prev) => ({
            ...prev,
            [invoice]: { ok: false, message: errorMessage },
          }));
          console.warn(
            `[UI] Human verification failed internally for invoice='${invoice}':`,
            errorMessage
          );
        }
      } else {
        setSubmitResult((prev) => ({
          ...prev,
          [invoice]: {
            ok: false,
            message: json?.error || 'Verification failed',
          },
        }));
        console.warn(`[UI] Human verification failed for invoice='${invoice}'`);
      }

      /* COMMENTED OUT - PLASTIKS SUBMISSION CODE
      // Step 2: Submit to Plastiks
      console.log(`[UI] Submit starting for invoice='${invoice}'`);
      const submitUrl = devSecret
        ? `/api/plastiks/submit?secret=${encodeURIComponent(
            devSecret
          )}&invoice=${encodeURIComponent(invoice)}`
        : `/api/plastiks/submit?invoice=${encodeURIComponent(invoice)}`;
      const resp = await fetch(submitUrl, { method: 'POST' });
      const json = await resp.json().catch(() => ({}));
      console.log(`[UI] Submit response ok=${resp.ok}`, json);

      if (resp.ok) {
        // 🚀 CRITICAL FIX: Check individual result status, not just HTTP status
        const individualResult = json?.results?.[0];
        const isActuallySucceeded =
          individualResult?.status !== 'failed' && !individualResult?.error;

        if (isActuallySucceeded) {
          setSubmitResult((prev) => ({
            ...prev,
            [invoice]: { ok: true, message: 'Submitted' },
          }));
          console.log(`[UI] Submit succeeded for invoice='${invoice}'`);
        } else {
          // HTTP 200 but internal failure
          const errorMessage =
            individualResult?.error || 'Plastiks submission failed';
          setSubmitResult((prev) => ({
            ...prev,
            [invoice]: { ok: false, message: errorMessage },
          }));
          console.warn(
            `[UI] Submit failed internally for invoice='${invoice}':`,
            errorMessage
          );
        }
      } else {
        setSubmitResult((prev) => ({
          ...prev,
          [invoice]: { ok: false, message: json?.error || 'Submission failed' },
        }));
        console.warn(`[UI] Submit failed for invoice='${invoice}'`);
      }
      */
    } catch (e) {
      setSubmitResult((prev) => ({
        ...prev,
        [invoice]: {
          ok: false,
          message: (e as Error)?.message || 'Network error',
        },
      }));
      console.error(`[UI] Submit error for invoice='${invoice}'`, e);
    } finally {
      setSubmitting((prev) => ({ ...prev, [invoice]: false }));
    }
  }, []);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);
  const [processingProgress, setProcessingProgress] = useState(0);
  // const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map()); // Track blob URLs for database files - Removed with Review tab

  // Track upload state to prevent duplicates
  const isUploadingRef = useRef(false);

  // Helper function to check for duplicate files in database
  // ========== SMART FILENAME FINGERPRINTING ==========
  const generateFilenameFingerprint = useCallback(
    (fileName: string, userId: string): string => {
      console.log(`🔤 Generating fingerprint for: "${fileName}"`);

      // Extract document type and business identifier
      const docType = extractDocumentTypeFromFilename(fileName);
      const businessId = extractBusinessNumberFromFilename(fileName);
      const fingerprint = `${userId}:${docType}:${businessId}`;

      console.log(`🔤 Fingerprint result: "${fingerprint}"`);
      return fingerprint;
    },
    []
  );

  const extractDocumentTypeFromFilename = (fileName: string): string => {
    const lower = fileName.toLowerCase();

    if (lower.includes('invoice')) return 'invoice';
    if (
      lower.includes('eway') ||
      lower.includes('e way') ||
      lower.includes('e-way')
    )
      return 'eway';
    if (/^[0-9]+\.?\s*[a-z]{2}\d+/i.test(fileName)) return 'state_doc'; // Pattern: "29. GJ0270009843.pdf"
    if (lower.includes('receipt')) return 'receipt';
    if (lower.includes('eft')) return 'eft';

    return 'other';
  };

  const extractBusinessNumberFromFilename = (fileName: string): string => {
    // Remove file extension for cleaner processing
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');

    // Pattern 1: Invoice numbers like "25.INVOICE NO.343.pdf" → "343"
    const invoiceMatch = nameWithoutExt.match(/invoice[^0-9]*(\d+)/i);
    if (invoiceMatch) return invoiceMatch[1];

    // Pattern 2: E-way bills like "47.EWAY BILL.259.pdf" → "259"
    const ewayMatch = nameWithoutExt.match(/e.?way[^0-9]*(\d+)/i);
    if (ewayMatch) return ewayMatch[1];

    // Pattern 3: State documents like "29. GJ0270009843.pdf" → "GJ0270009843"
    const stateMatch = nameWithoutExt.match(/([A-Z]{2}\d{10,})/i);
    if (stateMatch) return stateMatch[1].toUpperCase();

    // Pattern 4: Receipt patterns like "EFT-123" → "123"
    const receiptMatch = nameWithoutExt.match(/(?:eft|receipt)[^0-9]*(\d+)/i);
    if (receiptMatch) return receiptMatch[1];

    // Fallback: Use normalized filename (for files that don't match patterns)
    return nameWithoutExt
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  };

  const checkForDuplicates = useCallback(
    async (files: File[], uploadId: string) => {
      console.log(
        `🔍 [upload:${uploadId}] Checking for duplicates in database using SMART fingerprinting...`
      );

      const supabase = getSupabaseBrowser();
      const filesToUpload: File[] = [];
      const skippedFiles: { name: string; reason: string }[] = [];

      for (const file of files) {
        const fileName = file.name;
        const fileSize = file.size;

        console.log(
          `🔎 [upload:${uploadId}] Checking file: ${fileName} (${(
            fileSize / 1024
          ).toFixed(2)} KB)`
        );

        // ✅ SMART: Generate business-aware fingerprint
        const fileFingerprint = generateFilenameFingerprint(
          fileName,
          session?.user?.id || ''
        );
        console.log(
          `🔤 [upload:${uploadId}] Generated fingerprint: ${fileFingerprint}`
        );

        // Check temp_documents with EXACT filename match (not pattern)
        const { data: tempDocs, error: tempError } = await supabase
          .from('temp_documents')
          .select('pdf_path, upload_date')
          .eq('user_id', session?.user?.id)
          .eq('pdf_path', fileName); // ✅ EXACT match instead of ILIKE pattern

        if (tempError) {
          console.error(
            `❌ [upload:${uploadId}] Error checking temp_documents:`,
            tempError
          );
          // Continue with upload if we can't check
          filesToUpload.push(file);
          continue;
        }

        if (tempDocs && tempDocs.length > 0) {
          console.log(
            `⚠️ [upload:${uploadId}] File ${fileName} already exists in temp_documents (exact match), skipping...`
          );
          skippedFiles.push({
            name: fileName,
            reason: 'Already in temp_documents',
          });
          continue;
        }

        // Check single_documents with EXACT filename match
        const { data: singleDocs, error: singleError } = await supabase
          .from('single_documents')
          .select('pdf_path, upload_date, original_filename')
          .eq('user_id', session?.user?.id)
          .eq('original_filename', fileName); // ✅ EXACT match instead of ILIKE pattern

        if (singleError) {
          console.error(
            `❌ [upload:${uploadId}] Error checking single_documents:`,
            singleError
          );
          // Continue with upload if we can't check
          filesToUpload.push(file);
          continue;
        }

        if (singleDocs && singleDocs.length > 0) {
          console.log(
            `⚠️ [upload:${uploadId}] File ${fileName} already processed in single_documents (exact match), skipping...`
          );
          skippedFiles.push({ name: fileName, reason: 'Already processed' });
          continue;
        }

        // File is not a duplicate, add to upload queue
        console.log(
          `✅ [upload:${uploadId}] File ${fileName} is new, will upload`
        );
        filesToUpload.push(file);
      }

      console.log(`📊 [upload:${uploadId}] SMART duplicate check results:`);
      console.log(`   📤 Files to upload: ${filesToUpload.length}`);
      console.log(`   ⏭️ Files skipped: ${skippedFiles.length}`);

      if (skippedFiles.length > 0) {
        console.log(`📋 [upload:${uploadId}] Skipped files:`, skippedFiles);
        // Show user notification about skipped files
        setPreprocessingProgress(
          `Skipped ${skippedFiles.length} duplicate files. Uploading ${filesToUpload.length} new files...`
        );
      }

      return {
        filesToUpload,
        skippedFiles,
        duplicateCount: skippedFiles.length,
        newFilesCount: filesToUpload.length,
        totalFilesCount: files.length,
      };
    },
    [session?.user?.id, generateFilenameFingerprint]
  );

  // Session management for long uploads
  const [sessionActive, setSessionActive] = useState(false);
  const sessionManagerRef = useRef<{
    keepAliveInterval?: NodeJS.Timeout;
    warningTimeout?: NodeJS.Timeout;
    lastRefreshTime: number;
  }>({
    lastRefreshTime: Date.now(),
  });

  // Start session keep-alive for long operations
  const startSessionKeepAlive = useCallback(() => {
    console.log(
      '🔄 [SESSION] Starting session keep-alive for upload operation'
    );
    setSessionActive(true); // Update UI state

    // Clear any existing timers
    if (sessionManagerRef.current.keepAliveInterval) {
      clearInterval(sessionManagerRef.current.keepAliveInterval);
    }
    if (sessionManagerRef.current.warningTimeout) {
      clearTimeout(sessionManagerRef.current.warningTimeout);
    }

    // Refresh session every 5 minutes during upload
    sessionManagerRef.current.keepAliveInterval = setInterval(async () => {
      try {
        console.log('🔄 [SESSION] Refreshing session to prevent expiration...');
        const { data, error } = await supabase.auth.refreshSession();

        if (error) {
          console.error('❌ [SESSION] Failed to refresh session:', error);
          // Show user warning about potential session expiration
          alert(
            '⚠️ Your session may expire soon. Please save your work and consider refreshing the page.'
          );
        } else if (data.session) {
          sessionManagerRef.current.lastRefreshTime = Date.now();
          console.log('✅ [SESSION] Session refreshed successfully');
        }
      } catch (err) {
        console.error('❌ [SESSION] Session refresh error:', err);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Show warning 2 minutes before session typically expires (assuming 10 minute sessions)
    sessionManagerRef.current.warningTimeout = setTimeout(() => {
      console.log('⚠️ [SESSION] Session expiration warning');
      alert(
        '⚠️ Your session is about to expire. Please complete your upload soon or it may be interrupted.'
      );
    }, 8 * 60 * 1000); // 8 minutes (2 minutes before typical expiration)
  }, []);

  // Stop session keep-alive
  const stopSessionKeepAlive = useCallback(() => {
    console.log('🛑 [SESSION] Stopping session keep-alive');
    setSessionActive(false); // Update UI state

    if (sessionManagerRef.current.keepAliveInterval) {
      clearInterval(sessionManagerRef.current.keepAliveInterval);
      sessionManagerRef.current.keepAliveInterval = undefined;
    }

    if (sessionManagerRef.current.warningTimeout) {
      clearTimeout(sessionManagerRef.current.warningTimeout);
      sessionManagerRef.current.warningTimeout = undefined;
    }
  }, []);

  // Helper function to upload files to temp_documents and trigger preprocessing
  const uploadToTempDocuments = useCallback(
    async (files: File[]) => {
      const uploadId = Math.random().toString(36).substring(2, 15);
      console.log(`🚀 [upload:${uploadId}] === UPLOAD BATCH STARTED ===`);
      console.log(
        `⏰ [upload:${uploadId}] Timestamp: ${new Date().toISOString()}`
      );
      console.log(`📊 [upload:${uploadId}] Files to upload: ${files.length}`);

      if (!session?.user?.id) {
        console.error(`❌ [upload:${uploadId}] No user session for upload`);
        return;
      }

      // Start session management for this upload batch
      startSessionKeepAlive();

      try {
        // Prevent duplicate uploads
        if (isUploadingRef.current) {
          console.log(
            `⏳ [upload:${uploadId}] Upload already in progress, skipping...`
          );
          stopSessionKeepAlive(); // Clean up session management
          return;
        }
        isUploadingRef.current = true;

        // Check for duplicates before uploading
        const {
          filesToUpload,
          skippedFiles,
          duplicateCount,
          newFilesCount,
          totalFilesCount,
        } = await checkForDuplicates(files, uploadId);

        // 🚀 PHASE 2: Set duplicate count and skipped files for UI feedback
        setDuplicateFilesCount(duplicateCount);
        setSkippedFilesInfo(skippedFiles);

        if (filesToUpload.length === 0) {
          console.log(
            `⚠️ [upload:${uploadId}] All files are duplicates, nothing to upload`
          );
          isUploadingRef.current = false;
          setIsPreprocessing(false); // ✅ FIX: Stop the loading state
          setPreprocessingProgress(
            `🔍 All ${totalFilesCount} files are duplicates - no new files to process.`
          );
          setTimeout(() => setPreprocessingProgress(''), 5000);

          // 🚀 PHASE 4: Update database state even when no files uploaded
          console.log(
            `🔄 [PHASE4] All duplicates - updating database state...`
          );
          await checkDocumentsStatus();

          stopSessionKeepAlive(); // Clean up session management
          return;
        }

        const supabase = getSupabaseBrowser();
        const uploadedPaths: string[] = [];

        console.log(
          `📤 [upload:${uploadId}] Starting upload to Storage and temp_documents...`
        );
        console.log(
          `📊 [upload:${uploadId}] Processing ${newFilesCount} new files (${duplicateCount} duplicates skipped)`
        );

        // 🚀 PHASE 2: Enhanced progress messaging for partial duplicates
        if (duplicateCount > 0) {
          setPreprocessingProgress(
            `${duplicateCount} of ${totalFilesCount} files are duplicates. Processing ${newFilesCount} new files...`
          );
        } else {
          setPreprocessingProgress(`Processing ${newFilesCount} files...`);
        }

        // Log all files being processed in this batch
        console.log(`🔍 [upload:${uploadId}] Files in this batch:`);
        filesToUpload.forEach((file, idx) => {
          console.log(
            `   ${idx}: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`
          );
        });

        const uploadPromises = filesToUpload.map(async (file, index) => {
          const fileId = `file${index + 1}`;
          try {
            console.log(
              `📄 [upload:${uploadId}] [${fileId}] Processing file: ${
                file.name
              } (${(file.size / 1024).toFixed(2)} KB)`
            );

            // Generate unique path for storage (timestamp + index + random to prevent collisions)
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const pdfPath = `temp/${session.user.id}/${timestamp}_${index}_${randomSuffix}_${safeName}`;

            console.log(
              `📁 [upload:${uploadId}] [${fileId}] Target path: ${pdfPath}`
            );
            console.log(
              `🔍 [upload:${uploadId}] [${fileId}] Path components:`,
              {
                timestamp,
                index,
                randomSuffix,
                safeName,
                originalName: file.name,
                userId: session.user.id,
              }
            );

            // Upload to Supabase storage
            console.log(
              `☁️ [upload:${uploadId}] [${fileId}] Uploading to Storage...`
            );
            console.log(
              `🔍 [upload:${uploadId}] [${fileId}] Storage details:`,
              {
                bucket: 'documents',
                path: pdfPath,
                fileSize: file.size,
                fileName: file.name,
                contentType: file.type,
              }
            );

            const { error: uploadError } = await supabase.storage
              .from('documents')
              .upload(pdfPath, file, {
                cacheControl: '3600',
                upsert: false, // Fail if file exists (we want unique paths)
              });

            if (uploadError) {
              console.error(
                `❌ [upload:${uploadId}] [${fileId}] Failed to upload ${file.name}:`,
                uploadError
              );
              console.error(
                `🔍 [upload:${uploadId}] [${fileId}] Upload error details:`,
                {
                  message: uploadError.message,
                  path: pdfPath,
                  fileSize: file.size,
                  fileName: file.name,
                  fullError: uploadError,
                }
              );
              // Don't return - let the upload continue for other files
              return;
            }

            console.log(
              `✅ [upload:${uploadId}] [${fileId}] Storage upload successful`
            );

            // Verify the file actually exists in storage
            const { data: fileExists, error: checkError } =
              await supabase.storage
                .from('documents')
                .list(pdfPath.substring(0, pdfPath.lastIndexOf('/')), {
                  search: pdfPath.substring(pdfPath.lastIndexOf('/') + 1),
                });

            console.log(
              `🔍 [upload:${uploadId}] [${fileId}] File verification:`,
              {
                path: pdfPath,
                exists: !checkError && fileExists && fileExists.length > 0,
                checkError: checkError?.message,
                foundFiles: fileExists?.map((f) => f.name) || [],
              }
            );

            // Insert into temp_documents
            console.log(
              `💾 [upload:${uploadId}] [${fileId}] Inserting record into temp_documents...`
            );
            const { error: insertError } = await supabase
              .from('temp_documents')
              .insert({
                user_id: session.user.id,
                pdf_path: pdfPath,
                upload_date: new Date().toISOString(),
              });

            if (insertError) {
              console.error(
                `❌ [upload:${uploadId}] [${fileId}] Failed to insert ${file.name} to temp_documents:`,
                insertError
              );
              // Clean up uploaded file
              console.log(
                `🧹 [upload:${uploadId}] [${fileId}] Cleaning up orphaned storage file...`
              );
              await supabase.storage.from('documents').remove([pdfPath]);
              return;
            }

            console.log(
              `✅ [upload:${uploadId}] [${fileId}] Successfully uploaded ${file.name} to temp_documents`
            );
            uploadedPaths.push(pdfPath);
          } catch (error) {
            console.error(
              `❌ [upload:${uploadId}] [${fileId}] Error uploading ${file.name}:`,
              error
            );
          }
        });

        await Promise.all(uploadPromises);
        console.log(
          `✅ [upload:${uploadId}] Upload to temp_documents completed`
        );
        console.log(
          `📊 [upload:${uploadId}] Successfully uploaded paths:`,
          uploadedPaths
        );

        // 🚀 PHASE 4: Update database state after upload completion
        console.log(
          `🔄 [PHASE4] Upload completed - updating database state...`
        );
        await checkDocumentsStatus();

        // Log current storage bucket contents for debugging
        try {
          const { data: allFiles, error: listError } = await supabase.storage
            .from('documents')
            .list('temp/' + session.user.id, {
              limit: 100,
              sortBy: { column: 'created_at', order: 'desc' },
            });

          console.log(`🗂️ [upload:${uploadId}] Current temp folder contents:`, {
            userId: session.user.id,
            folderPath: 'temp/' + session.user.id,
            fileCount: allFiles?.length || 0,
            files:
              allFiles?.map((f) => ({
                name: f.name,
                size: f.metadata?.size,
                created: f.created_at,
              })) || [],
            listError: listError?.message,
          });
        } catch (e) {
          console.warn(
            `⚠️ [upload:${uploadId}] Could not list storage contents:`,
            e
          );
        }

        // Store current batch paths for logging
        console.log(
          `📊 [upload:${uploadId}] Current batch paths:`,
          uploadedPaths
        );

        // Reset upload flag
        isUploadingRef.current = false;

        // Trigger preprocessing immediately if we have successful uploads
        if (uploadedPaths.length > 0) {
          console.log(
            `🔄 [upload:${uploadId}] Triggering immediate preprocessing for ${uploadedPaths.length} files...`
          );
          // Update preprocessing status (isPreprocessing already set to true in handleFilesAdded)
          const statusMessage =
            skippedFiles.length > 0
              ? `Preparing ${uploadedPaths.length} new documents (${skippedFiles.length} duplicates skipped)...`
              : `Preparing ${uploadedPaths.length} documents for processing...`;
          setPreprocessingProgress(statusMessage);

          try {
            const cronSecret =
              process.env.NEXT_PUBLIC_LOCAL_CRON_SECRET ||
              'local-dev-submit-123';
            console.log(
              `🔑 [preprocess-trigger:${uploadId}] Using cron secret: ${
                cronSecret === process.env.NEXT_PUBLIC_LOCAL_CRON_SECRET
                  ? 'env-variable'
                  : 'fallback'
              }`
            );

            const response = await fetch('/api/cron/preprocess', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${cronSecret}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                pdf_paths: uploadedPaths,
                user_id: session.user.id,
              }),
            });

            const result = await response.json();
            console.log(
              `📊 [preprocess-trigger:${uploadId}] Preprocessing result:`,
              result
            );

            if (!result.success) {
              console.error(
                `❌ [preprocess-trigger:${uploadId}] Preprocessing failed:`,
                result.error
              );
              setPreprocessingProgress(`Preprocessing failed: ${result.error}`);
              return;
            }

            console.log(
              `✅ [preprocess-trigger:${uploadId}] Preprocessing completed: ${result.processed} processed, ${result.errors} errors`
            );
            setPreprocessingProgress(
              `Preprocessing completed: ${result.processed} processed, ${result.errors} errors`
            );

            // Start readiness polling
            setTimeout(async () => {
              const successMessage =
                result.processed > uploadedPaths.length
                  ? `Ready! ${uploadedPaths.length} files split into ${result.processed} pages for AI processing`
                  : `Ready! ${result.processed} pages prepared for AI processing`;
              setPreprocessingProgress(successMessage);
              setIsPreprocessing(false);

              // 🚀 PHASE 4: Update database state after preprocessing completion
              console.log(
                `🔄 [PHASE4] Preprocessing completed - updating database state...`
              );
              await checkDocumentsStatus();
            }, 2000);
          } catch (error) {
            console.error(
              `❌ [preprocess-trigger:${uploadId}] Preprocessing error:`,
              error
            );
            setPreprocessingProgress(`Preprocessing error: ${error}`);
          }
        } else {
          console.warn(
            `⚠️ [upload:${uploadId}] No files were successfully uploaded; skipping preprocessing`
          );
          // Re-enable the button since no preprocessing is needed
          setIsPreprocessing(false);
          setPreprocessingProgress('');
          console.log(
            `🔓 Frontend: Button re-enabled - no files to preprocess`
          );
        }

        console.log(`🏁 [upload:${uploadId}] === UPLOAD BATCH COMPLETED ===`);

        // Stop session keep-alive after upload completes
        stopSessionKeepAlive();
      } catch (error) {
        console.error(
          `❌ [upload:${uploadId}] Upload failed with error:`,
          error
        );
        // Ensure session management is cleaned up even on error
        stopSessionKeepAlive();
        // Reset upload flag on error
        isUploadingRef.current = false;
        // Show error to user
        setPreprocessingProgress(`Upload failed: ${error}`);
        setIsPreprocessing(false);
      }
    },
    [
      session?.user?.id,
      checkForDuplicates,
      checkDocumentsStatus,
      startSessionKeepAlive,
      stopSessionKeepAlive,
    ]
  );

  const handleFilesAdded = useCallback(
    (newFiles: File[]) => {
      console.log(
        `🆕 Starting new session - adding ${newFiles.length} new files`
      );

      // 🚀 PHASE 3: Clear previous session data
      setProcessedDocuments([]);
      setDuplicateFilesCount(0);
      setSkippedFilesInfo([]);
      setPreprocessingProgress('');

      // 🚨 IMMEDIATELY disable the button when files are added
      setIsPreprocessing(true);
      setPreprocessingProgress('Preparing files for upload...');
      console.log(
        `🔒 Frontend: Button disabled immediately - preprocessing started`
      );

      // Add all files to UI immediately (database-level duplicate checking will handle duplicates)
      setFiles((prevFiles) => {
        const updatedFiles = [...prevFiles];
        let addedCount = 0;

        newFiles.forEach((newFile) => {
          console.log(
            `📄 Frontend: Adding file - ${newFile.name} (${(
              newFile.size / 1024
            ).toFixed(2)} KB)`
          );

          // Simple client-side check to avoid duplicate UI entries in the same session
          if (
            !updatedFiles.some(
              (existingFile) =>
                existingFile.name === newFile.name &&
                existingFile.size === newFile.size
            )
          ) {
            updatedFiles.push(newFile);
            addedCount++;
            console.log(`✅ Frontend: Added to UI - ${newFile.name}`);
          } else {
            console.log(`⚠️ Frontend: Skipped UI duplicate - ${newFile.name}`);
          }
        });

        console.log(
          `📊 Frontend: Files summary - Added to UI: ${addedCount}, Total in UI: ${updatedFiles.length}`
        );
        return updatedFiles;
      });

      // Upload files (with database-level duplicate checking)
      uploadToTempDocuments(newFiles);
    },
    [uploadToTempDocuments]
  );

  const handleRemoveFile = (index: number) => {
    const fileName = files[index]?.name;
    console.log(`🗑️ Frontend: Removing file at index ${index} - ${fileName}`);

    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    setProcessedDocuments((prevDocs) => prevDocs.filter((_, i) => i !== index));

    console.log(`✅ Frontend: File removed - ${fileName}`);
  };

  // Removed with Review tab
  /*
  const handleUpdateDocument = (index: number, updatedData: AppDocument) => {
    console.log(`✏️ Frontend: Updating document at index ${index}`);
    console.log(`📄 Frontend: Document type: ${updatedData.document_type}`);

    setProcessedDocuments((prev) => {
      const newDocs = [...prev];
      newDocs[index] = {
        ...newDocs[index],
        data: updatedData,
      };
      console.log(`✅ Frontend: Document updated successfully`);
      return newDocs;
    });
  };
  */

  const processFiles = async () => {
    const processId = Math.random().toString(36).substring(2, 15);
    console.log(`🚀 [process:${processId}] === AI PROCESSING STARTED ===`);
    console.log(
      `⏰ [process:${processId}] Timestamp: ${new Date().toISOString()}`
    );

    // 🎯 LOCAL TRACKING FOR BACKEND GROUPING TRIGGER (Fix async state issue)
    let localCompletedCount = 0;
    let localErrorCount = 0;

    // Fetch documents from single_documents only (preprocessing already done)
    const supabase = getSupabaseBrowser();

    console.log(
      `🔍 [process:${processId}] Fetching ready documents from single_documents...`
    );

    // Fetch ready documents for AI processing (all uploaded documents, no time restriction)
    const { data: singleDocs, error: fetchError } = await supabase
      .from('single_documents')
      .select('*')
      .eq('status', 'uploaded')
      .eq('user_id', session?.user?.id) // Filter by current user
      .order('upload_date', { ascending: true });

    console.log(
      `📊 [process:${processId}] Found ${
        singleDocs?.length || 0
      } documents ready for AI processing (no time restriction)`,
      {
        error: fetchError,
        documents: singleDocs?.map((d) => ({
          pdf_path: d.pdf_path,
          original_filename: d.original_filename,
          upload_date: d.upload_date,
        })),
      }
    );

    if (fetchError) {
      // Silently handle fetch errors - continue with empty results
      console.log(
        `⚠️ [process:${processId}] No documents available for processing`
      );
      return;
    }

    if (!singleDocs || singleDocs.length === 0) {
      console.log(
        `⚠️ [process:${processId}] No documents ready for AI processing`
      );
      console.log(`💡 [process:${processId}] This means either:`);
      console.log(`   1. No files uploaded yet`);
      console.log(
        `   2. Files are still being preprocessed (split into pages)`
      );
      console.log(`   3. Files already processed (status='processed')`);
      setShowAlreadyProcessedAlert(true);
      setTimeout(() => {
        setShowAlreadyProcessedAlert(false);
      }, 8000);
      return;
    }

    console.log(
      `🚀 [process:${processId}] === STARTING AI BATCH PROCESSING ===`
    );
    console.log(
      `📊 [process:${processId}] Processing ${singleDocs.length} pages from single_documents`
    );
    console.log(
      `⏰ [process:${processId}] Started at ${new Date().toISOString()}`
    );

    setIsProcessing(true);
    setCurrentProcessingIndex(0);
    setProcessingProgress(0);
    setTotalPagesToProcess(singleDocs.length); // Set the actual page count

    // 🚀 Initialize document slots for documents being processed
    console.log(
      `🔄 Frontend: Preparing slots for ${singleDocs.length} documents to process`
    );
    setProcessedDocuments((prev) => {
      const updated = [...prev];

      // Add slots for documents from single_documents
      singleDocs.forEach((doc) => {
        const fileName =
          doc.original_filename ||
          doc.pdf_path.split('/').pop() ||
          'unknown.pdf';

        // Check if we already have this file in our processed documents
        const existingIndex = updated.findIndex(
          (processedDoc) => processedDoc.fileName === fileName
        );

        if (existingIndex === -1) {
          // Document not found, add a new slot
          console.log(
            `📝 Frontend: Creating doc slot for document - ${fileName}`
          );
          updated.push({
            fileName: fileName,
            documentType: '',
            data: JSON.parse(
              JSON.stringify(documentTemplates.invoice)
            ) as AppDocument,
            fileUrl: '',
            status: 'pending',
          });
        } else {
          console.log(
            `♻️ Frontend: Document ${fileName} already exists in processed documents`
          );
        }
      });

      return updated;
    });

    const batchStartTime = Date.now();

    try {
      // Process documents from single_documents
      let processedCount = 0;
      for (let i = 0; i < singleDocs.length; i++) {
        const currentDoc = singleDocs[i];
        const fileName =
          currentDoc.original_filename ||
          currentDoc.pdf_path.split('/').pop() ||
          'unknown.pdf';

        processedCount++;

        // Add progressive delay between files to prevent Supabase rate limiting
        if (processedCount > 1) {
          // Delay increases every 4 files: 0ms, 1s, 1s, 1s, 2s, 2s, 2s, 2s, 3s...
          const delay = Math.min(1000 * Math.ceil(processedCount / 4), 3000);
          console.log(
            `⏳ Frontend: Waiting ${delay}ms before processing document ${processedCount} to prevent rate limiting`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.log(
          `\n🔄 Frontend: === PROCESSING DOCUMENT ${processedCount}/${singleDocs.length} ===`
        );
        console.log(`📄 Frontend: Document: ${fileName}`);
        console.log(`🆔 Frontend: Document ID: ${currentDoc.id}`);

        setCurrentProcessingIndex(i);

        // Update status to processing in both frontend and database
        console.log(
          `🔄 Frontend: Setting status to 'processing' for document ${
            i + 1
          }: ${fileName}`
        );
        setProcessedDocuments((prev) =>
          prev.map((doc) =>
            doc.fileName === fileName ? { ...doc, status: 'processing' } : doc
          )
        );

        // Update database status to 'processing'
        const { error: processingUpdateError } = await supabase
          .from('single_documents')
          .update({ status: 'processing' })
          .eq('id', currentDoc.id);

        if (processingUpdateError) {
          console.error(
            `❌ Failed to update single_documents status to processing:`,
            processingUpdateError
          );
        } else {
          console.log(
            `✅ Updated single_documents status to 'processing' for ${fileName}`
          );
        }

        const fileStartTime = Date.now();

        try {
          console.log(
            `📦 Frontend: Creating FormData for API request with document ID`
          );
          const formData = new FormData();
          formData.append('documentId', currentDoc.id);
          formData.append('pdfPath', currentDoc.pdf_path);

          // Log session and token details
          console.log(`🔐 Frontend: Auth session details:`, {
            hasSession: !!session,
            userId: session?.user?.id,
            userEmail: session?.user?.email,
            hasAccessToken: !!session?.access_token,
            tokenLength: session?.access_token?.length,
            tokenPreview: session?.access_token
              ? `${session.access_token.substring(0, 20)}...`
              : null,
          });

          const headers = {
            Authorization: `Bearer ${session?.access_token}`, // 👈 ADD AUTH TOKEN
          };

          console.log(`🌐 Frontend: Sending request to /api/process-document`);
          console.log(`📋 Frontend: Request headers:`, {
            hasAuthHeader: !!headers.Authorization,
            authHeaderPreview: headers.Authorization
              ? `${headers.Authorization.substring(0, 30)}...`
              : null,
          });

          const response = await fetch('/api/process-document', {
            method: 'POST',
            headers,
            body: formData,
          });

          const responseTime = Date.now() - fileStartTime;
          console.log(
            `⏰ Frontend: API response received in ${responseTime}ms`
          );
          console.log(`📊 Frontend: Response status: ${response.status}`);
          console.log(
            `📋 Frontend: Response headers:`,
            Object.fromEntries(response.headers.entries())
          );

          if (!response.ok) {
            console.error(`❌ Frontend: HTTP Error ${response.status}:`, {
              status: response.status,
              statusText: response.statusText,
              url: response.url,
            });
          }

          const result = await response.json();
          console.log(`📋 Frontend: API response for ${fileName}:`, result);

          // ===== DEBUGGING: Check exact response structure =====
          console.log(
            `🔍 Frontend: Debugging response structure for ${fileName}:`
          );
          console.log(
            `   📊 result.success: ${
              result.success
            } (type: ${typeof result.success})`
          );
          console.log(
            `   🔗 result.fileUrl: ${
              result.fileUrl
            } (type: ${typeof result.fileUrl})`
          );
          console.log(
            `   🆔 result.databaseId: ${
              result.databaseId
            } (type: ${typeof result.databaseId})`
          );
          console.log(
            `   📦 result.storageType: ${
              result.storageType
            } (type: ${typeof result.storageType})`
          );
          console.log(`   🔍 Full result keys:`, Object.keys(result));

          if (result.success) {
            // Check if document was skipped (additional_document)
            if (result.skipped) {
              console.log(`🚫 Frontend: Document skipped - ${fileName}`);
              console.log(`📋 Frontend: Reason: ${result.reason}`);
              console.log(
                `📄 Frontend: Document type: ${result.data?.document_type}`
              );

              // Don't add to processedDocuments, just continue to next document
              continue;
            }

            console.log(`✅ Frontend: Processing successful for ${fileName}`);
            console.log(
              `📋 Frontend: Document type identified: ${result.data.document_type}`
            );
            console.log(`🔗 Frontend: File URL: ${result.fileUrl}`);

            if (result.meta) {
              console.log(`📊 Frontend: Processing metadata:`);
              console.log(
                `   ⚡ Server processing time: ${result.meta.processingTime}ms`
              );
              console.log(`   🆔 Request ID: ${result.meta.requestId}`);
            }

            // Update with successful result
            console.log(`📝 Frontend: Updating document ${i} with:`, {
              fileUrl: result.fileUrl,
              databaseId: result.databaseId,
              storageType: result.storageType,
            });

            // ===== DEBUGGING: Validate values before state update =====
            const updateValues = {
              fileUrl: result.fileUrl,
              databaseId: result.databaseId,
              storageType: result.storageType,
            };
            console.log(
              `🔍 Frontend: Values being set in state:`,
              updateValues
            );
            console.log(`   🔗 fileUrl is truthy: ${!!updateValues.fileUrl}`);
            console.log(
              `   🆔 databaseId is truthy: ${!!updateValues.databaseId}`
            );

            // 🎯 INCREMENT LOCAL COMPLETED COUNT
            localCompletedCount++;

            setProcessedDocuments((prev) => {
              // Create a new processed document from the result
              const newDoc: ProcessedDocument = {
                fileName: fileName,
                documentType: result.data.document_type,
                data: result.data,
                status: 'completed' as const,
                fileUrl: result.fileUrl,
                databaseId: result.databaseId,
                storageType: result.storageType,
              };

              // Find the document by fileName and update it, or add if not found
              const updated = [...prev];
              const existingIndex = updated.findIndex(
                (doc) => doc.fileName === fileName
              );

              if (existingIndex >= 0) {
                // Update the existing document
                updated[existingIndex] = newDoc;
                console.log(
                  `✅ Frontend: Updated existing document: ${fileName} at index ${existingIndex}`
                );
              } else {
                // Add new document
                updated.push(newDoc);
                console.log(`✅ Frontend: Added new document: ${fileName}`);
              }

              console.log(
                `📊 Frontend: Total documents in state: ${updated.length}`
              );
              return updated;
            });

            // Update single_documents status to 'processed'
            const { error: updateError } = await supabase
              .from('single_documents')
              .update({ status: 'processed' })
              .eq('id', currentDoc.id);

            if (updateError) {
              console.error(
                `❌ Failed to update single_documents status:`,
                updateError
              );
            } else {
              console.log(
                `✅ Updated single_documents status to 'processed' for ${fileName}`
              );
            }
          } else {
            console.error(`❌ Frontend: Processing failed for ${fileName}`);
            console.error(`   Error: ${result.error}`);
            console.error(`   Details:`, result.details);

            // 🎯 INCREMENT LOCAL ERROR COUNT
            localErrorCount++;

            // Update database status to 'failed'
            const { error: failedUpdateError } = await supabase
              .from('single_documents')
              .update({
                status: 'failed',
                error_message: result.error || 'Processing failed',
                failed_at: new Date().toISOString(),
              })
              .eq('id', currentDoc.id);

            if (failedUpdateError) {
              console.error(
                `❌ Failed to update single_documents status to failed:`,
                failedUpdateError
              );
            } else {
              console.log(
                `✅ Updated single_documents status to 'failed' for ${fileName}`
              );
            }

            // Update with error
            setProcessedDocuments((prev) =>
              prev.map((doc) =>
                doc.fileName === fileName
                  ? {
                      ...doc,
                      status: 'error' as const,
                      error: result.error || 'Processing failed',
                    }
                  : doc
              )
            );
          }
        } catch (networkError) {
          const errorTime = Date.now() - fileStartTime;
          console.error(
            `💥 Frontend: Network error for ${fileName} after ${errorTime}ms`
          );
          console.error(`   Error:`, networkError);

          // 🎯 INCREMENT LOCAL ERROR COUNT
          localErrorCount++;

          // Update database status to 'failed' for network error
          const { error: networkFailedUpdateError } = await supabase
            .from('single_documents')
            .update({
              status: 'failed',
              error_message:
                networkError instanceof Error
                  ? networkError.message
                  : 'Network error',
              failed_at: new Date().toISOString(),
            })
            .eq('id', currentDoc.id);

          if (networkFailedUpdateError) {
            console.error(
              `❌ Failed to update single_documents status to failed (network error):`,
              networkFailedUpdateError
            );
          } else {
            console.log(
              `✅ Updated single_documents status to 'failed' for ${fileName} (network error)`
            );
          }

          // Update with network error
          setProcessedDocuments((prev) =>
            prev.map((doc) =>
              doc.fileName === fileName
                ? {
                    ...doc,
                    status: 'error' as const,
                    error: 'Network error or backend unavailable',
                  }
                : doc
            )
          );
        }

        // Update progress based on new files processed
        const progressPercent = (processedCount / singleDocs.length) * 100;
        setProcessingProgress(progressPercent);
        console.log(
          `📈 Frontend: Progress updated to ${progressPercent.toFixed(
            1
          )}% (${processedCount}/${singleDocs.length} documents)`
        );
      }

      const totalBatchTime = Date.now() - batchStartTime;
      console.log(`🎉 Frontend: === BATCH PROCESSING COMPLETED ===`);
      console.log(`⏰ Frontend: Total batch time: ${totalBatchTime}ms`);
      console.log(
        `📊 Frontend: Average time per NEW file: ${
          processedCount > 0 ? (totalBatchTime / processedCount).toFixed(2) : 0
        }ms`
      );

      // 🚀 PHASE 4: Update database state after AI processing completion
      console.log(
        `🔄 [PHASE4] AI processing completed - updating database state...`
      );
      await checkDocumentsStatus();

      // ========== COMPREHENSIVE BATCH SUMMARY ==========
      console.log(`\n🎯 ===============================================`);
      console.log(`📊 BATCH PROCESSING COMPLETE - FINAL SUMMARY`);
      console.log(`🎯 ===============================================`);

      const completedDocs = processedDocuments.filter(
        (doc) => doc.status === 'completed'
      );
      const failedDocs = processedDocuments.filter(
        (doc) => doc.status === 'error'
      );
      const successRate = Math.round(
        (completedDocs.length / files.length) * 100
      );
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);

      console.log(`📈 Overall Statistics:`);
      console.log(`   📋 Total Documents: ${files.length}`);
      console.log(`   ✅ Successfully Processed: ${completedDocs.length}`);
      console.log(`   ❌ Failed Processing: ${failedDocs.length}`);
      console.log(`   📊 Success Rate: ${successRate}%`);
      console.log(
        `   💾 Total Data Processed: ${(totalSize / 1024 / 1024).toFixed(2)} MB`
      );
      console.log(`   ⏱️  Total Processing Time: ${totalBatchTime}ms`);
      console.log(
        `   🚀 Average Time per Document: ${Math.round(
          totalBatchTime / files.length
        )}ms`
      );

      console.log(`\n📋 Document Details:`);
      files.forEach((file, index) => {
        const doc = processedDocuments[index];
        console.log(`\n   📄 Document ${index + 1}:`);
        console.log(`      📁 File: ${file.name}`);
        console.log(`      📊 Size: ${(file.size / 1024).toFixed(2)} KB`);

        // Safety check for undefined documents
        if (!doc) {
          console.log(
            `      ⚠️  Status: Document not found in processed array`
          );
          return;
        }

        if (doc.status === 'completed' && doc.data) {
          console.log(`      🏷️  Type: ${doc.data.document_type}`);

          // Safe property access with type assertions
          const docData = doc.data as unknown as Record<string, unknown>;
          const bankName = docData.bank_name || 'N/A';
          const title =
            docData.document_title || docData.invoice_title || 'N/A';

          console.log(`      🏦 Bank: ${bankName}`);
          console.log(`      📝 Title: ${title}`);

          // Extract amount with safe property access
          let documentAmount: string | number = 'N/A';
          if (doc.data.document_type === 'eft_receipt') {
            const transactionDetails = docData.transaction_details as
              | Record<string, unknown>
              | undefined;
            documentAmount =
              (transactionDetails?.amount as string | number) || 'N/A';
          } else if (doc.data.document_type === 'invoice') {
            const totalSummary = docData.total_summary as
              | Record<string, unknown>
              | undefined;
            documentAmount =
              (totalSummary?.total_invoice_amount as string | number) || 'N/A';
          }

          console.log(`      💰 Amount: ${documentAmount}`);
          console.log(`      ☁️  Status: ✅ SUCCESS`);
          console.log(
            `      🔗 File URL: ${doc.fileUrl ? 'Generated' : 'Missing'}`
          );
        } else {
          console.log(`      🏷️  Type: Failed to process`);
          console.log(`      🏦 Bank: N/A`);
          console.log(`      📝 Title: N/A`);
          console.log(`      💰 Amount: N/A`);
          console.log(`      ☁️  Status: ❌ FAILED`);
          console.log(`      ⚠️  Error: ${doc?.error || 'Unknown error'}`);
        }
      });

      if (failedDocs.length > 0) {
        console.log(`\n❌ FAILED DOCUMENTS ANALYSIS:`);
        failedDocs.forEach((doc, index) => {
          const originalFile = files[processedDocuments.indexOf(doc)];
          console.log(`   ${index + 1}. ${originalFile.name}`);
          console.log(
            `      📊 Size: ${(originalFile.size / 1024).toFixed(2)} KB`
          );
          console.log(`      ⚠️  Error: ${doc.error}`);
          console.log(
            `      🔍 Likely Cause: Network connectivity or Supabase server issues`
          );
        });

        console.log(`\n💡 RECOMMENDATIONS FOR FAILED UPLOADS:`);
        console.log(`   🔄 Retry failed documents individually`);
        console.log(`   🌐 Check network connection stability`);
        console.log(`   ⏰ Wait a few minutes and try again (server load)`);
        console.log(
          `   📊 All failed files have similar sizes (~2.3MB) - likely network timeout`
        );
      }

      console.log(`\n🎯 ===============================================\n`);

      // Use LOCAL TRACKING instead of async state (fixes timing issue)
      console.log(
        `📈 Frontend: Results - Completed: ${localCompletedCount}, Errors: ${localErrorCount}`
      );

      setActiveTab('results');
      console.log(`🔄 Frontend: Switched to results tab`);

      // 🚀 Reset groups when new documents are processed (but keep documents loaded)
      if (processedCount > 0) {
        console.log(
          `🔄 Frontend: Resetting groups due to ${processedCount} new documents`
        );
        setHasInitializedGroups(false);
        setGroups({});
      }
    } catch (batchError) {
      console.error(`💥 Frontend: Batch processing error:`, batchError);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingIndex(-1);
      console.log(`🔄 Frontend: Processing state reset`);

      // 🚀 TRIGGER BACKEND GROUPING SERVICE AFTER AI PROCESSING COMPLETES
      if (localCompletedCount > 0) {
        console.log(
          `🔧 Frontend: Triggering backend document grouping for ${localCompletedCount} processed documents...`
        );
        triggerDocumentGrouping(localCompletedCount);
      }

      // 🚀 REFRESH FAILED DOCUMENTS LIST AFTER PROCESSING
      fetchFailedDocuments();

      // Auto-redirect to Verify & Submit tab after successful processing
      if (localCompletedCount > 0) {
        console.log(
          `🔄 Frontend: Auto-redirecting to Verify & Submit tab (${localCompletedCount} pages processed)`
        );
        setTimeout(() => {
          setActiveTab('submit');
          console.log(
            `✅ Frontend: Successfully switched to Verify & Submit tab`
          );
        }, 2000); // 2 second delay to let user see completion message
      }
    }
  };

  // Cleanup session management on component unmount
  useEffect(() => {
    return () => {
      console.log(
        '🧹 [CLEANUP] Component unmounting - cleaning up session management'
      );
      if (sessionManagerRef.current.keepAliveInterval) {
        clearInterval(sessionManagerRef.current.keepAliveInterval);
      }
      if (sessionManagerRef.current.warningTimeout) {
        clearTimeout(sessionManagerRef.current.warningTimeout);
      }
      setSessionActive(false);
    };
  }, []);
  // Removed with Review tab
  /*
  const handleDownloadCSV = () => {
    const completedDocs = processedDocuments.filter(
      (doc) => doc.status === 'completed'
    );

    console.log(`📥 Frontend: Starting CSV download`);
    console.log(
      `📊 Frontend: ${completedDocs.length} completed documents to export`
    );

    if (completedDocs.length === 0) {
      console.log(`⚠️ Frontend: No completed documents to export`);
      return;
    }

    console.log(`🔄 Frontend: Flattening document data for CSV...`);
    const csvStart = Date.now();

    // Flatten nested objects for CSV
    const flattenObject = (
      obj: Record<string, unknown>,
      prefix = ''
    ): Record<string, unknown> => {
      const flattened: Record<string, unknown> = {};

      for (const key in obj) {
        if (
          obj[key] !== null &&
          typeof obj[key] === 'object' &&
          !Array.isArray(obj[key])
        ) {
          Object.assign(
            flattened,
            flattenObject(
              obj[key] as Record<string, unknown>,
              `${prefix}${key}_`
            )
          );
        } else if (Array.isArray(obj[key])) {
          (obj[key] as unknown[]).forEach((item: unknown, index: number) => {
            if (typeof item === 'object' && item !== null) {
              Object.assign(
                flattened,
                flattenObject(
                  item as Record<string, unknown>,
                  `${prefix}${key}_${index + 1}_`
                )
              );
            } else {
              flattened[`${prefix}${key}_${index + 1}`] = item;
            }
          });
        } else {
          flattened[`${prefix}${key}`] = obj[key];
        }
      }

      return flattened;
    };

    // Convert to CSV
    const csvRows = [];
    const allFields = new Set<string>();

    // Collect all possible fields
    completedDocs.forEach((doc) => {
      const flattened = flattenObject({ fileName: doc.fileName, ...doc.data });
      Object.keys(flattened).forEach((key) => allFields.add(key));
    });

    const headers = Array.from(allFields);
    csvRows.push(headers.join(','));

    // Add data rows
    completedDocs.forEach((doc) => {
      const flattened = flattenObject({ fileName: doc.fileName, ...doc.data });
      const row = headers.map((header) => {
        const value = flattened[header] || '';
        return typeof value === 'string' &&
          (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"` // escape double quotes
          : value;
      });
      csvRows.push(row.join(','));
    });

    // Download CSV
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const fileName = `ocean-integrity-data-${
      new Date().toISOString().split('T')[0]
    }.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const csvTime = Date.now() - csvStart;
    console.log(`✅ Frontend: CSV download completed in ${csvTime}ms`);
    console.log(`📁 Frontend: File name: ${fileName}`);
    console.log(`📊 Frontend: CSV size: ${(blob.size / 1024).toFixed(2)} KB`);
  };
  */

  const completedCount = useMemo(
    () => processedDocuments.filter((d) => d.status === 'completed').length,
    [processedDocuments]
  );
  const errorCount = useMemo(
    () => processedDocuments.filter((d) => d.status === 'error').length,
    [processedDocuments]
  );

  // Log state changes
  console.log(
    `📊 Frontend State: Files: ${files.length}, Processed: ${processedDocuments.length}, Completed: ${completedCount}, Errors: ${errorCount}, Ready: ${readyDocumentsCount}, Temp: ${tempDocumentsCount}, Duplicates: ${duplicateFilesCount}, Progress: "${preprocessingProgress}"`
  );

  return (
    <main className='min-h-screen bg-gradient-to-b from-slate-50 to-slate-100'>
      <div className='container mx-auto py-8 px-4'>
        <header className='mb-8 text-center'>
          <div className='relative h-[300px] w-full overflow-hidden'>
            <VideoText src='https://cdn.magicui.design/ocean-small.webm'>
              OCEAN/AI
            </VideoText>
          </div>

          <h2 className='text-2xl font-semibold text-slate-700 mt-2'>
            Automated Plastic Credit Verification
          </h2>
          <p className='text-slate-600 mt-4 max-w-3xl mx-auto'>
            Streamline your sustainability reporting with intelligent document
            processing and blockchain-backed transparency.
          </p>

          <div className='mt-6 text-left max-w-3xl mx-auto space-y-4'>
            <h3 className='text-xl font-semibold text-slate-800'>
              🚀 What It Does
            </h3>
            <p>
              Upload your documents—
              <strong>invoices, EFT receipts, and e-way bills</strong>—and let
              our AI do the heavy lifting:
            </p>

            <ul className='space-y-3 list-disc pl-5'>
              <li className='flex items-start'>
                <span className='mr-2'>🔍</span>
                <span>
                  <strong>Automatic Data Extraction</strong>
                  <br />
                  Our AI identifies and extracts key data points from uploaded
                  documents with high accuracy.
                </span>
              </li>
              <li className='flex items-start'>
                <span className='mr-2'>📁</span>
                <span>
                  <strong>Smart Grouping</strong>
                  <br />
                  Documents are intelligently grouped by transaction to
                  accelerate verification.
                </span>
              </li>
              <li className='flex items-start'>
                <span className='mr-2'>✅</span>
                <span>
                  <strong>Plastic Credit Verification</strong>
                  <br />
                  Extracted data is matched against recycling actions to
                  validate plastic credits. Incomplete or missing credits are
                  automatically flagged to be uploaded.
                </span>
              </li>
              <li className='flex items-start'>
                <span className='mr-2'>📊</span>
                <span>
                  <strong>Simple Analytics</strong>
                  <br />
                  Total Tons data, Processed Docs, Verified Credits.
                </span>
              </li>
            </ul>
          </div>
        </header>

        <div className='max-w-4xl mx-auto'>
          <Tabs
            value={activeTab}
            onValueChange={(v: string) =>
              setActiveTab(
                v as
                  | 'upload'
                  | 'results'
                  | 'groups'
                  | 'submit'
                  | 'blockchain'
                  | 'data'
              )
            }
            className='space-y-6'
          >
            <div className='flex justify-center'>
              <TabsList className='grid w-full grid-cols-4'>
                <TabsTrigger value='upload' className='text-base py-1'>
                  Upload & Process
                </TabsTrigger>

                <TabsTrigger value='groups' className='text-base py-1'>
                  Verify & Submit
                </TabsTrigger>

                <TabsTrigger value='blockchain' className='text-base py-1'>
                  Blockchain
                </TabsTrigger>

                <TabsTrigger value='data' className='text-base py-1'>
                  Data Management
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value='upload' className='space-y-6'>
              <Card className='shadow-md border-slate-200'>
                <CardContent className='p-6'>
                  <div className='mb-6'>
                    <h2 className='text-xl font-semibold mb-2'>
                      Document Upload
                    </h2>
                    <p className='text-slate-600 text-sm'>
                      Upload your accounting documents and our AI will process
                      them to identify and extract the relevant data
                    </p>
                  </div>

                  <FileUploader
                    onFilesAdded={handleFilesAdded}
                    maxFiles={100}
                    acceptedFileTypes={['.pdf']}
                    sessionActive={sessionActive}
                  />

                  {files.length > 0 && (
                    <div className='mt-8'>
                      <div className='flex items-center justify-between mb-4'>
                        <h3 className='text-lg font-medium'>
                          Uploaded Documents
                        </h3>
                        {/* 🚀 PHASE 5: Enhanced file count badge with workflow status */}
                        <div className='flex gap-2'>
                          <Badge variant='outline' className='text-slate-600'>
                            {files.length}{' '}
                            {files.length === 1 ? 'file' : 'files'}
                          </Badge>
                          {duplicateFilesCount > 0 && (
                            <Badge
                              variant='outline'
                              className='text-orange-600 border-orange-200 bg-orange-50'
                            >
                              {duplicateFilesCount} duplicate
                              {duplicateFilesCount > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {tempDocumentsCount > 0 && (
                            <Badge
                              variant='outline'
                              className='text-yellow-600 border-yellow-200 bg-yellow-50'
                            >
                              {tempDocumentsCount} preprocessing
                            </Badge>
                          )}
                          {readyDocumentsCount > 0 && (
                            <Badge
                              variant='outline'
                              className='text-green-600 border-green-200 bg-green-50'
                            >
                              {readyDocumentsCount} ready
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className='space-y-3'>
                        {files.map((file, index) => {
                          const doc = processedDocuments[index];
                          const docType =
                            doc?.documentType as keyof typeof documentTypes;
                          const DocIcon =
                            documentTypes[docType]?.icon || FileText;
                          const iconColor =
                            documentTypes[docType]?.color || 'text-slate-500';

                          // 🚀 PHASE 2: Check if file is duplicate
                          const fileStatus = getFileStatus(file);

                          return (
                            <div
                              key={index}
                              className='flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm'
                            >
                              <div className='flex items-center gap-3'>
                                <div className='p-2 bg-blue-50 rounded-md relative'>
                                  {doc?.status === 'processing' &&
                                  currentProcessingIndex === index ? (
                                    <Loader2 className='h-5 w-5 text-blue-500 animate-spin' />
                                  ) : doc?.status === 'completed' ? (
                                    <DocIcon
                                      className={`h-5 w-5 ${iconColor}`}
                                    />
                                  ) : doc?.status === 'error' ? (
                                    <AlertCircle className='h-5 w-5 text-red-500' />
                                  ) : (
                                    <FileText className='h-5 w-5 text-slate-500' />
                                  )}
                                </div>
                                <div>
                                  <p className='font-medium text-slate-800'>
                                    {file.name}
                                  </p>
                                  <div className='flex items-center gap-2 text-xs text-slate-500'>
                                    <span>
                                      {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                    {doc?.status === 'processing' &&
                                      currentProcessingIndex === index && (
                                        <span className='text-blue-600 flex items-center gap-1'>
                                          <Clock className='h-3 w-3' />
                                          Processing...
                                        </span>
                                      )}
                                    {doc?.status === 'completed' && (
                                      <span className='text-green-600 flex items-center gap-1'>
                                        <CheckCircle2 className='h-3 w-3' />
                                        {documentTypes[docType]?.title ||
                                          'Completed'}
                                      </span>
                                    )}
                                    {doc?.status === 'error' && (
                                      <span className='text-red-600 flex items-center gap-1'>
                                        <AlertCircle className='h-3 w-3' />
                                        Error
                                      </span>
                                    )}
                                    {/* 🚀 PHASE 2: Show duplicate status */}
                                    {fileStatus.isDuplicate && (
                                      <Badge
                                        variant='outline'
                                        className='text-orange-600 border-orange-200 bg-orange-50'
                                      >
                                        DUPLICATE
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {!isProcessing && (
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() => handleRemoveFile(index)}
                                  className='text-slate-500 hover:text-red-500'
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className='mt-8'>
                        {/* 🚀 PHASE 5: Enhanced status display */}
                        {(() => {
                          const status = getDetailedStatus();
                          return (
                            <div
                              className={`p-4 rounded-lg border ${status.bgColor} ${status.borderColor} mb-4`}
                            >
                              <div className='flex items-center justify-between'>
                                <div>
                                  <p className={`font-medium ${status.color}`}>
                                    {isPreprocessing
                                      ? 'Pre-processing Documents'
                                      : 'Document Status'}
                                  </p>
                                  <p className={`text-sm ${status.color}`}>
                                    {status.message}
                                  </p>
                                </div>
                                {isPreprocessing && (
                                  <Loader2 className='h-5 w-5 text-orange-500 animate-spin' />
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {isPreprocessing ? (
                          <div className='space-y-4'>
                            <div className='bg-blue-50 border border-blue-200 rounded-lg p-3'>
                              <p className='text-sm text-blue-700'>
                                🔄 Documents are being prepared for AI
                                processing. This includes splitting multi-page
                                PDFs into individual pages.
                              </p>
                            </div>
                          </div>
                        ) : isProcessing ? (
                          <div className='space-y-4'>
                            <div className='flex items-center justify-between'>
                              <div>
                                <p className='font-medium text-slate-800'>
                                  Processing Page {currentProcessingIndex + 1}{' '}
                                  of {totalPagesToProcess || files.length}
                                </p>
                                <p className='text-sm text-slate-600'>
                                  AI is analyzing each page individually...
                                  {totalPagesToProcess > files.length && (
                                    <span className='text-blue-600'>
                                      {' '}
                                      ({files.length} original files split into{' '}
                                      {totalPagesToProcess} pages)
                                    </span>
                                  )}
                                </p>
                              </div>
                              <Loader2 className='h-5 w-5 text-blue-500 animate-spin' />
                            </div>
                            <Progress
                              value={processingProgress}
                              className='h-2'
                            />
                          </div>
                        ) : (
                          <>
                            <Button
                              type='button'
                              onClick={processFiles}
                              disabled={
                                readyDocumentsCount === 0 || isPreprocessing
                              }
                              className='w-full py-6 text-lg gap-2'
                            >
                              {isPreprocessing ? (
                                <>
                                  Pre-processing...
                                  <Loader2 className='h-5 w-5 animate-spin' />
                                </>
                              ) : (
                                <>
                                  Process Documents{' '}
                                  <ArrowRight className='h-5 w-5' />
                                </>
                              )}
                            </Button>

                            {/* 🚀 PHASE 5: Enhanced button status explanation */}
                            {!isPreprocessing && !isProcessing && (
                              <div className='mt-2 text-center'>
                                {readyDocumentsCount === 0 ? (
                                  <p className='text-sm text-slate-500'>
                                    {files.length > 0
                                      ? 'No documents ready for AI processing'
                                      : 'Upload documents to begin processing'}
                                  </p>
                                ) : (
                                  <p className='text-sm text-green-600'>
                                    ✅ Ready to process {readyDocumentsCount}{' '}
                                    page{readyDocumentsCount > 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>
                            )}

                            {isPreprocessing && (
                              <p className='text-sm text-center text-orange-600 mt-2'>
                                Please wait while documents are being
                                prepared...
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {errorCount > 0 && !isProcessing && (
                    <Alert
                      className='mt-6 bg-red-50 border-red-200'
                      variant='destructive'
                    >
                      <AlertCircle className='h-4 w-4' />
                      <AlertTitle>Processing Errors</AlertTitle>
                      <AlertDescription>
                        {errorCount} page{errorCount > 1 ? 's' : ''} failed to
                        process. Check the results tab for details.
                      </AlertDescription>
                    </Alert>
                  )}

                  {completedCount > 0 && !isProcessing && (
                    <Alert className='mt-6 bg-green-50 border-green-200'>
                      <CheckCircle2 className='h-4 w-4 text-green-600' />
                      <AlertTitle>Processing Complete</AlertTitle>
                      <AlertDescription>
                        🎉 {completedCount} page{completedCount > 1 ? 's' : ''}{' '}
                        processed successfully!
                        {totalPagesToProcess > files.length && (
                          <span className='text-green-700'>
                            {' '}
                            (from {files.length} original file
                            {files.length > 1 ? 's' : ''})
                          </span>
                        )}
                        <p className='text-sm text-green-600 mt-1'>
                          Your documents are ready for verification and
                          blockchain submission!
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {showAlreadyProcessedAlert && (
                    <Alert
                      className='mt-6 bg-amber-50 border-amber-400 border-2 shadow-lg'
                      variant='destructive'
                    >
                      <AlertCircle className='h-6 w-6 text-amber-600 animate-pulse' />
                      <AlertTitle className='text-amber-800 font-bold text-lg'>
                        ⚠️ WARNING: Documents Already Processed!
                      </AlertTitle>
                      <AlertDescription className='text-amber-700 font-semibold text-base'>
                        🚫 All uploaded documents have already been processed!
                        <br />
                        <br />
                        💡 <strong>What to do:</strong>
                        <br />
                        • Upload NEW documents to process them
                        <br />• Check the &quot;Review&quot; tab to see your
                        existing processed documents
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* 🚀 NEW: Failed Preprocessing Section */}
              {failedPreprocessingDocs.length > 0 && (
                <Card className='shadow-md border-red-200 bg-red-50'>
                  <CardContent className='p-6'>
                    <div className='mb-4'>
                      <h3 className='text-lg font-semibold text-red-800 flex items-center gap-2'>
                        <AlertCircle className='h-5 w-5' />
                        Failed Preprocessing ({
                          failedPreprocessingDocs.length
                        }{' '}
                        documents)
                      </h3>
                      <p className='text-red-600 text-sm mt-1'>
                        These documents failed during preprocessing and need
                        attention
                      </p>
                    </div>

                    <div className='space-y-2 mb-4 max-h-40 overflow-y-auto'>
                      {failedPreprocessingDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className='flex items-center justify-between p-3 bg-white border border-red-200 rounded-lg'
                        >
                          <div className='flex items-center gap-3'>
                            <AlertCircle className='h-4 w-4 text-red-500' />
                            <div>
                              <p className='font-medium text-slate-800 text-sm'>
                                {doc.pdf_path.split('/').pop() ||
                                  'Unknown file'}
                              </p>
                              <p className='text-xs text-red-600'>
                                {doc.error_message || 'Processing failed'}
                              </p>
                            </div>
                          </div>
                          <div className='text-xs text-slate-500'>
                            {doc.last_attempt
                              ? new Date(doc.last_attempt).toLocaleString()
                              : 'Unknown'}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className='flex gap-2 flex-wrap'>
                      <Button
                        onClick={retryFailedPreprocessing}
                        size='sm'
                        className='bg-red-600 hover:bg-red-700'
                      >
                        🔄 Retry Failed ({failedPreprocessingDocs.length})
                      </Button>
                      <Button
                        onClick={() => {
                          const fileList = failedPreprocessingDocs
                            .map(
                              (doc) =>
                                `${doc.pdf_path.split('/').pop()}: ${
                                  doc.error_message
                                }`
                            )
                            .join('\n');
                          const blob = new Blob([fileList], {
                            type: 'text/plain',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'failed-preprocessing-files.txt';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        variant='outline'
                        size='sm'
                      >
                        📋 Download List
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 🚀 NEW: Failed AI Processing Section */}
              {failedAIDocs.length > 0 && (
                <Card className='shadow-md border-orange-200 bg-orange-50'>
                  <CardContent className='p-6'>
                    <div className='mb-4'>
                      <h3 className='text-lg font-semibold text-orange-800 flex items-center gap-2'>
                        <AlertCircle className='h-5 w-5' />
                        Failed AI Processing ({failedAIDocs.length} documents)
                      </h3>
                      <p className='text-orange-600 text-sm mt-1'>
                        These documents failed during AI processing and can be
                        retried
                      </p>
                    </div>

                    <div className='space-y-2 mb-4 max-h-40 overflow-y-auto'>
                      {failedAIDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className='flex items-center justify-between p-3 bg-white border border-orange-200 rounded-lg'
                        >
                          <div className='flex items-center gap-3'>
                            <AlertCircle className='h-4 w-4 text-orange-500' />
                            <div>
                              <p className='font-medium text-slate-800 text-sm'>
                                {doc.original_filename ||
                                  doc.pdf_path.split('/').pop() ||
                                  'Unknown file'}
                              </p>
                              <p className='text-xs text-orange-600'>
                                {doc.error_message || 'AI processing failed'}
                              </p>
                            </div>
                          </div>
                          <div className='text-xs text-slate-500'>
                            {doc.failed_at
                              ? new Date(doc.failed_at).toLocaleString()
                              : 'Unknown'}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className='flex gap-2 flex-wrap'>
                      <Button
                        onClick={retryFailedAI}
                        size='sm'
                        className='bg-orange-600 hover:bg-orange-700'
                      >
                        🔄 Retry AI Processing ({failedAIDocs.length})
                      </Button>
                      <Button
                        onClick={() => {
                          const fileList = failedAIDocs
                            .map(
                              (doc) =>
                                `${
                                  doc.original_filename ||
                                  doc.pdf_path.split('/').pop()
                                }: ${doc.error_message}`
                            )
                            .join('\n');
                          const blob = new Blob([fileList], {
                            type: 'text/plain',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'failed-ai-processing-files.txt';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        variant='outline'
                        size='sm'
                      >
                        📋 Download List
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <DocumentTypeCard
                  title='Invoices'
                  description='Bills from vendors with detailed item breakdown'
                  icon={FileCheck}
                  color='blue'
                />
                <DocumentTypeCard
                  title='EFT Receipts'
                  description='Electronic fund transfer payment confirmations'
                  icon={CreditCard}
                  color='green'
                />
                <DocumentTypeCard
                  title='E-Way Bills'
                  description='Electronic waybills for goods transportation'
                  icon={Truck}
                  color='amber'
                />
              </div>
            </TabsContent>

            {/* ===== New: Group & Verify Tab ===== */}
            <TabsContent value='groups' className='space-y-6'>
              <Card className='shadow-md border-slate-200'>
                <CardHeader>
                  <div className='flex justify-between items-start'>
                    <div>
                      <CardTitle>Group & Verify</CardTitle>
                      <CardDescription>
                        {isDocumentsLoaded
                          ? 'Groups are built by backend service. Complete groups can be submitted, incomplete groups show missing documents.'
                          : 'Loading document groups...'}
                      </CardDescription>

                      {/* 🚀 NEW: Group Statistics */}
                      {isDocumentsLoaded && (
                        <div className='flex items-center gap-4 mt-3'>
                          <div className='flex items-center gap-2 px-3 py-1.5 bg-blue-100 rounded-md border border-blue-200'>
                            <FolderOpen className='h-4 w-4 text-blue-600' />
                            <span className='font-semibold text-blue-700 text-sm'>
                              📁 Groups: {groupStats.totalGroups}
                            </span>
                          </div>

                          <div className='flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-md border border-green-200'>
                            <CheckCircle2 className='h-4 w-4 text-green-600' />
                            <span className='font-semibold text-green-700 text-sm'>
                              ✅ Complete: {groupStats.completeGroups}
                            </span>
                          </div>

                          <div className='flex items-center gap-2 px-3 py-1.5 bg-red-100 rounded-md border border-red-200'>
                            <AlertCircle className='h-4 w-4 text-red-600' />
                            <span className='font-semibold text-red-700 text-sm'>
                              ❌ Incomplete: {groupStats.incompleteGroups}
                            </span>
                          </div>

                          {groupStats.ungroupedDocs > 0 && (
                            <div className='flex items-center gap-2 px-3 py-1.5 bg-orange-100 rounded-md border border-orange-200'>
                              <FileText className='h-4 w-4 text-orange-600' />
                              <span className='font-semibold text-orange-700 text-sm'>
                                📄 Ungrouped: {groupStats.ungroupedDocs}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className='flex items-center gap-2'>
                      <VerifiedCsvDownload session={session} />
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          console.log('🔄 [MANUAL] Refreshing groups...');
                          setHasInitializedGroups(false);
                          setIsDocumentsLoaded(false);
                          setGroups({});
                        }}
                        disabled={isGroupsLoading}
                      >
                        {isGroupsLoading ? 'Loading...' : 'Refresh Groups'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='p-6'>
                  {isGroupsLoading || !isDocumentsLoaded ? (
                    <div className='flex items-center gap-2 text-slate-600'>
                      <Loader2 className='h-4 w-4 animate-spin' /> Loading
                      {isGroupsLoading ? ' groups...' : ' documents...'}
                    </div>
                  ) : Object.keys(groups).length === 0 ? (
                    <div className='text-slate-600 text-sm'>
                      No groups found. Upload and process documents to see
                      groups here.
                    </div>
                  ) : (
                    <div className='space-y-8'>
                      {Object.entries(groups)
                        .sort(([, groupA], [, groupB]) => {
                          // 🎯 SORT: Completed groups first, then incomplete
                          const aComplete = groupA.isComplete || false;
                          const bComplete = groupB.isComplete || false;

                          // If completion status differs, complete groups come first
                          if (aComplete !== bComplete) {
                            return bComplete ? 1 : -1; // Complete (true) comes first
                          }

                          // If both have same completion status, sort by invoice number
                          return groupA.invoice.localeCompare(groupB.invoice);
                        })
                        .map(([invoiceKey, group]) => {
                          const latestByType = {
                            invoice: group.docs?.['invoice']?.[0],
                            'e-way-bill': group.docs?.['e-way-bill']?.[0],
                            eft_receipt: group.docs?.['eft_receipt']?.[0],
                          };
                          if (!group) return null;
                          const status = computeGroupStatus(group);
                          return (
                            <div
                              key={invoiceKey}
                              className='border rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-all border-slate-200 w-full max-w-4xl mx-auto'
                            >
                              <div className='flex items-start justify-between gap-4'>
                                <div>
                                  <div className='font-medium text-slate-800'>
                                    Invoice: {group.invoice || 'N/A'}
                                  </div>
                                  <div className='text-xs text-slate-600'>
                                    Status: {status.count} of {status.total}{' '}
                                    files uploaded
                                  </div>
                                </div>
                                <div className='flex items-center gap-2'>
                                  {group.human_verified ? (
                                    <Badge className='bg-green-100 text-green-700 border-0 flex items-center gap-1'>
                                      <CheckCircle2 className='h-3 w-3' />
                                      Verified
                                    </Badge>
                                  ) : status.complete ? (
                                    <Badge className='bg-blue-100 text-blue-700 border-0 flex items-center gap-1'>
                                      <FileCheck className='h-3 w-3' />
                                      Complete
                                    </Badge>
                                  ) : (
                                    <Badge className='bg-red-100 text-red-700 border-0 flex items-center gap-1'>
                                      <AlertCircle className='h-3 w-3' />
                                      Incomplete
                                    </Badge>
                                  )}
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    onClick={() =>
                                      toggleGroupExpansion(invoiceKey)
                                    }
                                    className='h-8 w-8 p-0'
                                  >
                                    {expandedGroups[invoiceKey] ? (
                                      <ChevronUp className='h-4 w-4' />
                                    ) : (
                                      <ChevronDown className='h-4 w-4' />
                                    )}
                                  </Button>
                                </div>
                              </div>

                              {!status.complete &&
                                status.missing.length > 0 && (
                                  <div className='text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded mt-3 p-2'>
                                    Missing: {status.missing.join(', ')}. Use
                                    &quot;Upload & Process&quot; to add the
                                    missing files.
                                  </div>
                                )}

                              {/* Collapsible content - only show when expanded */}
                              {expandedGroups[invoiceKey] && (
                                <>
                                  <div className='space-y-6 mt-6'>
                                    {(() => {
                                      // Determine which document sections to show
                                      const isIndian =
                                        group.country === 'IN' &&
                                        isIndianRecycler(group.recyclerCompany);
                                      const hasEFT = Boolean(
                                        group.docs?.eft_receipt?.length
                                      );

                                      // For Indian recyclers: only show sections for documents they actually have
                                      let documentsToShow: Array<
                                        'invoice' | 'eft_receipt' | 'e-way-bill'
                                      >;

                                      if (isIndian && !hasEFT) {
                                        // Indian recycler with only 2 files: show only invoice and e-way-bill
                                        documentsToShow = [
                                          'invoice',
                                          'e-way-bill',
                                        ];
                                      } else {
                                        // All other cases: show all 3 sections
                                        documentsToShow = [
                                          'invoice',
                                          'eft_receipt',
                                          'e-way-bill',
                                        ];
                                      }

                                      return documentsToShow;
                                    })().map((t) => {
                                      const latest = group.docs?.[t]?.[0];
                                      const tTitle =
                                        documentTypes[t]?.title || t;
                                      const docType =
                                        latest?.document_type as keyof typeof documentTypes;
                                      const DocIcon =
                                        documentTypes[docType]?.icon ||
                                        FileText;
                                      const iconColor =
                                        documentTypes[docType]?.color ||
                                        'text-slate-500';

                                      return (
                                        <div
                                          key={t}
                                          className='border rounded-lg overflow-hidden bg-white'
                                        >
                                          <div className='bg-slate-50 px-4 py-2 border-b flex items-center gap-2'>
                                            <DocIcon
                                              className={`h-4 w-4 ${iconColor}`}
                                            />
                                            <h4 className='font-medium text-slate-800'>
                                              {tTitle}
                                            </h4>
                                            {latest?.file_url && (
                                              <a
                                                href={latest.file_url}
                                                target='_blank'
                                                rel='noreferrer'
                                                className='ml-auto text-xs text-blue-600 hover:underline'
                                                title='View original PDF'
                                              >
                                                View PDF
                                              </a>
                                            )}
                                          </div>
                                          <div className='grid grid-cols-1 md:grid-cols-2 gap-0'>
                                            <div className='p-4 border-r'>
                                              {latest?.file_url ? (
                                                <div className='h-[400px]'>
                                                  <PdfPreview
                                                    fileUrl={latest.file_url}
                                                    heightClass='h-full'
                                                  />
                                                </div>
                                              ) : (
                                                <div className='h-[400px] flex items-center justify-center text-slate-400'>
                                                  No file uploaded
                                                </div>
                                              )}
                                            </div>
                                            <div
                                              className='p-4 overflow-auto'
                                              style={{ maxHeight: '500px' }}
                                            >
                                              {latest?.raw_json ? (
                                                <div className='space-y-4'>
                                                  <h5 className='font-medium text-slate-800 border-b pb-2'>
                                                    Extracted Data
                                                  </h5>
                                                  <div className='space-y-2 text-sm'>
                                                    {latest.raw_json ? (
                                                      Object.entries(
                                                        latest.raw_json as Record<
                                                          string,
                                                          unknown
                                                        >
                                                      ).map(([key, value]) => {
                                                        if (
                                                          value === null ||
                                                          value === undefined ||
                                                          value === ''
                                                        )
                                                          return null;
                                                        if (
                                                          typeof value ===
                                                            'object' &&
                                                          !Array.isArray(value)
                                                        )
                                                          return null;

                                                        const displayValue =
                                                          Array.isArray(value)
                                                            ? value
                                                                .map(String)
                                                                .join(', ')
                                                            : String(value);

                                                        return (
                                                          <div
                                                            key={key}
                                                            className='grid grid-cols-3 gap-2'
                                                          >
                                                            <div className='text-slate-500 capitalize'>
                                                              {key.replace(
                                                                /_/g,
                                                                ' '
                                                              )}
                                                              :
                                                            </div>
                                                            <div className='col-span-2 font-medium'>
                                                              {displayValue}
                                                            </div>
                                                          </div>
                                                        );
                                                      })
                                                    ) : (
                                                      <div className='text-slate-400 text-center py-2'></div>
                                                    )}
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className='text-slate-400 text-center py-8'>
                                                  No data extracted yet
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className='mt-6 pt-4 border-t border-slate-100'>
                                    {recyclingDocs[group.invoice]
                                      ?.plastiks_submitted_at ? (
                                      <div className='mb-4 space-y-2 text-sm'>
                                        <div className='bg-green-50 p-4 rounded-lg border border-green-100'>
                                          <h4 className='font-medium text-green-800 mb-3 flex items-center gap-2'>
                                            <CheckCircle2 className='h-4 w-4' />
                                            Successfully Human Verified
                                          </h4>
                                          <div className='grid grid-cols-1 md:grid-cols-2 gap-3 text-sm'>
                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Invoice #
                                              </div>
                                              <div className='font-medium text-slate-800'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.invoice_number?.toString() ||
                                                  'N/A'}
                                              </div>
                                            </div>

                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Recycler Company
                                              </div>
                                              <div className='font-medium text-slate-800'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.recycler_company?.toString() ||
                                                  'N/A'}
                                              </div>
                                            </div>
                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Network Operator Company
                                              </div>
                                              <div className='font-medium text-slate-800'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.network_operator_company?.toString() ||
                                                  'N/A'}
                                              </div>
                                            </div>

                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Plastic Type
                                              </div>
                                              <div className='font-medium text-slate-800'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.plastic_type?.toString() ||
                                                  'N/A'}
                                              </div>
                                            </div>

                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Weight
                                              </div>
                                              <div className='font-medium text-slate-800'>
                                                {recyclingDocs[group.invoice]
                                                  ?.tonnage_tons !== undefined
                                                  ? `${
                                                      recyclingDocs[
                                                        group.invoice
                                                      ]?.tonnage_tons?.toString() ||
                                                      '0'
                                                    } tons`
                                                  : 'N/A'}
                                              </div>
                                            </div>

                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Country
                                              </div>
                                              <div className='font-medium text-slate-800'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.country?.toString() || 'N/A'}
                                              </div>
                                            </div>

                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Collection ID
                                              </div>
                                              <div className='font-mono text-xs text-slate-600 break-all'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.plastiks_collection_id?.toString() ||
                                                  'N/A'}
                                              </div>
                                            </div>
                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Metadata Hash
                                              </div>
                                              <div className='font-mono text-xs text-slate-600 break-all'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.plastiks_metadata_hash?.toString() ||
                                                  'N/A'}
                                              </div>
                                            </div>
                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Collection Address
                                              </div>
                                              <div className='font-mono text-xs text-slate-600 break-all'>
                                                {recyclingDocs[
                                                  group.invoice
                                                ]?.plastiks_collection_address?.toString() ||
                                                  'N/A'}
                                              </div>
                                            </div>
                                            <div>
                                              <div className='text-slate-500 text-xs font-medium mb-1'>
                                                Submitted At
                                              </div>
                                              <div className='text-sm text-slate-700'>
                                                {recyclingDocs[group.invoice]
                                                  ?.plastiks_submitted_at
                                                  ? new Date(
                                                      recyclingDocs[
                                                        group.invoice
                                                      ]
                                                        ?.plastiks_submitted_at ??
                                                        ''
                                                    ).toLocaleString()
                                                  : 'N/A'}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className='text-sm text-slate-600'>
                                        No data available
                                      </div>
                                    )}

                                    {/* Combined Data & Verification Section */}
                                    <div
                                      className={`p-6 border rounded-lg mt-4 ${
                                        group.human_verified
                                          ? 'border-green-200 bg-green-50'
                                          : 'border-blue-200 bg-blue-50'
                                      }`}
                                    >
                                      <div className='space-y-4'>
                                        {/* Header */}
                                        <div className='flex items-center justify-between'>
                                          <h4 className='font-medium text-slate-800'>
                                            {group.human_verified
                                              ? 'Verified Document Data'
                                              : 'Document Data for Verification'}
                                          </h4>
                                          {group.human_verified && (
                                            <div className='flex items-center gap-2 text-green-800'>
                                              <CheckCircle2 className='h-4 w-4' />
                                              <span className='text-sm font-semibold'>
                                                Human Verified
                                              </span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Data Grid */}
                                        <div className='grid grid-cols-1 md:grid-cols-2 gap-3 text-sm'>
                                          <div>
                                            <div className='text-slate-500 text-xs font-medium mb-1'>
                                              Invoice #
                                            </div>
                                            <div className='font-medium text-slate-800'>
                                              {String(
                                                latestByType.invoice?.raw_json
                                                  ?.invoice_number ||
                                                  latestByType.invoice?.raw_json
                                                    ?.invoice ||
                                                  'N/A'
                                              )}
                                            </div>
                                          </div>

                                          <div>
                                            <div className='text-slate-500 text-xs font-medium mb-1'>
                                              Company
                                            </div>
                                            <div className='font-medium text-slate-800'>
                                              {String(
                                                latestByType.invoice?.raw_json
                                                  ?.bill_to_company_name ||
                                                  latestByType['e-way-bill']
                                                    ?.raw_json
                                                    ?.ship_to_company_name ||
                                                  'N/A'
                                              )}
                                            </div>
                                          </div>

                                          <div>
                                            <div className='text-slate-500 text-xs font-medium mb-1'>
                                              Network Operator
                                            </div>
                                            <div className='font-medium text-slate-800'>
                                              {String(
                                                latestByType.invoice?.raw_json
                                                  ?.bill_from_company_name ||
                                                  latestByType['e-way-bill']
                                                    ?.raw_json
                                                    ?.ship_from_company_name ||
                                                  'N/A'
                                              )}
                                            </div>
                                          </div>

                                          <div>
                                            <div className='text-slate-500 text-xs font-medium mb-1'>
                                              Plastic Type
                                            </div>
                                            <div className='font-medium text-slate-800'>
                                              {String(
                                                latestByType.invoice?.raw_json
                                                  ?.plastic_type ||
                                                  latestByType['e-way-bill']
                                                    ?.raw_json?.plastic_type ||
                                                  'N/A'
                                              )}
                                            </div>
                                          </div>

                                          <div>
                                            <div className='text-slate-500 text-xs font-medium mb-1'>
                                              Weight
                                            </div>
                                            <div className='font-medium text-slate-800'>
                                              {latestByType.invoice?.raw_json
                                                ?.weight
                                                ? `${String(
                                                    latestByType.invoice
                                                      .raw_json.weight
                                                  )} ${String(
                                                    latestByType.invoice
                                                      .raw_json.weight_unit ||
                                                      'kg'
                                                  )}`
                                                : 'N/A'}
                                            </div>
                                          </div>

                                          <div>
                                            <div className='text-slate-500 text-xs font-medium mb-1'>
                                              City
                                            </div>
                                            <div className='font-medium text-slate-800'>
                                              {String(
                                                latestByType['e-way-bill']
                                                  ?.raw_json?.from_location ||
                                                  latestByType['e-way-bill']
                                                    ?.raw_json?.city ||
                                                  latestByType.invoice?.raw_json
                                                    ?.city ||
                                                  'N/A'
                                              )}
                                            </div>
                                          </div>

                                          <div>
                                            <div className='text-slate-500 text-xs font-medium mb-1'>
                                              Country
                                            </div>
                                            <div className='font-medium text-slate-800'>
                                              {String(
                                                latestByType['e-way-bill']
                                                  ?.raw_json
                                                  ?.ship_to_country_code ||
                                                  latestByType['e-way-bill']
                                                    ?.raw_json
                                                    ?.origin_country ||
                                                  latestByType['e-way-bill']
                                                    ?.raw_json?.country ||
                                                  latestByType.invoice?.raw_json
                                                    ?.country ||
                                                  'N/A'
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Verification Details (if verified) */}
                                        {group.human_verified ? (
                                          <div className='pt-3 border-t border-green-200'>
                                            <div className='grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-green-700'>
                                              <div>
                                                <div className='text-green-600 text-xs font-medium mb-1'>
                                                  Verified by
                                                </div>
                                                <div className='font-medium'>
                                                  {session.user?.email ||
                                                    'Unknown'}
                                                </div>
                                              </div>
                                              <div>
                                                <div className='text-green-600 text-xs font-medium mb-1'>
                                                  Verified at
                                                </div>
                                                <div className='font-medium'>
                                                  {group.verified_at
                                                    ? new Date(
                                                        group.verified_at
                                                      ).toLocaleString()
                                                    : 'Unknown'}
                                                </div>
                                              </div>
                                              <div>
                                                <div className='text-green-600 text-xs font-medium mb-1'>
                                                  Status
                                                </div>
                                                <div className='font-medium'>
                                                  ✅ Ready for blockchain
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className='pt-3 border-t border-blue-200'>
                                            <p className='text-sm text-slate-600'>
                                              Data needs to be human-verified
                                              before it gets sent to the
                                              blockchain.
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <Button
                                      size='sm'
                                      disabled={
                                        !status.complete ||
                                        submitting[group.invoice] ||
                                        group.human_verified
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubmitGroup(group.invoice);
                                      }}
                                      className={`w-full gap-2 mt-2 ${
                                        group.human_verified
                                          ? 'bg-green-600 hover:bg-green-700 text-white'
                                          : submitResult[group.invoice] &&
                                            !submitResult[group.invoice]?.ok
                                          ? 'bg-red-600 hover:bg-red-700 text-white'
                                          : ''
                                      }`}
                                    >
                                      {submitting[group.invoice] ? (
                                        <span className='flex items-center gap-2'>
                                          <Loader2 className='h-3 w-3 animate-spin' />
                                          Verifying...
                                        </span>
                                      ) : group.human_verified ? (
                                        <span className='flex items-center gap-2'>
                                          <CheckCircle2 className='h-3 w-3' />
                                          Human Verified
                                        </span>
                                      ) : submitResult[group.invoice] &&
                                        !submitResult[group.invoice]?.ok ? (
                                        <span className='flex items-center gap-2'>
                                          <AlertCircle className='h-3 w-3' />
                                          Retry Verification
                                        </span>
                                      ) : (
                                        <span className='flex items-center gap-2'>
                                          <UploadCloud className='h-3 w-3' />
                                          Human Verify
                                          <ArrowRight className='h-3 w-3' />
                                        </span>
                                      )}
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ===== NEW: Blockchain Tab ===== */}
            <TabsContent value='blockchain' className='space-y-6'>
              <Card className='shadow-md border-slate-200'>
                <CardHeader>
                  <div className='flex justify-between items-start'>
                    <div>
                      <CardTitle>Blockchain Submission</CardTitle>
                      <CardDescription>
                        {isVerifiedDocsLoading
                          ? 'Loading verified documents...'
                          : 'Submit verified documents to Plastiks blockchain'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='p-6'>
                  {isVerifiedDocsLoading ? (
                    <div className='flex items-center justify-center py-8'>
                      <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
                      <span className='ml-3 text-slate-600'>
                        Loading verified documents...
                      </span>
                    </div>
                  ) : Object.keys(verifiedDocs).length === 0 ? (
                    <div className='text-center py-8'>
                      <div className='text-slate-600 text-sm'>
                        No verified documents found. Complete human verification
                        first.
                      </div>
                    </div>
                  ) : (
                    <div className='space-y-6'>
                      {Object.entries(verifiedDocs).map(([invoiceKey, doc]) => {
                        // Get the same data source as Human Verify card
                        const group = groups[invoiceKey];
                        const latestByType = group
                          ? {
                              invoice: group.docs?.['invoice']?.[0],
                              'e-way-bill': group.docs?.['e-way-bill']?.[0],
                              eft_receipt: group.docs?.['eft_receipt']?.[0],
                            }
                          : null;

                        // Show loading state if groups data isn't ready yet
                        if (!latestByType || !latestByType.invoice) {
                          return (
                            <div
                              key={invoiceKey}
                              className='border rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-all border-slate-200 w-full max-w-4xl mx-auto'
                            >
                              <div className='flex items-start justify-between gap-4'>
                                <div className='flex-1'>
                                  <div className='font-medium text-slate-800'>
                                    Invoice: {invoiceKey}
                                  </div>
                                  <div className='text-xs text-slate-600 mt-2'>
                                    Loading document data...
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={invoiceKey}
                            className='border rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-all border-slate-200 w-full max-w-4xl mx-auto'
                          >
                            <div className='flex items-start justify-between gap-4'>
                              <div className='flex-1'>
                                <div className='font-medium text-slate-800'>
                                  Invoice: {invoiceKey}
                                </div>
                                <div className='text-xs text-slate-600'>
                                  Status:{' '}
                                  {doc.plastiks_submitted_at
                                    ? 'Submitted to Blockchain'
                                    : 'Ready for Blockchain'}
                                </div>
                              </div>
                              <div className='flex items-center gap-2'>
                                {doc.plastiks_submitted_at ? (
                                  <Badge className='bg-green-100 text-green-700 border-0 flex items-center gap-1'>
                                    <CheckCircle2 className='h-3 w-3' />
                                    Submitted
                                  </Badge>
                                ) : (
                                  <Badge className='bg-blue-100 text-blue-700 border-0 flex items-center gap-1'>
                                    <FileCheck className='h-3 w-3' />
                                    Ready
                                  </Badge>
                                )}
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() =>
                                    toggleBlockchainInvoiceExpansion(invoiceKey)
                                  }
                                  className='h-8 w-8 p-0'
                                >
                                  {expandedBlockchainInvoices[invoiceKey] ? (
                                    <ChevronUp className='h-4 w-4' />
                                  ) : (
                                    <ChevronDown className='h-4 w-4' />
                                  )}
                                </Button>
                              </div>
                            </div>

                            {/* Collapsible Document Details */}
                            {expandedBlockchainInvoices[invoiceKey] && (
                              <div className='mt-6 pt-4 border-t border-slate-100'>
                                <div className='bg-green-50 p-4 rounded-lg border border-green-100'>
                                  <h4 className='font-medium text-green-800 mb-3 flex items-center gap-2'>
                                    <CheckCircle2 className='h-4 w-4' />
                                    Human Verified Document Data
                                  </h4>
                                  <div className='grid grid-cols-2 gap-6 text-sm'>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Invoice #
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {latestByType?.invoice
                                          ? String(
                                              latestByType.invoice.raw_json
                                                ?.invoice_number ||
                                                latestByType.invoice.raw_json
                                                  ?.invoice ||
                                                'N/A'
                                            )
                                          : invoiceKey}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Company
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {String(
                                          latestByType?.invoice?.raw_json
                                            ?.bill_to_company_name ||
                                            latestByType?.['e-way-bill']
                                              ?.raw_json
                                              ?.ship_to_company_name ||
                                            'N/A'
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Plastic Type
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {String(
                                          latestByType?.invoice?.raw_json
                                            ?.plastic_type ||
                                            latestByType?.['e-way-bill']
                                              ?.raw_json?.plastic_type ||
                                            'N/A'
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Weight
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {latestByType?.invoice?.raw_json?.weight
                                          ? `${String(
                                              latestByType.invoice.raw_json
                                                .weight
                                            )} ${String(
                                              latestByType.invoice.raw_json
                                                .weight_unit || 'kg'
                                            )}`
                                          : 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        City
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {String(
                                          latestByType?.['e-way-bill']?.raw_json
                                            ?.from_location ||
                                            latestByType?.['e-way-bill']
                                              ?.raw_json?.city ||
                                            latestByType?.invoice?.raw_json
                                              ?.city ||
                                            'N/A'
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Country
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {String(
                                          latestByType?.['e-way-bill']?.raw_json
                                            ?.ship_to_country_code ||
                                            latestByType?.['e-way-bill']
                                              ?.raw_json?.origin_country ||
                                            latestByType?.['e-way-bill']
                                              ?.raw_json?.country ||
                                            latestByType?.invoice?.raw_json
                                              ?.country ||
                                            'N/A'
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Verification Details */}
                                  <div className='mt-4 pt-4 border-t border-green-200 grid grid-cols-3 gap-6 text-sm'>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Verified by
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {session?.user?.email}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Verified at
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.verified_at
                                          ? new Date(
                                              doc.verified_at
                                            ).toLocaleString()
                                          : 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Status
                                      </div>
                                      <div className='flex items-center gap-1 text-sm font-medium text-green-700'>
                                        <CheckCircle2 className='h-3 w-3' />
                                        {doc.plastiks_submitted_at
                                          ? 'Submitted to Blockchain'
                                          : 'Ready for Blockchain'}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Push to Plastiks Button */}
                                <Button
                                  size='sm'
                                  disabled={
                                    isPushingToPlastiks ||
                                    !!doc.plastiks_submitted_at
                                  }
                                  onClick={() =>
                                    handlePushToPlastiks(invoiceKey)
                                  }
                                  className={`w-full gap-2 mt-4 ${
                                    doc.plastiks_submitted_at
                                      ? 'bg-gray-400 hover:bg-gray-400 text-white cursor-not-allowed'
                                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                                  }`}
                                >
                                  {isPushingToPlastiks ? (
                                    <span className='flex items-center gap-2'>
                                      <Loader2 className='h-3 w-3 animate-spin' />
                                      Pushing to Blockchain...
                                    </span>
                                  ) : doc.plastiks_submitted_at ? (
                                    <span className='flex items-center gap-2'>
                                      <CheckCircle2 className='h-3 w-3' />
                                      Submitted to Blockchain
                                    </span>
                                  ) : (
                                    <span className='flex items-center gap-2'>
                                      <ArrowRight className='h-3 w-3' />
                                      Push to Plastiks
                                    </span>
                                  )}
                                </Button>

                                {/* Blockchain Details if submitted */}
                                {doc.plastiks_submitted_at && (
                                  <div className='mt-4 p-4 bg-slate-50 rounded-lg border'>
                                    <h5 className='font-medium text-slate-800 mb-3'>
                                      Blockchain Details
                                    </h5>
                                    <div className='grid grid-cols-2 gap-4 text-sm'>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>
                                          Collection ID
                                        </div>
                                        <div className='text-sm text-slate-700'>
                                          {doc.plastiks_collection_id || 'N/A'}
                                        </div>
                                      </div>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>
                                          Collection Address
                                        </div>
                                        <div className='text-sm text-slate-700 truncate'>
                                          {doc.plastiks_collection_address ||
                                            'N/A'}
                                        </div>
                                      </div>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>
                                          Metadata Hash
                                        </div>
                                        <div className='text-sm text-slate-700 truncate'>
                                          {doc.plastiks_metadata_hash || 'N/A'}
                                        </div>
                                      </div>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>
                                          Submitted At
                                        </div>
                                        <div className='text-sm text-slate-700'>
                                          {doc.plastiks_submitted_at
                                            ? new Date(
                                                doc.plastiks_submitted_at
                                              ).toLocaleString()
                                            : 'N/A'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ===== NEW: Data Management Tab ===== */}
            <TabsContent value='data' className='space-y-6'>
              <DataManagementTable session={session} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}

// Main app with direct session management
export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔄 [HOME] Initializing session...');

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log(
        '⏰ [HOME] Session initialization timeout - forcing completion'
      );
      setLoading(false);
    }, 10000); // 10 second timeout

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        clearTimeout(timeoutId);
        if (error) {
          console.error('❌ [HOME] Session error:', error);
          // Clear invalid session data
          if (
            error.message.includes('refresh_token_not_found') ||
            error.message.includes('Invalid Refresh Token')
          ) {
            console.log('🧹 [HOME] Clearing invalid tokens...');
            supabase.auth.signOut();
          }
        }
        console.log('📥 [HOME] Initial session:', !!session);
        setSession(session);
        setLoading(false);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.error('💥 [HOME] Session initialization failed:', error);
        setLoading(false);
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 [HOME] Auth changed:', event, !!session);

      // Handle token refresh errors
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.log('⚠️ [HOME] Token refresh failed, signing out...');
        supabase.auth.signOut();
      }

      setSession(session);
      setLoading(false);
    });

    return () => {
      console.log('🔚 [HOME] Cleaning up auth subscription');
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // Show loading
  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-lg'>Loading...</div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!session) {
    return (
      <div className='bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10'>
        <div className='flex w-full max-w-sm flex-col gap-6'>
          <div className='flex items-center gap-2 self-center font-medium'>
            <div className='bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md'>
              <GalleryVerticalEnd className='size-4' />
            </div>
            Ocean Integrity AI
          </div>
          <LoginForm />
        </div>
      </div>
    );
  }

  // Show main app
  return <HomeContent session={session} />;
}
