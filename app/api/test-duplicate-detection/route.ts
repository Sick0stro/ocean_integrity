// Test endpoint for duplicate detection logic
// Access via: GET /api/test-duplicate-detection

import { NextResponse } from 'next/server';

// Replicate the functions from app/page.tsx
function extractDocumentTypeFromFilename(fileName: string): string {
  const lower = fileName.toLowerCase();

  if (lower.includes('invoice')) return 'invoice';
  if (
    lower.includes('eway') ||
    lower.includes('e way') ||
    lower.includes('e-way')
  )
    return 'eway';
  if (/^[0-9]+\.?\s*[a-z]{2}\d+/i.test(fileName)) return 'state_doc';
  if (lower.includes('receipt')) return 'receipt';
  if (lower.includes('eft')) return 'eft';

  return 'other';
}

function extractBusinessNumberFromFilename(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');

  // Pattern 1: Invoice numbers
  const invoiceMatch = nameWithoutExt.match(/invoice[^0-9]*(\d+)/i);
  if (invoiceMatch) return invoiceMatch[1];

  // Pattern 2: E-way bills
  const ewayMatch = nameWithoutExt.match(/e.?way[^0-9]*(\d+)/i);
  if (ewayMatch) return ewayMatch[1];

  // Pattern 3: State documents
  const stateMatch = nameWithoutExt.match(/([A-Z]{2}\d{10,})/i);
  if (stateMatch) return stateMatch[1].toUpperCase();

  // Pattern 4: Receipt patterns
  const receiptMatch = nameWithoutExt.match(/(?:eft|receipt)[^0-9]*(\d+)/i);
  if (receiptMatch) return receiptMatch[1];

  // Fallback
  return nameWithoutExt
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function generateFilenameFingerprint(fileName: string, userId: string): string {
  const docType = extractDocumentTypeFromFilename(fileName);
  const businessId = extractBusinessNumberFromFilename(fileName);
  return `${userId}:${docType}:${businessId}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const testFile = searchParams.get('file');

  if (testFile) {
    // Test single file
    const result = {
      fileName: testFile,
      documentType: extractDocumentTypeFromFilename(testFile),
      businessNumber: extractBusinessNumberFromFilename(testFile),
      fingerprint: generateFilenameFingerprint(testFile, 'test_user'),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      singleFileTest: result,
    });
  }

  // Test your August 22nd batch
  const august22Files = [
    '25.INVOICE NO.343.pdf',
    '37. INVOICE NO. 47.pdf',
    '60. INVOICE NO. 1675.pdf',
    '47.EWAY BILL.259.pdf',
    '31.EWAY BILL.257.pdf',
    '29. GJ0270009843.pdf',
    '116. RJ0670000891.pdf',
    '101. MP0510007928.pdf',
  ];

  const results = august22Files.map((fileName) => ({
    fileName,
    documentType: extractDocumentTypeFromFilename(fileName),
    businessNumber: extractBusinessNumberFromFilename(fileName),
    fingerprint: generateFilenameFingerprint(fileName, 'test_user'),
    oldPatternWouldMatch:
      fileName.replace(/[^a-zA-Z0-9.-]/g, '_').includes('INVOICE') ||
      fileName.includes('EWAY') ||
      fileName.includes('GJ'),
  }));

  // Analyze duplicates
  const fingerprints = results.map((r) => r.fingerprint);
  const uniqueFingerprints = [...new Set(fingerprints)];
  const hasDuplicates = fingerprints.length !== uniqueFingerprints.length;

  return NextResponse.json({
    success: true,
    analysis: {
      totalFiles: august22Files.length,
      uniqueFingerprints: uniqueFingerprints.length,
      hasFalsePositives: !hasDuplicates,
      message: hasDuplicates
        ? '❌ Still has duplicate detection issues'
        : '✅ No false positives detected!',
    },
    results,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const { files } = await request.json();

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide an array of filenames to test',
        },
        { status: 400 }
      );
    }

    const results = files.map((fileName: string) => ({
      fileName,
      documentType: extractDocumentTypeFromFilename(fileName),
      businessNumber: extractBusinessNumberFromFilename(fileName),
      fingerprint: generateFilenameFingerprint(fileName, 'test_user'),
    }));

    return NextResponse.json({
      success: true,
      customTest: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in POST request:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid JSON payload',
      },
      { status: 400 }
    );
  }
}
