import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';
import { resolvePreferredMediaUrl } from '@/lib/video-delivery';

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;

interface EventData {
    title: string;
    description: string;
    price: string;
    creator_id: string;
    created_at: number;
    access_mode?: 'paid' | 'free_collectible' | 'public_free';
}

interface EventDescription {
    title: string | null;
    description: string | null;
    thumbnailUrl: string | null;
    creatorId: string | null;
    accessMode: 'paid' | 'free_collectible' | 'public_free' | null;
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
        return { title: null, description: null, thumbnailUrl: null, creatorId: null, accessMode: null };
    }

    const parsed = parseTitleMetadata(event.title);
    const thumbnailUrl = parsed.thumbnailCid
        ? await resolvePreferredMediaUrl(parsed.thumbnailUrl ?? null, parsed.manifestCid)
        : null;

    return {
        title: parsed.title || null,
        description: event.description || null,
        thumbnailUrl,
        creatorId: event.creator_id || null,
        accessMode: event.access_mode ?? (event.price === '0' ? 'public_free' : 'paid'),
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
        title: query.data?.title ?? null,
        description: query.data?.description ?? null,
        thumbnailUrl: query.data?.thumbnailUrl ?? null,
        creatorId: query.data?.creatorId ?? null,
        accessMode: query.data?.accessMode ?? null,
        loading: query.isLoading,
    };
}
