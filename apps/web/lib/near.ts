// lib/near.ts
import { connect, keyStores, transactions } from 'near-api-js';

const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID!;

export async function getNearConnection() {
    const near = await connect({
        networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
        nodeUrl: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
            ? 'https://rpc.mainnet.near.org'
            : 'https://test.rpc.fastnear.com',
        walletUrl: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
            ? 'https://wallet.near.org'
            : 'https://wallet.testnet.near.org',
        keyStore: new keyStores.BrowserLocalStorageKeyStore(),
    });
    return near;
}

/**
 * Result of NFT ownership verification
 */
export interface OwnershipResult {
    isOwner: boolean;
    error?: string;
}

/**
 * Server-side NFT ownership verification
 * SECURITY: Verifies ownership on-chain via NEAR RPC
 *
 * @returns Object with isOwner boolean and optional error message
 */
export async function verifyNftOwnership(
    walletAddress: string,
    tokenId: string
): Promise<OwnershipResult> {
    try {
        const near = await connect({
            networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
            nodeUrl: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
                ? 'https://rpc.mainnet.near.org'
                : 'https://test.rpc.fastnear.com',
            keyStore: new keyStores.InMemoryKeyStore(), // Use InMemory for server-side
        });

        const account = await near.account(NFT_CONTRACT_ID);

        // Call view function on contract
        const isOwner = await account.viewFunction({
            contractId: NFT_CONTRACT_ID,
            methodName: 'verify_ownership',
            args: {
                account_id: walletAddress,
                token_id: tokenId,
            },
        });

        return { isOwner: Boolean(isOwner) };
    } catch (error) {
        console.error("Error verifying NFT ownership:", error);

        // Distinguish between "not owner" and "verification failed"
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
            isOwner: false,
            error: `Verification failed: ${errorMessage}`
        };
    }
}

/**
 * Verifies a NEAR wallet signature
 *
 * SECURITY: Real cryptographic signature verification using NEAR API
 *
 * @param walletAddress - The NEAR wallet address that allegedly signed the message
 * @param message - The original message that was signed
 * @param signature - The signature to verify (base64 encoded)
 * @param publicKey - The public key associated with the wallet
 * @returns true if signature is valid, false otherwise
 */
export async function verifySignature(
    walletAddress: string,
    message: string,
    signature: string,
    publicKey: string
): Promise<boolean> {
    try {
        const { utils } = await import('near-api-js');

        // Convert message to bytes
        const messageBytes = Buffer.from(message);

        // Convert signature from base64 to bytes
        const signatureBytes = Buffer.from(signature, 'base64');

        // Create PublicKey instance from the provided public key string
        const pubKey = utils.PublicKey.from(publicKey);

        // Verify the signature
        const isValid = pubKey.verify(messageBytes, signatureBytes);

        if (!isValid) {
            console.error('Signature verification failed: Invalid signature');
            return false;
        }

        // Additional security: verify the public key belongs to the wallet
        // by checking it's in the wallet's access keys
        const near = await getNearConnection();
        const account = await near.account(walletAddress);
        const accessKeys = await account.getAccessKeys();

        const keyExists = accessKeys.some(
            key => key.public_key === publicKey
        );

        if (!keyExists) {
            console.error('Signature verification failed: Public key not associated with wallet');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error verifying NEAR signature:', error);
        return false;
    }
}


