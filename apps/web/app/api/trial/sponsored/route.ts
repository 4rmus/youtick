import { NextResponse } from "next/server";
import { connect, keyStores, KeyPair } from "near-api-js";

/**
 * Sponsored Trial API - Creates trial accounts as subaccounts of the contract
 * 
 * POST /api/trial/sponsored
 * Body: { username: string, new_public_key: string }
 * 
 * Creates: {username}.{contract_id} (e.g. "alice.v1.utick.testnet")
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, new_public_key } = body;

        if (!username || !new_public_key) {
            return NextResponse.json(
                { error: "Missing username or new_public_key" },
                { status: 400 }
            );
        }

        // Validate username format (contract will also validate)
        const usernamePattern = /^[a-z0-9_-]{2,32}$/;
        if (!usernamePattern.test(username)) {
            return NextResponse.json(
                { error: "Username must be 2-32 characters, lowercase letters, numbers, - and _ only" },
                { status: 400 }
            );
        }

        // Get relayer credentials
        const relayerAccountId = process.env.RELAYER_ACCOUNT_ID;
        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;

        if (!relayerAccountId || !relayerPrivateKey) {
            console.error("Missing relayer credentials:", { relayerAccountId: !!relayerAccountId, relayerPrivateKey: !!relayerPrivateKey });
            return NextResponse.json(
                { error: "Server configuration error: Missing relayer credentials" },
                { status: 500 }
            );
        }

        const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "v1.utick.testnet";
        const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";

        // The new account will be: {username}.{contractId}
        const newAccountId = `${username}.${contractId}`;

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

        // Call contract's create_sponsored_trial with username
        const result = await relayerAccount.functionCall({
            contractId,
            methodName: "create_sponsored_trial",
            args: {
                username,
                new_public_key,
            },
            gas: BigInt("200000000000000"), // 200 TGas
        });

        return NextResponse.json({
            success: true,
            account_id: newAccountId,
            transaction_hash: result.transaction.hash,
        });

    } catch (error: any) {
        console.error("Sponsored trial error:", error);

        // Check for specific errors
        if (error.message?.includes("Trial pool empty")) {
            return NextResponse.json(
                { error: "Trial pool is empty. Please try again later." },
                { status: 503 }
            );
        }

        if (error.message?.includes("already exists")) {
            return NextResponse.json(
                { error: "This username is already taken. Please choose another." },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to create trial account" },
            { status: 500 }
        );
    }
}
