import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/utils/supabase';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;

  console.log(
    `📄 ServeDocument: Retrieving document ${documentId} from database`
  );

  try {
    const supabase = getSupabaseClient();

    // Query the document_storage table for the file data
    const { data, error } = await supabase
      .from('document_storage')
      .select('file_base64, file_name, file_size')
      .eq('id', documentId)
      .single();

    if (error) {
      console.error(
        `❌ ServeDocument: Database error for ${documentId}:`,
        error
      );
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!data) {
      console.error(`❌ ServeDocument: No data found for ${documentId}`);
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    console.log(
      `✅ ServeDocument: Found document ${data.file_name} (${data.file_size} bytes)`
    );

    // Convert base64 to buffer
    const base64Data = data.file_base64.replace(
      /^data:application\/pdf;base64,/,
      ''
    );
    const pdfBuffer = Buffer.from(base64Data, 'base64');

    console.log(
      `🔄 ServeDocument: Converted base64 to buffer (${pdfBuffer.length} bytes)`
    );

    // Return the PDF file with proper headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.length.toString(),
        'Content-Disposition': `inline; filename="${data.file_name}"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error(
      `💥 ServeDocument: Error serving document ${documentId}:`,
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
