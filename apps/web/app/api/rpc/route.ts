import { NextRequest, NextResponse } from 'next/server';
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

export async function POST(request: NextRequest) {
    // CORS check - block disallowed origins
    const corsBlock = checkCors(request);
    if (corsBlock) return corsBlock;

    try {
        const body = await request.json();
        const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'mainnet';
        const rpcUrl = networkId === 'mainnet'
            ? 'https://free.rpc.fastnear.com'
            : 'https://test.rpc.fastnear.com';

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        const res = NextResponse.json(data);
        return addCorsHeaders(res, request);
    } catch (error) {
        console.error('RPC Proxy Error:', error);
        const errorRes = NextResponse.json({ error: 'Failed to proxy RPC request' }, { status: 500 });
        return addCorsHeaders(errorRes, request);
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request);
}
