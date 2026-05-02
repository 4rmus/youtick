const NEAR_RPC_UPSTREAMS = {
    mainnet: 'https://free.rpc.fastnear.com/',
    testnet: 'https://test.rpc.fastnear.com/',
} as const;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
};

function getUpstreamUrl(): string {
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
    const upstream = await fetch(getUpstreamUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': request.headers.get('content-type') || 'application/json',
        },
        body: await request.text(),
    });

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
