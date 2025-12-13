import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from "@/components/ui/button";
import { Loader2, Ticket, Check, AlertCircle } from "lucide-react";
import { transactions, utils, connect, keyStores } from 'near-api-js';

interface TicketPurchaseCardProps {
    cid: string;
    onPurchaseSuccess?: () => void;
}

interface EventDetails {
    price: string;
    title: string;
    media?: string;
    uploader?: string;
}

export function TicketPurchaseCard({ cid, onPurchaseSuccess }: TicketPurchaseCardProps) {
    const { selector, accountId } = useWallet();
    const [loading, setLoading] = useState(false);
    const [purchasing, setPurchasing] = useState(false);
    const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!cid) return;

        const fetchDetails = async () => {
            setLoading(true);
            try {
                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';
                const rpcUrl = "/api/near-rpc"; // Use proxy

                // Ensure we use the proxy for this call too
                const near = await connect({
                    networkId: 'testnet',
                    nodeUrl: typeof window !== 'undefined' ? window.location.origin + rpcUrl : 'https://rpc.testnet.near.org',
                    keyStore: new keyStores.InMemoryKeyStore(),
                });

                const account = await near.account(contractId);
                const event: any = await account.viewFunction({
                    contractId,
                    methodName: 'get_event',
                    args: { encrypted_cid: cid }
                });

                if (event) {
                    let title = event.title;
                    let media = "https://bafybeiejkf54bn7q3d3j6w3c3j3j3j3j3j3j3j3.ipfs.dweb.link/token.png";

                    // Parse Title Schema: RealCID:::ThumbnailCID:::Title
                    if (title && title.includes(':::')) {
                        const parts = title.split(':::');
                        if (parts.length >= 3) {
                            const thumbnailCid = parts[1];
                            title = parts.slice(2).join(':::');
                            media = `https://gateway.lighthouse.storage/ipfs/${thumbnailCid}`;
                        } else if (parts.length === 2) {
                            title = parts[1];
                        }
                    }

                    setEventDetails({
                        price: utils.format.formatNearAmount(event.price),
                        title: title || "Exclusive Content",
                        media,
                        uploader: event.creator_id
                    });
                }
            } catch (e) {
                console.error("Error fetching ticket details:", e);
                setError("Failed to load ticket info");
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [cid]);

    const handlePurchase = async () => {
        if (!selector || !accountId || !eventDetails) return;
        setPurchasing(true);
        try {
            const wallet = await selector.wallet();
            const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';

            const depositYocto = utils.format.parseNearAmount(eventDetails.price);

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

            // Create Lit session after successful purchase for seamless video playback
            try {
                const { lit } = await import('@/lib/lit');
                const { deriveEthAddress, signWithMPC } = await import('@/lib/chain-signatures');

                console.log('Creating Lit session for seamless video playback...');
                const mpcAddress = await deriveEthAddress(accountId, 'test', wallet);

                await lit.getSessionSigs(
                    wallet,
                    accountId,
                    mpcAddress,
                    signWithMPC,
                    undefined,
                    undefined,
                    'test'
                );
                console.log('Lit session created and cached successfully!');
            } catch (sessionError) {
                console.warn('Failed to create Lit session (video will still work with signature):', sessionError);
                // Don't fail the purchase if session creation fails
            }

            // Note: success handling depends on redirect or callback
            if (onPurchaseSuccess) onPurchaseSuccess();

        } catch (e) {
            console.error("Purchase failed:", e);
            setError("Transaction failed");
        } finally {
            setPurchasing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8 bg-black/40 rounded-xl border border-white/10 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    if (!eventDetails) return null;

    return (
        <div className="relative group overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl max-w-sm mx-auto transition-all hover:border-zinc-600">
            {/* Image Container */}
            <div className="aspect-video relative bg-zinc-950">
                <img
                    src={eventDetails.media}
                    alt="Ticket Preview"
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500 blur-sm"
                />

                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-90" />

                {/* Lock Icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/50 backdrop-blur-md p-4 rounded-full border border-white/10 shadow-xl">
                        <Ticket className="w-6 h-6 text-white" />
                    </div>
                </div>

                {/* Badge */}
                <div className="absolute top-3 right-3 bg-red-500/90 backdrop-blur-md px-3 py-1 rounded-full border border-red-400/20 shadow-lg glow-red">
                    <span className="text-[10px] font-bold text-white tracking-wider uppercase">Access Required</span>
                </div>
            </div>

            {/* Content Details */}
            <div className="p-5 relative">
                <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-white text-lg leading-tight line-clamp-1">
                        {eventDetails.title}
                    </h4>
                </div>

                <p className="text-xs text-zinc-400 line-clamp-2 mb-4">
                    To watch this exclusive content, you need to purchase a Ticket NFT. This grants you permanent access.
                </p>

                {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 p-2 rounded mb-3 border border-red-900/50">
                        <AlertCircle className="w-3 h-3" />
                        {error}
                    </div>
                )}

                {/* Footer Info & Action */}
                <div className="flex items-end justify-between pt-4 border-t border-white/5 gap-4">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 mb-1 text-zinc-500">
                            <span className="text-[10px] uppercase tracking-widest">Payment To</span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-[8px] font-bold text-white">
                                {eventDetails.uploader ? eventDetails.uploader.substring(0, 1).toUpperCase() : "?"}
                            </div>
                            <span className="text-xs text-zinc-400 font-medium truncate max-w-[100px]" title={eventDetails.uploader}>
                                {eventDetails.uploader || "Unknown"}
                            </span>
                        </div>

                        <span className="text-xl font-bold text-white leading-none">{eventDetails.price} <span className="text-xs font-normal text-zinc-400">NEAR</span></span>
                    </div>

                    <Button
                        onClick={handlePurchase}
                        disabled={purchasing || !accountId}
                        className="bg-white text-black hover:bg-zinc-200 font-bold shadow-lg shadow-white/5"
                    >
                        {purchasing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Mining...
                            </>
                        ) : (
                            <>
                                Buy Ticket
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
