"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Edit2, X, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Define specific interfaces for complex data structures
interface InvoiceItem {
  sino?: string | number;
  product_description?: string;
  hsn_code?: string;
  quantity?: string | number;
  unit_price?: string | number;
  total?: string | number;
}

interface AddressDetails {
  [key: string]: {
    [key: string]: string | number | undefined;
  } | undefined;
}

interface DataSheetProps {
  data: Record<string, unknown>;
  documentType: string;
}

export default function DataSheet({ data, documentType }: DataSheetProps) {
  const [editableData, setEditableData] = useState<Record<string, unknown>>(data);
  const [isEditing, setIsEditing] = useState(false);
  const [originalData, setOriginalData] = useState<Record<string, unknown>>(data);

  const handleEdit = () => {
    setOriginalData({ ...editableData });
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    // In a real application, you'd typically send editableData to an API here
    console.log("Saving changes:", editableData);
  };

  const handleCancel = () => {
    setEditableData(originalData);
    setIsEditing(false);
  };

  // Format field names for display
  const formatFieldName = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  // Render different layouts based on document type
  const renderDocumentData = () => {
    if (documentType === "invoice") {
      return renderInvoiceData();
    } else if (documentType === "eft_receipt") {
      return renderEftReceiptData();
    } else if (documentType === "e-way-bill") {
      return renderEwayBillData();
    } else {
      return renderGenericData();
    }
  };

  const renderInvoiceData = () => {
    const { items, total_summary, supplier, recipient, ...basicInfo } = editableData;

    // Ensure supplier and recipient are objects or undefined
    const supplierObj = (supplier && typeof supplier === "object" && !Array.isArray(supplier)) ? supplier as Record<string, unknown> : undefined;
    const recipientObj = (recipient && typeof recipient === "object" && !Array.isArray(recipient)) ? recipient as Record<string, unknown> : undefined;
    const invoiceItems = (items && Array.isArray(items)) ? items as InvoiceItem[] : [];
    const invoiceTotalSummary = (total_summary && typeof total_summary === "object" && !Array.isArray(total_summary)) ? total_summary as Record<string, unknown> : undefined;


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
                  <div className="text-sm">{typeof value === "string" || typeof value === "number" ? value : value !== undefined && value !== null ? JSON.stringify(value) : "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Supplier & Recipient */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {supplierObj && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Supplier Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(supplierObj).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                      <div className="text-sm">{value as string || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {recipientObj && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recipient Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(recipientObj).map(([key, value]) => (
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
        {invoiceItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Items ({invoiceItems.length})</CardTitle>
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
                    {invoiceItems.map((item: InvoiceItem, index: number) => (
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
        {invoiceTotalSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Total Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(invoiceTotalSummary).map(([key, value]) => (
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
    );
  };

  const renderEftReceiptData = () => {
    const { transaction_details, sender_details, recipient_details, reference_numbers, ...basicInfo } = editableData;

    const eftTransactionDetails = (transaction_details && typeof transaction_details === "object" && !Array.isArray(transaction_details)) ? transaction_details as Record<string, unknown> : undefined;
    const eftSenderDetails = (sender_details && typeof sender_details === "object" && !Array.isArray(sender_details)) ? sender_details as Record<string, unknown> : undefined;
    const eftRecipientDetails = (recipient_details && typeof recipient_details === "object" && !Array.isArray(recipient_details)) ? recipient_details as Record<string, unknown> : undefined;
    const eftReferenceNumbers = (reference_numbers && typeof reference_numbers === "object" && !Array.isArray(reference_numbers)) ? reference_numbers as Record<string, unknown> : undefined;

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
                  <div className="text-sm">{typeof value === "string" || typeof value === "number" ? value : value !== undefined && value !== null ? JSON.stringify(value) : "N/A"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Transaction Details */}
        {eftTransactionDetails && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Transaction Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(eftTransactionDetails).map(([key, value]) => (
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
          {eftSenderDetails && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sender Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(eftSenderDetails).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{formatFieldName(key)}</label>
                      <div className="text-sm">{value as string || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {eftRecipientDetails && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recipient Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(eftRecipientDetails).map(([key, value]) => (
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
        {eftReferenceNumbers && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Reference Numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(eftReferenceNumbers).map(([key, value]) => (
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
    );
  };

  const renderEwayBillData = () => {
    const { address_details, ...basicInfo } = editableData;

    const ewayBillAddressDetails = (address_details && typeof address_details === "object" && !Array.isArray(address_details)) ? address_details as AddressDetails : undefined;

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
                  <div className="text-sm">
                    {typeof value === "string" || typeof value === "number"
                      ? value
                      : value !== undefined && value !== null
                        ? JSON.stringify(value)
                        : "N/A"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Address Details */}
        {ewayBillAddressDetails && (
          <div className="space-y-4">
            {Object.entries(ewayBillAddressDetails).map(([section, details]) => (
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
    );
  };

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
                  <TableCell>
                    {value === null || value === undefined
                      ? "N/A"
                      : typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

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
  );
}