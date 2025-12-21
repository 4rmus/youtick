import { useState, useEffect } from 'react';
import { connect, keyStores, utils } from 'near-api-js';
import { TokenWithVideo } from './useOwnedTokens';

const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';

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
                // Determine the full URL for the proxy
                const nodeUrl = typeof window !== 'undefined'
                    ? window.location.origin + rpcUrl
                    : 'http://localhost:3000' + rpcUrl;

                const near = await connect({
                    networkId: 'testnet',
                    nodeUrl,
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const account = await near.account(NFT_CONTRACT_ID);

                // 1. Fetch list of NFTs
                console.log("Fetching nft_tokens from index 0...");
                setDebugInfo((prev) => ({ ...prev, step: 'fetching_tokens' }));

                const events: unknown[] = await account.viewFunction({
                    contractId: NFT_CONTRACT_ID,
                    methodName: 'get_events',
                    args: { limit: 200 } // Increased to show more events
                });

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
                    // Handle "RealCID:::Title" or "RealCID:::ThumbnailCID:::Title" format
                    let displayTitle = event.title;
                    let displayMedia = "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png"; // Default placeholder

                    if (displayTitle && displayTitle.includes(':::')) {
                        const parts = displayTitle.split(':::');
                        if (parts.length >= 3) {
                            // Format: RealCID:::ThumbnailCID:::Title
                            const thumbnailCid = parts[1];
                            displayTitle = parts.slice(2).join(':::'); // Join rest in case title has :::
                            displayMedia = `https://gateway.lighthouse.storage/ipfs/${thumbnailCid}`;
                        } else if (parts.length === 2) {
                            // Format: RealCID:::Title (Legacy)
                            displayTitle = parts[1];
                        }
                    }

                    // Use actual description from contract, with price as fallback info
                    const displayDescription = event.description || `NFT ticket - ${utils.format.formatNearAmount(event.price)} NEAR`;

                    return {
                        token_id: `event-${index}`,
                        owner_id: event.creator_id,
                        metadata: {
                            title: displayTitle,
                            description: displayDescription,
                            media: displayMedia,
                            copies: 1
                        },
                        video_metadata: {
                            encrypted_cid: cid,
                            livepeer_playback_id: "TICKET",
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
