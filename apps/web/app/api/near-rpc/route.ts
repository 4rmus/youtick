const NEAR_RPC_UPSTREAMS = {
    mainnet: [
        'https://free.rpc.fastnear.com/',
        'https://rpc.mainnet.near.org/',
        'https://near.drpc.org/',
    ],
    testnet: [
        'https://test.rpc.fastnear.com/',
        'https://rpc.testnet.near.org/',
        'https://near-testnet.drpc.org/',
    ],
} as const;

const MAX_RPC_BODY_BYTES = 64 * 1024;

const ALLOWED_RPC_METHODS = new Set([
    'EXPERIMENTAL_changes',
    'EXPERIMENTAL_changes_in_block',
    'EXPERIMENTAL_light_client_proof',
    'EXPERIMENTAL_protocol_config',
    'EXPERIMENTAL_receipt',
    'EXPERIMENTAL_tx_status',
    'block',
    'broadcast_tx_async',
    'broadcast_tx_commit',
    'chunk',
    'gas_price',
    'network_info',
    'next_light_client_block',
    'query',
    'send_tx',
    'status',
    'tx',
    'validators',
]);

const STRIPPED_UPSTREAM_HEADERS = [
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'content-encoding',
    'content-length',
    'transfer-encoding',
] as const;

function getUpstreamUrls(): readonly string[] {
    const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
    return NEAR_RPC_UPSTREAMS[network];
}

export async function OPTIONS(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: { Allow: 'POST, OPTIONS' },
    });
}

async function readLimitedBody(request: Request): Promise<Uint8Array | null> {
    const declaredLength = request.headers.get('content-length');
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RPC_BODY_BYTES)) {
        return null;
    }

    if (!request.body) return new Uint8Array();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RPC_BODY_BYTES) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

function errorResponse(status: number, error: string): Response {
    return Response.json({ error }, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}

export async function POST(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
        return errorResponse(415, 'application/json required');
    }

    const bodyBytes = await readLimitedBody(request);
    if (!bodyBytes) return errorResponse(413, 'NEAR RPC body too large');

    let payload: unknown;
    try {
        payload = JSON.parse(new TextDecoder().decode(bodyBytes));
    } catch {
        return errorResponse(400, 'Invalid JSON-RPC request');
    }

    if (
        !payload
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || (payload as { jsonrpc?: unknown }).jsonrpc !== '2.0'
        || typeof (payload as { method?: unknown }).method !== 'string'
        || !ALLOWED_RPC_METHODS.has((payload as { method: string }).method)
    ) {
        return errorResponse(400, 'Unsupported JSON-RPC request');
    }

    const body = JSON.stringify(payload);
    let upstream: Response | null = null;

    for (const upstreamUrl of getUpstreamUrls()) {
        try {
            upstream = await fetch(upstreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            if (upstream.status !== 429 && upstream.status < 500) break;
        } catch {
            upstream = null;
        }
    }

    if (!upstream) {
        return errorResponse(502, 'NEAR RPC unavailable');
    }

    const headers = new Headers(upstream.headers);
    for (const header of STRIPPED_UPSTREAM_HEADERS) {
        headers.delete(header);
    }
    headers.set('Cache-Control', 'no-store');

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}
