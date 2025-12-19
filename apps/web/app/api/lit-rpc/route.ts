import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
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

        // Add CORS headers to the response from our own API
        const res = NextResponse.json(data);
        res.headers.set('Access-Control-Allow-Origin', '*');
        res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.headers.set('Access-Control-Allow-Headers', 'Content-Type');

        return res;
    } catch (error: any) {
        console.error('Lit RPC Proxy Error:', error);
        return NextResponse.json({ error: 'Failed to proxy Lit RPC request' }, { status: 500 });
    }
}

export async function OPTIONS() {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return res;
}
