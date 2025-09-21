'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  RotateCcw,
  Trash2,
  ExternalLink,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { Session } from '@supabase/supabase-js';

type ProcessingStatus =
  | 'failed_preprocessing'
  | 'failed_ai_processing'
  | 'successfully_parsed'
  | 'successfully_pushed_blockchain';

interface DocumentData {
  id: string;
  fileName: string;
  pdfUrl: string;
  status: ProcessingStatus;
  data: {
    extractedText?: string;
    metadata?: Record<string, unknown>;
    processingLogs?: string[];
  };
  uploadedAt: string;
  source_table?: string;
  original_filename?: string;
  pdf_path?: string;
  upload_date?: string;
  last_error?: string;
  retry_count?: number;
  file_size?: number;
  page_number?: number;
  total_pages?: number;
}

interface DataManagementTableProps {
  session: Session;
}

// Map database status to UI status
const mapDatabaseStatusToUIStatus = (
  dbStatus: string,
  sourceTable: string
): ProcessingStatus => {
  if (sourceTable === 'temp_documents') {
    if (dbStatus === 'failed') return 'failed_preprocessing';
    if (dbStatus === 'processed') return 'successfully_parsed';
    return 'failed_preprocessing'; // uploaded or other temp statuses
  }

  if (sourceTable === 'single_documents') {
    if (dbStatus === 'failed') return 'failed_ai_processing';
    if (dbStatus === 'processed') return 'successfully_parsed';
    if (dbStatus === 'skipped_duplicate') return 'successfully_parsed';
    return 'failed_ai_processing'; // uploaded or other single statuses
  }

  // For parsed documents, assume successfully pushed to blockchain
  return 'successfully_pushed_blockchain';
};

// Smart retry options based on document state
interface RetryOption {
  action: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const getRetryOptions = (item: DocumentData): RetryOption[] => {
  const options: RetryOption[] = [];

  if (item.source_table === 'temp_documents') {
    if (item.status === 'failed_preprocessing') {
      options.push({
        action: 'force_preprocessing',
        label: 'Retry Preprocessing',
        description: 'Re-run PDF splitting and text extraction',
        icon: <FileText className='h-4 w-4' />,
      });
    }

    // If temp doc is processed, check children
    if (
      item.status === 'successfully_parsed' &&
      item.total_pages &&
      item.total_pages > 1
    ) {
      options.push({
        action: 'auto',
        label: 'Check Child Pages',
        description: 'Check and retry failed child pages',
        icon: <RotateCcw className='h-4 w-4' />,
      });
    }
  }

  if (item.source_table === 'single_documents') {
    if (item.status === 'failed_ai_processing') {
      options.push({
        action: 'force_ai',
        label: 'Retry AI Processing',
        description: 'Re-run AI analysis and data extraction',
        icon: <RotateCcw className='h-4 w-4' />,
      });
    }

    // If it's a duplicate, offer skip option
    if (
      item.last_error?.includes('duplicate') ||
      item.last_error?.includes('409')
    ) {
      options.push({
        action: 'skip_duplicate',
        label: 'Mark as Duplicate',
        description: 'Skip this document (duplicate content)',
        icon: <Trash2 className='h-4 w-4' />,
      });
    }
  }

  // General auto-detect option
  if (
    options.length === 0 ||
    item.status === 'failed_preprocessing' ||
    item.status === 'failed_ai_processing'
  ) {
    options.push({
      action: 'auto',
      label: 'Smart Retry',
      description: 'Auto-detect failure point and retry',
      icon: <RotateCcw className='h-4 w-4' />,
    });
  }

  return options;
};

const getStatusBadge = (status: ProcessingStatus) => {
  const statusConfig = {
    failed_preprocessing: {
      label: 'Failed Preprocessing',
      variant: 'destructive' as const,
    },
    failed_ai_processing: {
      label: 'Failed AI Processing',
      variant: 'secondary' as const,
    },
    successfully_parsed: {
      label: 'Successfully Parsed',
      variant: 'default' as const,
    },
    successfully_pushed_blockchain: {
      label: 'Pushed to Blockchain',
      variant: 'outline' as const,
    },
  };

  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className='whitespace-nowrap'>
      {config.label}
    </Badge>
  );
};

export function DataManagementTable({ session }: DataManagementTableProps) {
  const [data, setData] = useState<DocumentData[]>([]);
  const [selectedItem, setSelectedItem] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [itemToRetry, setItemToRetry] = useState<DocumentData | null>(null);

  // Fetch unprocessed documents from API
  const fetchUnprocessedDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/data-management?table=unprocessed_documents&page=1&limit=100&userId=${session.user.id}`
      );
      const result = await response.json();

      if (response.ok) {
        // Transform API data to UI format
        const transformedData: DocumentData[] = result.data.map(
          (item: {
            id: string;
            original_filename?: string;
            pdf_path?: string;
            status?: string;
            source_table?: string;
            total_pages?: number;
            page_number?: number;
            file_size?: number;
            upload_date?: string;
            last_error?: string;
            retry_count?: number;
          }) => ({
            id: item.id,
            fileName: item.original_filename || item.pdf_path || 'Unknown File',
            pdfUrl: item.pdf_path
              ? `/api/serve-document/${item.id}`
              : '/placeholder.pdf',
            status: mapDatabaseStatusToUIStatus(
              item.status || 'uploaded',
              item.source_table || 'single_documents'
            ),
            data: {
              metadata: {
                pages: item.total_pages || item.page_number || 1,
                size: item.file_size
                  ? `${(item.file_size / 1024).toFixed(1)} KB`
                  : 'Unknown',
                type: 'Document',
                source: item.source_table,
                pageNumber: item.page_number,
                totalPages: item.total_pages,
              },
              extractedText: item.last_error
                ? `Error: ${item.last_error}`
                : undefined,
              processingLogs: [
                `📊 Source Table: ${item.source_table}`,
                `📋 Status: ${item.status || 'uploaded'}`,
                `🔄 Retry Count: ${item.retry_count || 0}`,
                item.page_number
                  ? `📄 Page: ${item.page_number}/${item.total_pages}`
                  : '',
                item.file_size
                  ? `📦 File Size: ${(item.file_size / 1024).toFixed(1)} KB`
                  : '',
                item.last_error
                  ? `❌ Last Error: ${item.last_error}`
                  : '✅ No errors recorded',
                `🎯 Processing Stage: ${
                  item.source_table === 'temp_documents'
                    ? 'PDF Preprocessing'
                    : 'AI Analysis'
                }`,
              ].filter(Boolean),
            },
            uploadedAt: item.upload_date || new Date().toISOString(),
            source_table: item.source_table,
            original_filename: item.original_filename,
            pdf_path: item.pdf_path,
            upload_date: item.upload_date,
            last_error: item.last_error,
            retry_count: item.retry_count,
            file_size: item.file_size,
            page_number: item.page_number,
            total_pages: item.total_pages,
          })
        );

        setData(transformedData);
      } else {
        console.error('Failed to fetch unprocessed documents:', result.error);
      }
    } catch (error) {
      console.error('Error fetching unprocessed documents:', error);
    } finally {
      setLoading(false);
    }
  }, [session.user.id]);

  // Load data on component mount
  useEffect(() => {
    fetchUnprocessedDocuments();
  }, [fetchUnprocessedDocuments]);

  const handleRetry = async (id: string, action: string = 'auto') => {
    try {
      console.log(`🔄 [retry] Initiating ${action} retry for document ${id}`);

      // Use the smart retry API endpoint
      const response = await fetch(`/api/documents/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: id,
          userId: session.user.id,
          action: action,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Retry initiated:', result);

        // Show success message based on action
        const actionMessages: Record<string, string> = {
          auto: 'Smart retry initiated - system will auto-detect the best retry strategy',
          force_preprocessing:
            'Preprocessing retry initiated - PDF will be re-split and processed',
          force_ai:
            'AI processing retry initiated - document will be re-analyzed',
          skip_duplicate: 'Document marked as duplicate and skipped',
        };

        alert(
          actionMessages[action] ||
            result.message ||
            'Retry initiated successfully'
        );

        // Refresh the data to show updated status
        fetchUnprocessedDocuments();
      } else {
        const result = await response.json();
        console.error('Retry failed:', result.error);
        alert(`Retry failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Error retrying document:', error);
      alert('Error retrying document. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(
        `/api/data-management?table=unprocessed_documents&id=${id}&userId=${session.user.id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        console.log('✅ Document deleted successfully');
        // Remove from local state
        setData((prev) => prev.filter((item) => item.id !== id));
      } else {
        const result = await response.json();
        alert(`Deletion failed: ${result.error}`);
        console.error('Delete failed:', result.error);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Error deleting document. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className='container mx-auto p-6 space-y-6'>
      {/* Header Section */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Data Management</h1>
          <p className='text-muted-foreground'>
            Manage unprocessed documents in your pipeline
          </p>
        </div>
        <Button
          variant='outline'
          onClick={fetchUnprocessedDocuments}
          disabled={loading}
          className='flex items-center gap-2'
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Main Content */}
      <Card className='w-full'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <FileText className='h-5 w-5' />
            Unprocessed Documents
          </CardTitle>
          <CardDescription>
            Documents that are stuck in processing or failed - ready for cleanup
            or retry
            {data.length > 0 && ` • ${data.length} documents found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <RefreshCw className='h-6 w-6 animate-spin' />
              <span className='ml-2'>Loading unprocessed documents...</span>
            </div>
          ) : (
            <div className='rounded-md border'>
              <Table className='w-full'>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-[35%]'>File Name</TableHead>
                    <TableHead className='w-[30%]'>Status</TableHead>
                    <TableHead className='w-[20%]'>Uploaded</TableHead>
                    <TableHead className='w-[15%] text-right'>
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className='text-center py-8 text-muted-foreground'
                      >
                        <div className='flex flex-col items-center gap-2'>
                          <FileText className='h-8 w-8 text-muted-foreground/50' />
                          <p>No unprocessed documents found</p>
                          <p className='text-sm'>
                            All your documents have been processed successfully!
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <FileText className='h-4 w-4 text-muted-foreground' />
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant='link'
                                  className='p-0 h-auto font-medium text-left justify-start'
                                  onClick={() => setSelectedItem(item)}
                                >
                                  {item.fileName}
                                </Button>
                              </DialogTrigger>
                              <DialogContent className='max-w-2xl max-h-[80vh] overflow-y-auto'>
                                <DialogHeader>
                                  <DialogTitle className='flex items-center gap-2'>
                                    <FileText className='h-5 w-5' />
                                    {selectedItem?.fileName}
                                  </DialogTitle>
                                  <DialogDescription>
                                    Detailed information about the PDF
                                    processing
                                  </DialogDescription>
                                </DialogHeader>
                                {selectedItem && (
                                  <div className='space-y-4'>
                                    <div className='grid grid-cols-2 gap-4'>
                                      <div>
                                        <h4 className='font-semibold mb-2'>
                                          Status
                                        </h4>
                                        {getStatusBadge(selectedItem.status)}
                                      </div>
                                      <div>
                                        <h4 className='font-semibold mb-2'>
                                          PDF URL
                                        </h4>
                                        <Button
                                          variant='outline'
                                          size='sm'
                                          asChild
                                        >
                                          <a
                                            href={selectedItem.pdfUrl}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                          >
                                            <ExternalLink className='h-4 w-4 mr-2' />
                                            View PDF
                                          </a>
                                        </Button>
                                      </div>
                                    </div>

                                    {selectedItem.data.metadata && (
                                      <div>
                                        <h4 className='font-semibold mb-2'>
                                          Metadata
                                        </h4>
                                        <div className='bg-muted p-3 rounded-md'>
                                          <pre className='text-sm'>
                                            {JSON.stringify(
                                              selectedItem.data.metadata,
                                              null,
                                              2
                                            )}
                                          </pre>
                                        </div>
                                      </div>
                                    )}

                                    {selectedItem.data.extractedText && (
                                      <div>
                                        <h4 className='font-semibold mb-2'>
                                          Extracted Text
                                        </h4>
                                        <div className='bg-muted p-3 rounded-md max-h-40 overflow-y-auto'>
                                          <p className='text-sm'>
                                            {selectedItem.data.extractedText}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {selectedItem.data.processingLogs && (
                                      <div>
                                        <h4 className='font-semibold mb-2'>
                                          Processing Logs
                                        </h4>
                                        <div className='space-y-1'>
                                          {selectedItem.data.processingLogs.map(
                                            (log, index) => (
                                              <div
                                                key={index}
                                                className='text-sm bg-muted p-2 rounded'
                                              >
                                                {log}
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className='text-muted-foreground'>
                          {formatDate(item.uploadedAt)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex items-center justify-end gap-1'>
                            {(() => {
                              const retryOptions = getRetryOptions(item);
                              const canRetry = !(
                                item.status ===
                                  'successfully_pushed_blockchain' ||
                                item.status === 'successfully_parsed'
                              );

                              if (!canRetry) {
                                return (
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    disabled
                                    className='h-8 w-8 p-0'
                                    title='Document already processed'
                                  >
                                    <RotateCcw className='h-4 w-4' />
                                  </Button>
                                );
                              }

                              if (retryOptions.length === 1) {
                                // Single option - show simple button
                                const option = retryOptions[0];
                                return (
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    onClick={() =>
                                      handleRetry(item.id, option.action)
                                    }
                                    className='h-8 w-8 p-0'
                                    title={option.description}
                                  >
                                    {option.icon}
                                  </Button>
                                );
                              }

                              // Multiple options - show dialog trigger
                              return (
                                <Button
                                  variant='outline'
                                  size='sm'
                                  className='h-8 w-auto px-2'
                                  title='Smart retry options'
                                  onClick={() => {
                                    setItemToRetry(item);
                                    setRetryDialogOpen(true);
                                  }}
                                >
                                  <RotateCcw className='h-4 w-4' />
                                  <ChevronDown className='h-3 w-3 ml-1' />
                                </Button>
                              );
                            })()}
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-8 w-8 p-0 bg-transparent'
                              title='Delete'
                              onClick={() => {
                                setItemToDelete(item.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smart Retry Options Dialog */}
      <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <RotateCcw className='h-5 w-5' />
              Smart Retry Options
            </DialogTitle>
            <DialogDescription>
              Choose the best retry strategy for &ldquo;{itemToRetry?.fileName}
              &rdquo;
            </DialogDescription>
          </DialogHeader>
          {itemToRetry && (
            <div className='space-y-3'>
              {getRetryOptions(itemToRetry).map((option) => (
                <Button
                  key={option.action}
                  variant='outline'
                  className='w-full justify-start text-left h-auto p-4'
                  onClick={() => {
                    handleRetry(itemToRetry.id, option.action);
                    setRetryDialogOpen(false);
                    setItemToRetry(null);
                  }}
                >
                  <div className='flex items-start gap-3 w-full'>
                    <div className='flex-shrink-0 mt-0.5'>{option.icon}</div>
                    <div className='flex-1 text-left'>
                      <div className='font-medium text-sm'>{option.label}</div>
                      <div className='text-xs text-muted-foreground mt-1'>
                        {option.description}
                      </div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the PDF
              document and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (itemToDelete) {
                  handleDelete(itemToDelete);
                  setItemToDelete(null);
                }
                setDeleteDialogOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
