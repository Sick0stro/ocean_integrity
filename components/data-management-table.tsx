'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Trash2,
  RotateCcw,
  Download,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Session } from '@supabase/supabase-js';

interface DataRecord {
  id: string;
  user_id: string;
  created_at?: string;
  upload_date?: string;
  status?: string;
  error_message?: string;
  pdf_path?: string;
  original_filename?: string;
  file_size?: number;
  document_type?: string;
  raw_json?: any;
  anchor_key?: string;
  invoice_number?: string;
  [key: string]: any;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface DataManagementTableProps {
  session: Session;
}

const TABLE_CONFIGS = {
  temp_documents: {
    name: 'Temp Documents',
    description: 'Documents awaiting preprocessing',
    columns: ['pdf_path', 'upload_date', 'status', 'error_message'],
    displayColumns: ['File Path', 'Upload Date', 'Status', 'Error Message'],
  },
  single_documents: {
    name: 'Single Documents',
    description: 'Preprocessed documents ready for AI processing',
    columns: [
      'pdf_path',
      'original_filename',
      'file_size',
      'status',
      'upload_date',
    ],
    displayColumns: [
      'File Path',
      'Original Filename',
      'File Size',
      'Status',
      'Upload Date',
    ],
  },
  parsed_documents: {
    name: 'Parsed Documents',
    description: 'AI-processed document data',
    columns: ['document_type', 'anchor_key', 'file_url', 'created_at'],
    displayColumns: ['Document Type', 'Anchor Key', 'File URL', 'Created At'],
  },
  recycling_docs: {
    name: 'Recycling Documents',
    description: 'Business-ready recycling records',
    columns: [
      'invoice_number',
      'recycler_company',
      'plastic_type',
      'tonnage_tons',
      'status',
    ],
    displayColumns: [
      'Invoice Number',
      'Recycler Company',
      'Plastic Type',
      'Tonnage (tons)',
      'Status',
    ],
  },
  document_groups: {
    name: 'Document Groups',
    description: 'Grouped documents by invoice',
    columns: [
      'invoice_number',
      'group_key',
      'is_complete',
      'completion_percentage',
      'last_processed_at',
    ],
    displayColumns: [
      'Invoice Number',
      'Group Key',
      'Complete',
      'Completion %',
      'Last Processed',
    ],
  },
};

export function DataManagementTable({ session }: DataManagementTableProps) {
  const [selectedTable, setSelectedTable] =
    useState<keyof typeof TABLE_CONFIGS>('temp_documents');
  const [data, setData] = useState<DataRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);

  const fetchData = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/data-management?table=${selectedTable}&page=${page}&limit=${pagination.limit}&userId=${session.user.id}`
        );
        const result = await response.json();

        if (response.ok) {
          setData(result.data);
          setPagination(result.pagination);
        } else {
          console.error('Failed to fetch data:', result.error);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    },
    [selectedTable, pagination.limit, session.user.id]
  );

  useEffect(() => {
    fetchData(1);
    setSelectedRecords([]);
  }, [selectedTable]);

  const handleDelete = async (recordId: string) => {
    try {
      const response = await fetch(
        `/api/data-management?table=${selectedTable}&id=${recordId}&userId=${session.user.id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        fetchData(pagination.page);
        setSelectedRecords((prev) => prev.filter((id) => id !== recordId));
        console.log('✅ Document deleted successfully');
      } else {
        const result = await response.json();
        alert(`Deletion failed: ${result.error}`);
        console.error('Delete failed:', result.error);
      }
    } catch (error) {
      console.error('Error deleting record:', error);
      alert('Error deleting record. Please try again.');
    }
  };

  const handleRetry = async (recordId: string) => {
    try {
      const response = await fetch(
        `/api/data-management?action=retry&table=${selectedTable}&id=${recordId}&userId=${session.user.id}`,
        { method: 'POST' }
      );

      if (response.ok) {
        fetchData(pagination.page);
      } else {
        const result = await response.json();
        console.error('Retry failed:', result.error);
      }
    } catch (error) {
      console.error('Error retrying record:', error);
    }
  };

  const handleBulkDelete = async () => {
    for (const recordId of selectedRecords) {
      await handleDelete(recordId);
    }
    setSelectedRecords([]);
  };

  const handleSelectAll = (checked: boolean) => {
    // Only allow selection for tables where deletion is permitted
    if (!['temp_documents', 'single_documents'].includes(selectedTable)) {
      return; // Do nothing for protected tables
    }

    if (checked) {
      // Only select records that can actually be deleted
      const deletableRecords = data.filter((record) => canDeleteRecord(record));
      setSelectedRecords(deletableRecords.map((record) => record.id));
    } else {
      setSelectedRecords([]);
    }
  };

  const exportToCSV = () => {
    const config = TABLE_CONFIGS[selectedTable];
    const headers = config.displayColumns.join(',');
    const rows = data.map((record) =>
      config.columns
        .map((col) => {
          const value = record[col];
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value).replace(/,/g, ';'); // Replace commas to avoid CSV issues
        })
        .join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedTable}_${
      new Date().toISOString().split('T')[0]
    }.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatValue = (value: any, column: string) => {
    if (value === null || value === undefined) return '-';

    if (column.includes('date') || column.includes('_at')) {
      return new Date(value).toLocaleString();
    }

    if (column === 'file_size') {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    if (column === 'status') {
      const statusColors: Record<string, string> = {
        uploaded: 'bg-blue-100 text-blue-800',
        processing: 'bg-yellow-100 text-yellow-800',
        processed: 'bg-green-100 text-green-800',
        failed: 'bg-red-100 text-red-800',
      };
      return (
        <Badge className={statusColors[value] || 'bg-gray-100 text-gray-800'}>
          {value}
        </Badge>
      );
    }

    if (typeof value === 'object') {
      return JSON.stringify(value).substring(0, 50) + '...';
    }

    return String(value);
  };

  const canDeleteRecord = (record: DataRecord) => {
    // Only allow deletion from temp_documents and single_documents tables
    if (!['temp_documents', 'single_documents'].includes(selectedTable)) {
      return false;
    }

    // For temp_documents, only allow deletion of unprocessed statuses
    if (selectedTable === 'temp_documents') {
      const unprocessedStatuses = ['uploaded', 'failed', null, undefined];
      return !record.status || unprocessedStatuses.includes(record.status);
    }

    // For single_documents, the backend will check if it's truly unprocessed
    // (not in parsed_documents), so we allow the attempt and let backend validate
    if (selectedTable === 'single_documents') {
      return true;
    }

    return false;
  };

  const filteredData = data.filter((record) =>
    Object.values(record).some((value) =>
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const config = TABLE_CONFIGS[selectedTable];

  return (
    <div className='space-y-6'>
      {/* Header Controls */}
      <div className='flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between'>
        <div className='flex flex-col sm:flex-row gap-4 items-start sm:items-center'>
          <Select value={selectedTable} onValueChange={setSelectedTable}>
            <SelectTrigger className='w-48'>
              <SelectValue placeholder='Select table' />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TABLE_CONFIGS).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className='relative'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
            <Input
              placeholder='Search records...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='pl-10 w-64'
            />
          </div>
        </div>

        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => fetchData(pagination.page)}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={exportToCSV}
            disabled={data.length === 0}
          >
            <Download className='h-4 w-4 mr-2' />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedRecords.length > 0 &&
        ['temp_documents', 'single_documents'].includes(selectedTable) && (
          <Card>
            <CardContent className='py-4'>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-gray-600'>
                  {selectedRecords.length} unprocessed record(s) selected
                </span>
                <div className='flex gap-2'>
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className='h-4 w-4 mr-2' />
                    Delete Selected
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{config.name}</CardTitle>
          <CardDescription>
            {config.description} • {pagination.totalCount} total records
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <RefreshCw className='h-6 w-6 animate-spin' />
              <span className='ml-2'>Loading...</span>
            </div>
          ) : (
            <>
              <div className='border rounded-lg overflow-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-12'>
                        {['temp_documents', 'single_documents'].includes(
                          selectedTable
                        ) ? (
                          <Checkbox
                            checked={
                              selectedRecords.length ===
                                filteredData.filter((record) =>
                                  canDeleteRecord(record)
                                ).length &&
                              filteredData.filter((record) =>
                                canDeleteRecord(record)
                              ).length > 0
                            }
                            onCheckedChange={handleSelectAll}
                          />
                        ) : (
                          <span className='text-xs text-gray-400'>N/A</span>
                        )}
                      </TableHead>
                      {config.displayColumns.map((column) => (
                        <TableHead key={column}>{column}</TableHead>
                      ))}
                      <TableHead className='w-32'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={config.columns.length + 2}
                          className='text-center py-8 text-gray-500'
                        >
                          No records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            {canDeleteRecord(record) ? (
                              <Checkbox
                                checked={selectedRecords.includes(record.id)}
                                onCheckedChange={(checked: boolean) => {
                                  if (checked) {
                                    setSelectedRecords((prev) => [
                                      ...prev,
                                      record.id,
                                    ]);
                                  } else {
                                    setSelectedRecords((prev) =>
                                      prev.filter((id) => id !== record.id)
                                    );
                                  }
                                }}
                              />
                            ) : (
                              <span className='text-xs text-gray-400'>—</span>
                            )}
                          </TableCell>
                          {config.columns.map((column) => (
                            <TableCell
                              key={column}
                              className='max-w-xs truncate'
                            >
                              {formatValue(record[column], column)}
                            </TableCell>
                          ))}
                          <TableCell>
                            <div className='flex gap-1'>
                              {(selectedTable === 'temp_documents' ||
                                selectedTable === 'single_documents') &&
                                record.status === 'failed' && (
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    onClick={() => handleRetry(record.id)}
                                  >
                                    <RotateCcw className='h-3 w-3' />
                                  </Button>
                                )}
                              <Button
                                variant='outline'
                                size='sm'
                                disabled={!canDeleteRecord(record)}
                                onClick={() => {
                                  setRecordToDelete(record.id);
                                  setDeleteDialogOpen(true);
                                }}
                                title={
                                  !canDeleteRecord(record)
                                    ? 'Cannot delete processed or verified documents'
                                    : 'Delete record'
                                }
                              >
                                <Trash2 className='h-3 w-3' />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className='flex items-center justify-between mt-4'>
                <div className='text-sm text-gray-600'>
                  Page {pagination.page} of {pagination.totalPages} •{' '}
                  {pagination.totalCount} total records
                </div>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={!pagination.hasPrevPage}
                    onClick={() => fetchData(pagination.page - 1)}
                  >
                    <ChevronLeft className='h-4 w-4' />
                    Previous
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={!pagination.hasNextPage}
                    onClick={() => fetchData(pagination.page + 1)}
                  >
                    Next
                    <ChevronRight className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              record and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recordToDelete) {
                  handleDelete(recordToDelete);
                  setRecordToDelete(null);
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
