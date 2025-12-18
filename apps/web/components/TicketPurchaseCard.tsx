import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from "@/components/ui/button";
import { Loader2, Ticket, Check, AlertCircle } from "lucide-react";
import { transactions, utils, connect, keyStores } from 'near-api-js';
import { SessionManager } from '@/lib/session-manager';

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
    const [loading, setLoading] = useState(false); // Global loading (initial fetch)
    const [actionLoading, setActionLoading] = useState(false); // Action button loading
    const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasSessionKey, setHasSessionKey] = useState<boolean | null>(null);

    // 1. Initial Load: Fetch Details & Check Session Key
    useEffect(() => {
        if (!cid) return;

        const init = async () => {
            setLoading(true);
            try {
                // Fetch Event Details
                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-0.utick.testnet';
                const rpcUrl = "/api/near-rpc";

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

                // Check Session Key (using static import now)
                if (accountId) {
                    const sessionManager = new SessionManager(accountId);
                    const hasKey = await sessionManager.hasSessionKey();
                    setHasSessionKey(hasKey);
                }

            } catch (e) {
                console.error("Error loading ticket info:", e);
                setError("Failed to load ticket info");
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [cid, accountId]);

    // Action 1: Setup Account (Add Session Key)
    const handleSetup = async () => {
        if (!selector || !accountId) return;
        setActionLoading(true);
        setError(null);
        try {
            const wallet = await selector.wallet();
            const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-0.utick.testnet';
            const sessionManager = new SessionManager(accountId);

            console.log("Requesting access key...");
            const keyPair = utils.KeyPair.fromRandom('ed25519');
            const publicKey = keyPair.getPublicKey().toString();

            // Just store locally for now, standard logic implies we trust the wallet tx to succeed
            await sessionManager.saveSessionKey(keyPair);

            await wallet.signAndSendTransaction({
                receiverId: accountId,
                actions: [
                    transactions.addKey(
                        utils.PublicKey.from(publicKey),
                        transactions.functionCallAccessKey(
                            contractId,
                            [],
                            BigInt(utils.format.parseNearAmount('0.25') || '0')
                        )
                    )
                ]
            });

            // If we get here, tx succeeded
            setHasSessionKey(true);
        } catch (e) {
            console.error("Setup failed:", e);
            setError("Setup failed. Please try again.");
        } finally {
            setActionLoading(false);
        }
    };

    // Action: Buy Ticket (Standard Purchase + Deposit + Optional Session Key Setup)
    const handlePurchase = async () => {
        if (!selector || !accountId || !eventDetails) return;
        setActionLoading(true);
        setError(null);
        try {
            const wallet = await selector.wallet();
            const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-0.utick.testnet';
            const sessionManager = new SessionManager(accountId);

            const actions = [];

            // 1. If no session key, add it to the batch
            if (hasSessionKey === false) {
                console.log("No session key found. Adding Initialization to batch...");
                const keyPair = utils.KeyPair.fromRandom('ed25519');
                const publicKey = keyPair.getPublicKey().toString();

                // Store locally (optimistic)
                await sessionManager.saveSessionKey(keyPair);

                actions.push(
                    transactions.addKey(
                        utils.PublicKey.from(publicKey),
                        transactions.functionCallAccessKey(
                            contractId,
                            [],
                            BigInt(utils.format.parseNearAmount('0.25') || '0')
                        )
                    )
                );
            }

            // 2. Add Purchase Action
            const MIN_STORAGE_COST = utils.format.parseNearAmount('0.01');
            const priceYocto = utils.format.parseNearAmount(eventDetails.price) || '0';
            let finalDeposit = BigInt(priceYocto);
            const minStorage = BigInt(MIN_STORAGE_COST || '0');

            if (finalDeposit < minStorage) {
                finalDeposit = minStorage;
            }

            actions.push(
                transactions.functionCall(
                    'buy_ticket',
                    Buffer.from(JSON.stringify({
                        receiver_id: accountId,
                        encrypted_cid: cid
                    })),
                    BigInt('30000000000000'), // 30 Tgas
                    finalDeposit
                )
            );

            // 3. Add Deposit Action
            actions.push(
                transactions.functionCall(
                    'deposit_funds',
                    Buffer.from(JSON.stringify({})),
                    BigInt('30000000000000'), // 30 TGas
                    BigInt(utils.format.parseNearAmount('1') || '0')
                )
            );

            console.log(`Sending batch transaction (${actions.length} actions)...`);
            await wallet.signAndSendTransaction({
                receiverId: contractId,
                actions: actions,
            });

            // If we get here, tx succeeded
            if (hasSessionKey === false) setHasSessionKey(true);
            if (onPurchaseSuccess) onPurchaseSuccess();

        } catch (e) {
            console.error("Purchase failed:", e);
            setError("Transaction failed or was rejected");
        } finally {
            setActionLoading(false);
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

                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-90" />

                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/50 backdrop-blur-md p-4 rounded-full border border-white/10 shadow-xl">
                        <Ticket className="w-6 h-6 text-white" />
                    </div>
                </div>

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
                        disabled={actionLoading || !accountId || hasSessionKey === null}
                        className="bg-white text-black hover:bg-zinc-200 font-bold shadow-lg shadow-white/5"
                    >
                        {actionLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {hasSessionKey === false ? "Initializing..." : "Mining..."}
                            </>
                        ) : (
                            hasSessionKey === false ? "Buy & Setup" : "Buy Ticket"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
