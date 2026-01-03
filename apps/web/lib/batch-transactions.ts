import { transactions, utils } from 'near-api-js';

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
    const actions = [
        // Action 1: Mint NFT (no deposit needed, uses prepaid pattern)
        transactions.functionCall(
            'nft_mint_prepaid',
            Buffer.from(JSON.stringify(videoMetadata)),
            BigInt('100000000000000'), // 100 TGas
            BigInt('0') // No deposit attached (uses internal balance)
        ),
        // Action 2: Create Event (requires storage deposit)
        transactions.functionCall(
            'create_event',
            Buffer.from(JSON.stringify(eventMetadata)),
            BigInt('30000000000000'), // 30 TGas
            BigInt(utils.format.parseNearAmount('0.1') || '0') // 0.1 NEAR storage deposit
        )
    ];

    return await wallet.signAndSendTransaction({
        receiverId: contractId,
        actions: actions
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
    // Use signAndSendTransactions (plural) to bundle both into one signature approval if supported by the wallet
    return await wallet.signAndSendTransactions({
        transactions: [
            {
                receiverId: contractId,
                actions: [
                    transactions.functionCall(
                        'deposit_funds',
                        Buffer.from(JSON.stringify({})),
                        BigInt('30000000000000'), // 30 TGas
                        BigInt(utils.format.parseNearAmount(gasAmount) || '0')
                    )
                ]
            },
            {
                receiverId: accountId,
                actions: [
                    transactions.addKey(
                        utils.PublicKey.from(sessionKeyPublicKey),
                        transactions.functionCallAccessKey(
                            contractId,
                            [], // All methods allowed
                            BigInt(utils.format.parseNearAmount('0.25') || '0') // 0.25 NEAR allowance
                        )
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
    return await wallet.signAndSendTransaction({
        receiverId: accountId,
        actions: [
            transactions.addKey(
                utils.PublicKey.from(sessionKeyPublicKey),
                transactions.functionCallAccessKey(
                    contractId,
                    [], // All methods allowed
                    BigInt(utils.format.parseNearAmount('0.25') || '0') // 0.25 NEAR allowance for tx fees
                )
            )
        ]
    });
}
