import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import { NEAR_CONFIG } from '@/lib/constants';

const CONTRACT_ID = NEAR_CONFIG.contractId;

export function useHasTicket(accountId: string | undefined, encryptedCid: string | undefined) {
    return useQuery({
        queryKey: ['hasTicket', accountId, encryptedCid],
        queryFn: async () => {
            if (!accountId || !encryptedCid) return false;
            const provider = getProvider();
            const has = await viewContract<boolean>(
                provider,
                CONTRACT_ID,
                'has_ticket',
                { account_id: accountId, encrypted_cid: encryptedCid },
            );
            return has;
        },
        enabled: !!accountId && !!encryptedCid,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
    });
}
