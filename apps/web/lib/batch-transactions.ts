// lib/batch-transactions.ts - near-api-js v7 compatible
import { actions, nearToYocto, PublicKey, type Action } from 'near-api-js';
import { GAS_CONSTANTS } from './constants';
import type { WalletInstance } from './types';
import type { SessionManager } from './session-manager';

/**
 * Batch initial setup: Gas deposit + Session Key
 * This requires TWO transactions because:
 * 1. deposit_funds goes to the CONTRACT
 * 2. addKey goes to the USER's account
 */
export async function batchInitialSetup(
    wallet: WalletInstance,
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
                        GAS_CONSTANTS.smallGas,
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
 * Batch initial setup with optional Nova platform funding.
 * Bundles gas deposit + session key + (optional) Nova NEAR transfer into one wallet popup.
 */
export async function batchInitialSetupWithNovaFunding(
    wallet: WalletInstance,
    accountId: string,
    contractId: string,
    sessionKeyPublicKey: string,
    gasAmount: string = '1',
    novaFunding?: { receiverId: string; amount: number }
) {
    const pubKey = PublicKey.fromString(sessionKeyPublicKey);

    const transactions: Array<{ receiverId: string; actions: Action[] }> = [
        {
            receiverId: contractId,
            actions: [
                actions.functionCall(
                    'deposit_funds',
                    {},
                    GAS_CONSTANTS.smallGas,
                    BigInt(nearToYocto(parseFloat(gasAmount)))
                )
            ]
        },
        {
            receiverId: accountId,
            actions: [
                actions.addFunctionCallAccessKey(
                    pubKey,
                    contractId,
                    [],
                    BigInt(nearToYocto('0.25'))
                )
            ]
        }
    ];

    // Add Nova funding transaction if needed
    if (novaFunding && novaFunding.amount > 0) {
        transactions.push({
            receiverId: novaFunding.receiverId,
            actions: [actions.transfer(nearToYocto(novaFunding.amount))]
        });
    }

    return await wallet.signAndSendTransactions({ transactions });
}

/**
 * Signless version of batchUploadActions
 * Uses Session Key and internal balance
 */
export async function batchUploadActionsSignless(
    sessionManager: SessionManager,
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
            nova_group_id?: string | null;
            storage_type: 'Nova';
        };
    },
    eventMetadata: {
        encrypted_cid: string;
        title: string;
        description: string;
        price: string;
        price_usd?: number | null;
    }
) {
    // We must split these into two transactions because Limited Access Keys (Session Keys)
    // only allow one action per transaction.

    await sessionManager.callMethod('nft_mint_prepaid', videoMetadata);

    return await sessionManager.callMethod('create_event_prepaid', {
        encrypted_cid: eventMetadata.encrypted_cid,
        title: eventMetadata.title,
        description: eventMetadata.description,
        price: eventMetadata.price,
        price_usd: eventMetadata.price_usd ?? null,
    });
}

