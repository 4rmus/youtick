import { useState, useEffect } from 'react';
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

export function useEventDescription(encrypted_cid: string | null) {
    const [description, setDescription] = useState<string | null>(null);
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [creatorId, setCreatorId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!encrypted_cid || encrypted_cid === 'ACCESS_PASS') {
            setDescription(null);
            setThumbnailUrl(null);
            return;
        }

        const fetchDescription = async () => {
            setLoading(true);
            try {
                // v7: Use JsonRpcProvider directly for view calls
                const provider = getProvider();

                const event = await viewContract<EventData | null>(
                    provider,
                    NFT_CONTRACT_ID,
                    'get_event',
                    { encrypted_cid }
                );

                if (event) {
                    if (event.description) {
                        setDescription(event.description);
                    }
                    if (event.creator_id) {
                        setCreatorId(event.creator_id);
                    }

                    // Use centralized metadata parser for thumbnail extraction
                    const parsed = parseTitleMetadata(event.title);

                    if (parsed.thumbnailCid) {
                        setThumbnailUrl(parsed.thumbnailUrl);
                    }
                }
            } catch (error) {
                console.error('Error fetching event description:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDescription();
    }, [encrypted_cid]);

    return { description, thumbnailUrl, creatorId, loading };
}

