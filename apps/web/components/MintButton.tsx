import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Ticket } from "lucide-react";
import { transactions, utils, connect, keyStores } from 'near-api-js';

interface MintButtonProps {
    cid?: string;
}

export function MintButton({ cid }: MintButtonProps) {
    const { selector, accountId } = useWallet();
    const [minting, setMinting] = useState(false);
    const [price, setPrice] = useState<string | null>(null);
    const [loadingPrice, setLoadingPrice] = useState(false);

    useEffect(() => {
        if (!cid) return;

        const fetchPrice = async () => {
            setLoadingPrice(true);
            try {
                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-1.utick.testnet';
                // Use the proxy by default or direct RPC if needed. Using proxy config.
                const near = await connect({
                    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
                    nodeUrl: typeof window !== 'undefined' ? window.location.origin + '/api/near-rpc' : 'https://test.rpc.fastnear.com',
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const account = await near.account(contractId);
                const event: any = await account.viewFunction({
                    contractId,
                    methodName: 'get_event',
                    args: { encrypted_cid: cid }
                });

                if (event && event.price) {
                    setPrice(utils.format.formatNearAmount(event.price));
                }
            } catch (e) {
                console.error("Error fetching ticket price:", e);
            } finally {
                setLoadingPrice(false);
            }
        };

        fetchPrice();
    }, [cid]);

    const handleMint = async () => {
        if (!selector || !accountId) return;
        setMinting(true);
        try {
            const wallet = await selector.wallet();
            const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-1.utick.testnet';

            // SALES FLOW: Buy Ticket
            if (cid && price) {
                const depositYocto = utils.format.parseNearAmount(price);
                const action = transactions.functionCall(
                    'buy_ticket',
                    Buffer.from(JSON.stringify({
                        receiver_id: accountId,
                        encrypted_cid: cid
                    })),
                    BigInt('30000000000000'), // 30 Tgas
                    BigInt(depositYocto || '0')
                );

                await wallet.signAndSendTransaction({
                    receiverId: contractId,
                    actions: [action as any],
                });
            }
            // LEGACY FLOW: Mint Generic Access Pass
            else {
                const args = {
                    receiver_id: accountId,
                    token_metadata: {
                        title: "youtick Access Pass",
                        description: "Global access pass for youtick exclusive content",
                        media: "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png",
                        copies: 1
                    },
                    video_metadata: {
                        encrypted_cid: "ACCESS_PASS",
                        livepeer_playback_id: "ACCESS_PASS",
                        duration_seconds: 0,
                        content_type: "Exclusive"
                    }
                };

                const action = transactions.functionCall(
                    'nft_mint',
                    Buffer.from(JSON.stringify(args)),
                    BigInt('300000000000000'), // 300 Tgas
                    BigInt('100000000000000000000000') // 0.1 NEAR
                );

                await wallet.signAndSendTransaction({
                    receiverId: contractId,
                    actions: [action as any],
                });
            }

        } catch (e) {
            console.error("Minting failed:", e);
        } finally {
            setMinting(false);
        }
    };

    if (!accountId) return null;

    if (loadingPrice) {
        return <Button disabled variant="outline" size="sm"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading price...</Button>;
    }

    return (
        <Button
            onClick={handleMint}
            disabled={minting}
            variant={price ? "default" : "secondary"}
            className="gap-2"
        >
            {minting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : price ? (
                <Ticket className="h-4 w-4" />
            ) : (
                <Coins className="h-4 w-4" />
            )}
            {minting ? "Processing..." : price ? `Buy Ticket (${price} NEAR)` : "Mint Global Access Pass"}
        </Button>
    );
}
