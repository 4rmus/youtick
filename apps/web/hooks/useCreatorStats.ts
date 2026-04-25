import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import type { CreatorProfile, CreatorStats, PurchaseLog } from '@/lib/types';
import { NEAR_CONFIG } from '@/lib/constants';

const CONTRACT_ID = NEAR_CONFIG.contractId;

export interface CreatorSales {
    logs: [number, PurchaseLog][];
}

/** Gracefully handle contract methods that may not exist on older deployments */
function isMethodNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return msg.includes('contract method is not found') || msg.includes('method is not found');
}

export function useCreatorStats(accountId: string | undefined) {
    return useQuery({
        queryKey: ['creatorStats', accountId],
        queryFn: async () => {
            if (!accountId) return null;
            try {
                const provider = getProvider();
                const stats = await viewContract<CreatorStats>(
                    provider,
                    CONTRACT_ID,
                    'get_creator_stats',
                    { creator_id: accountId },
                );
                return stats;
            } catch (err) {
                if (isMethodNotFoundError(err)) return null;
                throw err;
            }
        },
        enabled: !!accountId,
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
    });
}

export function useCreatorProfile(accountId: string | undefined) {
    return useQuery({
        queryKey: ['creatorProfile', accountId],
        queryFn: async () => {
            if (!accountId) return null;
            try {
                const provider = getProvider();
                const profile = await viewContract<CreatorProfile | null>(
                    provider,
                    CONTRACT_ID,
                    'get_creator_profile',
                    { creator_id: accountId },
                );
                return profile;
            } catch (err) {
                if (isMethodNotFoundError(err)) return null;
                throw err;
            }
        },
        enabled: !!accountId,
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
    });
}

export function useCreatorPurchaseLogs(accountId: string | undefined) {
    return useQuery({
        queryKey: ['creatorPurchaseLogs', accountId],
        queryFn: async () => {
            if (!accountId) return [] as [number, PurchaseLog][];
            try {
                const provider = getProvider();
                const logs = await viewContract<[number, PurchaseLog][]>(
                    provider,
                    CONTRACT_ID,
                    'get_purchase_logs_by_creator',
                    { creator_id: accountId, limit: 100 },
                );
                return logs;
            } catch (err) {
                if (isMethodNotFoundError(err)) return [] as [number, PurchaseLog][];
                throw err;
            }
        },
        enabled: !!accountId,
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
    });
}
