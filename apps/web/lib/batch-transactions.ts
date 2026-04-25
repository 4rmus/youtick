export interface SignlessUploadManager {
    callMethod(
        method: string,
        args: Record<string, unknown>,
        gas?: string,
    ): Promise<unknown>;
}

export class BatchPublishError extends Error {
    constructor(
        message: string,
        public readonly phase: 'mint' | 'event',
        public readonly retryable: boolean,
    ) {
        super(message);
        this.name = 'BatchPublishError';
    }
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
        access_mode?: 'paid' | 'free_collectible' | 'public_free';
        content_type?: string;
    }
) {
    const mintResult = await sessionManager.callMethod('nft_mint_prepaid', videoMetadata);

    if (mintResult === false) {
        throw new BatchPublishError(
            'NFT minting failed on-chain. The upload session has been restored – please try again.',
            'mint',
            true,
        );
    }

    try {
        return await sessionManager.callMethod('create_event_prepaid', {
            encrypted_cid: eventMetadata.encrypted_cid,
            title: eventMetadata.title,
            description: eventMetadata.description,
            price: eventMetadata.price,
            price_usd: eventMetadata.price_usd ?? null,
            access_mode: eventMetadata.access_mode ?? null,
            content_type: eventMetadata.content_type ?? null,
        });
    } catch (error) {
        throw new BatchPublishError(
            `NFT minted but event creation failed. Session key is still valid – retry publishing. Original error: ${error instanceof Error ? error.message : String(error)}`,
            'event',
            true,
        );
    }
}
