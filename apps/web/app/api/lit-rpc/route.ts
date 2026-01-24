import { NextRequest, NextResponse } from 'next/server';
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

export async function POST(req: NextRequest) {
    // CORS check - block disallowed origins
    const corsBlock = checkCors(req);
    if (corsBlock) return corsBlock;

    try {
        const body = await req.json();

        // Proxy to Yellowstone RPC
        const response = await fetch('https://yellowstone-rpc.litprotocol.com', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        // Add CORS headers for allowed origins only (youtick.net, localhost)
        const res = NextResponse.json(data);
        return addCorsHeaders(res, req);
    } catch (error: unknown) {
        console.error('Lit RPC Proxy Error:', error);
        const errorRes = NextResponse.json({ error: 'Failed to proxy Lit RPC request' }, { status: 500 });
        return addCorsHeaders(errorRes, req);
    }
}

export async function OPTIONS(req: NextRequest) {
    return handleCorsPreflightRequest(req);
}
