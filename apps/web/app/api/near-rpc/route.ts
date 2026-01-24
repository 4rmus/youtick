import { NextRequest, NextResponse } from 'next/server';
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

export async function POST(request: NextRequest) {
    // CORS check - block disallowed origins
    const corsBlock = checkCors(request);
    if (corsBlock) return corsBlock;

    try {
        const body = await request.json();
        // Switched to fastnear because rpc.testnet.near.org is deprecated/rate-limited
        const rpcUrl = "https://test.rpc.fastnear.com";

        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        const res = NextResponse.json(data);
        return addCorsHeaders(res, request);
    } catch (error) {
        console.error("NEAR RPC Proxy Error:", error);
        const errorRes = NextResponse.json({ error: "Failed to fetch from NEAR RPC" }, { status: 500 });
        return addCorsHeaders(errorRes, request);
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request);
}
