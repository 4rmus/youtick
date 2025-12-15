import { NextResponse } from 'next/server';
import lighthouse from '@lighthouse-web3/sdk';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const apiKey = process.env.LIGHTHOUSE_API_KEY || process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY;
        if (!apiKey) {
            console.error('LIGHTHOUSE_API_KEY is not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // Convert File to ArrayBuffer for Node.js environment usage if needed,
        // although SDK might handle File objects if polyfilled.
        // Lighthouse SDK `uploadBuffer` is safer for Node environments.
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Usage: await lighthouse.uploadBuffer(buffer, apiKey)
        // SDK returns: { data: { Name: string, Hash: string, Size: string } }
        const response = await lighthouse.uploadBuffer(buffer, apiKey);

        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error('Lighthouse Proxy Error:', error);
        return NextResponse.json(
            { error: error.message || 'Upload failed' },
            { status: 500 }
        );
    }
}
