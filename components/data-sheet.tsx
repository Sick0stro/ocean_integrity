"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Save, XCircle } from "lucide-react"
import { Document } from "@/types/document-types"

type NestedObject = Record<string, unknown>;

const setNestedValue = <T extends NestedObject>(
  obj: T,
  path: string,
  value: string | number | null
): T => {
  const keys = path.split('.');
  const lastKey = keys[keys.length - 1];
  
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

const DataRenderer: React.FC<DataRendererProps> = ({ data, pathPrefix = '', isEditing, handleChange }) => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  return (
    <div className="space-y-4">
      {Object.entries(data).map(([key, value]) => {
        const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return (
            <div key={currentPath} className="ml-4 pl-4 border-l">
              <h5 className="font-semibold text-sm capitalize text-slate-600 mb-2">{key.replace(/_/g, " ")}</h5>
              <DataRenderer data={value as NestedObject} pathPrefix={currentPath} isEditing={isEditing} handleChange={handleChange} />
            </div>
          )
        }

        // Skip rendering certain fields that are not useful to edit
        if (['document_type', 'confidence', 'content'].includes(key)) {
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
              <p className="text-sm text-slate-900">{String(value ?? 'N/A')}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface DataSheetProps {
  data: Document;
  onUpdate: (updatedData: Document) => void;
}

export default function DataSheet({ data, onUpdate }: DataSheetProps) {
  const [editableData, setEditableData] = useState<Document>(data)
  const [isEditing, setIsEditing] = useState(false)

  // Update internal state if the initial data prop changes
  useEffect(() => {
    setEditableData(data)
  }, [data])

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSave = () => {
    onUpdate(editableData)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditableData(data) // Reset to original data
    setIsEditing(false)
  }

  const handleChange = (path: string, value: string) => {
    setEditableData((prev) => {
      // Create a deep copy to avoid direct state mutation
      const newData = JSON.parse(JSON.stringify(prev));
      return setNestedValue(newData, path, value);
    });
  }

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