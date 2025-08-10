'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Document as AppDocument } from '@/types/document-types';
import type { ProcessedDocument } from '@/types/processed-document';
import { FileText, AlertCircle, CheckCircle2, ArrowRight, Loader2, Clock, FileCheck, CreditCard, Truck, UploadCloud } from 'lucide-react';
import { getInvoiceGroupKey, isSameInvoice } from '@/lib/invoiceUtils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSupabaseBrowser } from '@/utils/supabase-browser';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import FileUploader from '@/components/file-uploader';
import dynamic from 'next/dynamic';
import DataSheet from '@/components/data-sheet';
// Import documentTemplates for default document structure
import { documentTemplates } from '@/constants/document-templates';
// import { setDocumentField, documentEntries } from "@/types/document-types-util"; // Removed unused imports
import DocumentTypeCard from '@/components/document-type-card';
import { documentTypes } from '@/constants/document-types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VideoText } from '@/components/magicui/video-text';
import CSVDownloadBtn from '@/components/csv-download-btn';

const PdfPreview = dynamic(() => import('@/components/pdf-preview'), {
  ssr: false,
});

// Helper function to create blob URL for database-stored PDFs
const createPdfBlobUrl = async (databaseId: string): Promise<string | null> => {
  try {
    console.log(
      `🔄 Frontend: Creating blob URL for database document ${databaseId}`
    );

    const response = await fetch(`/api/serve-document/${databaseId}`);
    if (!response.ok) {
      console.error(
        `❌ Frontend: Failed to fetch database document ${databaseId}`
      );
      return null;
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    console.log(`✅ Frontend: Created blob URL for document ${databaseId}`);
    return blobUrl;
  } catch (error) {
    console.error(
      `💥 Frontend: Error creating blob URL for ${databaseId}:`,
      error
    );
    return null;
  }
};

// Component to handle PDF preview for both Supabase Storage and Database files
interface DocumentPdfPreviewProps {
  doc: ProcessedDocument;
  blobUrls: Map<string, string>;
  setBlobUrls: React.Dispatch<React.SetStateAction<Map<string, string>>>;
}

const DocumentPdfPreview: React.FC<DocumentPdfPreviewProps> = ({
  doc,
  blobUrls,
  setBlobUrls,
}) => {
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);
  const [blobError, setBlobError] = useState<string | null>(null);

  const getPdfUrl = useCallback(async (): Promise<string | null> => {
    // Case 1: Supabase Storage file (has fileUrl)
    if (doc.fileUrl) {
      console.log(
        `🔗 Frontend: Using Supabase Storage URL for ${doc.fileName}`
      );
      return doc.fileUrl;
    }

    // Case 2: Database-stored file (has databaseId)
    if (doc.databaseId) {
      // Check if we already have a blob URL for this document
      if (blobUrls.has(doc.databaseId)) {
        console.log(`♻️ Frontend: Using cached blob URL for ${doc.fileName}`);
        return blobUrls.get(doc.databaseId)!;
      }

      // Create new blob URL
      console.log(
        `🔄 Frontend: Creating new blob URL for database document ${doc.fileName}`
      );
      setIsLoadingBlob(true);
      setBlobError(null);

      try {
        const blobUrl = await createPdfBlobUrl(doc.databaseId);
        if (blobUrl) {
          // Cache the blob URL
          setBlobUrls((prev) => new Map(prev).set(doc.databaseId!, blobUrl));
          console.log(`✅ Frontend: Cached blob URL for ${doc.fileName}`);
          return blobUrl;
        } else {
          setBlobError('Failed to create preview');
          return null;
        }
      } catch (error) {
        console.error(
          `💥 Frontend: Error creating blob URL for ${doc.fileName}:`,
          error
        );
        setBlobError('Error loading preview');
        return null;
      } finally {
        setIsLoadingBlob(false);
      }
    }

    console.log(`⚠️ Frontend: No file URL or database ID for ${doc.fileName}`);
    return null;
  }, [doc.fileUrl, doc.databaseId, doc.fileName, blobUrls, setBlobUrls]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Load PDF URL when component mounts or doc changes
  useEffect(() => {
    let mounted = true;

    getPdfUrl().then((url) => {
      if (mounted) {
        setPdfUrl(url);
      }
    });

    return () => {
      mounted = false;
    };
  }, [getPdfUrl]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (doc.databaseId && blobUrls.has(doc.databaseId)) {
        const blobUrl = blobUrls.get(doc.databaseId);
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          console.log(`🧹 Frontend: Cleaned up blob URL for ${doc.fileName}`);
        }
      }
    };
  }, [doc.databaseId, blobUrls, doc.fileName]);

  // Render the appropriate state
  if (isLoadingBlob) {
    return (
      <div className='flex flex-col'>
        <h4 className='font-medium text-slate-800 mb-2 text-sm'>
          Document Preview
        </h4>
        <div className='flex items-center justify-center p-8 bg-slate-50 rounded-lg'>
          <Loader2 className='h-6 w-6 animate-spin text-blue-500' />
          <span className='ml-2 text-slate-600'>Loading preview...</span>
        </div>
      </div>
    );
  }

  if (blobError) {
    return (
      <div className='flex flex-col'>
        <h4 className='font-medium text-slate-800 mb-2 text-sm'>
          Document Preview
        </h4>
        <div className='flex items-center justify-center p-8 bg-red-50 rounded-lg'>
          <AlertCircle className='h-6 w-6 text-red-500' />
          <span className='ml-2 text-red-600'>{blobError}</span>
        </div>
      </div>
    );
  }

  if (pdfUrl) {
    return (
      <div className='flex flex-col'>
        <h4 className='font-medium text-slate-800 mb-2 text-sm'>
          Document Preview
          {doc.storageType === 'database' && (
            <Badge variant='outline' className='ml-2 text-xs'>
              Database
            </Badge>
          )}
        </h4>
        <PdfPreview fileUrl={pdfUrl} />
      </div>
    );
  }

  // No preview available
  return (
    <div className='flex flex-col'>
      <h4 className='font-medium text-slate-800 mb-2 text-sm'>
        Document Preview
      </h4>
      <div className='flex items-center justify-center p-8 bg-slate-50 rounded-lg'>
        <FileText className='h-6 w-6 text-slate-400' />
        <span className='ml-2 text-slate-500'>
          Preview not available
          {doc.databaseId && (
            <div className='mt-2 text-xs'>
              <p>Database ID: {doc.databaseId}</p>
              <p>Storage Type: {doc.storageType}</p>
              <p>Has fileUrl: {doc.fileUrl ? 'Yes' : 'No'}</p>
            </div>
          )}
        </span>
      </div>
    </div>
  );
};

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
};

type InvoiceGroup = {
  invoice: string;
  docs: Partial<Record<'invoice' | 'eft_receipt' | 'e-way-bill', GroupDoc[]>>;
};

// Define the shape of the submit result
interface SubmitResult {
  ok: boolean;
  message: string;
}

export default function Home() {
  // Document processing state
  const [files, setFiles] = useState<File[]>([]);
  const [processedDocuments, setProcessedDocuments] = useState<ProcessedDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDocumentsLoaded, setIsDocumentsLoaded] = useState(false);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'upload' | 'results' | 'groups' | 'submit'>('upload');
  
  // Document grouping state
  const [groups, setGroups] = useState<Record<string, InvoiceGroup>>({});
  const [recyclingDocs, setRecyclingDocs] = useState<Record<string, any>>({});
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);
  // Track all processed invoice numbers for validation
  const [processedInvoiceNumbers, setProcessedInvoiceNumbers] = useState<Set<string>>(new Set());
  
  // Submission state
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [submitResult, setSubmitResult] = useState<Record<string, SubmitResult>>({});
  
  // Poll for updated Plastiks submission details
  useEffect(() => {
    if (!submitResult || Object.keys(submitResult).length === 0) return;
    
    // Find all invoice numbers that were just submitted successfully
    const submittedInvoices = Object.entries(submitResult)
      .filter(([_, result]) => result?.ok)
      .map(([invoice]) => invoice);

    if (submittedInvoices.length === 0) return;

    // Initial fetch
    const fetchUpdatedDocs = async () => {
      try {
        console.log('Polling for updated Plastiks details for invoices:', submittedInvoices);
        const supabase = getSupabaseBrowser();
        const { data: updatedDocs, error } = await supabase
          .from('recycling_docs')
          .select('*')
          .in('invoice_number', submittedInvoices);

        if (error) {
          console.error('Error polling for updated docs:', error);
          return;
        }

        console.log('Received updated docs:', JSON.stringify(updatedDocs, null, 2));

        if (updatedDocs && updatedDocs.length > 0) {
          setRecyclingDocs(prev => {
            const updated = { ...prev };
            updatedDocs.forEach(doc => {
              if (doc.invoice_number) {
                const updatedDoc = {
                  ...(updated[doc.invoice_number] || {}),
                  ...doc,
                  plastiks_collection_address: doc.plastiks_collection_address || updated[doc.invoice_number]?.plastiks_collection_address,
                  plastiks_metadata_hash: doc.plastiks_metadata_hash || updated[doc.invoice_number]?.plastiks_metadata_hash,
                  plastiks_submitted_at: doc.plastiks_submitted_at || updated[doc.invoice_number]?.plastiks_submitted_at,
                };
                
                console.log(`Updating doc ${doc.invoice_number}:`, {
                  hasAddress: !!updatedDoc.plastiks_collection_address,
                  hasHash: !!updatedDoc.plastiks_metadata_hash,
                  doc: updatedDoc
                });
                
                updated[doc.invoice_number] = updatedDoc;
              }
            });
            return updated;
          });
        }
      } catch (err) {
        console.error('Error in polling function:', err);
      }
    };

    // Initial fetch
    fetchUpdatedDocs();

    // Set up polling interval (every 3 seconds)
    const intervalId = setInterval(fetchUpdatedDocs, 3000);

    // Clean up interval on component unmount or when dependencies change
    return () => clearInterval(intervalId);
  }, [submitResult]);

  // Initialize submitting state for all groups
  useEffect(() => {
    const initialSubmitting: Record<string, boolean> = {};
    Object.keys(groups).forEach(invoice => {
      initialSubmitting[invoice] = false;
    });
    setSubmitting(prev => ({
      ...initialSubmitting,
      ...prev
    }));
  }, [groups]);
  
  // Blob URLs for PDF previews - moved to the main state section

  // Calculate the status of a group (complete status, count of files, missing files)
  const computeGroupStatus = (group: InvoiceGroup | undefined) => {
    if (!group?.docs) {
      return { complete: false, count: 0, missing: ['invoice', 'eft_receipt', 'e-way-bill'] };
    }

    const hasInvoice = Boolean(group.docs.invoice?.length);
    const hasEftReceipt = Boolean(group.docs.eft_receipt?.length);
    const hasEWayBill = Boolean(group.docs['e-way-bill']?.length);
    
    const count = [hasInvoice, hasEftReceipt, hasEWayBill].filter(Boolean).length;
    const missing = [
      !hasInvoice && 'invoice',
      !hasEftReceipt && 'eft_receipt',
      !hasEWayBill && 'e-way-bill'
    ].filter(Boolean) as string[];

    return {
      complete: hasInvoice && hasEftReceipt && hasEWayBill,
      count,
      missing
    };
  };

  // Check if an invoice group is complete (has invoice, EFT receipt, and e-way bill)
  const isCompleteGroup = useCallback((invoiceKey: string, groupsMap: Record<string, InvoiceGroup>): boolean => {
    if (!invoiceKey) return false;
    
    // Find all groups that match this invoice (handling different formats)
    const matchingGroups = Object.entries(groupsMap).filter(([key]) => 
      isSameInvoice(key, invoiceKey)
    );
    
    // If no matches, it's not complete
    if (matchingGroups.length === 0) return false;
    
    // Check if any matching group is complete
    return matchingGroups.some(([_, group]) => {
      const hasInvoice = group.docs.invoice && group.docs.invoice.length > 0;
      const hasEftReceipt = group.docs.eft_receipt && group.docs.eft_receipt.length > 0;
      const hasEWayBill = group.docs['e-way-bill'] && group.docs['e-way-bill'].length > 0;
      
      const isComplete = hasInvoice && hasEftReceipt && hasEWayBill;
      console.log(`Group '${invoiceKey}' is ${isComplete ? 'complete' : 'incomplete'}`);
      return isComplete;
    });
  }, []);

  // Track if an invoice number is from a processed invoice (not just a reference)
  const trackProcessedInvoice = useCallback((invoiceNumber: string) => {
    if (invoiceNumber) {
      setProcessedInvoiceNumbers(prev => {
        const updated = new Set(prev);
        updated.add(invoiceNumber);
        return updated;
      });
    }
  }, []);

  // Build/merge a single parsed_documents row into groups map
  const mergeRowIntoGroups = useCallback(
    (row: GroupDoc, map: Record<string, InvoiceGroup>) => {
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
            console.log(`Skipping '${invoiceKey}' - already part of a complete group`);
            return;
          }
          
          // Find existing group with matching invoice number (handling different formats)
          const existingKey = Object.keys(map).find(key => 
            isSameInvoice(key, invoiceKey)
          );
          
          const groupKey = existingKey || getInvoiceGroupKey(invoiceKey);
          
          if (!map[groupKey]) {
            console.log(`Creating new group for invoice: '${invoiceKey}'`);
            map[groupKey] = {
              invoice: invoiceKey,
              docs: {}
            };
          }
          
          // Add document to the appropriate document type array
          const docType = row.document_type;
          if (!map[groupKey].docs[docType]) {
            map[groupKey].docs[docType] = [];
          }
          
          // Check if this document is already in the group to avoid duplicates
          if (!map[groupKey].docs[docType]?.some(doc => doc.id === row.id)) {
            map[groupKey].docs[docType] = [
              ...(map[groupKey].docs[docType] || []),
              row
            ];
            console.log(`Added document ${row.id} to group ${groupKey} as type ${docType}`);
          }
        };
        
        // Get the primary invoice key from the document
        const rj = (row.raw_json || {}) as Record<string, unknown>;
        const primary = (
          (rj.anchor_key || rj.invoice || '') as string
        ).toString().trim();
        
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
          const validReferences = [secondInvoice, thirdInvoice].filter(inv => 
            inv && processedInvoiceNumbers.has(inv)
          );
          
          validReferences.forEach(invoice => {
            console.log(`Processing valid invoice reference from EFT: '${invoice}'`);
            ensureGroup(invoice);
          });
          
          console.log('Processed EFT receipt with references:', {
            id: row.id,
            primary,
            secondInvoice,
            thirdInvoice
          });
          
          // Process additional invoices if they're different from primary
          if (secondInvoice && secondInvoice !== primary) {
            console.log(`Processing second_invoice: ${secondInvoice}`);
            ensureGroup(secondInvoice);
          }
          
          if (thirdInvoice && thirdInvoice !== primary && thirdInvoice !== secondInvoice) {
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
    [isCompleteGroup, isSameInvoice, getInvoiceGroupKey]
  );

  // Load recycling docs data with all required fields
  useEffect(() => {
    let cancelled = false;
    
    const loadRecyclingDocs = async () => {
      if (!isDocumentsLoaded) return;
      
      try {
        const supa = getSupabaseBrowser();
        const { data, error } = await supa
          .from('recycling_docs')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (!cancelled && !error && data) {
          const docsMap = data.reduce((acc, doc) => ({
            ...acc,
            [doc.invoice_number]: {
              ...doc,
              // Ensure we have all required fields with defaults
              tonnage_tons: doc.tonnage_tons || 0,
              country: doc.country || doc.origin || '',
              plastic_type: doc.plastic_type || 'Unknown',
              recycler_company: doc.recycler_company || 'Unknown',
              plastiks_collection_id: doc.plastiks_collection_id || null,
              plastiks_collection_address: doc.plastiks_collection_address || null,
              plastiks_metadata_hash: doc.plastiks_metadata_hash || null,
              plastiks_submitted_at: doc.plastiks_submitted_at || null,
            }
          }), {});
          setRecyclingDocs(docsMap);
        }
      } catch (error) {
        console.error('Error loading recycling docs:', error);
      }
    };
    
    loadRecyclingDocs();
    
    return () => {
      cancelled = true;
    };
  }, [isDocumentsLoaded]);

  // Realtime subscription to parsed_documents
  useEffect(() => {
    const supa = getSupabaseBrowser();
    let cancelled = false;

    const loadInitial = async () => {
      setIsGroupsLoading(true);
      try {
        const { data, error } = await supa
          .from('parsed_documents')
          .select('id, document_type, file_url, created_at, raw_json')
          .order('created_at', { ascending: false })
          .limit(1000);
          
        if (error) {
          console.error('Failed to load parsed_documents', error);
          return;
        }
        
        if (cancelled) return;
        
        // Only process groups if we have data
        if (data && data.length > 0) {
          const map: Record<string, InvoiceGroup> = {};
          
          (data as unknown as GroupDoc[]).forEach((row) => {
            if (!row) return;
            
            // Get the primary invoice key from the document
            const rj = (row.raw_json || {}) as Record<string, unknown>;
            const primary = (rj.anchor_key || rj.invoice || '') as string;
            
            if (!primary) return;
            
            // Ensure we have a valid document type
            if (!row.document_type) return;
            
            // Skip if document type is not one we care about
            if (!['invoice', 'eft_receipt', 'e-way-bill'].includes(row.document_type)) {
              return;
            }
            
            // Merge the row into groups
            mergeRowIntoGroups(row, map);
          });
          
          // Update the groups state
          setGroups(map);
          setIsDocumentsLoaded(true);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        if (!cancelled) {
          setIsGroupsLoading(false);
        }
      }
    };

    loadInitial();

    const channel = supa
      .channel('parsed_documents_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parsed_documents' },
        (payload: any) => {
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
      supa.removeChannel(channel);
    };
  }, [mergeRowIntoGroups]);

  // computeGroupStatus is defined above with more comprehensive implementation

  const handleSubmitGroup = useCallback(async (invoice: string) => {
    setSubmitting((prev) => ({ ...prev, [invoice]: true }));
    setSubmitResult((prev) => ({
      ...prev,
      [invoice]: { ok: false, message: '' },
    }));
    try {
      console.log(`[UI] Promote starting for invoice='${invoice}'`);
      const devSecret = process.env.NEXT_PUBLIC_LOCAL_CRON_SECRET;
      const promoteUrl = devSecret
        ? `/api/recycling-docs/promote?secret=${encodeURIComponent(
            devSecret
          )}&invoice=${encodeURIComponent(invoice)}`
        : `/api/recycling-docs/promote?invoice=${encodeURIComponent(invoice)}`;
      // Step 1: Promote latest parsed_documents rows into recycling_docs
      const promoteResp = await fetch(promoteUrl, { method: 'POST' });
      const promoteJson = await promoteResp.json().catch(() => ({}));
      console.log(`[UI] Promote response ok=${promoteResp.ok}`, promoteJson);
      if (!promoteResp.ok) {
        setSubmitResult((prev) => ({
          ...prev,
          [invoice]: {
            ok: false,
            message: promoteJson?.error
              ? `Promote failed: ${promoteJson.error}`
              : 'Promote failed',
          },
        }));
        console.warn(`[UI] Promote failed for invoice='${invoice}'`);
        return;
      }

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
        setSubmitResult((prev) => ({
          ...prev,
          [invoice]: { ok: true, message: 'Submitted' },
        }));
        console.log(`[UI] Submit succeeded for invoice='${invoice}'`);
      } else {
        setSubmitResult((prev) => ({
          ...prev,
          [invoice]: { ok: false, message: json?.error || 'Submission failed' },
        }));
        console.warn(`[UI] Submit failed for invoice='${invoice}'`);
      }
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
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map()); // Track blob URLs for database files

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    console.log(`📁 Frontend: Adding ${newFiles.length} new files`);

    setFiles((prevFiles) => {
      const updatedFiles = [...prevFiles];
      let addedCount = 0;

      newFiles.forEach((newFile) => {
        console.log(
          `🔍 Frontend: Checking file - ${newFile.name} (${(
            newFile.size / 1024
          ).toFixed(2)} KB)`
        );

        // Check if a file with the same name and size already exists
        if (
          !updatedFiles.some(
            (existingFile) =>
              existingFile.name === newFile.name &&
              existingFile.size === newFile.size
          )
        ) {
          updatedFiles.push(newFile);
          addedCount++;
          console.log(`✅ Frontend: Added file - ${newFile.name}`);
        } else {
          console.log(`⚠️ Frontend: Skipped duplicate file - ${newFile.name}`);
        }
      });

      console.log(
        `📊 Frontend: Files summary - Added: ${addedCount}, Total: ${updatedFiles.length}`
      );
      return updatedFiles;
    });
  }, []);

  const handleRemoveFile = (index: number) => {
    const fileName = files[index]?.name;
    console.log(`🗑️ Frontend: Removing file at index ${index} - ${fileName}`);

    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    setProcessedDocuments((prevDocs) => prevDocs.filter((_, i) => i !== index));

    console.log(`✅ Frontend: File removed - ${fileName}`);
  };

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

  const processFiles = async () => {
    if (files.length === 0) {
      console.log(`⚠️ Frontend: No files to process`);
      return;
    }

    console.log(`🚀 Frontend: === STARTING BATCH PROCESSING ===`);
    console.log(`📊 Frontend: Processing ${files.length} files`);
    console.log(`⏰ Frontend: Started at ${new Date().toISOString()}`);

    setIsProcessing(true);
    setCurrentProcessingIndex(0);
    setProcessingProgress(0);

    // Initialize processed documents array
    console.log(
      `🔄 Frontend: Initializing document array with invoice templates`
    );
    const initialDocs: ProcessedDocument[] = files.map((file, index) => {
      console.log(
        `📝 Frontend: Creating initial doc ${index + 1}/${files.length} - ${
          file.name
        }`
      );
      return {
        fileName: file.name,
        documentType: '',
        data: JSON.parse(
          JSON.stringify(documentTemplates.invoice)
        ) as AppDocument,
        fileUrl: '',
        status: 'pending',
      };
    });
    setProcessedDocuments(initialDocs);

    const batchStartTime = Date.now();

    try {
      // Process files one by one
      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];

        // Add progressive delay between files to prevent Supabase rate limiting
        if (i > 0) {
          // Delay increases every 4 files: 0ms, 1s, 1s, 1s, 2s, 2s, 2s, 2s, 3s...
          const delay = Math.min(1000 * Math.ceil(i / 4), 3000);
          console.log(
            `⏳ Frontend: Waiting ${delay}ms before file ${
              i + 1
            } to prevent rate limiting`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.log(
          `\n🔄 Frontend: === PROCESSING FILE ${i + 1}/${files.length} ===`
        );
        console.log(`📄 Frontend: File: ${currentFile.name}`);
        console.log(
          `📊 Frontend: Size: ${(currentFile.size / 1024).toFixed(2)} KB`
        );

        setCurrentProcessingIndex(i);

        // Update status to processing
        console.log(
          `🔄 Frontend: Setting status to 'processing' for file ${i + 1}`
        );
        setProcessedDocuments((prev) =>
          prev.map((doc, index) =>
            index === i ? { ...doc, status: 'processing' } : doc
          )
        );

        const fileStartTime = Date.now();

        try {
          console.log(`📦 Frontend: Creating FormData for API request`);
          const formData = new FormData();
          formData.append('file', currentFile);

          console.log(`🌐 Frontend: Sending request to /api/process-document`);
          const response = await fetch('/api/process-document', {
            method: 'POST',
            body: formData,
          });

          const responseTime = Date.now() - fileStartTime;
          console.log(
            `⏰ Frontend: API response received in ${responseTime}ms`
          );
          console.log(`📊 Frontend: Response status: ${response.status}`);

          const result = await response.json();
          console.log(
            `📋 Frontend: API response for ${currentFile.name}:`,
            result
          );

          // ===== DEBUGGING: Check exact response structure =====
          console.log(
            `🔍 Frontend: Debugging response structure for ${currentFile.name}:`
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
            console.log(
              `✅ Frontend: Processing successful for ${currentFile.name}`
            );
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

            setProcessedDocuments((prev) => {
              const updated = prev.map((doc, index) =>
                index === i
                  ? {
                      ...doc,
                      documentType: result.data.document_type,
                      data: result.data,
                      status: 'completed' as const,
                      fileUrl: result.fileUrl,
                      databaseId: result.databaseId, // Store database ID for PDF preview
                      storageType: result.storageType, // Track storage type
                    }
                  : doc
              );

              // ===== DEBUGGING: Verify state update =====
              const updatedDoc = updated[i];
              if (updatedDoc) {
                console.log(
                  `🔍 Frontend: State updated. Document ${i} now has:`,
                  {
                    fileUrl: updatedDoc.fileUrl,
                    databaseId: updatedDoc.databaseId,
                    storageType: updatedDoc.storageType,
                    fileName: updatedDoc.fileName,
                  }
                );
              } else {
                console.error(
                  `❌ Frontend: Could not find updated document at index ${i}`
                );
              }

              return updated;
            });
          } else {
            console.error(
              `❌ Frontend: Processing failed for ${currentFile.name}`
            );
            console.error(`   Error: ${result.error}`);
            console.error(`   Details:`, result.details);

            // Update with error
            setProcessedDocuments((prev) =>
              prev.map((doc, index) =>
                index === i
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
            `💥 Frontend: Network error for ${currentFile.name} after ${errorTime}ms`
          );
          console.error(`   Error:`, networkError);

          // Update with network error
          setProcessedDocuments((prev) =>
            prev.map((doc, index) =>
              index === i
                ? {
                    ...doc,
                    status: 'error' as const,
                    error: 'Network error or backend unavailable',
                  }
                : doc
            )
          );
        }

        // Update progress
        const progressPercent = ((i + 1) / files.length) * 100;
        setProcessingProgress(progressPercent);
        console.log(
          `📈 Frontend: Progress updated to ${progressPercent.toFixed(1)}%`
        );
      }

      const totalBatchTime = Date.now() - batchStartTime;
      console.log(`🎉 Frontend: === BATCH PROCESSING COMPLETED ===`);
      console.log(`⏰ Frontend: Total batch time: ${totalBatchTime}ms`);
      console.log(
        `📊 Frontend: Average time per file: ${(
          totalBatchTime / files.length
        ).toFixed(2)}ms`
      );

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

      // Calculate success/error counts
      const completedCount = processedDocuments.filter(
        (doc) => doc.status === 'completed'
      ).length;
      const errorCount = processedDocuments.filter(
        (doc) => doc.status === 'error'
      ).length;
      console.log(
        `📈 Frontend: Results - Completed: ${completedCount}, Errors: ${errorCount}`
      );

      setActiveTab('results');
      console.log(`🔄 Frontend: Switched to results tab`);
    } catch (batchError) {
      console.error(`💥 Frontend: Batch processing error:`, batchError);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingIndex(-1);
      console.log(`🔄 Frontend: Processing state reset`);
    }
  };

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
    `📊 Frontend State: Files: ${files.length}, Processed: ${processedDocuments.length}, Completed: ${completedCount}, Errors: ${errorCount}`
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
          <h1 className='text-3xl font-bold text-slate-800'>
            Ocean Integrity AI Accounting
          </h1>
          <p className='text-slate-600 mt-2 max-w-2xl mx-auto'>
            Upload your documents and let our AI identify and extract data from
            invoices, EFT receipts, and e-way bills
          </p>
        </header>

        <div className='max-w-4xl mx-auto'>
          <Tabs
            value={activeTab}
            onValueChange={(v: string) =>
              setActiveTab(v as 'upload' | 'results' | 'groups' | 'submit')
            }
            className='space-y-6'
          >
            <div className='flex justify-center'>
              <TabsList className='grid w-full grid-cols-4'>
                <TabsTrigger value='upload' className='text-base py-1'>
                  1. Upload & Process
                </TabsTrigger>
                <TabsTrigger
                  value='results'
                  disabled={completedCount === 0}
                  className='text-base py-1'
                >
                  2. Review & Export
                </TabsTrigger>
                <TabsTrigger value='groups' className='text-base py-1'>
                  3. Push to Plastiks
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
                    maxFiles={1000}
                    acceptedFileTypes={['.pdf']}
                  />

                  {files.length > 0 && (
                    <div className='mt-8'>
                      <div className='flex items-center justify-between mb-4'>
                        <h3 className='text-lg font-medium'>
                          Uploaded Documents
                        </h3>
                        <Badge variant='outline' className='text-slate-600'>
                          {files.length} {files.length === 1 ? 'file' : 'files'}
                        </Badge>
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
                        {isProcessing ? (
                          <div className='space-y-4'>
                            <div className='flex items-center justify-between'>
                              <div>
                                <p className='font-medium text-slate-800'>
                                  Processing Document{' '}
                                  {currentProcessingIndex + 1} of {files.length}
                                </p>
                                <p className='text-sm text-slate-600'>
                                  AI is analyzing each document individually...
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
                          <Button
                            onClick={processFiles}
                            disabled={files.length === 0}
                            className='w-full py-6 text-lg gap-2'
                          >
                            Process Documents <ArrowRight className='h-5 w-5' />
                          </Button>
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
                        {errorCount} document{errorCount > 1 ? 's' : ''} failed
                        to process. Check the results tab for details.
                      </AlertDescription>
                    </Alert>
                  )}

                  {completedCount > 0 && !isProcessing && (
                    <Alert className='mt-6 bg-green-50 border-green-200'>
                      <CheckCircle2 className='h-4 w-4 text-green-600' />
                      <AlertTitle>Processing Complete</AlertTitle>
                      <AlertDescription>
                        {completedCount} document{completedCount > 1 ? 's' : ''}{' '}
                        processed successfully.
                        <p>
                          Click the &quot;Review &amp; Export&quot; tab to see
                          the extracted data.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

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

            <TabsContent value='results' className='space-y-6'>
              {completedCount > 0 ? (
                <>
                  <div className='grid grid-cols-1 gap-6'>
                    {processedDocuments.map((doc, index) => {
                      if (doc.status !== 'completed') return null;

                      const docType =
                        doc.documentType as keyof typeof documentTypes;
                      const DocIcon = documentTypes[docType]?.icon || FileText;
                      const iconColor =
                        documentTypes[docType]?.color || 'text-slate-500';
                      const bgColor =
                        documentTypes[docType]?.bgColor || 'bg-slate-100';
                      const title =
                        documentTypes[docType]?.title || doc.documentType;

                      return (
                        <Card
                          key={index}
                          className='shadow-md border-slate-200 overflow-hidden'
                        >
                          <CardHeader>
                            <div
                              className={`p-4 ${bgColor} border-b flex items-center justify-between`}
                            >
                              <div className='flex items-center gap-3'>
                                <div className={`p-1.5 rounded-md ${bgColor}`}>
                                  <DocIcon className={`h-5 w-5 ${iconColor}`} />
                                </div>
                                <div>
                                  <CardTitle className='font-medium text-slate-800'>
                                    {doc.fileName}
                                  </CardTitle>
                                  <CardDescription className='text-xs'>
                                    Identified as:{' '}
                                    <span className='font-medium'>{title}</span>
                                  </CardDescription>
                                </div>
                              </div>
                              <CardAction>
                                <Badge
                                  className={`${bgColor} ${iconColor} border-0`}
                                >
                                  {title}
                                </Badge>
                              </CardAction>
                            </div>
                          </CardHeader>

                          <CardContent>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-6 p-4'>
                              <DataSheet
                                key={
                                  doc.fileName +
                                  '-' +
                                  doc.documentType +
                                  '-' +
                                  (typeof doc.data === 'object'
                                    ? JSON.stringify(doc.data)
                                    : String(doc.data))
                                }
                                data={doc.data}
                                documentType={doc.documentType}
                                onUpdate={(updatedData: AppDocument) =>
                                  handleUpdateDocument(index, updatedData)
                                }
                              />
                              <DocumentPdfPreview
                                doc={doc}
                                blobUrls={blobUrls}
                                setBlobUrls={setBlobUrls}
                              />
                            </div>
                          </CardContent>

                          <CardFooter>
                            <p className='text-xs text-slate-500'>
                              Card Footer (optional info)
                            </p>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Show error documents */}
                  {errorCount > 0 && (
                    <Card className='shadow-md border-red-200 bg-red-50'>
                      <CardContent className='p-4'>
                        <h3 className='font-medium text-red-800 mb-2 flex items-center gap-2'>
                          <AlertCircle className='h-5 w-5' />
                          Failed Documents ({errorCount})
                        </h3>
                        <div className='space-y-2'>
                          {processedDocuments
                            .filter((doc) => doc.status === 'error')
                            .map((doc, index) => (
                              <div key={index} className='text-sm text-red-700'>
                                <span className='font-medium'>
                                  {doc.fileName}:
                                </span>{' '}
                                {doc.error}
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className='shadow-md border-slate-200 bg-white p-6'>
                    <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
                      <div>
                        <h3 className='text-lg font-medium'>
                          Document Processing Summary
                        </h3>
                        <p className='text-slate-600 text-sm'>
                          {completedCount} completed • {errorCount} failed •{' '}
                          {files.length} total
                        </p>
                      </div>
                      <div className='flex gap-3'>
                        <CSVDownloadBtn
                          processedDocuments={processedDocuments}
                          handleDownloadCSV={handleDownloadCSV}
                        />
                        <Button
                          variant='secondary'
                          className='gap-2'
                          onClick={() => setActiveTab('groups')}
                        >
                          Go to Group & Verify{' '}
                          <ArrowRight className='h-4 w-4' />
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                className='gap-2'
                                disabled
                                variant='secondary'
                                title='Coming soon'
                              >
                                Push Data to Portal{' '}
                                <ArrowRight className='h-4 w-4' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                Coming soon - Send extracted data to accounting
                                portal
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </Card>
                </>
              ) : (
                <div className='text-center py-16 bg-white rounded-lg border shadow-sm'>
                  <FileText className='h-12 w-12 text-slate-300 mx-auto mb-4' />
                  <h3 className='text-xl font-medium text-slate-800 mb-2'>
                    No Completed Documents
                  </h3>
                  <p className='text-slate-600 max-w-md mx-auto'>
                    Please upload and process documents first to see the
                    extracted data here.
                  </p>
                  <Button
                    variant='outline'
                    className='mt-6'
                    onClick={() => setActiveTab('upload')}
                  >
                    Go to Upload
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ===== New: Group & Verify Tab ===== */}
            <TabsContent value='groups' className='space-y-6'>
              <Card className='shadow-md border-slate-200'>
                <CardHeader>
                  <CardTitle>Group & Verify</CardTitle>
                  <CardDescription>
                    {isDocumentsLoaded ? (
                      'Groups are built from parsed documents. Complete all three files to enable submission.'
                    ) : (
                      'Loading document groups...'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className='p-6'>
                  {isGroupsLoading || !isDocumentsLoaded ? (
                    <div className='flex items-center gap-2 text-slate-600'>
                      <Loader2 className='h-4 w-4 animate-spin' /> Loading
                      {isGroupsLoading ? ' groups...' : ' documents...'}
                    </div>
                  ) : Object.keys(groups).length === 0 ? (
                    <div className='text-slate-600 text-sm'>
                      No groups found. Upload and process documents to see groups here.
                    </div>
                  ) : (
                    <div className='space-y-8'>
                      {Object.entries(groups).map(([invoiceKey, group]) => {
                        const latestByType = {
                          invoice: group.docs?.['invoice']?.[0],
                          'e-way-bill': group.docs?.['e-way-bill']?.[0],
                          'eft_receipt': group.docs?.['eft_receipt']?.[0],
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
                                  Status: {status.count} of 3 files uploaded
                                </div>
                              </div>
                                <div className='flex items-center gap-2'>
                                  {status.complete ? (
                                    <Badge className='bg-green-100 text-green-700 border-0'>
                                      Complete
                                    </Badge>
                                  ) : (
                                    <Badge className='bg-red-100 text-red-700 border-0'>
                                      Incomplete
                                    </Badge>
                                  )}
                                </div>
                            </div>

                            {!status.complete && status.missing.length > 0 && (
                              <div className='text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded mt-3 p-2'>
                                Missing: {status.missing.join(', ')}. Use
                                &quot;Upload & Process&quot; to add the missing
                                files.
                              </div>
                            )}

                            <div className='space-y-6 mt-6'>
                              {(
                                [
                                  'invoice',
                                  'eft_receipt',
                                  'e-way-bill',
                                ] as const
                              ).map((t) => {
                                const latest = group.docs?.[t]?.[0];
                                const tTitle = documentTypes[t]?.title || t;
                                const docType = latest?.document_type as keyof typeof documentTypes;
                                const DocIcon = documentTypes[docType]?.icon || FileText;
                                const iconColor = documentTypes[docType]?.color || 'text-slate-500';

                                return (
                                  <div key={t} className='border rounded-lg overflow-hidden bg-white'>
                                    <div className='bg-slate-50 px-4 py-2 border-b flex items-center gap-2'>
                                      <DocIcon className={`h-4 w-4 ${iconColor}`} />
                                      <h4 className='font-medium text-slate-800'>{tTitle}</h4>
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
                                      <div className='p-4 overflow-auto' style={{ maxHeight: '500px' }}>
                                        {latest?.raw_json ? (
                                          <div className='space-y-4'>
                                            <h5 className='font-medium text-slate-800 border-b pb-2'>Extracted Data</h5>
                                            <div className='space-y-2 text-sm'>
                                              {latest.raw_json ? (
                                                Object.entries(latest.raw_json as Record<string, unknown>).map(([key, value]) => {
                                                  if (value === null || value === undefined || value === '') return null;
                                                  if (typeof value === 'object' && !Array.isArray(value)) return null;
                                                  
                                                  const displayValue = Array.isArray(value) 
                                                    ? value.map(String).join(', ')
                                                    : String(value);
                                                  
                                                  return (
                                                    <div key={key} className='grid grid-cols-3 gap-2'>
                                                      <div className='text-slate-500 capitalize'>{key.replace(/_/g, ' ')}:</div>
                                                      <div className='col-span-2 font-medium'>
                                                        {displayValue}
                                                      </div>
                                                    </div>
                                                  );
                                                })
                                              ) : (
                                                <div className='text-slate-400 text-center py-2'>No data available</div>
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
                              {recyclingDocs[group.invoice]?.plastiks_submitted_at ? (
                                <div className='mb-4 space-y-2 text-sm'>
                                  <div className='bg-green-50 p-4 rounded-lg border border-green-100'>
                                    <h4 className='font-medium text-green-800 mb-3 flex items-center gap-2'>
                                      <CheckCircle2 className='h-4 w-4' />
                                      Successfully Submitted to Plastiks
                                    </h4>
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3 text-sm'>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Invoice #</div>
                                        <div className='font-medium text-slate-800'>
                                          {recyclingDocs[group.invoice]?.invoice_number?.toString() || 'N/A'}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Recycler Company</div>
                                        <div className='font-medium text-slate-800'>
                                          {recyclingDocs[group.invoice]?.recycler_company?.toString() || 'N/A'}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Plastic Type</div>
                                        <div className='font-medium text-slate-800'>
                                          {recyclingDocs[group.invoice]?.plastic_type?.toString() || 'N/A'}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Weight</div>
                                        <div className='font-medium text-slate-800'>
                                          {recyclingDocs[group.invoice]?.tonnage_tons 
                                            ? `${recyclingDocs[group.invoice]?.tonnage_tons.toString()} tons` 
                                            : 'N/A'}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Country</div>
                                        <div className='font-medium text-slate-800'>
                                          {recyclingDocs[group.invoice]?.country?.toString() || 'N/A'}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Collection ID</div>
                                        <div className='font-mono text-xs text-slate-600 break-all'>
                                          {recyclingDocs[group.invoice]?.plastiks_collection_id?.toString() || 'N/A'}
                                        </div>
                                      </div>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Metadata Hash</div>
                                        <div className='font-mono text-xs text-slate-600 break-all'>
                                          {recyclingDocs[group.invoice]?.plastiks_metadata_hash?.toString() || 'N/A'}
                                        </div>
                                      </div>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Collection Address</div>
                                        <div className='font-mono text-xs text-slate-600 break-all'>
                                          {recyclingDocs[group.invoice]?.plastiks_collection_address?.toString() || 'N/A'}
                                        </div>
                                      </div>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Submitted At</div>
                                        <div className='text-sm text-slate-700'>
                                          {recyclingDocs[group.invoice]?.plastiks_submitted_at 
                                            ? new Date(recyclingDocs[group.invoice]?.plastiks_submitted_at ?? '').toLocaleString() 
                                            : 'N/A'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className='mb-4 space-y-4'>
                                  <h4 className='font-medium text-slate-800'>Data to be sent to Plastiks:</h4>
                                  <div className='bg-blue-50 p-4 rounded-lg border border-blue-100'>
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3 text-sm'>
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Invoice #</div>
                                        <div className='font-medium text-slate-800'>
                                          {String(latestByType.invoice?.raw_json?.invoice_number || 
                                           latestByType.invoice?.raw_json?.invoice || 'N/A')}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Company</div>
                                        <div className='font-medium text-slate-800'>
                                          {String(latestByType.invoice?.raw_json?.bill_to_company_name ||
                                           latestByType['e-way-bill']?.raw_json?.ship_to_company_name || 'N/A')}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Plastic Type</div>
                                        <div className='font-medium text-slate-800'>
                                          {String(latestByType.invoice?.raw_json?.plastic_type ||
                                           latestByType['e-way-bill']?.raw_json?.plastic_type || 'N/A')}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Weight</div>
                                        <div className='font-medium text-slate-800'>
                                          {latestByType.invoice?.raw_json?.weight 
                                            ? `${String(latestByType.invoice.raw_json.weight)} ${String(latestByType.invoice.raw_json.weight_unit || 'kg')}`
                                            : 'N/A'}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>City</div>
                                        <div className='font-medium text-slate-800'>
                                          {String(
                                            latestByType['e-way-bill']?.raw_json?.from_location || 
                                            latestByType['e-way-bill']?.raw_json?.city ||
                                            latestByType.invoice?.raw_json?.city || 
                                            'N/A'
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className='text-slate-500 text-xs font-medium mb-1'>Country</div>
                                        <div className='font-medium text-slate-800'>
                                          {String(
                                            latestByType['e-way-bill']?.raw_json?.ship_to_country_code ||
                                            latestByType['e-way-bill']?.raw_json?.origin_country ||
                                            latestByType['e-way-bill']?.raw_json?.country ||
                                            latestByType.invoice?.raw_json?.country || 
                                            'N/A'
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {!recyclingDocs[group.invoice]?.plastiks_submitted_at && (
                                <div>
                                  {submitResult[group.invoice]?.ok ? (
                                    <div className='mt-4 p-3 bg-green-50 border border-green-200 rounded-md'>
                                      <div className='flex items-start gap-2 text-green-800'>
                                        <CheckCircle2 className='h-4 w-4 flex-shrink-0 mt-0.5' />
                                        <div className='space-y-2 w-full'>
                                          <p className='font-medium'>Successfully Submitted to Plastiks</p>
                                          
                                          {/* Display all available Plastiks details */}
                                          <div className='grid grid-cols-1 gap-2 text-sm'>
                                            <div className='flex justify-between'>
                                              <span className='text-slate-600'>Invoice #:</span>
                                              <span className='font-medium'>{recyclingDocs[group.invoice]?.invoice_number || 'N/A'}</span>
                                            </div>
                                            
                                            <div className='flex justify-between'>
                                              <span className='text-slate-600'>Company:</span>
                                              <span className='font-medium'>{recyclingDocs[group.invoice]?.recycler_company || 'N/A'}</span>
                                            </div>
                                            
                                            <div className='flex justify-between'>
                                              <span className='text-slate-600'>Plastic Type:</span>
                                              <span className='font-medium'>{recyclingDocs[group.invoice]?.plastic_type || 'N/A'}</span>
                                            </div>
                                            
                                            <div className='flex justify-between'>
                                              <span className='text-slate-600'>Weight:</span>
                                              <span className='font-medium'>
                                                {recyclingDocs[group.invoice]?.tonnage_tons 
                                                  ? `${recyclingDocs[group.invoice]?.tonnage_tons} tons` 
                                                  : recyclingDocs[group.invoice]?.tonnage_kg 
                                                    ? `${recyclingDocs[group.invoice]?.tonnage_kg} kg` 
                                                    : 'N/A'}
                                              </span>
                                            </div>
                                            
                                            <div className='flex justify-between'>
                                              <span className='text-slate-600'>Country:</span>
                                              <span className='font-medium'>{recyclingDocs[group.invoice]?.country || 'N/A'}</span>
                                            </div>
                                            
                                            {recyclingDocs[group.invoice]?.plastiks_collection_id && (
                                              <div className='flex justify-between'>
                                                <span className='text-slate-600'>Collection ID:</span>
                                                <span className='font-medium'>{recyclingDocs[group.invoice].plastiks_collection_id}</span>
                                              </div>
                                            )}
                                            
                                            {recyclingDocs[group.invoice]?.plastiks_collection_address && (
                                              <div className='flex flex-col'>
                                                <span className='text-slate-600 text-xs mb-1'>Collection Address:</span>
                                                <span className='text-xs break-all bg-white p-2 rounded border'>{recyclingDocs[group.invoice].plastiks_collection_address}</span>
                                              </div>
                                            )}
                                            
                                            {recyclingDocs[group.invoice]?.plastiks_metadata_hash && (
                                              <div className='flex flex-col'>
                                                <span className='text-slate-600 text-xs mb-1'>Metadata Hash:</span>
                                                <span className='text-xs break-all bg-white p-2 rounded border font-mono'>{recyclingDocs[group.invoice].plastiks_metadata_hash}</span>
                                              </div>
                                            )}
                                          </div>
                                          
                                          {submitResult[group.invoice]?.message && (
                                            <p className='text-xs text-green-700 mt-2'>
                                              {String(submitResult[group.invoice]?.message)}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ) : submitResult[group.invoice]?.message ? (
                                    <div className='mt-4 p-3 bg-red-50 border border-red-200 rounded-md'>
                                      <div className='flex items-start gap-2 text-red-800'>
                                        <AlertCircle className='h-4 w-4 flex-shrink-0 mt-0.5' />
                                        <div>
                                          <p className='font-medium'>Submission Failed</p>
                                          <p className='text-xs text-red-700 mt-1'>
                                            {String(submitResult[group.invoice]?.message || '')}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                              
                              {!submitResult[group.invoice]?.ok && !recyclingDocs[group.invoice]?.plastiks_submitted_at && (
                                <Button
                                  size='sm'
                                  disabled={!status.complete || submitting[group.invoice]}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSubmitGroup(group.invoice);
                                  }}
                                  className='w-full gap-2 mt-2'
                                >
                                  {submitting[group.invoice] ? (
                                    <span className='flex items-center gap-2'>
                                      <Loader2 className='h-3 w-3 animate-spin' />
                                      Submitting to Plastiks...
                                    </span>
                                  ) : (
                                    <span className='flex items-center gap-2'>
                                      <UploadCloud className='h-3 w-3' />
                                      Push to Plastiks
                                      <ArrowRight className='h-3 w-3' />
                                    </span>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
