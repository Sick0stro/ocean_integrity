"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Edit2, X, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DataSheetProps {
  data: Record<string, any>
  documentType: string
}

export default function DataSheet({ data, documentType }: DataSheetProps) {
  const [editableData, setEditableData] = useState<Record<string, any>>(data)
  const [isEditing, setIsEditing] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [originalData, setOriginalData] = useState<Record<string, any>>(data)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const handleEdit = () => {
    setOriginalData({ ...editableData })
    setIsEditing(true)
  }

  const handleSave = () => {
    setIsEditing(false)
    setEditingKey(null)
  }

  const handleCancel = () => {
    setEditableData(originalData)
    setIsEditing(false)
    setEditingKey(null)
  }

  const handleCellEdit = (key: string) => {
    setEditingKey(key)
  }

  const handleCellChange = (key: string, value: string) => {
    setEditableData((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Format field names for display
  const formatFieldName = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^./, (str) => str.toUpperCase())
      .trim()
  }

  // Render different layouts based on document type
  const renderDocumentData = () => {
    if (documentType === "invoice") {
      return renderInvoiceData()
    } else if (documentType === "eft_receipt") {
      return renderEftReceiptData()
    } else if (documentType === "e-way-bill") {
      return renderEwayBillData()
    } else {
      return renderGenericData()
    }
  }

  const renderInvoiceData = () => {
    const { items, total_summary, supplier, recipient, ...basicInfo } = editableData

    return (
      <div className="space-y-4">
        {/* Basic Invoice Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invoice Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(basicInfo).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                  <div className="text-sm">{value as string || "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Supplier & Recipient */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {supplier && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Supplier Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(supplier).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                      <div className="text-sm">{value as string || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {recipient && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recipient Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(recipient).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                      <div className="text-sm">{value as string || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Items */}
        {items && Array.isArray(items) && items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Items ({items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">S.No</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">HSN Code</TableHead>
                      <TableHead className="text-xs">Qty</TableHead>
                      <TableHead className="text-xs">Unit Price</TableHead>
                      <TableHead className="text-xs">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell className="text-xs">{item.sino || index + 1}</TableCell>
                        <TableCell className="text-xs">{item.product_description || "N/A"}</TableCell>
                        <TableCell className="text-xs">{item.hsn_code || "N/A"}</TableCell>
                        <TableCell className="text-xs">{item.quantity || "N/A"}</TableCell>
                        <TableCell className="text-xs">{item.unit_price || "N/A"}</TableCell>
                        <TableCell className="text-xs">{item.total || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Total Summary */}
        {total_summary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Total Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(total_summary).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                    <div className="text-sm font-medium">{value as string || "N/A"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  const renderEftReceiptData = () => {
    const { transaction_details, sender_details, recipient_details, reference_numbers, ...basicInfo } = editableData

    return (
      <div className="space-y-4">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receipt Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(basicInfo).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                  <div className="text-sm">{value || "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Transaction Details */}
        {transaction_details && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Transaction Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(transaction_details).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                    <div className="text-sm">{value as string || "N/A"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sender & Recipient */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sender_details && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sender Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(sender_details).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                      <div className="text-sm">{value as string || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {recipient_details && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recipient Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(recipient_details).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                      <div className="text-sm">{value as string || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Reference Numbers */}
        {reference_numbers && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Reference Numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(reference_numbers).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                    <div className="text-sm">{value as string || "N/A"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  const renderEwayBillData = () => {
    const { address_details, ...basicInfo } = editableData

    return (
      <div className="space-y-4">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">E-Way Bill Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(basicInfo).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                  <div className="text-sm">{value || "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Address Details */}
        {address_details && (
          <div className="space-y-4">
            {Object.entries(address_details).map(([section, details]) => (
              <Card key={section}>
                <CardHeader>
                  <CardTitle className="text-sm">{formatFieldName(section)} Address</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {typeof details === "object" &&
                      details &&
                      Object.entries(details).map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                          <div className="text-sm">{value || "N/A"}</div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderGenericData = () => {
    return (
      <Card>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Field</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(editableData).map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{formatFieldName(key)}</TableCell>
                  <TableCell>{typeof value === "object" ? JSON.stringify(value) : value || "N/A"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-slate-700">Extracted Data</h4>
        <div className="space-x-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="outline" onClick={handleCancel} className="h-8 gap-1 text-xs">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} className="h-8 gap-1 text-xs bg-green-600 hover:bg-green-700">
                <Check className="h-3.5 w-3.5" /> Save Changes
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={handleEdit} className="h-8 gap-1 text-xs">
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      {renderDocumentData()}
    </div>
  )
}
