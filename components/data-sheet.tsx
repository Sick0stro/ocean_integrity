"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Save, XCircle} from "lucide-react"
import type { Document as AppDocument } from "@/types/document-types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type NestedObject = { [key: string]: string | number | boolean | NestedObject | NestedObject[] };

const setNestedValue = <T extends NestedObject>(
  obj: T,
  path: string,
  value: string | number | null
): T => {
  const keys = path.split('.');
  
  // Create a new object with the updated value
  return keys.reduceRight<T>((acc, key, i) => {
    return {
      ...acc,
      [key]: i === keys.length - 1 ? value : acc[key]
    };
  }, obj);
}

interface DataRendererProps {
  data: NestedObject;
  pathPrefix?: string;
  isEditing: boolean;
  handleChange: (path: string, value: string) => void;
}

const renderValue = (value: unknown): React.ReactNode => {
  if (value === null || value === undefined) return 'N/A';
  if (Array.isArray(value)) return null; // Will be handled by parent
  if (typeof value === 'object') return null; // Will be handled by parent
  return String(value);
};

const DataRenderer: React.FC<DataRendererProps> = ({ data, pathPrefix = '', isEditing, handleChange }) => {
  if (data === null || typeof data !== 'object') {
    return <p className="text-sm text-slate-500">No data available</p>;
  }
  
  // Handle array of objects (like invoice items)
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <p className="text-sm text-slate-500">No items</p>;
    }
    
    // Check if it's an array of objects
    const isArrayOfObjects = data.every(item => item !== null && typeof item === 'object');
    
    if (isArrayOfObjects) {
      // Get all unique keys from all objects in the array
      const allKeys = new Set<string>();
      data.forEach(item => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach(key => allKeys.add(key));
        }
      });
      
      const columns = Array.from(allKeys);
      
      return (
        <div className="mt-4">
          <h5 className="font-semibold text-sm capitalize text-slate-600 mb-2">Items</h5>
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col} className="text-xs font-medium text-slate-700 whitespace-nowrap">
                      {col.replace(/_/g, ' ').toUpperCase()}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item, index) => (
                  <TableRow key={index}>
                    {columns.map((col) => {
                        const cellPath = `${pathPrefix}[${index}].${col}`;
                        const cellValue = item[col];
                        return (
                          <TableCell key={cellPath} className="text-sm p-2 whitespace-nowrap">
                            {isEditing ? (
                              <Input
                                value={String(cellValue ?? '')}
                                onChange={(e) => handleChange(cellPath, e.target.value)}
                                className="text-xs"
                              />
                            ) : (
                              renderValue(cellValue)
                            )}
                          </TableCell>
                        );
                      })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }
    
    // For arrays of primitive values
    return (
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="text-sm">
            {String(item ?? 'N/A')}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(data).map(([key, value]) => {
        const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key

        // Handle arrays (e.g., items list)
        if (Array.isArray(value)) {
          return (
            <div key={currentPath} className="ml-4 pl-4 border-l">
              <DataRenderer
                data={value as unknown as NestedObject}
                pathPrefix={currentPath}
                isEditing={isEditing}
                handleChange={handleChange}
              />
            </div>
          );
        }

        // Nested object (non-array)
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return (
            <div key={currentPath} className="ml-4 pl-4 border-l">
              <h5 className="font-semibold text-sm capitalize text-slate-600 mb-2">{key.replace(/_/g, " ")}</h5>
              <DataRenderer data={value as NestedObject} pathPrefix={currentPath} isEditing={isEditing} handleChange={handleChange} />
            </div>
          )
        }

        // Skip rendering certain fields that are not useful to edit
        // Skip fields not useful for display/editing but keep document_type visible
        if (['confidence', 'content', 'fileUrl', 'success'].includes(key)) {
          return null;
        }
        
        // Skip null or undefined values
        if (value === null || value === undefined) {
          return null;
        }
        
        // Skip empty objects and arrays as they'll be handled by their parent
        if (typeof value === 'object' && Object.keys(value).length === 0) {
          return null;
        }

        return (
          <div key={currentPath} className="grid grid-cols-2 items-center gap-2">
            <Label htmlFor={currentPath} className="text-sm font-medium text-slate-700 truncate">
              {key.replace(/_/g, " ")}
            </Label>
            {isEditing ? (
              <Input
                id={currentPath}
                value={String(value ?? '')}
                onChange={(e) => handleChange(currentPath, e.target.value)}
                className="text-sm"
              />
            ) : (
              <div className="text-sm text-slate-900 break-words">
                {renderValue(value)}
                {typeof value === 'object' && value !== null && !Array.isArray(value) && (
                  <div className="ml-4 pl-4 border-l border-slate-200 mt-1">
                    <DataRenderer 
                      data={value} 
                      pathPrefix={`${pathPrefix}.${key}`} 
                      isEditing={isEditing} 
                      handleChange={handleChange} 
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface DataSheetProps {
  data: AppDocument;
  documentType: string;
  onUpdate: (updatedData: AppDocument) => void;
}

// Templates containing ALL expected fields for every document type as defined in types/document-types.ts
export const documentTemplates: Record<string, NestedObject> = {
  eft_receipt: {
    document_type: 'eft_receipt',
    document_title: '',
    bank_name: '',
    transaction_details: {
      transaction_date_time: '',
      value_date: '',
      amount: 0,
      currency: '',
      payment_type: '',
      description: ''
    },
    sender_details: {
      name: '',
      bank: '',
      branch: ''
    },
    recipient_details: {
      name: '',
      customer_no: '',
      account_no: '',
      iban: ''
    },
    reference_numbers: {
      inquiry_no: '',
      transaction_ref: '',
      document_no: '',
      ettn: ''
    }
  },
  invoice: {
    document_type: 'invoice',
    invoice_title: '',
    irn: '',
    ack_no: '',
    ack_date: '',
    document_no: '',
    document_date: '',
    supplier: {
      name: '',
      gstin: '',
      address: '',
      phone: ''
    },
    recipient: {
      name: '',
      gstin: '',
      address: ''
    },
    items: [],
    total_summary: {
      taxable_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total_invoice_amount: 0
    }
  },
  'e-way-bill': {
    document_type: 'e-way-bill',
    eway_bill_no: '',
    generated_date: '',
    generated_by: '',
    valid_upto: '',
    mode: '',
    approx_distance: '',
    address_details: {
      from: {
        gstin: '',
        name: '',
        address: ''
      },
      to: {
        gstin: '',
        name: '',
        address: ''
      },
      ship_to: {
        gstin: '',
        name: '',
        address: ''
      }
    }
  }
};

// Deep merge helper to ensure every expected field is present
const mergeWithTemplate = (template: NestedObject, data: NestedObject): NestedObject => {
  // If template is not an object (primitive) just take data or template default
  if (typeof template !== 'object' || template === null) {
    return data ?? template;
  }

  // Handle arrays – we simply return the data if it's an array, otherwise the template
  if (Array.isArray(template)) {
    return Array.isArray(data) ? data : template;
  }

  const result: NestedObject = {};

  // Merge keys from template first
  Object.keys(template).forEach((key) => {
    const value = data ? (data as NestedObject)[key] : undefined;
    result[key] = mergeWithTemplate(
      template[key] as NestedObject,
      typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as NestedObject) : {}
    );
  });

  // Add any additional keys that exist in data but not in template
  if (data) {
    Object.keys(data).forEach((key) => {
      if (!(key in result)) {
        const value = (data as NestedObject)[key];
        result[key] = value;
      }
    });
  }

  return result;
};

export default function DataSheet({ data, documentType, onUpdate }: DataSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const template = documentTemplates[documentType] ?? {};
  const [editableData, setEditableData] = useState<NestedObject>(mergeWithTemplate(template, data as unknown as NestedObject));

  // Update internal state if the initial data prop changes
  useEffect(() => {
    const freshTemplate = documentTemplates[documentType] ?? {};
    setEditableData(mergeWithTemplate(freshTemplate, data as unknown as NestedObject));
  }, [data, documentType]) // Added documentType to dependency array

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSave = () => {
    onUpdate(editableData as unknown as AppDocument);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditableData(data as unknown as NestedObject) // Reset to original data
    setIsEditing(false)
  }

  const handleChange = (path: string, value: string) => {
    const updatedData = setNestedValue({ ...editableData }, path, value);
    setEditableData(updatedData);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-slate-800 text-sm">Extracted Data</h4>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleSave} className="flex items-center gap-1 text-green-600 hover:text-green-700">
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancel} className="flex items-center gap-1 text-red-600 hover:text-red-700">
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleEdit} className="flex items-center gap-1">
              <Edit className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>
      <div className="p-4 border rounded-md bg-slate-50/50">
        <DataRenderer data={editableData} isEditing={isEditing} handleChange={handleChange} />
      </div>
    </div>
  )
}