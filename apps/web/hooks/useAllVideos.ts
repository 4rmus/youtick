import { useState, useEffect } from 'react';
import { yoctoToNear } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { TokenWithVideo } from './useOwnedTokens';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;

interface DebugInfo {
    contractId?: string;
    rpcUrl?: string;
    step?: string;
    rawEventCount?: number;
    finalCount?: number;
    error?: string;
}

export function useAllVideos() {
    const [tokens, setTokens] = useState<TokenWithVideo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [debugInfo, setDebugInfo] = useState<DebugInfo>({});

    useEffect(() => {
        const fetchVideos = async () => {
            setLoading(true);
            setError(null);
            // Use local proxy to avoid CORS issues on localhost
            const rpcUrl = '/api/near-rpc';

            setDebugInfo({
                contractId: NFT_CONTRACT_ID,
                rpcUrl,
                step: 'init'
            });

            try {
                // v7: Use JsonRpcProvider directly for view calls
                const provider = getProvider();

                // 1. Fetch list of NFTs
                console.log("Fetching nft_tokens from index 0...");
                setDebugInfo((prev) => ({ ...prev, step: 'fetching_tokens' }));

                const events = await viewContract<unknown[]>(
                    provider,
                    NFT_CONTRACT_ID,
                    'get_events',
                    { limit: 200 } // Increased to show more events
                );

                console.log("Fetched events:", events);
                setDebugInfo((prev) => ({ ...prev, rawEventCount: events?.length, step: 'transforming_events' }));

                if (!events || events.length === 0) {
                    setTokens([]);
                    return;
                }

                // Transform Events into the structure expected by the UI (TokenWithVideo)
                // effectively treating each Event as a "Virtual Token" for display purposes
                const eventTokens: TokenWithVideo[] = events.map((item, index) => {
                    const [cid, event] = item as [string, { title: string; description: string; creator_id: string; price: string }];

                    // Use centralized metadata parser
                    const parsed = parseTitleMetadata(event.title);

                    // Use actual description from contract, with price as fallback info
                    // v7: yoctoToNear expects bigint, convert string from contract
                    const displayDescription = event.description || `NFT ticket - ${yoctoToNear(BigInt(event.price))} NEAR`;

                    return {
                        token_id: `event-${index}`,
                        owner_id: event.creator_id,
                        metadata: {
                            title: parsed.title,
                            description: displayDescription,
                            media: parsed.thumbnailUrl,
                            copies: 1
                        },
                        video_metadata: {
                            encrypted_cid: cid,
                            duration_seconds: 0,
                            content_type: "Exclusive",
                            price: event.price // Store price separately
                        }
                    };
                });

                setTokens(eventTokens.reverse());
                setDebugInfo((prev) => ({ ...prev, finalCount: eventTokens.length, step: 'complete' }));

            } catch (err) {
                const error = err as Error;
                console.error("Error fetching all videos:", error);
                setError(error.message || "Failed to fetch videos");
                setDebugInfo((prev) => ({ ...prev, error: error.message }));
            } finally {
                setLoading(false);
            }
        };

        fetchVideos();
    }, []);

    return { tokens, loading, error, debugInfo };
}
