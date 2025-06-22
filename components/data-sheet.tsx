"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Save, XCircle } from "lucide-react"

// Helper function to set a value in a nested object
const setNestedValue = (obj: any, path: string, value: any) => {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]]
  }
  current[keys[keys.length - 1]] = value
  return { ...obj }
}

interface DataRendererProps {
  data: any
  pathPrefix?: string
  isEditing: boolean
  handleChange: (path: string, value: any) => void
}

const DataRenderer: React.FC<DataRendererProps> = ({ data, pathPrefix = '', isEditing, handleChange }) => {
  if (data === null || typeof data !== 'object') {
    return null
  }

  return (
    <div className="space-y-4">
      {Object.entries(data).map(([key, value]) => {
        const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return (
            <div key={currentPath} className="ml-4 pl-4 border-l">
              <h5 className="font-semibold text-sm capitalize text-slate-600 mb-2">{key.replace(/_/g, " ")}</h5>
              <DataRenderer data={value} pathPrefix={currentPath} isEditing={isEditing} handleChange={handleChange} />
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
  data: Record<string, unknown>
  documentType: string
  onUpdate: (updatedData: Record<string, unknown>) => void
}

export default function DataSheet({ data, documentType, onUpdate }: DataSheetProps) {
  const [editableData, setEditableData] = useState<Record<string, unknown>>(data)
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

  const handleChange = (path: string, value: any) => {
    setEditableData((prev) => setNestedValue(prev, path, value))
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