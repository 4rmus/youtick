import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import type { NFTEvent } from '@/lib/types';
import { NEAR_CONFIG } from '@/lib/constants';

const CONTRACT_ID = NEAR_CONFIG.contractId;

export function useEvent(encryptedCid: string | undefined) {
    return useQuery({
        queryKey: ['event', encryptedCid],
        queryFn: async () => {
            if (!encryptedCid) return null;
            const provider = getProvider();
            const event = await viewContract<NFTEvent | null>(
                provider,
                CONTRACT_ID,
                'get_event',
                { encrypted_cid: encryptedCid },
            );
            return event;
        },
        enabled: !!encryptedCid,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
    });
}
