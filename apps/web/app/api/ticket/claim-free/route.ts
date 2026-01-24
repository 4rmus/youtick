import { NextRequest, NextResponse } from "next/server";
import { Account, KeyPair, KeyPairSigner, actions, type KeyPairString } from "near-api-js";
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

/**
 * Sponsored Free Ticket Claim API
 *
 * POST /api/ticket/claim-free
 * Body: { receiver_id: string, encrypted_cid: string }
 *
 * Claims a FREE ticket (price=0) with the contract paying storage costs.
 * Works for trial accounts and regular users alike.
 */
export async function POST(request: NextRequest) {
    // CORS check - block disallowed origins
    const corsBlock = checkCors(request);
    if (corsBlock) return corsBlock;

    try {
        const body = await request.json();
        const { receiver_id, encrypted_cid } = body;

        if (!receiver_id || !encrypted_cid) {
            const errorRes = NextResponse.json(
                { error: "Missing receiver_id or encrypted_cid" },
                { status: 400 }
            );
            return addCorsHeaders(errorRes, request);
        }

        // Get relayer credentials
        const relayerAccountId = process.env.RELAYER_ACCOUNT_ID;
        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;

        if (!relayerAccountId || !relayerPrivateKey) {
            console.error("Missing relayer credentials");
            const errorRes = NextResponse.json(
                { error: "Server configuration error: Missing relayer credentials" },
                { status: 500 }
            );
            return addCorsHeaders(errorRes, request);
        }

        const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "v1.utick.testnet";
        const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";

        // v7: Create Account with signer directly
        const keyPair = KeyPair.fromString(relayerPrivateKey as KeyPairString);
        const signer = new KeyPairSigner(keyPair);
        const rpcUrl = networkId === "mainnet"
            ? "https://rpc.fastnear.com"
            : "https://test.rpc.fastnear.com";

        const relayerAccount = new Account(relayerAccountId, rpcUrl, signer);

        // Call contract's claim_free_ticket_sponsored using v7 actions
        const result = await relayerAccount.signAndSendTransaction({
            receiverId: contractId,
            actions: [
                actions.functionCall(
                    "claim_free_ticket_sponsored",
                    { receiver_id, encrypted_cid },
                    BigInt("100000000000000"), // 100 TGas
                    BigInt(0) // No deposit
                )
            ]
        });

        // Extract token info from result
        const tokenId = result.receipts_outcome?.[0]?.outcome?.logs?.find(
            (log: string) => log.includes("token_id")
        );

        const successRes = NextResponse.json({
            success: true,
            receiver_id,
            transaction_hash: result.transaction.hash,
            token_id: tokenId,
        });
        return addCorsHeaders(successRes, request);

    } catch (error: unknown) {
        console.error("Sponsored free ticket claim error:", error);

        let errorRes: NextResponse;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("not free")) {
            errorRes = NextResponse.json(
                { error: "This ticket is not free. Please use the normal purchase flow." },
                { status: 400 }
            );
        } else if (errorMessage.includes("Trial pool empty")) {
            errorRes = NextResponse.json(
                { error: "Trial pool is empty. Please try again later." },
                { status: 503 }
            );
        } else if (errorMessage.includes("Event not found")) {
            errorRes = NextResponse.json(
                { error: "Event not found. Invalid encrypted_cid." },
                { status: 404 }
            );
        } else {
            errorRes = NextResponse.json(
                { error: errorMessage || "Failed to claim free ticket" },
                { status: 500 }
            );
        }

        return addCorsHeaders(errorRes, request);
    }
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request);
}
