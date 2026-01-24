// lib/batch-transactions.ts - near-api-js v7 compatible
import { actions, nearToYocto, PublicKey } from 'near-api-js';

/**
 * Batch multiple actions into a single transaction
 * This reduces multiple signatures into one
 */
export async function batchUploadActions(
    wallet: any,
    contractId: string,
    accountId: string,
    videoMetadata: {
        receiver_id: string;
        token_metadata: {
            title: string;
            description: string;
            media: string;
            copies: number;
        };
        video_metadata: {
            encrypted_cid: string;
            duration_seconds: number;
            content_type: string;
        };
    },
    eventMetadata: {
        encrypted_cid: string;
        title: string;
        description: string;
        price: string;
    }
) {
    // v7: Use actions.functionCall instead of transactions.functionCall
    const txActions = [
        // Action 1: Mint NFT (no deposit needed, uses prepaid pattern)
        actions.functionCall(
            'nft_mint_prepaid',
            videoMetadata,
            BigInt('100000000000000'), // 100 TGas
            BigInt('0') // No deposit attached (uses internal balance)
        ),
        // Action 2: Create Event (requires storage deposit)
        actions.functionCall(
            'create_event',
            eventMetadata,
            BigInt('30000000000000'), // 30 TGas
            BigInt(nearToYocto('0.1')) // v7: Use nearToYocto
        )
    ];

    return await wallet.signAndSendTransaction({
        receiverId: contractId,
        actions: txActions
    });
}

/**
 * Batch initial setup: Gas deposit + Session Key
 * This requires TWO transactions because:
 * 1. deposit_funds goes to the CONTRACT
 * 2. addKey goes to the USER's account
 */
export async function batchInitialSetup(
    wallet: any,
    accountId: string,
    contractId: string,
    sessionKeyPublicKey: string,
    gasAmount: string = '1' // 1 NEAR default
) {
    // v7: Use actions helpers
    const pubKey = PublicKey.fromString(sessionKeyPublicKey);

    // Use signAndSendTransactions (plural) to bundle both into one signature approval if supported by the wallet
    return await wallet.signAndSendTransactions({
        transactions: [
            {
                receiverId: contractId,
                actions: [
                    actions.functionCall(
                        'deposit_funds',
                        {},
                        BigInt('30000000000000'), // 30 TGas
                        BigInt(nearToYocto(parseFloat(gasAmount)))
                    )
                ]
            },
            {
                receiverId: accountId,
                actions: [
                    // v7: Use addFunctionCallAccessKey instead of addKey + functionCallAccessKey
                    actions.addFunctionCallAccessKey(
                        pubKey,
                        contractId,
                        [], // All methods allowed
                        BigInt(nearToYocto('0.25')) // 0.25 NEAR allowance
                    )
                ]
            }
        ]
    });
}

/**
 * Signless version of batchUploadActions
 * Uses Session Key and internal balance
 */
export async function batchUploadActionsSignless(
    sessionManager: any,
    videoMetadata: {
        receiver_id: string;
        token_metadata: {
            title: string;
            description: string;
            media: string;
            copies: number;
        };
        video_metadata: {
            encrypted_cid: string;
            duration_seconds: number;
            content_type: string;
        };
    },
    eventMetadata: {
        encrypted_cid: string;
        title: string;
        description: string;
        price: string;
    }
) {
    // We must split these into two transactions because Limited Access Keys (Session Keys)
    // only allow one action per transaction.

    console.log("Action 1: Minting NFT (Signless)...");
    await sessionManager.callMethod('nft_mint_prepaid', videoMetadata);

    console.log("Action 2: Creating Event (Signless)...");
    return await sessionManager.callMethod('create_event_prepaid', {
        encrypted_cid: eventMetadata.encrypted_cid,
        title: eventMetadata.title,
        description: eventMetadata.description,
        price: eventMetadata.price
    });
}

/**
 * Create session key only (no deposit) for PKP users
 * PKP users don't need prepaid gas - they pay directly
 */
export async function createSessionKeyOnly(
    wallet: any,
    accountId: string,
    contractId: string,
    sessionKeyPublicKey: string
) {
    const pubKey = PublicKey.fromString(sessionKeyPublicKey);

    return await wallet.signAndSendTransaction({
        receiverId: accountId,
        actions: [
            // v7: Use addFunctionCallAccessKey
            actions.addFunctionCallAccessKey(
                pubKey,
                contractId,
                [], // All methods allowed
                BigInt(nearToYocto('0.25')) // 0.25 NEAR allowance for tx fees
            )
        ]
    });
}
