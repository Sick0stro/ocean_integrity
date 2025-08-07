'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Document as AppDocument } from '@/types/document-types';
import type { ProcessedDocument } from '@/types/processed-document';
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
} from 'lucide-react';
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

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [processedDocuments, setProcessedDocuments] = useState<
    ProcessedDocument[]
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'results'>('upload');
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
            onValueChange={(v) => setActiveTab(v as 'upload' | 'results')}
            className='space-y-6'
          >
            <div className='flex justify-center'>
              <TabsList className='grid w-full grid-cols-2'>
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
          </Tabs>
        </div>
      </div>
    </main>
  );
}
