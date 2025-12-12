import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { connect, keyStores } from 'near-api-js';

const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'utick6.testnet';

interface VideoMetadata {
    encrypted_cid: string;
    livepeer_playback_id: string;
    duration_seconds: number;
    event_date?: number;
    content_type: string;
}

export interface TokenWithVideo {
    token_id: string;
    owner_id: string;
    metadata?: {
        title?: string;
        description?: string;
        media?: string;
        copies?: number;
    };
    approved_account_ids?: Record<string, number>;
    video_metadata?: VideoMetadata;
}

export function useOwnedTokens() {
    const { accountId } = useWallet();
    const [tokens, setTokens] = useState<TokenWithVideo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!accountId) {
            setTokens([]);
            return;
        }

        const fetchTokens = async () => {
            setLoading(true);
            setError(null);
            try {
                const near = await connect({
                    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
                    nodeUrl: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
                        ? 'https://rpc.mainnet.near.org'
                        : 'https://test.rpc.fastnear.com',
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const account = await near.account(NFT_CONTRACT_ID);

                // Call the contract method that returns tokens + video metadata
                const result = await account.viewFunction({
                    contractId: NFT_CONTRACT_ID,
                    methodName: 'get_tokens_with_video',
                    args: {
                        account_id: accountId,
                        limit: 50 // Fetch last 50 tokens
                    }
                });

                // The contract returns Vec<(Token, Option<VideoMetadata>)>
                // We need to map this to a flatter structure for the UI
                const mappedTokens: TokenWithVideo[] = result.map(([token, videoMeta]: [any, any]) => {
                    let displayTitle = token.metadata?.title || token.token_id;
                    let displayMedia = token.metadata?.media;

                    // Parse Schema: RealCID:::ThumbnailCID:::Title
                    if (displayTitle && displayTitle.includes(':::')) {
                        const parts = displayTitle.split(':::');
                        if (parts.length >= 3) {
                            const thumbnailCid = parts[1];
                            displayTitle = parts.slice(2).join(':::');
                            // If media is standard placeholder or missing, use the extracted thumbnail
                            if (!displayMedia || displayMedia.includes('token.png')) {
                                displayMedia = `https://gateway.lighthouse.storage/ipfs/${thumbnailCid}`;
                            }
                        } else if (parts.length === 2) {
                            displayTitle = parts[1];
                        }
                    }

                    return {
                        ...token,
                        metadata: {
                            ...token.metadata,
                            title: displayTitle,
                            media: displayMedia
                        },
                        video_metadata: videoMeta
                    };
                });

                setTokens(mappedTokens.reverse());

            } catch (err: any) {
                console.error("Error fetching tokens:", err);
                setError(err.message || "Failed to fetch tokens");
            } finally {
                setLoading(false);
            }
        };

        fetchTokens();
    }, [accountId]);

    return { tokens, loading, error };
}
