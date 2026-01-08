import { useState, useEffect } from 'react';
import { connect, keyStores } from 'near-api-js';

const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet';

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
                const near = await connect({
                    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
                    nodeUrl: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
                        ? 'https://rpc.mainnet.near.org'
                        : 'https://test.rpc.fastnear.com',
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const account = await near.account(NFT_CONTRACT_ID);
                const event: EventData | null = await account.viewFunction({
                    contractId: NFT_CONTRACT_ID,
                    methodName: 'get_event',
                    args: { encrypted_cid }
                });

                if (event) {
                    if (event.description) {
                        setDescription(event.description);
                    }
                    if (event.creator_id) {
                        setCreatorId(event.creator_id);
                    }

                    // Extract thumbnail from title format: "RealCID:::ThumbnailCID:::Title"
                    if (event.title && event.title.includes(':::')) {
                        const parts = event.title.split(':::');
                        if (parts.length >= 3) {
                            const thumbnailCid = parts[1];
                            setThumbnailUrl(`https://gateway.lighthouse.storage/ipfs/${thumbnailCid}`);
                        }
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

