import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const rpcUrl = 'https://test.rpc.fastnear.com';

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('RPC Proxy Error:', error);
        return NextResponse.json({ error: 'Failed to proxy RPC request' }, { status: 500 });
    }
}
