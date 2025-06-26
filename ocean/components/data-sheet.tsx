"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Edit2, X, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DataSheetProps {
  data: Record<string, unknown>
  documentType: string
}

export default function DataSheet({ data, documentType }: DataSheetProps) {
  const [editableData, setEditableData] = useState<Record<string, unknown>>(data)
  const [isEditing, setIsEditing] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [originalData, setOriginalData] = useState<Record<string, unknown>>(data)
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

  const formatFieldName = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^./, (str) => str.toUpperCase())
      .trim()
  }

  const renderDocumentData = () => {
    if (documentType === "invoice") return renderInvoiceData()
    if (documentType === "eft_receipt") return renderEftReceiptData()
    if (documentType === "e-way-bill") return renderEwayBillData()
    return renderGenericData()
  }

  const renderInvoiceData = () => {
    const { items, total_summary, supplier, recipient, ...basicInfo } = editableData

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Invoice Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(basicInfo).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                  <div className="text-sm">{String(value) || "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Supplier & Recipient */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[{ title: "Supplier", data: supplier }, { title: "Recipient", data: recipient }].map(({ title, data }) =>
            data && typeof data === "object" && !Array.isArray(data) ? (
              <Card key={title}>
                <CardHeader><CardTitle className="text-sm">{title} Details</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(data as Record<string, unknown>).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                        <div className="text-sm">{String(value) || "N/A"}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null
          )}
        </div>

        {/* Items */}
        {Array.isArray(items) && items.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Items ({items.length})</CardTitle></CardHeader>
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
                    {items.map((item, index) => {
                      const row = item as Record<string, unknown>
                      return (
                        <TableRow key={index}>
                          <TableCell className="text-xs">{String(row.sino ?? index + 1)}</TableCell>
                          <TableCell className="text-xs">{String(row.product_description ?? "N/A")}</TableCell>
                          <TableCell className="text-xs">{String(row.hsn_code ?? "N/A")}</TableCell>
                          <TableCell className="text-xs">{String(row.quantity ?? "N/A")}</TableCell>
                          <TableCell className="text-xs">{String(row.unit_price ?? "N/A")}</TableCell>
                          <TableCell className="text-xs">{String(row.total ?? "N/A")}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Total Summary */}
        {total_summary && typeof total_summary === "object" && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Total Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(total_summary as Record<string, unknown>).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                    <div className="text-sm font-medium">{String(value) || "N/A"}</div>
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

    const renderSection = (title: string, data?: unknown) =>
      data && typeof data === "object" ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(data as Record<string, unknown>).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                  <div className="text-sm">{String(value) || "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null

    return (
      <div className="space-y-4">
        {renderSection("Receipt Information", basicInfo)}
        {renderSection("Transaction Details", transaction_details)}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderSection("Sender Details", sender_details)}
          {renderSection("Recipient Details", recipient_details)}
        </div>
        {renderSection("Reference Numbers", reference_numbers)}
      </div>
    )
  }

  const renderEwayBillData = () => {
    const { address_details, ...basicInfo } = editableData

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">E-Way Bill Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(basicInfo).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                  <div className="text-sm">{String(value) || "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {address_details && typeof address_details === "object" && (
          <div className="space-y-4">
            {Object.entries(address_details as Record<string, unknown>).map(([section, details]) =>
              typeof details === "object" ? (
                <Card key={section}>
                  <CardHeader><CardTitle className="text-sm">{formatFieldName(section)} Address</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(details as Record<string, unknown>).map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                          <div className="text-sm">{String(value) || "N/A"}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null
            )}
          </div>
        )}
      </div>
    )
  }

  const renderGenericData = () => (
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
                <TableCell>{typeof value === "object" ? JSON.stringify(value) : String(value) || "N/A"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )

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
