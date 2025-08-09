'use client';

import * as React from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

interface PdfPreviewProps {
  fileUrl: string;
  heightClass?: string; // optional to allow compact viewers in grids
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ fileUrl, heightClass }) => {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  return (
    <div
      className={`${
        heightClass || 'h-[600px]'
      } border rounded-lg overflow-hidden`}
    >
      <Worker workerUrl='https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'>
        <Viewer fileUrl={fileUrl} plugins={[defaultLayoutPluginInstance]} />
      </Worker>
    </div>
  );
};

export default PdfPreview;
