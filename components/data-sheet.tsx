"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Save, XCircle} from "lucide-react"
import type { Document as AppDocument } from "@/types/document-types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { documentTemplates } from "@/constants/document-templates"

// test change
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

import React from "react"

const DataRenderer: React.FC<DataRendererProps> = React.memo(({ data, pathPrefix = '', isEditing, handleChange }) => {
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
        const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        
        if (value === null || typeof value !== 'object') {
          return (
            <div key={key} className="grid grid-cols-4 gap-4 items-center">
              <Label className="text-sm font-medium text-slate-700">
                {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </Label>
              {isEditing ? (
                <div className="col-span-3">
                  <Input
                    type="text"
                    value={value as string | number}
                    onChange={(e) => handleChange(currentPath, e.target.value)}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="col-span-3 text-slate-900">
                  {renderValue(value)}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={key} className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">
              {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </h3>
            <div className="ml-4 border-l-2 border-slate-200 pl-4">
              <DataRenderer 
                data={value as NestedObject} 
                pathPrefix={currentPath}
                isEditing={isEditing}
                handleChange={handleChange}
              />
            </div>
          </div>
        );
      })}
    </div>
  )
})

// Deep merge helper to ensure every expected field is present
const mergeWithTemplate = (template: NestedObject, data: NestedObject): NestedObject => {
  // If template is not an object (primitive) just take data or template default
  if (typeof template !== 'object' || template === null) {
    return data ?? template;
  }

  // Handle arrays (shallow copy for now, could be made recursive if needed)
  if (Array.isArray(template)) {
    return (Array.isArray(data) ? [...data] : [...template]) as unknown as NestedObject;
  }

  // Create a new object that will hold the merged result
  const result: NestedObject = {};

  // For each key in the template
  for (const key in template) {
    if (Object.prototype.hasOwnProperty.call(template, key)) {
      // If data has the key and it's not null/undefined
      if (data && data[key] !== undefined && data[key] !== null) {
        // If both values are objects, merge them recursively
        if (typeof template[key] === 'object' && template[key] !== null && 
            typeof data[key] === 'object' && data[key] !== null) {
          result[key] = mergeWithTemplate(
            template[key] as NestedObject, 
            data[key] as NestedObject
          );
        } else {
          // Otherwise, use the data value
          result[key] = data[key];
        }
      } else {
        // Otherwise, use the template value
        result[key] = template[key];
      }
    }
  }


  return result;
};

interface DataSheetProps {
  data: unknown;
  documentType: string;
  onUpdate: (updated: AppDocument) => void;
}
// DataSheetProps interface is now defined above. DataSheet uses this interface.
const DataSheet: React.FC<DataSheetProps> = ({ data, documentType, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false); 
  const template = documentTemplates[documentType as keyof typeof documentTemplates] || {};
  const [editableData, setEditableData] = useState<NestedObject>(mergeWithTemplate(template, data as unknown as NestedObject));

  // Ensure state resets if data deeply changes (force remount via key in parent for full reset)
  useEffect(() => {
    const freshTemplate = documentTemplates[documentType as keyof typeof documentTemplates] || {};
    setEditableData(mergeWithTemplate(freshTemplate, data as unknown as NestedObject));
    setIsEditing(false);
  }, [data, documentType]);

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
export default DataSheet;