import { NextResponse } from "next/server";
import { connect, keyStores, KeyPair } from "near-api-js";

/**
 * Sponsored Free Ticket Claim API
 * 
 * POST /api/ticket/claim-free
 * Body: { receiver_id: string, encrypted_cid: string }
 * 
 * Claims a FREE ticket (price=0) with the contract paying storage costs.
 * Works for trial accounts and regular users alike.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { receiver_id, encrypted_cid } = body;

        if (!receiver_id || !encrypted_cid) {
            return NextResponse.json(
                { error: "Missing receiver_id or encrypted_cid" },
                { status: 400 }
            );
        }

        // Get relayer credentials
        const relayerAccountId = process.env.RELAYER_ACCOUNT_ID;
        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;

        if (!relayerAccountId || !relayerPrivateKey) {
            console.error("Missing relayer credentials");
            return NextResponse.json(
                { error: "Server configuration error: Missing relayer credentials" },
                { status: 500 }
            );
        }

        const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "v1.utick.testnet";
        const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";

        // Setup keystore
        const keyStore = new keyStores.InMemoryKeyStore();
        await keyStore.setKey(
            networkId,
            relayerAccountId,
            KeyPair.fromString(relayerPrivateKey as any)
        );

        // Connect to NEAR
        const near = await connect({
            networkId,
            keyStore,
            nodeUrl: networkId === "mainnet"
                ? "https://rpc.fastnear.com"
                : "https://test.rpc.fastnear.com",
        });

        const relayerAccount = await near.account(relayerAccountId);

        // Call contract's claim_free_ticket_sponsored
        const result = await relayerAccount.functionCall({
            contractId,
            methodName: "claim_free_ticket_sponsored",
            args: {
                receiver_id,
                encrypted_cid,
            },
            gas: BigInt("100000000000000"), // 100 TGas
        });

        // Extract token info from result
        const tokenId = result.receipts_outcome?.[0]?.outcome?.logs?.find(
            (log: string) => log.includes("token_id")
        );

        return NextResponse.json({
            success: true,
            receiver_id,
            transaction_hash: result.transaction.hash,
            token_id: tokenId,
        });

    } catch (error: any) {
        console.error("Sponsored free ticket claim error:", error);

        if (error.message?.includes("not free")) {
            return NextResponse.json(
                { error: "This ticket is not free. Please use the normal purchase flow." },
                { status: 400 }
            );
        }

        if (error.message?.includes("Trial pool empty")) {
            return NextResponse.json(
                { error: "Trial pool is empty. Please try again later." },
                { status: 503 }
            );
        }

        if (error.message?.includes("Event not found")) {
            return NextResponse.json(
                { error: "Event not found. Invalid encrypted_cid." },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to claim free ticket" },
            { status: 500 }
        );
    }
}
