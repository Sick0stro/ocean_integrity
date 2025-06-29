"use client"

import { useState, useMemo, useCallback } from "react"
import type { Document as AppDocument } from "@/types/document-types"
import type { ProcessedDocument } from "@/types/processed-document"
import {
  FileText,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Clock,
  FileCheck,
  CreditCard,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import FileUploader from "@/components/file-uploader"
import dynamic from 'next/dynamic'
import DataSheet from "@/components/data-sheet"
// Import documentTemplates for default document structure
import { documentTemplates } from "@/components/data-sheet";
import { setDocumentField, documentEntries } from "@/types/document-types-util";
import DocumentTypeCard from "@/components/document-type-card"
import { documentTypes } from "@/constants/document-types"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { VideoText } from "@/components/magicui/video-text"
import CSVDownloadBtn from "@/components/csv-download-btn"

const PdfPreview = dynamic(() => import('@/components/pdf-preview'), { ssr: false })

export default function Home() {
  const [files, setFiles] = useState<File[]>([])
  const [processedDocuments, setProcessedDocuments] = useState<ProcessedDocument[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<"upload" | "results">("upload")
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1)
  const [processingProgress, setProcessingProgress] = useState(0)

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    setFiles((prevFiles) => {
      const updatedFiles = [...prevFiles];
      newFiles.forEach((newFile) => {
        // Check if a file with the same name and size already exists
        if (!updatedFiles.some(
            (existingFile) =>
              existingFile.name === newFile.name && existingFile.size === newFile.size
          )
        ) {
          updatedFiles.push(newFile);
        }
      });
      return updatedFiles;
    });
  }, []);

  const handleRemoveFile = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index))
    setProcessedDocuments((prevDocs) => prevDocs.filter((_, i) => i !== index))
  }

  const handleUpdateDocument = (index: number, updatedData: AppDocument) => {
    setProcessedDocuments((prev) => {
      const newDocs = [...prev]
      newDocs[index] = {
        ...newDocs[index],
        data: updatedData,
      }
      return newDocs
    })
  }

  const processFiles = async () => {
    if (files.length === 0) return

    setIsProcessing(true)
    setCurrentProcessingIndex(0)
    setProcessingProgress(0)

    // Initialize processed documents array
    // Use a deep clone of the invoice template to ensure type safety
    const initialDocs: ProcessedDocument[] = files.map((file) => ({
      fileName: file.name,
      documentType: "",
      data: JSON.parse(JSON.stringify(documentTemplates.invoice)) as AppDocument,
      fileUrl: "",
      status: "pending",
    }))
    setProcessedDocuments(initialDocs)

    try {
      // Process files one by one
      for (let i = 0; i < files.length; i++) {
        setCurrentProcessingIndex(i)

        // Update status to processing
        setProcessedDocuments((prev) =>
          prev.map((doc, index) => (index === i ? { ...doc, status: "processing" } : doc)),
        )

        try {
          const formData = new FormData()
          formData.append("file", files[i])

          // CHANGE: Use Next.js API route
          const response = await fetch("/api/process-document", {
            method: "POST",
            body: formData,
          })

          const result = await response.json()

          if (result.success) {
            // Update with successful result
            setProcessedDocuments((prev) =>
              prev.map((doc, index) =>
                index === i
                  ? {
                      ...doc,
                      documentType: result.data.document_type,
                      data: result.data,
                      status: "completed",
                      fileUrl: result.fileUrl,
                    }
                  : doc,
              ),
            )
          } else {
            // Update with error
            setProcessedDocuments((prev) =>
              prev.map((doc, index) =>
                index === i
                  ? {
                      ...doc,
                      status: "error",
                      error: result.error || "Processing failed",
                    }
                  : doc,
              ),
            )
          }
        } catch {
          // Update with network error
          setProcessedDocuments((prev) =>
            prev.map((doc, index) =>
              index === i
                ? {
                    ...doc,
                    status: "error",
                    error: "Network error or backend unavailable",
                  }
                : doc,
            ),
          )
        }

        // Update progress
        setProcessingProgress(((i + 1) / files.length) * 100)
      }

      setActiveTab("results")
    } catch {
      console.error("Processing error")
    } finally {
      setIsProcessing(false)
      setCurrentProcessingIndex(-1)
    }
  }

  const handleDownloadCSV = () => {
    const completedDocs = processedDocuments.filter((doc) => doc.status === "completed")
    if (completedDocs.length === 0) return

    // Flatten nested objects for CSV
    const flattenObject = (obj: Record<string, unknown>, prefix = ""): Record<string, unknown> => {
      const flattened: Record<string, unknown> = {}

      for (const key in obj) {
        if (obj[key] !== null && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
          Object.assign(flattened, flattenObject(obj[key] as Record<string, unknown>, `${prefix}${key}_`))
        } else if (Array.isArray(obj[key])) {
          (obj[key] as unknown[]).forEach((item: unknown, index: number) => {
            if (typeof item === "object" && item !== null) {
              Object.assign(flattened, flattenObject(item as Record<string, unknown>, `${prefix}${key}_${index + 1}_`))
            } else {
              flattened[`${prefix}${key}_${index + 1}`] = item
            }
          })
        } else {
          flattened[`${prefix}${key}`] = obj[key]
        }
      }

      return flattened
    }

    // Convert to CSV
    const csvRows = []
    const allFields = new Set<string>()

    // Collect all possible fields
    completedDocs.forEach((doc) => {
      const flattened = flattenObject({ fileName: doc.fileName, ...doc.data })
      Object.keys(flattened).forEach((key) => allFields.add(key))
    })

    const headers = Array.from(allFields)
    csvRows.push(headers.join(","))

    // Add data rows
    completedDocs.forEach((doc) => {
      const flattened = flattenObject({ fileName: doc.fileName, ...doc.data })
      const row = headers.map((header) => {
        const value = flattened[header] || ""
        return typeof value === "string" && (value.includes(",") || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"` // escape double quotes
          : value
      })
      csvRows.push(row.join(","))
    })

    // Download CSV
    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `ocean-integrity-data-${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const completedCount = useMemo(() => processedDocuments.filter((d) => d.status === "completed").length, [processedDocuments])
  const errorCount = useMemo(() => processedDocuments.filter((d) => d.status === "error").length, [processedDocuments])

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="container mx-auto py-8 px-4">
        <header className="mb-8 text-center">
          <div className="relative h-[300px] w-full overflow-hidden">
            <VideoText src="https://cdn.magicui.design/ocean-small.webm">
              OCEAN/AI
            </VideoText>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Ocean Integrity AI Accounting</h1>
          <p className="text-slate-600 mt-2 max-w-2xl mx-auto">
            Upload your documents and let our AI identify and extract data from invoices, EFT receipts, and e-way bills
          </p>
        </header>

        <div className="max-w-4xl mx-auto">
          <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(v as "upload" | "results")} className="space-y-6">
            <div className="flex justify-center">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" className="text-base py-1">
                  1. Upload & Process
                </TabsTrigger>
                <TabsTrigger value="results" disabled={completedCount === 0} className="text-base py-1">
                  2. Review & Export
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="upload" className="space-y-6">
              <Card className="shadow-md border-slate-200">
                <CardContent className="p-6">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold mb-2">Document Upload</h2>
                    <p className="text-slate-600 text-sm">
                      Upload your accounting documents and our AI will process them to identify and extract
                      the relevant data
                    </p>
                  </div>

                  <FileUploader onFilesAdded={handleFilesAdded} maxFiles={1000} acceptedFileTypes={[".pdf"]} />

                  {files.length > 0 && (
                    <div className="mt-8">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Uploaded Documents</h3>
                        <Badge variant="outline" className="text-slate-600">
                          {files.length} {files.length === 1 ? "file" : "files"}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {files.map((file, index) => {
                          const doc = processedDocuments[index]
                          const docType = doc?.documentType as keyof typeof documentTypes
                          const DocIcon = documentTypes[docType]?.icon || FileText
                          const iconColor = documentTypes[docType]?.color || "text-slate-500"

                          return (
                            <div
                              key={index}
                              className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm"
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-md relative">
                                  {doc?.status === "processing" && currentProcessingIndex === index ? (
                                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                  ) : doc?.status === "completed" ? (
                                    <DocIcon className={`h-5 w-5 ${iconColor}`} />
                                  ) : doc?.status === "error" ? (
                                    <AlertCircle className="h-5 w-5 text-red-500" />
                                  ) : (
                                    <FileText className="h-5 w-5 text-slate-500" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-slate-800">{file.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                                    {doc?.status === "processing" && currentProcessingIndex === index && (
                                      <span className="text-blue-600 flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Processing...
                                      </span>
                                    )}
                                    {doc?.status === "completed" && (
                                      <span className="text-green-600 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" />
                                        {documentTypes[docType]?.title || "Completed"}
                                      </span>
                                    )}
                                    {doc?.status === "error" && (
                                      <span className="text-red-600 flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        Error
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {!isProcessing && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveFile(index)}
                                  className="text-slate-500 hover:text-red-500"
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-8">
                        {isProcessing ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-slate-800">
                                  Processing Document {currentProcessingIndex + 1} of {files.length}
                                </p>
                                <p className="text-sm text-slate-600">AI is analyzing each document individually...</p>
                              </div>
                              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                            </div>
                            <Progress value={processingProgress} className="h-2" />
                          </div>
                        ) : (
                          <Button
                            onClick={processFiles}
                            disabled={files.length === 0}
                            className="w-full py-6 text-lg gap-2"
                          >
                            Process Documents <ArrowRight className="h-5 w-5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {errorCount > 0 && !isProcessing && (
                    <Alert className="mt-6 bg-red-50 border-red-200" variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Processing Errors</AlertTitle>
                      <AlertDescription>
                        {errorCount} document{errorCount > 1 ? "s" : ""} failed to process. Check the results tab for
                        details.
                      </AlertDescription>
                    </Alert>
                  )}

                  {completedCount > 0 && !isProcessing && (
                    <Alert className="mt-6 bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle>Processing Complete</AlertTitle>
                      <AlertDescription>
                        {completedCount} document{completedCount > 1 ? "s" : ""} processed successfully.
                        <p>Click the &quot;Review &amp; Export&quot; tab to see the extracted data.</p>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <DocumentTypeCard
                  title="Invoices"
                  description="Bills from vendors with detailed item breakdown"
                  icon={FileCheck}
                  color="blue"
                />
                <DocumentTypeCard
                  title="EFT Receipts"
                  description="Electronic fund transfer payment confirmations"
                  icon={CreditCard}
                  color="green"
                />
                <DocumentTypeCard
                  title="E-Way Bills"
                  description="Electronic waybills for goods transportation"
                  icon={Truck}
                  color="amber"
                />
              </div>
            </TabsContent>

            <TabsContent value="results" className="space-y-6">
              {completedCount > 0 ? (
                <>
                  <div className="grid grid-cols-1 gap-6">
                    {processedDocuments.map((doc, index) => {
                      if (doc.status !== "completed") return null

                      const docType = doc.documentType as keyof typeof documentTypes
                      const DocIcon = documentTypes[docType]?.icon || FileText
                      const iconColor = documentTypes[docType]?.color || "text-slate-500"
                      const bgColor = documentTypes[docType]?.bgColor || "bg-slate-100"
                      const title = documentTypes[docType]?.title || doc.documentType

                      return (
                        <Card key={index} className="shadow-md border-slate-200 overflow-hidden">
                        <CardHeader>
                          <div className={`p-4 ${bgColor} border-b flex items-center justify-between`}>
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded-md ${bgColor}`}>
                                <DocIcon className={`h-5 w-5 ${iconColor}`} />
                              </div>
                              <div>
                                <CardTitle className="font-medium text-slate-800">
                                  {doc.fileName}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  Identified as: <span className="font-medium">{title}</span>
                                </CardDescription>
                              </div>
                            </div>
                            <CardAction>
                              <Badge className={`${bgColor} ${iconColor} border-0`}>{title}</Badge>
                            </CardAction>
                          </div>
                        </CardHeader>
                      
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                            <DataSheet
                              data={doc.data}
                              documentType={doc.documentType}
                              onUpdate={(updatedData) => handleUpdateDocument(index, updatedData)}
                            />
                            {doc.fileUrl && (
                              <div className="flex flex-col">
                                <h4 className="font-medium text-slate-800 mb-2 text-sm">Document Preview</h4>
                                <PdfPreview fileUrl={doc.fileUrl} />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      
                        <CardFooter>
                          <p className="text-xs text-slate-500">Card Footer (optional info)</p>
                        </CardFooter>
                      </Card>
                        
                      )
                    })}
                  </div>

                  {/* Show error documents */}
                  {errorCount > 0 && (
                    <Card className="shadow-md border-red-200 bg-red-50">
                      <CardContent className="p-4">
                        <h3 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                          <AlertCircle className="h-5 w-5" />
                          Failed Documents ({errorCount})
                        </h3>
                        <div className="space-y-2">
                          {processedDocuments
                            .filter((doc) => doc.status === "error")
                            .map((doc, index) => (
                              <div key={index} className="text-sm text-red-700">
                                <span className="font-medium">{doc.fileName}:</span> {doc.error}
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="shadow-md border-slate-200 bg-white p-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-medium">Document Processing Summary</h3>
                        <p className="text-slate-600 text-sm">
                          {completedCount} completed • {errorCount} failed • {files.length} total
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <CSVDownloadBtn
        processedDocuments={processedDocuments}
        handleDownloadCSV={handleDownloadCSV}
      />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button className="gap-2" disabled variant="secondary" title="Coming soon">
                                Push Data to Portal <ArrowRight className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Coming soon - Send extracted data to accounting portal</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </Card>
                </>
              ) : (
                <div className="text-center py-16 bg-white rounded-lg border shadow-sm">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-slate-800 mb-2">No Completed Documents</h3>
                  <p className="text-slate-600 max-w-md mx-auto">
                    Please upload and process documents first to see the extracted data here.
                  </p>
                  <Button variant="outline" className="mt-6" onClick={() => setActiveTab("upload")}>
                    Go to Upload
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}