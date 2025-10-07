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
  // Fields from matched_records
  invoice_date?: string;
  bill_from_company?: string;
  ship_to_company?: string;
  invoice_weight_kg?: number;
  invoice_vehicle?: string;
  eway_vehicle?: string;
  invoice_file_url?: string;
  eway_file_url?: string;
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
  ChevronDown,
  ChevronUp,
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
import { documentTemplates } from '@/constants/document-templates';
import DocumentTypeCard from '@/components/document-type-card';
import { documentTypes } from '@/constants/document-types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { VideoText } from '@/components/magicui/video-text';
import { Session } from '@supabase/supabase-js';
import { LoginForm } from '@/components/login-form';
import { GalleryVerticalEnd } from 'lucide-react';
import { supabase } from '@/utils/supabase-browser';
import { DataManagementDashboard } from '@/components/data-management-dashboard';
import DashboardView from '@/components/dashboard-view';

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

  // Preprocessing state (NEW)
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [preprocessingProgress, setPreprocessingProgress] = useState('');
  const [totalPagesToProcess, setTotalPagesToProcess] = useState(0);

  // UI state
  const [activeTab, setActiveTab] = useState<
    'upload' | 'results' | 'dashboard' | 'blockchain' | 'data'
  >('upload');

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
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
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
      let activeBatchId = currentBatchId;

      if (!activeBatchId) {
        const { data: latestBatch, error: latestError } = await supabase
          .from('temp_documents')
          .select('upload_batch_id')
          .eq('user_id', session.user.id)
          .in('status', ['uploaded', 'processing', 'processed']) // ✅ Include 'processed' status
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestError) {
          console.warn(
            '⚠️ [checkDocumentsStatus] Error fetching latest batch:',
            latestError
          );
        }

        if (latestBatch?.upload_batch_id) {
          activeBatchId = latestBatch.upload_batch_id;
          setCurrentBatchId(latestBatch.upload_batch_id);
        }
      }

      if (!activeBatchId) {
        setTempDocumentsCount(0);
        setReadyDocumentsCount(0);
        return { temp: 0, ready: 0 };
      }

      const { data: tempDocs, error: tempError } = await supabase
        .from('temp_documents')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('upload_batch_id', activeBatchId)
        .in('status', ['uploaded', 'processing']);

      const { data: singleDocs, error: singleError } = await supabase
        .from('single_documents')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('upload_batch_id', activeBatchId)
        .eq('status', 'uploaded');

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
        `📊 [checkDocumentsStatus] Batch ${activeBatchId}: temp=${tempCount}, ready=${readyCount}`
      );

      setTempDocumentsCount(tempCount);
      setReadyDocumentsCount(readyCount);

      return { temp: tempCount, ready: readyCount };
    } catch (error) {
      console.error('❌ [checkDocumentsStatus] Database check failed:', error);
      setTempDocumentsCount(0);
      setReadyDocumentsCount(0);
      return { temp: 0, ready: 0 };
    }
  }, [currentBatchId, session?.user?.id]);

  // Toggle blockchain invoice expansion
  const toggleBlockchainInvoiceExpansion = (invoiceKey: string) => {
    setExpandedBlockchainInvoices((prev) => ({
      ...prev,
      [invoiceKey]: !prev[invoiceKey], // Default to false (collapsed)
    }));
  };

  // Legacy grouping loading hook removed - dashboard handles its own loading

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
  // Backend grouping state
  const [isGroupingInProgress, setIsGroupingInProgress] = useState(false);

  // Poll for updated Plastiks submission details (DEPRECATED - no longer used)
  // const [submitResult, setSubmitResult] = useState<Record<string, SubmitResult>>({});

  // DEPRECATED: Old submitResult polling logic removed
  // Blockchain submission now handled directly through matched_records

  // Blob URLs for PDF previews - moved to the main state section

  // 🚀 MATCHING SERVICE TRIGGER (New - replaces grouping)
  const triggerMatchingService = useCallback(
    async (processedCount: number) => {
      const matchingId = Math.random().toString(36).substring(2, 15);

      try {
        console.log(
          `🚀 Frontend: [matching:${matchingId}] Triggering matching service for ${processedCount} documents...`
        );

        const response = await fetch('/api/cron/compute-matches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({
            user_id: session?.user?.id,
            trigger: 'frontend_after_ai_processing',
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          console.log(
            `✅ Frontend: [matching:${matchingId}] Matching completed successfully:`,
            result
          );
          console.log(
            `   📊 Matched ${result.stats?.matchedPairs || 0} pairs (${
              result.stats?.compliantPairs || 0
            } compliant, ${result.stats?.flaggedPairs || 0} flagged)`
          );
        } else {
          console.error(
            `❌ Frontend: [matching:${matchingId}] Matching failed:`,
            result
          );
        }
      } catch (error) {
        console.error(
          `💥 Frontend: [matching:${matchingId}] Error triggering matching service:`,
          error
        );
      }
    },
    [session?.user?.id, session?.access_token]
  );

  // 🚀 BACKEND GROUPING SERVICE TRIGGER (Legacy - being phased out)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

          // DEPRECATED: Old grouping system
          console.log(
            `🔄 Frontend: [grouping:${groupingId}] Old grouping system (deprecated)`
          );

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

  // 🚀 Load processed documents from database on component mount
  useEffect(() => {
    let cancelled = false;

    const loadProcessedDocuments = async () => {
      try {
        console.log(
          '📄 [REVIEW] Loading ALL processed documents from database...'
        );

        const supabase = getSupabaseBrowser();
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

    return () => {
      cancelled = true;
    };
  }, [session.user.id, fetchFailedDocuments]); // Only depend on user ID, load on mount

  // 🚀 PERFORMANCE FIX: Lazy load groups data only when Push to Plastiks tab is clicked
  // DEPRECATED: Old document_groups loading logic removed
  // Blockchain tab now loads verified records directly from matched_records

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

        // Load human-verified matched records with plastiks submission status
        const supabase = getSupabaseBrowser();

        // Get verified matched records (both auto-verified compliant + manually-verified flagged)
        const { data: matchedRecords, error: matchedError } = await supabase
          .from('matched_records')
          .select('*')
          .eq('user_id', session.user.id) // Filter by current user
          .eq('human_verified', true) // Only verified documents
          .order('created_at', { ascending: false }); // Most recent first

        if (matchedError) {
          console.error(
            '❌ [BLOCKCHAIN] Failed to load verified records:',
            matchedError
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
          matchedRecords?.map((record) => ({
            ...record,
            // Add plastiks submission data if it exists
            plastiks_submitted_at:
              plastiksMap[record.invoice_number]?.plastiks_submitted_at || null,
            plastiks_collection_id:
              plastiksMap[record.invoice_number]?.plastiks_collection_id ||
              null,
            plastiks_collection_address:
              plastiksMap[record.invoice_number]?.plastiks_collection_address ||
              null,
            plastiks_metadata_hash:
              plastiksMap[record.invoice_number]?.plastiks_metadata_hash ||
              null,
          })) || [];

        const error = matchedError;

        if (error) {
          console.error('❌ [BLOCKCHAIN] Failed to load verified docs:', error);
          return;
        }

        if (cancelled) return;

        console.log(
          `✅ [BLOCKCHAIN] Loaded ${data?.length || 0} verified documents`
        );

        if (data && data.length > 0) {
          // Convert to map format for easy access
          const verifiedMap = data.reduce(
            (acc, doc) => ({
              ...acc,
              [doc.invoice_number]: {
                ...doc,
                // Ensure Plastiks submission fields are present
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
        `🔍 [upload:${uploadId}] Checking for potential duplicates in database (non-blocking)...`
      );

      const supabase = getSupabaseBrowser();
      const filesToUpload: File[] = [];
      const duplicateWarnings: { name: string; reason: string }[] = [];

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

        let duplicateFound = false;

        // Check temp_documents with EXACT filename match (not pattern)
        const { data: tempDocs, error: tempError } = await supabase
          .from('temp_documents')
          .select('pdf_path, upload_date, status')
          .eq('user_id', session?.user?.id)
          .eq('pdf_path', fileName)
          .limit(1);

        if (!tempError && tempDocs && tempDocs.length > 0) {
          console.log(
            `⚠️ [upload:${uploadId}] File ${fileName} already exists in temp_documents (${tempDocs[0].status}), warning but allowing upload...`
          );
          duplicateWarnings.push({
            name: fileName,
            reason: `File exists in temp_documents (${tempDocs[0].status}) - will check content duplicates during processing`,
          });
          duplicateFound = true;
        }

        // Check single_documents with EXACT filename match
        if (!duplicateFound) {
          const { data: singleDocs, error: singleError } = await supabase
            .from('single_documents')
            .select('pdf_path, upload_date, original_filename, status')
            .eq('user_id', session?.user?.id)
            .eq('original_filename', fileName)
            .limit(1);

          if (!singleError && singleDocs && singleDocs.length > 0) {
            console.log(
              `⚠️ [upload:${uploadId}] File ${fileName} already processed in single_documents (${singleDocs[0].status}), warning but allowing upload...`
            );
            duplicateWarnings.push({
              name: fileName,
              reason: `File exists in single_documents (${singleDocs[0].status}) - will check content duplicates during processing`,
            });
            duplicateFound = true;
          }
        }

        // Always add to upload queue - let content deduplication handle duplicates during AI processing
        console.log(
          `✅ [upload:${uploadId}] File ${fileName} will be uploaded${
            duplicateFound ? ' (with duplicate warning)' : ''
          }`
        );
        filesToUpload.push(file);
      }

      console.log(
        `📊 [upload:${uploadId}] Non-blocking duplicate check results:`
      );
      console.log(`   📤 Files to upload: ${filesToUpload.length}`);
      console.log(`   ⚠️ Duplicate warnings: ${duplicateWarnings.length}`);

      if (duplicateWarnings.length > 0) {
        console.log(
          `📋 [upload:${uploadId}] Duplicate warnings:`,
          duplicateWarnings
        );
        // Show user notification about potential duplicates
        setPreprocessingProgress(
          `${duplicateWarnings.length} potential duplicate(s) detected. Uploading ${filesToUpload.length} files - content deduplication will happen during processing...`
        );
      }

      return {
        filesToUpload,
        skippedFiles: [], // No files skipped in non-blocking mode
        duplicateCount: 0, // No files blocked
        newFilesCount: filesToUpload.length,
        totalFilesCount: files.length,
        duplicateWarnings, // New: warnings instead of blocks
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
      const batchId =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setCurrentBatchId(batchId);
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
          newFilesCount,
          totalFilesCount,
          duplicateWarnings,
        } = await checkForDuplicates(files, uploadId);

        // 🚀 PHASE 2: Set duplicate count and warning files for UI feedback
        setDuplicateFilesCount(duplicateWarnings?.length || 0);
        setSkippedFilesInfo(duplicateWarnings || []);

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
          `📊 [upload:${uploadId}] Processing ${newFilesCount} files (${
            duplicateWarnings?.length || 0
          } duplicate warnings)`
        );

        // 🚀 PHASE 2: Enhanced progress messaging for duplicate warnings
        if (duplicateWarnings && duplicateWarnings.length > 0) {
          setPreprocessingProgress(
            `${duplicateWarnings.length} potential duplicate(s) detected. Processing ${newFilesCount} files - content deduplication during AI processing...`
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
                upload_batch_id: batchId,
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
            duplicateWarnings && duplicateWarnings.length > 0
              ? `Preparing ${uploadedPaths.length} documents (${duplicateWarnings.length} duplicate warnings)...`
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
                upload_batch_id: batchId,
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

            // IMMEDIATE status check after preprocessing
            (async () => {
              try {
                const successMessage =
                  result.processed > uploadedPaths.length
                    ? `Ready! ${uploadedPaths.length} files split into ${result.processed} pages for AI processing`
                    : `Ready! ${result.processed} pages prepared for AI processing`;

                setPreprocessingProgress(successMessage);
                setIsPreprocessing(false);

                // 🚀 CRITICAL FIX: Query database IMMEDIATELY using the known batch ID
                console.log(
                  `🔄 [PHASE4] Preprocessing completed - checking status for batch: ${batchId}`
                );

                const supabase = getSupabaseBrowser();

                // Query single_documents directly with the batch ID we just created
                const { data: readyDocs, error: readyError } = await supabase
                  .from('single_documents')
                  .select('id')
                  .eq('user_id', session.user.id)
                  .eq('upload_batch_id', batchId)
                  .eq('status', 'uploaded');

                if (readyError) {
                  console.error(
                    `❌ [PHASE4] Error checking single_documents:`,
                    readyError
                  );
                } else {
                  const count = readyDocs?.length || 0;
                  console.log(
                    `✅ [PHASE4] Found ${count} documents ready for AI in batch ${batchId}`
                  );

                  // FORCE state update immediately
                  setReadyDocumentsCount(count);
                  setTempDocumentsCount(0); // Preprocessing is done

                  console.log(
                    `✅ [PHASE4] Button should now be ENABLED with ${count} documents`
                  );
                }
              } catch (error) {
                console.error(
                  `❌ [PHASE4] Error in post-preprocessing status check:`,
                  error
                );
              }
            })();
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
    let singleDocsQuery = supabase
      .from('single_documents')
      .select('*')
      .eq('status', 'uploaded')
      .eq('user_id', session?.user?.id)
      .order('upload_date', { ascending: true });

    if (currentBatchId) {
      singleDocsQuery = singleDocsQuery.eq('upload_batch_id', currentBatchId);
    }

    const { data: singleDocs, error: fetchError } = await singleDocsQuery;

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
          `🔄 Frontend: Processing completed for ${processedCount} new documents`
        );
      }
    } catch (batchError) {
      console.error(`💥 Frontend: Batch processing error:`, batchError);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingIndex(-1);
      console.log(`🔄 Frontend: Processing state reset`);

      // 🚀 TRIGGER MATCHING SERVICE AFTER AI PROCESSING COMPLETES
      if (localCompletedCount > 0) {
        console.log(
          `🔧 Frontend: Triggering matching service for ${localCompletedCount} processed documents...`
        );
        triggerMatchingService(localCompletedCount);
      }

      // 🚀 REFRESH FAILED DOCUMENTS LIST AFTER PROCESSING
      fetchFailedDocuments();

      // Auto-redirect to Dashboard tab after successful processing
      if (localCompletedCount > 0) {
        console.log(
          `🔄 Frontend: Auto-redirecting to Dashboard tab (${localCompletedCount} pages processed)`
        );
        setTimeout(() => {
          setActiveTab('dashboard');
          console.log(`✅ Frontend: Successfully switched to Dashboard tab`);
        }, 2000); // 2 second delay to let user see completion message
      }
    }
  };

  // Cleanup session management on component unmount
  useEffect(() => {
    const sessionManager = sessionManagerRef.current;
    return () => {
      console.log(
        '🧹 [CLEANUP] Component unmounting - cleaning up session management'
      );
      if (sessionManager.keepAliveInterval) {
        clearInterval(sessionManager.keepAliveInterval);
      }
      if (sessionManager.warningTimeout) {
        clearTimeout(sessionManager.warningTimeout);
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
                v as 'upload' | 'results' | 'dashboard' | 'blockchain' | 'data'
              )
            }
            className='space-y-6'
          >
            <div className='flex justify-center'>
              <TabsList className='grid w-full grid-cols-4'>
                <TabsTrigger value='upload' className='text-base py-1'>
                  Upload & Process
                </TabsTrigger>

                <TabsTrigger value='dashboard' className='text-base py-1'>
                  Dashboard
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

            {/* ===== NEW: Dashboard Tab ===== */}
            <TabsContent value='dashboard' className='space-y-6'>
              <DashboardView session={session} />
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
                                    Verified Compliant Record
                                  </h4>
                                  <div className='grid grid-cols-2 gap-6 text-sm'>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Invoice #
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.invoice_number || 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Invoice Date
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.invoice_date || 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        From Company
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.bill_from_company || 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        To Company
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.ship_to_company || 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Plastic Type
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.plastic_type || 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Weight (MT)
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.invoice_weight_kg
                                          ? Math.round(
                                              doc.invoice_weight_kg / 1000
                                            )
                                          : 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Vehicle Number
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.invoice_vehicle ||
                                          doc.eway_vehicle ||
                                          'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        Country
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.country || 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className='text-slate-500 text-xs font-medium mb-1'>
                                        City
                                      </div>
                                      <div className='text-sm text-slate-700'>
                                        {doc.city || 'N/A'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Document Links */}
                                  <div className='mt-4 pt-4 border-t border-green-200'>
                                    <div className='flex items-center gap-4'>
                                      <a
                                        href={doc.invoice_file_url}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='inline-flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm font-medium'
                                      >
                                        📄 View Invoice
                                      </a>
                                      <a
                                        href={doc.eway_file_url}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='inline-flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm font-medium'
                                      >
                                        📄 View Eway Bill
                                      </a>
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
              <DataManagementDashboard
                session={session}
                onProcessDocuments={processFiles}
                isProcessing={isProcessing}
              />
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
    let mounted = true;

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log(
        '⏰ [HOME] Session initialization timeout - forcing completion'
      );
      if (mounted) {
        setLoading(false);
      }
    }, 3000); // 3 second timeout (reduced from 10)

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return;
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
        console.log('📥 [HOME] Initial session:', session ? 'EXISTS' : 'NULL');
        setSession(session);
        setLoading(false);
      })
      .catch((error) => {
        if (!mounted) return;
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
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // Show loading
  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-slate-50'>
        <div className='text-center'>
          <div className='text-lg font-semibold text-slate-700 mb-2'>
            Loading Ocean Integrity...
          </div>
          <div className='text-sm text-slate-500'>Initializing session</div>
        </div>
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
