import { NextRequest, NextResponse } from 'next/server';
import lighthouse from '@lighthouse-web3/sdk';
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

export async function POST(req: NextRequest) {
    // CORS check - block disallowed origins
    const corsBlock = checkCors(req);
    if (corsBlock) return corsBlock;

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            const errorRes = NextResponse.json({ error: 'No file provided' }, { status: 400 });
            return addCorsHeaders(errorRes, req);
        }

        const apiKey = process.env.LIGHTHOUSE_API_KEY || process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY;
        if (!apiKey) {
            console.error('LIGHTHOUSE_API_KEY is not configured');
            const errorRes = NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
            return addCorsHeaders(errorRes, req);
        }

        // Convert File to ArrayBuffer for Node.js environment usage if needed,
        // although SDK might handle File objects if polyfilled.
        // Lighthouse SDK `uploadBuffer` is safer for Node environments.
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Usage: await lighthouse.uploadBuffer(buffer, apiKey)
        // SDK returns: { data: { Name: string, Hash: string, Size: string } }
        const response = await lighthouse.uploadBuffer(buffer, apiKey);

        const successRes = NextResponse.json(response.data);
        return addCorsHeaders(successRes, req);

    } catch (error: unknown) {
        console.error('Lighthouse Proxy Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        const errorRes = NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
        return addCorsHeaders(errorRes, req);
    }
}

// Handle CORS preflight requests
export async function OPTIONS(req: NextRequest) {
    return handleCorsPreflightRequest(req);
}
