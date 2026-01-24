import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { getProvider, viewContract } from '@/lib/near';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';

/**
 * Check if a media URL looks valid
 */
function isValidMediaUrl(mediaUrl: string | undefined): boolean {
    if (!mediaUrl) return false;
    // Valid if it's an http URL or data URI
    return mediaUrl.startsWith('http') || mediaUrl.startsWith('data:');
}

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;

interface VideoMetadata {
    encrypted_cid: string;
    duration_seconds: number;
    event_date?: number;
    content_type: string;
    price?: string; // Event price in yoctoNEAR
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
                // v7: Use JsonRpcProvider directly for view calls
                const provider = getProvider();

                // Call the contract method that returns tokens + video metadata
                console.log("useOwnedTokens: Fetching from contract:", NFT_CONTRACT_ID, "for account:", accountId);
                const result = await viewContract<[any, any][]>(
                    provider,
                    NFT_CONTRACT_ID,
                    'get_tokens_with_video',
                    {
                        account_id: accountId,
                        limit: 50 // Fetch last 50 tokens
                    }
                );

                // The contract returns Vec<(Token, Option<VideoMetadata>)>
                // We need to map this to a flatter structure for the UI
                const mappedTokens: TokenWithVideo[] = result.map(([token, videoMeta]: [any, any]) => {
                    // Use centralized metadata parser
                    const parsed = parseTitleMetadata(
                        token.metadata?.title,
                        token.token_id
                    );

                    // Determine display media:
                    // - Use token.metadata.media if it exists and looks valid
                    // - Otherwise use the parsed thumbnail from title
                    const originalMediaValid = token.metadata?.media
                        && !token.metadata.media.includes('token.png')
                        && isValidMediaUrl(token.metadata.media);

                    const displayMedia = originalMediaValid
                        ? token.metadata.media
                        : parsed.thumbnailUrl;

                    console.log('[useOwnedTokens] Token metadata:', {
                        tokenId: token.token_id,
                        rawTitle: token.metadata?.title,
                        originalMedia: token.metadata?.media,
                        originalMediaValid,
                        parsedThumbnailCid: parsed.thumbnailCid,
                        parsedThumbnailUrl: parsed.thumbnailUrl,
                        displayMedia,
                        schemaVersion: parsed.schemaVersion
                    });

                    return {
                        ...token,
                        metadata: {
                            ...token.metadata,
                            title: parsed.title,
                            media: displayMedia
                        },
                        video_metadata: videoMeta
                    };
                });

                setTokens(mappedTokens.reverse());

            } catch (err: any) {
                console.error("Error fetching tokens:", err);
                // Handle contract state inconsistency (common after migration)
                if (err.message?.includes('inconsistent state')) {
                    console.warn("Contract state may have been reset. Returning empty token list.");
                    setTokens([]);
                    setError(null); // Don't show error to user - just show empty list
                } else {
                    setError(err.message || "Failed to fetch tokens");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchTokens();
    }, [accountId]);

    return { tokens, loading, error };
}
