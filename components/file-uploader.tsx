'use client';

import type React from 'react';
import { useState, useRef } from 'react';
import { Upload, File, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface FileUploaderProps {
  onFilesAdded: (files: File[]) => void;
  maxFiles?: number;
  acceptedFileTypes?: string[];
}

export default function FileUploader({
  onFilesAdded,
  maxFiles = 4,
  acceptedFileTypes = ['.pdf'],
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {}
  );
  const [, setMode] = useState<'files' | 'folder'>('files');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    console.log(
      `📁 FileUploader: Drag & Drop - ${files.length} total files detected`
    );

    const pdfFiles = files.filter((file) =>
      acceptedFileTypes.some((type) =>
        file.name.toLowerCase().endsWith(type.replace('.', ''))
      )
    );

    console.log(
      `🔍 FileUploader: Drag & Drop - Found ${pdfFiles.length} PDF files`
    );

    if (pdfFiles.length > 0) {
      const filesToAdd = pdfFiles.slice(0, maxFiles);
      simulateUpload(filesToAdd);
    }
  };

  const handleFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    isFolder: boolean = false
  ) => {
    console.log(
      `🚀 FileUploader: ${
        isFolder ? 'Folder' : 'Files'
      } selection - handleFileInputChange triggered`
    );
    console.log(
      `📂 FileUploader: Files detected:`,
      e.target.files?.length || 0
    );

    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      console.log(
        `📁 FileUploader: ${isFolder ? 'FOLDER' : 'FILES'} SELECTION WORKING! ${
          files.length
        } total files detected`
      );

      // Log all detected files for debugging
      files.forEach((file, index) => {
        const relativePath = (file as File & { webkitRelativePath?: string })
          .webkitRelativePath;
        console.log(
          `   📄 ${index + 1}. ${file.name} (${
            file.type || 'unknown type'
          }) - ${(file.size / 1024).toFixed(2)} KB`
        );
        if (isFolder) {
          console.log(`      📁 Path: ${relativePath || 'No path available'}`);
        }
      });

      // Filter for PDF files only
      const pdfFiles = files.filter((file) => {
        const isPdf =
          file.type === 'application/pdf' ||
          file.name.toLowerCase().endsWith('.pdf');
        console.log(
          `   🔍 ${file.name} - Is PDF: ${isPdf} (type: ${file.type})`
        );
        return isPdf;
      });

      console.log(
        `✅ FileUploader: Found ${pdfFiles.length} PDF files after filtering`
      );

      if (pdfFiles.length > 0) {
        const filesToAdd = pdfFiles.slice(0, maxFiles);
        console.log(
          `📦 FileUploader: Adding ${filesToAdd.length} PDF files to upload queue`
        );
        simulateUpload(filesToAdd);
      } else {
        console.log(`⚠️ FileUploader: No PDF files found in selection`);
        alert(
          `No PDF files found. Please select PDF files or a folder containing PDF files.`
        );
      }

      // Reset the input
      if (e.target) {
        e.target.value = '';
      }
    } else {
      console.log(
        `❌ FileUploader: No files detected - selection may have been cancelled`
      );
    }
  };

  const simulateUpload = (files: File[]) => {
    // Create initial progress entries
    const initialProgress: Record<string, number> = {};
    files.forEach((file) => {
      initialProgress[file.name] = 0;
    });
    setUploadProgress(initialProgress);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        let allComplete = true;

        Object.keys(newProgress).forEach((fileName) => {
          if (newProgress[fileName] < 100) {
            newProgress[fileName] += Math.random() * 20;
            if (newProgress[fileName] > 100) newProgress[fileName] = 100;
            allComplete = false;
          }
        });

        if (allComplete) {
          clearInterval(interval);
          // After "upload" is complete, add files to the main state
          setTimeout(() => {
            onFilesAdded(files);
            setUploadProgress({});
          }, 500);
        }

        return newProgress;
      });
    }, 200);
  };

  const handleSelectFiles = () => {
    console.log(`🖱️ FileUploader: "Select Files" button clicked`);
    setMode('files');
    if (fileInputRef.current) {
      console.log(`📂 FileUploader: Triggering file input click`);
      fileInputRef.current.click();
    } else {
      console.error(`❌ FileUploader: File input ref is null!`);
    }
  };

  const handleSelectFolder = () => {
    console.log(`🖱️ FileUploader: "Select Folder" button clicked`);
    setMode('folder');
    if (folderInputRef.current) {
      console.log(`📂 FileUploader: Triggering folder input click`);
      folderInputRef.current.click();
    } else {
      console.error(`❌ FileUploader: Folder input ref is null!`);
    }
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-50'
          : isUploading
          ? 'border-blue-300 bg-blue-50/50'
          : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Regular file input for selecting multiple files */}
      <input
        type='file'
        ref={fileInputRef}
        onChange={(e) => handleFileInputChange(e, false)}
        accept={acceptedFileTypes.join(',')}
        multiple={true}
        className='hidden'
        disabled={isUploading}
        style={{ display: 'none' }}
      />

      {/* Folder input with webkitdirectory */}
      <input
        type='file'
        ref={(input) => {
          folderInputRef.current = input;
          if (input) {
            // Set webkitdirectory directly on the DOM element
            (
              input as HTMLInputElement & { webkitdirectory: boolean }
            ).webkitdirectory = true;
          }
        }}
        onChange={(e) => handleFileInputChange(e, true)}
        multiple={true}
        className='hidden'
        disabled={isUploading}
        style={{ display: 'none' }}
      />

      {isUploading ? (
        <div className='space-y-4'>
          <div className='p-3 bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto'>
            <File className='h-8 w-8 text-blue-600' />
          </div>
          <h3 className='text-lg font-medium'>Uploading documents...</h3>

          <div className='space-y-3 max-w-md mx-auto'>
            {Object.entries(uploadProgress).map(([fileName, progress]) => (
              <div key={fileName} className='space-y-1'>
                <div className='flex justify-between text-sm'>
                  <span className='truncate max-w-[250px]'>{fileName}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className='h-2' />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className='flex flex-col items-center justify-center space-y-4'>
          <div className='p-3 bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center'>
            <Upload className='h-8 w-8 text-blue-600' />
          </div>
          <div>
            <h3 className='text-lg font-medium'>Upload PDF Documents</h3>
            <p className='text-sm text-slate-500 mt-1'>
              Drag & drop PDF files here, or use the buttons below
            </p>
            <p className='text-xs text-slate-400 mt-1'>
              Supports PDF Documents Only • Max {maxFiles} files at once
            </p>
          </div>

          <div className='flex gap-3'>
            <Button
              onClick={handleSelectFiles}
              variant='outline'
              size='lg'
              className='mt-2'
            >
              <File className='mr-2 h-4 w-4' />
              Select PDF File
            </Button>

            <Button
              onClick={handleSelectFolder}
              variant='outline'
              size='lg'
              className='mt-2'
            >
              <Folder className='mr-2 h-4 w-4' />
              Select Folder
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
