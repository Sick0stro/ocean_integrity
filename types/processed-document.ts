import type { Document as AppDocument } from './document-types';
import type { DocumentTypeKey } from '@/constants/document-types';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface ProcessedDocument {
  fileName: string;
  documentType: DocumentTypeKey | '';
  data: AppDocument;
  fileUrl?: string;
  databaseId?: string; // For database-stored files
  storageType?: 'storage' | 'database'; // Track storage location
  status: ProcessingStatus;
  error?: string;
}
