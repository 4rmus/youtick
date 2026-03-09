import { actions, nearToYocto, PublicKey } from 'near-api-js';
import { GAS_CONSTANTS } from './constants';
import type { WalletInstance } from './types';

export interface SignlessUploadManager {
    callMethod(
        method: string,
        args: Record<string, unknown>,
        gas?: string,
    ): Promise<unknown>;
}

export async function batchInitialSetup(
    wallet: WalletInstance,
    accountId: string,
    contractId: string,
    sessionKeyPublicKey: string,
    gasAmount: string = '1',
) {
    const publicKey = PublicKey.fromString(sessionKeyPublicKey);

    return await wallet.signAndSendTransactions({
        transactions: [
            {
                receiverId: contractId,
                actions: [
                    actions.functionCall(
                        'deposit_funds',
                        {},
                        GAS_CONSTANTS.smallGas,
                        BigInt(nearToYocto(parseFloat(gasAmount))),
                    ),
                ],
            },
            {
                receiverId: accountId,
                actions: [
                    actions.addFunctionCallAccessKey(
                        publicKey,
                        contractId,
                        [],
                        BigInt(nearToYocto('0.25')),
                    ),
                ],
            },
        ],
    });
}

export async function batchUploadActionsSignless(
    sessionManager: SignlessUploadManager,
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
            storage_type: 'Kms';
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
    await sessionManager.callMethod('nft_mint_prepaid', videoMetadata);

    return await sessionManager.callMethod('create_event_prepaid', {
        encrypted_cid: eventMetadata.encrypted_cid,
        title: eventMetadata.title,
        description: eventMetadata.description,
        price: eventMetadata.price,
        price_usd: eventMetadata.price_usd ?? null,
    });
}
