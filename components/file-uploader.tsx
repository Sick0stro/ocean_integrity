"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Upload, File } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

interface FileUploaderProps {
  onFilesAdded: (files: File[]) => void
  maxFiles?: number
  acceptedFileTypes?: string[]
}

export default function FileUploader({ onFilesAdded, maxFiles = 4, acceptedFileTypes = [".pdf"] }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) {
      setIsDragging(true)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    const pdfFiles = files.filter((file) =>
      acceptedFileTypes.some((type) => file.name.toLowerCase().endsWith(type.replace(".", ""))),
    )

    if (pdfFiles.length > 0) {
      const filesToAdd = pdfFiles.slice(0, maxFiles)
      simulateUpload(filesToAdd)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      const filesToAdd = files.slice(0, maxFiles)
      simulateUpload(filesToAdd)

      // Reset the input so the same file can be uploaded again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const simulateUpload = (files: File[]) => {
    // Create initial progress entries
    const initialProgress: Record<string, number> = {}
    files.forEach((file) => {
      initialProgress[file.name] = 0
    })
    setUploadProgress(initialProgress)

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        const newProgress = { ...prev }
        let allComplete = true

        Object.keys(newProgress).forEach((fileName) => {
          if (newProgress[fileName] < 100) {
            newProgress[fileName] += Math.random() * 20
            if (newProgress[fileName] > 100) newProgress[fileName] = 100
            allComplete = false
          }
        })

        if (allComplete) {
          clearInterval(interval)
          // After "upload" is complete, add files to the main state
          setTimeout(() => {
            onFilesAdded(files)
            setUploadProgress({})
          }, 500)
        }

        return newProgress
      })
    }, 200)
  }

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const isUploading = Object.keys(uploadProgress).length > 0

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : isUploading
            ? "border-blue-300 bg-blue-50/50"
            : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept={acceptedFileTypes.join(",")}
        multiple={maxFiles > 1}
        className="hidden"
        disabled={isUploading}
        {...{ webkitdirectory: "true" }}
      />

      {isUploading ? (
        <div className="space-y-4">
          <div className="p-3 bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
            <File className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-medium">Uploading documents...</h3>

          <div className="space-y-3 max-w-md mx-auto">
            {Object.entries(uploadProgress).map(([fileName, progress]) => (
              <div key={fileName} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="truncate max-w-[250px]">{fileName}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="p-3 bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center">
            <Upload className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium">Drag & Drop Each PDF Here</h3>
            <p className="text-sm text-slate-500 mt-1">or click to load the PDF entire folder from your computer</p>
            <p className="text-xs text-slate-400 mt-1">Supports PDF Documents Only • Max {maxFiles} files at once</p>
          </div>
          <Button onClick={handleButtonClick} variant="outline" size="lg" className="mt-2">
            Select Folder
          </Button>
        </div>
      )}
    </div>
  )
}
