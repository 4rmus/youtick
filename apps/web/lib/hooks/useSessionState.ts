'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SessionManager } from '../session-manager';
import { getProvider, viewContract } from '../near';
import { NEAR_CONFIG } from '../constants';

const CONTRACT_ID = NEAR_CONFIG.contractId;

// Helper: Get account balance from contract
async function getAccountBalance(accountId: string): Promise<string> {
    const provider = getProvider();
    try {
        const balance = await viewContract<string>(
            provider,
            CONTRACT_ID,
            'get_user_balance',
            { account_id: accountId }
        );
        // Convert from yoctoNEAR to NEAR
        const { yoctoToNear } = await import('near-api-js');
        return yoctoToNear(BigInt(balance));
    } catch (e) {
        console.warn("Error getting account balance:", e);
        return '0';
    }
}

/**
 * Hook: Check if user has a valid session key
 * - Caches for 60 seconds (staleTime)
 * - Keeps data for 5 minutes (gcTime)
 */
export function useSessionKey(accountId: string | null) {
    return useQuery({
        queryKey: ['sessionKey', accountId],
        queryFn: async () => {
            if (!accountId) return false;
            const sessionManager = new SessionManager(accountId);
            // Import wallet's function call key if available (created during MyNearWallet sign-in)
            await sessionManager.importWalletFunctionCallKey();
            return sessionManager.hasSessionKey();
        },
        enabled: !!accountId,
        staleTime: 60 * 1000, // 1 minute fresh
        gcTime: 5 * 60 * 1000, // 5 minute cache
    });
}

/**
 * Hook: Get user's prepaid balance in the contract
 * - Caches for 30 seconds
 */
export function useAccountBalance(accountId: string | null) {
    return useQuery({
        queryKey: ['balance', accountId],
        queryFn: () => getAccountBalance(accountId!),
        enabled: !!accountId,
        staleTime: 30 * 1000, // 30 seconds fresh
        gcTime: 5 * 60 * 1000, // 5 minute cache
    });
}

/**
 * Hook: Check NFT ownership for a specific CID
 * - Caches for 5 minutes (repeat plays use cache)
 * - Also grants access if user is the creator (uploader) of the video
 */
export function useNFTOwnership(accountId: string | null, cid: string | null) {
    return useQuery({
        queryKey: ['nftOwnership', accountId, cid],
        queryFn: async () => {
            if (!accountId || !cid) return false;
            const provider = getProvider();

            // Check 1: On-chain access check (includes ACCESS_PASS support)
            const hasTicket = await viewContract<boolean>(
                provider,
                CONTRACT_ID,
                'has_ticket',
                { account_id: accountId, encrypted_cid: cid }
            );
            if (hasTicket) return true;

            // Check 2: Creator bypass — video uploaders can watch their own content
            try {
                const event = await viewContract<{ creator_id: string } | null>(
                    provider,
                    CONTRACT_ID,
                    'get_event',
                    { encrypted_cid: cid }
                );
                if (event && event.creator_id === accountId) {
                    return true;
                }
            } catch {
                // Event not found — not a creator
            }

            return false;
        },
        enabled: !!accountId && !!cid,
        staleTime: 5 * 60 * 1000, // 5 minutes fresh
        gcTime: 10 * 60 * 1000, // 10 minute cache
    });
}

/**
 * Hook: Check if user is creator of a specific event
 */
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
        staleTime: Infinity, // Creator doesn't change
        gcTime: Infinity,
    });
}

/**
 * Combined hook: All session state in one place
 * - Deduplication: React Query ensures only 1 request per queryKey
 * - Parallel fetching: All queries run in parallel
 */
export function useSessionState(accountId: string | null) {
    const sessionKeyQuery = useSessionKey(accountId);
    const balanceQuery = useAccountBalance(accountId);

    return {
        // Data
        hasSessionKey: sessionKeyQuery.data ?? null,
        balance: balanceQuery.data ?? null,

        // Loading states
        isLoading: sessionKeyQuery.isLoading || balanceQuery.isLoading,
        isSessionKeyLoading: sessionKeyQuery.isLoading,
        isBalanceLoading: balanceQuery.isLoading,

        // Ready state
        isReady: !sessionKeyQuery.isLoading && !balanceQuery.isLoading,

        // Error states
        sessionKeyError: sessionKeyQuery.error,
        balanceError: balanceQuery.error,

        // Refetch functions
        refetchSessionKey: sessionKeyQuery.refetch,
        refetchBalance: balanceQuery.refetch,
    };
}

/**
 * Hook: Invalidate session caches (on logout, network change, etc.)
 */
export function useInvalidateSession() {
    const queryClient = useQueryClient();

    return (accountId?: string) => {
        if (accountId) {
            queryClient.invalidateQueries({ queryKey: ['sessionKey', accountId] });
            queryClient.invalidateQueries({ queryKey: ['balance', accountId] });
        } else {
            queryClient.invalidateQueries({ queryKey: ['sessionKey'] });
            queryClient.invalidateQueries({ queryKey: ['balance'] });
        }
    };
}
