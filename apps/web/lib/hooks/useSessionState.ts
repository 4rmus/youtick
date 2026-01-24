'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SessionManager, getCurrentRpcUrl } from '../session-manager';
import { getProvider, viewContract } from '../near';

const CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet';

// Types
export interface PKPData {
    publicKey: string;
    ethAddress: string;
    tokenId: string;
}

// Helper: Get PKP from localStorage
function getPKPFromStorage(accountId: string): PKPData | null {
    if (typeof window === 'undefined') return null;
    const cached = localStorage.getItem(`lit_pkp_${accountId}`);
    if (cached) {
        try {
            return JSON.parse(cached) as PKPData;
        } catch {
            return null;
        }
    }
    return null;
}

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
 * Hook: Get user's PKP data from localStorage
 * - PKP doesn't change, so staleTime is Infinity
 */
export function usePKPData(accountId: string | null) {
    return useQuery({
        queryKey: ['pkp', accountId],
        queryFn: () => getPKPFromStorage(accountId!),
        enabled: !!accountId,
        staleTime: Infinity, // PKP never goes stale
        gcTime: Infinity, // Keep forever
    });
}

/**
 * Hook: Check NFT ownership for a specific CID
 * - Caches for 5 minutes (repeat plays use cache)
 */
export function useNFTOwnership(accountId: string | null, cid: string | null) {
    return useQuery({
        queryKey: ['nftOwnership', accountId, cid],
        queryFn: async () => {
            if (!accountId || !cid) return false;
            const provider = getProvider();

            // Get all tokens for user
            const tokens = await viewContract<[string, { encrypted_cid: string }][]>(
                provider,
                CONTRACT_ID,
                'get_tokens_with_video',
                { account_id: accountId }
            );

            // Check if user owns token for this CID or has ACCESS_PASS
            return tokens.some(([_, metadata]) =>
                metadata.encrypted_cid === cid || metadata.encrypted_cid === 'ACCESS_PASS'
            );
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
    const pkpQuery = usePKPData(accountId);

    return {
        // Data
        hasSessionKey: sessionKeyQuery.data ?? null,
        balance: balanceQuery.data ?? null,
        pkpData: pkpQuery.data ?? null,

        // Loading states
        isLoading: sessionKeyQuery.isLoading || balanceQuery.isLoading,
        isSessionKeyLoading: sessionKeyQuery.isLoading,
        isBalanceLoading: balanceQuery.isLoading,
        isPKPLoading: pkpQuery.isLoading,

        // Ready state
        isReady: !sessionKeyQuery.isLoading && !balanceQuery.isLoading,

        // Error states
        sessionKeyError: sessionKeyQuery.error,
        balanceError: balanceQuery.error,

        // Refetch functions
        refetchSessionKey: sessionKeyQuery.refetch,
        refetchBalance: balanceQuery.refetch,
        refetchPKP: pkpQuery.refetch,
    };
}

/**
 * Hook: PKP Minting mutation
 * - Tracks loading/error state
 * - Updates cache on success
 */
export function usePKPMint() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (accountId: string) => {
            const { lit } = await import('../lit');
            const { PKPManager } = await import('../pkp');

            await lit.connect();
            const pkpManager = new PKPManager(lit.getLitNodeClient());
            return pkpManager.mintPKPSmart(accountId);
        },
        onSuccess: (data, accountId) => {
            // Update PKP cache
            const pkpData: PKPData = {
                publicKey: data.publicKey,
                ethAddress: data.ethAddress,
                tokenId: data.tokenId,
            };
            queryClient.setQueryData(['pkp', accountId], pkpData);

            // Also save to localStorage
            localStorage.setItem(`lit_pkp_${accountId}`, JSON.stringify(pkpData));
        },
    });
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
            queryClient.invalidateQueries({ queryKey: ['pkp', accountId] });
        } else {
            queryClient.invalidateQueries({ queryKey: ['sessionKey'] });
            queryClient.invalidateQueries({ queryKey: ['balance'] });
            queryClient.invalidateQueries({ queryKey: ['pkp'] });
        }
    };
}
