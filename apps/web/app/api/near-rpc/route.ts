import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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
        return NextResponse.json(data);
    } catch (error) {
        console.error("NEAR RPC Proxy Error:", error);
        return NextResponse.json({ error: "Failed to fetch from NEAR RPC" }, { status: 500 });
    }
}
