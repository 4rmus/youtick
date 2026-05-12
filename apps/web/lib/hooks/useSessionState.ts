'use client';

import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '../near';
import { NEAR_CONFIG } from '../constants';

const CONTRACT_ID = NEAR_CONFIG.contractId;

export async function resolveNFTOwnership(accountId: string | null, cid: string | null): Promise<boolean> {
    if (!accountId || !cid) return false;
    const provider = getProvider();

    try {
        const hasTicket = await viewContract<boolean>(
            provider,
            CONTRACT_ID,
            'has_ticket',
            { account_id: accountId, encrypted_cid: cid }
        );
        if (hasTicket) return true;
    } catch (error) {
        console.debug('[useNFTOwnership] has_ticket check failed; falling back to creator check:', error);
    }

    try {
        const event = await viewContract<{ creator_id: string } | null>(
            provider,
            CONTRACT_ID,
            'get_event',
            { encrypted_cid: cid }
        );
        return event?.creator_id === accountId;
    } catch {
        return false;
    }
}

export function useNFTOwnership(accountId: string | null, cid: string | null) {
    return useQuery({
        queryKey: ['nftOwnership', accountId, cid],
        queryFn: () => resolveNFTOwnership(accountId, cid),
        enabled: !!accountId && !!cid,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });
}

export function useIsCreator(accountId: string | null, cid: string | null) {
    return useQuery({
        queryKey: ['isCreator', accountId, cid],
        queryFn: async () => {
            if (!accountId || !cid) return false;
            const provider = getProvider();

            try {
                const event = await viewContract<{ creator_id: string }>(
                    provider,
                    CONTRACT_ID,
                    'get_event',
                    { encrypted_cid: cid }
                );
                return event?.creator_id === accountId;
            } catch {
                return false;
            }
        },
        enabled: !!accountId && !!cid,
        staleTime: Infinity,
        gcTime: Infinity,
    });
}
