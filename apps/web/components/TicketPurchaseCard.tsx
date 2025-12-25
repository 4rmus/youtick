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

/**
 * Mint PKP in background after ticket purchase for signless experience.
 * Non-blocking - errors are logged but don't affect user flow.
 */
async function mintPKPInBackground(accountId: string) {
    try {
        // Check if user already has a PKP
        const existingPkp = localStorage.getItem(`lit_pkp_${accountId}`);
        if (existingPkp) {
            console.log("PKP already exists for user, skipping mint");
            return;
        }

        console.log("🔐 Minting PKP for signless experience...");

        const response = await fetch('/api/relayer/mint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nearAccountId: accountId })
        });

        if (!response.ok) {
            const error = await response.json();
            console.warn("PKP minting failed (non-blocking):", error);
            return;
        }

        const data = await response.json();
        if (data.success && data.pkp) {
            // Store PKP info for future signless sessions
            localStorage.setItem(`lit_pkp_${accountId}`, JSON.stringify({
                publicKey: data.pkp.publicKey,
                ethAddress: data.pkp.ethAddress,
                tokenId: data.pkp.tokenId
            }));
            console.log("✅ PKP minted and stored:", data.pkp.ethAddress);
        }
    } catch (error) {
        // Non-blocking - user can still use MPC fallback
        console.warn("Background PKP minting error (non-blocking):", error);
    }
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
                const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-0-0.utick.testnet';
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
            const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-0-0.utick.testnet';
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
            const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1-0-0.utick.testnet';
            const sessionManager = new SessionManager(accountId);

            const transactionsList = [];

            // 1. Prepare Session Key Transaction if missing
            if (hasSessionKey === false) {
                console.log("No session key found. Adding Initialization to transactions...");
                const keyPair = utils.KeyPair.fromRandom('ed25519');
                const publicKey = keyPair.getPublicKey().toString();

                // Store locally (optimistic)
                await sessionManager.saveSessionKey(keyPair);

                transactionsList.push({
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
            }

            // 2. Prepare Purchase & Deposit Transaction
            // Strategy: Deposit everything first, then buy from prepaid balance
            // This avoids NEAR runtime's auto-refund of attached deposits
            const purchaseActions = [];
            const STORAGE_COST = utils.format.parseNearAmount('0.01') || '0';
            const priceYocto = utils.format.parseNearAmount(eventDetails.price) || '0';

            // Total deposit: ticket price + storage + 1N buffer for gas
            const totalDeposit = BigInt(priceYocto) + BigInt(STORAGE_COST) + BigInt(utils.format.parseNearAmount('1') || '0');

            // Step 1: Deposit all funds to prepaid balance
            purchaseActions.push(
                transactions.functionCall(
                    'deposit_funds',
                    Buffer.from(JSON.stringify({})),
                    BigInt('30000000000000'), // 30 TGas
                    totalDeposit
                )
            );

            // Step 2: Buy ticket from prepaid balance (NO attached deposit = NO auto-refund!)
            purchaseActions.push(
                transactions.functionCall(
                    'buy_ticket_prepaid', // Uses prepaid balance
                    Buffer.from(JSON.stringify({
                        receiver_id: accountId,
                        encrypted_cid: cid
                    })),
                    BigInt('50000000000000'), // 50 Tgas
                    BigInt('0') // No deposit - uses prepaid!
                )
            );

            transactionsList.push({
                receiverId: contractId,
                actions: purchaseActions
            });

            console.log(`Sending bundled transactions (${transactionsList.length} txs)...`);
            await wallet.signAndSendTransactions({
                transactions: transactionsList
            });

            if (hasSessionKey === false) setHasSessionKey(true);

            // 🔥 Mint PKP for signless experience - WAIT for completion before showing player
            await mintPKPInBackground(accountId);

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

    const priceNear = parseFloat(eventDetails.price) || 0;
    const isFree = priceNear === 0;

    return (
        <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl shadow-black/50 max-w-sm mx-auto">
            {/* Decorative Corner Glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />

            {/* Image Container */}
            <div className="aspect-video relative overflow-hidden">
                <img
                    src={eventDetails.media}
                    alt="Ticket Preview"
                    className="w-full h-full object-cover scale-105 blur-sm opacity-60 group-hover:opacity-80 transition-all duration-700"
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />

                {/* Lock Icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                        <Ticket className="w-7 h-7 text-white" />
                    </div>
                </div>

                {/* Top Badges Row */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    {/* Access Required Badge */}
                    <div className="px-3 py-1.5 rounded-lg bg-red-500/90 backdrop-blur-sm border border-red-400/30 shadow-lg">
                        <span className="text-[10px] font-bold text-white tracking-wider uppercase">🔒 Access Required</span>
                    </div>

                    {/* Price Badge */}
                    <div className={`px-3 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg ${isFree
                        ? 'bg-emerald-500/90 border-emerald-400/30'
                        : 'bg-gradient-to-r from-purple-600/90 to-blue-600/90 border-white/20'
                        }`}>
                        {isFree ? (
                            <span className="text-[10px] font-bold text-white tracking-wider uppercase">✨ Free Ticket</span>
                        ) : (
                            <span className="text-[10px] font-bold text-white tracking-wider">{eventDetails.price} NEAR</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="p-5 relative">
                {/* Title */}
                <h4 className="font-bold text-white text-lg leading-tight line-clamp-1 mb-2">
                    {eventDetails.title}
                </h4>

                {/* Description */}
                <p className="text-sm text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
                    Purchase this ticket NFT to unlock permanent access to exclusive content.
                </p>

                {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 p-2.5 rounded-lg mb-4 border border-red-900/50">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Divider with Gradient */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

                {/* Creator Row */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        {/* Avatar with Ring */}
                        <div className="relative">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 p-0.5">
                                <div className="w-full h-full rounded-[10px] bg-zinc-900 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">
                                        {eventDetails.uploader ? eventDetails.uploader.substring(0, 2).toUpperCase() : "??"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Creator</span>
                            <span className="text-xs text-zinc-300 font-medium truncate max-w-[120px]">
                                {eventDetails.uploader || "Unknown"}
                            </span>
                        </div>
                    </div>

                    {/* NFT Ticket Indicator */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
                        <span className="text-[10px] text-zinc-400 font-medium">NFT Ticket</span>
                    </div>
                </div>

                {/* Purchase Button */}
                <Button
                    onClick={handlePurchase}
                    disabled={actionLoading || !accountId || hasSessionKey === null}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-3 shadow-lg shadow-purple-500/20 border-0"
                >
                    {actionLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {hasSessionKey === false ? "Initializing..." : "Processing..."}
                        </>
                    ) : (
                        <>
                            <Ticket className="mr-2 h-4 w-4" />
                            {isFree ? "Claim Free Ticket" : hasSessionKey === false ? `Buy & Setup (${eventDetails.price} NEAR)` : `Buy Ticket (${eventDetails.price} NEAR)`}
                        </>
                    )}
                </Button>
            </div>

            {/* Bottom Shine Effect */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>
    );
}
