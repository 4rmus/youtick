import { actions } from 'near-api-js';
import { GAS_CONSTANTS, NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';
import { signAndSendWithSignlessProvision } from '@/lib/signless-access-key';
import type { WalletInstance } from '@/lib/types';

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
};

export async function readLivepeerPublication(jobId: string): Promise<LivepeerPublication | null> {
    requireJobId(jobId);
    const value = await viewContract<unknown>(
        getProvider(),
        NEAR_CONFIG.marketContractId,
        'get_publication',
        { publication_id: jobId },
    );
    if (value === null) return null;
    return parseLivepeerPublication(value, jobId);
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
        || !['ACTIVE', 'SALES_SUSPENDED', 'TAKEDOWN'].includes(String(publication.availability))) {
        throw new Error('invalid_livepeer_publication');
    }
    return publication as LivepeerPublication;
}

function requireJobId(jobId: string): void {
    if (!JOB_ID_PATTERN.test(jobId)) throw new Error('invalid_livepeer_job');
}
