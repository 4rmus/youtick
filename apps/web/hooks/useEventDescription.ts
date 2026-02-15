import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;

interface EventData {
    title: string;
    description: string;
    price: string;
    creator_id: string;
    created_at: number;
}

interface EventDescription {
    description: string | null;
    thumbnailUrl: string | null;
    creatorId: string | null;
}

async function fetchEventDescription(encrypted_cid: string): Promise<EventDescription> {
    const provider = getProvider();

    const event = await viewContract<EventData | null>(
        provider,
        NFT_CONTRACT_ID,
        'get_event',
        { encrypted_cid }
    );

    if (!event) {
        return { description: null, thumbnailUrl: null, creatorId: null };
    }

    const parsed = parseTitleMetadata(event.title);

    return {
        description: event.description || null,
        thumbnailUrl: parsed.thumbnailCid ? (parsed.thumbnailUrl ?? null) : null,
        creatorId: event.creator_id || null,
    };
}

export function useEventDescription(encrypted_cid: string | null) {
    const query = useQuery({
        queryKey: ['eventDescription', encrypted_cid],
        queryFn: () => fetchEventDescription(encrypted_cid!),
        enabled: !!encrypted_cid && encrypted_cid !== 'ACCESS_PASS',
        staleTime: 5 * 60 * 1000,   // 5 minutes fresh (event data rarely changes)
        gcTime: 10 * 60 * 1000,     // 10 minute cache
    });

    return {
        description: query.data?.description ?? null,
        thumbnailUrl: query.data?.thumbnailUrl ?? null,
        creatorId: query.data?.creatorId ?? null,
        loading: query.isLoading,
    };
}
