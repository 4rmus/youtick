/**
 * Capacity Credit Delegation for Lit Protocol
 * 
 * On datil-test network, requests to Lit require Capacity Credits.
 * This module handles delegating capacity from our server wallet to users.
 */

import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { ethers } from "ethers";

// Capacity Token ID - obtained from Lit Explorer after minting
// Set this in environment variables after minting a Capacity Credit NFT
const CAPACITY_TOKEN_ID = process.env.NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID;

// Server-side wallet private key for signing delegation auth sigs
const DELEGATION_WALLET_PRIVATE_KEY = process.env.LIT_DELEGATION_WALLET_PRIVATE_KEY;

// Chronicle Yellowstone RPC
const CHRONICLE_RPC = process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com';

/**
 * Create a Capacity Delegation Auth Sig for a user
 * This allows the user to use our Capacity Credits without owning one themselves
 * 
 * @param litNodeClient - Connected LitNodeClient instance
 * @param delegateeAddress - ETH address of the user being delegated to
 * @param uses - Number of uses to grant (default: 10)
 * @param expirationMinutes - Minutes until expiration (default: 60)
 */
export async function createCapacityDelegationAuthSig(
    litNodeClient: LitNodeClient,
    delegateeAddress: string,
    uses: number = 10,
    expirationMinutes: number = 60
) {
    if (!CAPACITY_TOKEN_ID) {
        console.warn("NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID not set - capacity delegation disabled");
        return null;
    }

    if (!DELEGATION_WALLET_PRIVATE_KEY) {
        console.warn("LIT_DELEGATION_WALLET_PRIVATE_KEY not set - capacity delegation disabled");
        return null;
    }

    try {
        // Create signer from private key
        const provider = new ethers.JsonRpcProvider(CHRONICLE_RPC);
        const dAppOwnerWallet = new ethers.Wallet(DELEGATION_WALLET_PRIVATE_KEY, provider);

        console.log("Creating Capacity Delegation Auth Sig for:", delegateeAddress);
        console.log("Using Capacity Token ID:", CAPACITY_TOKEN_ID);

        const { capacityDelegationAuthSig } = await litNodeClient.createCapacityDelegationAuthSig({
            dAppOwnerWallet,
            capacityTokenId: CAPACITY_TOKEN_ID,
            delegateeAddresses: [delegateeAddress],
            uses: uses.toString(),
            expiration: new Date(Date.now() + 1000 * 60 * expirationMinutes).toISOString(),
        });

        console.log("✅ Capacity Delegation Auth Sig created successfully");
        return capacityDelegationAuthSig;
    } catch (error) {
        console.error("Failed to create Capacity Delegation Auth Sig:", error);
        throw error;
    }
}

/**
 * Check if capacity delegation is available
 */
export function isCapacityDelegationAvailable(): boolean {
    return Boolean(CAPACITY_TOKEN_ID && DELEGATION_WALLET_PRIVATE_KEY);
}
