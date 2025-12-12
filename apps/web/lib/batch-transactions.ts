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
            livepeer_playback_id: string;
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
            BigInt('0') // No deposit
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
 * This is a one-time setup that happens on first use
 */
export async function batchInitialSetup(
    wallet: any,
    accountId: string,
    contractId: string,
    sessionKeyPublicKey: string,
    gasAmount: string = '1' // 1 NEAR default
) {
    const actions = [
        // Action 1: Deposit gas to tank (large amount for multiple uploads)
        transactions.functionCall(
            'deposit_funds',
            Buffer.from(JSON.stringify({})),
            BigInt('30000000000000'), // 30 TGas
            BigInt(utils.format.parseNearAmount(gasAmount) || '0')
        ),
        // Action 2: Add session key
        transactions.addKey(
            utils.PublicKey.from(sessionKeyPublicKey),
            transactions.functionCallAccessKey(
                contractId,
                [], // All methods allowed
                BigInt(utils.format.parseNearAmount('0.25') || '0') // 0.25 NEAR allowance
            )
        )
    ];

    return await wallet.signAndSendTransaction({
        receiverId: accountId, // Add key to user's account
        actions: actions
    });
}
