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

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
};

function getUpstreamUrls(): readonly string[] {
    const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
    return NEAR_RPC_UPSTREAMS[network];
}

export async function OPTIONS(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

export async function POST(request: Request): Promise<Response> {
    const body = await request.text();
    const contentType = request.headers.get('content-type') || 'application/json';
    let upstream: Response | null = null;

    for (const upstreamUrl of getUpstreamUrls()) {
        try {
            upstream = await fetch(upstreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body,
            });
            if (upstream.status !== 429 && upstream.status < 500) break;
        } catch {
            upstream = null;
        }
    }

    if (!upstream) {
        return Response.json({ error: 'NEAR RPC unavailable' }, {
            status: 502,
            headers: CORS_HEADERS,
        });
    }

    const headers = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value);
    }
    headers.set('Cache-Control', 'no-store');

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}
