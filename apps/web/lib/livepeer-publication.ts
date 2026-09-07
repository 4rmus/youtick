import { actions } from 'near-api-js';
import { APP_CONFIG, FEATURE_FLAGS, GAS_CONSTANTS, NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';
import { signAndSendWithSignlessProvision } from '@/lib/signless-access-key';
import type { WalletInstance } from '@/lib/types';
import { measureVideoOperation, observeVideoState } from '@/lib/video-measurements';

const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PLAYBACK_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;

export type LivepeerPublication = {
    publication_id: string;
    creator_id: string;
    title: string;
    price_usdc: string;
    generation: number;
    playback_id: string;
    availability: 'ACTIVE' | 'SALES_SUSPENDED' | 'TAKEDOWN';
    published_at_ms: number;
};

export type LivepeerMediaJob = {
    job_id: string;
    creator_id: string;
    status: 'Authorized' | 'Published';
    upload_public_key: string;
    generation?: number;
    created_at_ms?: number;
    upload_key_expires_at_ms?: string;
    expected_source_bytes?: string;
    title?: string;
    price_usdc?: string;
    profile_id?: string;
    profile_config_sha256?: string;
    fee_asset?: string;
    fee_quote_hash?: string;
};

export async function readLivepeerMediaJob(jobId: string): Promise<LivepeerMediaJob | null> {
    requireJobId(jobId);
    const value = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_media_job',
        { job_id: jobId },
    );
    if (value === null) return null;
    if (!value || typeof value !== 'object') throw new Error('invalid_livepeer_media_job');
    const job = value as Record<string, unknown>;
    if (job.job_id !== jobId
        || typeof job.creator_id !== 'string'
        || !job.creator_id
        || !['Authorized', 'Published'].includes(String(job.status))
        || typeof job.upload_public_key !== 'string'
        || !job.upload_public_key.startsWith('ed25519:')) {
        throw new Error('invalid_livepeer_media_job');
    }
    if (FEATURE_FLAGS.publicTestnetVideoV1 && (job.generation !== 1
        || !Number.isSafeInteger(job.created_at_ms) || Number(job.created_at_ms) <= 0
        || typeof job.expected_source_bytes !== 'string' || !/^[1-9][0-9]*$/.test(job.expected_source_bytes)
        || BigInt(job.expected_source_bytes) > 5_000_000_000n
        || typeof job.upload_key_expires_at_ms !== 'string' || !/^[1-9][0-9]{12,15}$/.test(job.upload_key_expires_at_ms)
        || job.fee_asset !== 'USDC' || typeof job.fee_quote_hash !== 'string' || !/^[0-9a-f]{64}$/.test(job.fee_quote_hash)
        || typeof job.title !== 'string' || new TextEncoder().encode(job.title).length > 200
        || typeof job.price_usdc !== 'string' || !/^[1-9][0-9]{0,38}$/.test(job.price_usdc)
        || job.profile_id !== 'paid-media-livepeer-v1' || typeof job.profile_config_sha256 !== 'string'
        || !/^[0-9a-f]{64}$/.test(job.profile_config_sha256))) {
        throw new Error('invalid_livepeer_media_job');
    }
    return {
        job_id: jobId,
        creator_id: job.creator_id,
        status: job.status as LivepeerMediaJob['status'],
        upload_public_key: job.upload_public_key,
        ...(FEATURE_FLAGS.publicTestnetVideoV1 ? {
            generation: 1, created_at_ms: Number(job.created_at_ms),
            upload_key_expires_at_ms: String(job.upload_key_expires_at_ms),
            expected_source_bytes: String(job.expected_source_bytes), title: String(job.title),
            price_usdc: String(job.price_usdc), profile_id: String(job.profile_id),
            profile_config_sha256: String(job.profile_config_sha256), fee_asset: 'USDC', fee_quote_hash: String(job.fee_quote_hash),
        } : {}),
    };
}

export async function waitForAuthorizedLivepeerJob(
    jobId: string,
    accountId: string,
    uploadPublicKey: string,
): Promise<void> {
    return measureVideoOperation('payment_finality', async () => {
        for (const delay of [0, 1_000, 2_000, 4_000, 8_000, 16_000]) {
            if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
            try {
                const job = await readLivepeerMediaJob(jobId);
                if (job
                    && job.creator_id === accountId
                    && job.upload_public_key === uploadPublicKey) return;
            } catch {
                // Final state can lag briefly after the wallet returns.
            }
        }
        throw new Error('livepeer_job_pending');
    });
}

export async function readLivepeerUploadProgress(jobId: string, creatorId?: string): Promise<{
    job: LivepeerMediaJob;
    publication: LivepeerPublication | null;
    expired: boolean;
    deadlineAtMs?: number;
}> {
    const job = await readLivepeerMediaJob(jobId);
    if (!job) throw new Error('livepeer_job_missing');
    if (creatorId !== undefined && job.creator_id !== creatorId) {
        throw new Error('livepeer_job_creator_mismatch');
    }
    const publication = await readLivepeerPublication(jobId);
    if (FEATURE_FLAGS.publicTestnetVideoV1) {
        const deadlineAtMs = Number(job.created_at_ms) + 86_400_000;
        if (!Number.isSafeInteger(deadlineAtMs)) throw new Error('invalid_livepeer_deadline');
        return { job, publication, deadlineAtMs, expired: !publication && Date.now() >= deadlineAtMs };
    }
    if (publication || !FEATURE_FLAGS.publicTestnetBeta) {
        return { job, publication, expired: false };
    }
    const value = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_public_testnet_beta_job',
        { job_id: jobId },
    );
    const marker = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    if (!marker
        || marker.creator_id !== job.creator_id
        || marker.generation !== 1
        || typeof marker.deadline_at_ms !== 'string'
        || !/^[1-9][0-9]*$/.test(marker.deadline_at_ms)
        || !Number.isSafeInteger(Number(marker.deadline_at_ms))) {
        throw new Error('invalid_livepeer_beta_deadline');
    }
    return { job, publication, expired: Date.now() >= Number(marker.deadline_at_ms) };
}

export async function readLivepeerPublications(
    fromIndex: number,
    limit: number,
): Promise<LivepeerPublication[]> {
    if (!Number.isSafeInteger(fromIndex) || fromIndex < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error('invalid_livepeer_publication_page');
    }
    const values = await viewContract<unknown[]>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_publications',
        { from_index: String(fromIndex), limit },
    );
    if (!Array.isArray(values)) throw new Error('invalid_livepeer_publication_page');
    return values.map((value) => {
        const id = value && typeof value === 'object'
            ? (value as Record<string, unknown>).publication_id
            : null;
        if (typeof id !== 'string') throw new Error('invalid_livepeer_publication');
        return parseLivepeerPublication(value, id);
    });
}

export async function readLivepeerPublicationsCount(): Promise<number> {
    const value = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_publications_count',
        {},
    );
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('invalid_livepeer_publication_count');
    return count;
}

export async function readCreatorBalance(accountId: string): Promise<string> {
    const value = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_creator_balance',
        { creator_id: accountId },
    );
    if (typeof value !== 'string' || !/^[0-9]{1,20}$/.test(value)) {
        throw new Error('invalid_creator_balance');
    }
    return value;
}

export async function withdrawCreatorBalance(wallet: WalletInstance): Promise<unknown> {
    return wallet.signAndSendTransaction({
        receiverId: NEAR_CONFIG.marketContractId,
        actions: [actions.functionCall(
            'withdraw_creator_balance',
            {},
            GAS_CONSTANTS.mediumGas,
            0n,
        )],
    });
}

export async function readLivepeerPublication(jobId: string): Promise<LivepeerPublication | null> {
    requireJobId(jobId);
    const value = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_publication',
        { publication_id: jobId },
    );
    if (value === null) return null;
    const publication = parseLivepeerPublication(value, jobId);
    observeVideoState('PUBLICATION_OBSERVED', publication.published_at_ms);
    return publication;
}

export async function hasLivepeerEntitlement(accountId: string, jobId: string): Promise<boolean> {
    requireJobId(jobId);
    const value = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'has_entitlement',
        { account_id: accountId, publication_id: jobId },
    );
    return value === true;
}

export async function buyLivepeerTicket(
    wallet: WalletInstance,
    accountId: string,
    publication: LivepeerPublication,
): Promise<unknown> {
    if (publication.availability !== 'ACTIVE') throw new Error('livepeer_sales_closed');
    const governance = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_governance_state',
        {},
    );
    const purchasesPaused = governance && typeof governance === 'object'
        ? (governance as { new_purchases_paused?: unknown }).new_purchases_paused
        : undefined;
    if (typeof purchasesPaused !== 'boolean') {
        throw new Error('invalid_livepeer_governance_state');
    }
    if (purchasesPaused) {
        throw new Error('livepeer_sales_closed');
    }
    const transaction = {
        receiverId: NEAR_CONFIG.usdcContractId,
        actions: [actions.functionCall(
            'ft_transfer_call',
            {
                receiver_id: NEAR_CONFIG.marketContractId,
                amount: publication.price_usdc,
                memo: 'YouTick Livepeer ticket purchase',
                msg: JSON.stringify({
                    action: 'buy_ticket',
                    publication_id: publication.publication_id,
                }),
            },
            GAS_CONSTANTS.mediumGas,
            1n,
        )],
    };
    if (FEATURE_FLAGS.enablePlaybackAuthorizerV2) {
        return wallet.signAndSendTransaction(transaction);
    }
    return signAndSendWithSignlessProvision(wallet, accountId, [transaction]);
}

export function parseLivepeerPublication(value: unknown, jobId: string): LivepeerPublication {
    requireJobId(jobId);
    if (!value || typeof value !== 'object') throw new Error('invalid_livepeer_publication');
    const publication = value as Record<string, unknown>;
    if (publication.publication_id !== jobId
        || typeof publication.creator_id !== 'string'
        || typeof publication.title !== 'string'
        || !publication.title.trim()
        || typeof publication.price_usdc !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(publication.price_usdc)
        || BigInt(publication.price_usdc) < 2_000_000n
        || !Number.isSafeInteger(publication.generation)
        || Number(publication.generation) < 1
        || typeof publication.playback_id !== 'string'
        || !PLAYBACK_ID_PATTERN.test(publication.playback_id)
        || !['ACTIVE', 'SALES_SUSPENDED', 'TAKEDOWN'].includes(String(publication.availability))
        || !Number.isSafeInteger(publication.published_at_ms)
        || Number(publication.published_at_ms) < 1) {
        throw new Error('invalid_livepeer_publication');
    }
    return publication as LivepeerPublication;
}

export function formatUsdc(value: string): string {
    const amount = BigInt(value);
    const whole = amount / 1_000_000n;
    const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function livepeerPublicationCoverUrl(
    publication: Pick<LivepeerPublication, 'publication_id' | 'generation'>,
): string | null {
    try {
        const url = new URL(
            `/v1/publication-covers/${encodeURIComponent(publication.publication_id)}/${publication.generation}`,
            APP_CONFIG.livepeerBridgeUrl,
        );
        if (url.protocol !== 'https:' || url.username || url.password) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function requireJobId(jobId: string): void {
    if (!JOB_ID_PATTERN.test(jobId)) throw new Error('invalid_livepeer_job');
}
