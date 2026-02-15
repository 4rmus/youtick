import { NextRequest, NextResponse } from 'next/server';
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

/**
 * Whitelist of safe NEAR JSON-RPC methods.
 * Only read-only query methods are allowed through the proxy.
 * State-changing methods (send_tx, broadcast_tx_*) are intentionally excluded.
 */
const ALLOWED_RPC_METHODS = new Set([
    // View/query methods (read-only)
    'query',
    'block',
    'chunk',
    'tx',
    'EXPERIMENTAL_tx_status',
    'gas_price',
    'status',
    'network_info',
    'validators',
    // Light client
    'next_light_client_block',
    'light_client_proof',
]);

export async function POST(request: NextRequest) {
    // CORS check - block disallowed origins
    const corsBlock = checkCors(request);
    if (corsBlock) return corsBlock;

    try {
        const body = await request.json();

        // Validate JSON-RPC method against whitelist
        const method = body?.method;
        if (!method || typeof method !== 'string') {
            const errorRes = NextResponse.json(
                { error: 'Invalid JSON-RPC request: missing method' },
                { status: 400 }
            );
            return addCorsHeaders(errorRes, request);
        }

        if (!ALLOWED_RPC_METHODS.has(method)) {
            console.warn(`[RPC Proxy] Blocked disallowed method: ${method}`);
            const errorRes = NextResponse.json(
                { error: `RPC method not allowed: ${method}` },
                { status: 403 }
            );
            return addCorsHeaders(errorRes, request);
        }

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
        console.error('RPC Proxy Error:', error instanceof Error ? error.message : 'Unknown error');
        const errorRes = NextResponse.json({ error: 'Failed to proxy RPC request' }, { status: 500 });
        return addCorsHeaders(errorRes, request);
    }
}

export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request);
}
