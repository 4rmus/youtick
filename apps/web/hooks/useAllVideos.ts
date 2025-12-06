import { useState, useEffect } from 'react';
import { connect, keyStores, utils } from 'near-api-js';
import { TokenWithVideo } from './useOwnedTokens';

const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'utick-demo-v3.testnet';

export function useAllVideos() {
    const [tokens, setTokens] = useState<TokenWithVideo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [debugInfo, setDebugInfo] = useState<any>({});

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
                setDebugInfo((prev: any) => ({ ...prev, step: 'fetching_tokens' }));

                const events: any[] = await account.viewFunction({
                    contractId: NFT_CONTRACT_ID,
                    methodName: 'get_events',
                    args: { limit: 50 }
                });

                console.log("Fetched events:", events);
                setDebugInfo((prev: any) => ({ ...prev, rawEventCount: events?.length, step: 'transforming_events' }));

                if (!events || events.length === 0) {
                    setTokens([]);
                    return;
                }

                // Transform Events into the structure expected by the UI (TokenWithVideo)
                // effectively treating each Event as a "Virtual Token" for display purposes
                const eventTokens: TokenWithVideo[] = events.map(([cid, event], index) => {
                    // Handle "RealCID:::Title" format
                    let displayTitle = event.title;
                    if (displayTitle && displayTitle.includes(':::')) {
                        displayTitle = displayTitle.split(':::')[1];
                    }

                    return {
                        token_id: `event-${index}`,
                        owner_id: event.creator_id,
                        metadata: {
                            title: displayTitle,
                            description: `Price: ${utils.format.formatNearAmount(event.price)} NEAR`,
                            media: "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png",
                            copies: 1
                        },
                        video_metadata: {
                            encrypted_cid: cid,
                            livepeer_playback_id: "TICKET",
                            duration_seconds: 0,
                            content_type: "Exclusive"
                        }
                    };
                });

                setTokens(eventTokens);
                setDebugInfo((prev: any) => ({ ...prev, finalCount: eventTokens.length, step: 'complete' }));

            } catch (err: any) {
                console.error("Error fetching all videos:", err);
                setError(err.message || "Failed to fetch videos");
                setDebugInfo((prev: any) => ({ ...prev, error: err.message }));
            } finally {
                setLoading(false);
            }
        };

        fetchVideos();
    }, []);

    return { tokens, loading, error, debugInfo };
}
