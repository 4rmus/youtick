import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from "@/components/ui/button";
import { Loader2, Ticket, AlertCircle, Play } from "lucide-react";
import { actions, KeyPair, PublicKey, yoctoToNear, nearToYocto } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { SessionManager } from '@/lib/session-manager';
import { useSessionState, useIsCreator } from '@/lib/hooks/useSessionState';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';

interface TicketPurchaseCardProps {
    cid: string;
    onPurchaseSuccess?: () => void;
    className?: string;
}

interface EventDetails {
    price: string;
    title: string;
    media?: string;
    uploader?: string;
}

export function TicketPurchaseCard({ cid, onPurchaseSuccess, className }: TicketPurchaseCardProps) {
    const { selector, accountId, getWallet, pkpData } = useWallet();

    // React Query hooks for cached state
    const { hasSessionKey, refetchSessionKey } = useSessionState(accountId);
    const { data: isCreatorData, isLoading: isCreatorLoading } = useIsCreator(accountId, cid);

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Initial Load: Fetch Event Details
    // Note: Session key check is now handled by useSessionState hook (React Query)
    useEffect(() => {
        if (!cid) return;

        const init = async () => {
            setLoading(true);
            try {
                const contractId = NEAR_CONFIG.contractId;

                // v7: Use JsonRpcProvider directly for view calls
                const provider = getProvider();

                const event = await viewContract<{
                    title: string;
                    price: string;
                    creator_id: string;
                }>(provider, contractId, 'get_event', { encrypted_cid: cid });

                if (event) {
                    // Use centralized metadata parser
                    const parsed = parseTitleMetadata(event.title, "Exclusive Content");

                    setEventDetails({
                        // v7: yoctoToNear expects bigint, convert string from contract
                        price: yoctoToNear(BigInt(event.price)),
                        title: parsed.title,
                        media: parsed.thumbnailUrl,
                        uploader: event.creator_id
                    });
                }

            } catch (e) {
                console.error("Error loading ticket info:", e);
                setError("Failed to load ticket info");
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [cid]);

    // Claim FREE Ticket (Sponsored by Contract)
    const handleFreeTicketClaim = async () => {
        if (!accountId || !eventDetails) return;
        setActionLoading(true);
        setError(null);
        try {
            console.log("Claiming free ticket via sponsored API...");

            const response = await fetch('/api/ticket/claim-free', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiver_id: accountId,
                    encrypted_cid: cid
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to claim free ticket');
            }

            console.log("✅ Free ticket claimed:", data);

            // PKP minting is now handled automatically by WalletProvider on connect
            if (onPurchaseSuccess) onPurchaseSuccess();

        } catch (e: any) {
            console.error("Free ticket claim failed:", e);
            setError(e.message || "Failed to claim free ticket");
        } finally {
            setActionLoading(false);
        }
    };

    // Buy Ticket with NEAR (for paid tickets)
    const handlePurchase = async () => {
        if (!accountId || !eventDetails) return;
        setActionLoading(true);
        setError(null);
        try {
            const wallet = await getWallet();
            const contractId = NEAR_CONFIG.contractId;
            const sessionManager = new SessionManager(accountId);

            const transactionsList = [];

            // Prepare Session Key Transaction if missing
            if (hasSessionKey === false) {
                console.log("No session key found. Adding Initialization to transactions...");
                // v7: Use KeyPair directly
                const keyPair = KeyPair.fromRandom('ed25519');
                const publicKey = keyPair.getPublicKey().toString();

                await sessionManager.saveSessionKey(keyPair);

                // v7: Use PublicKey.fromString and actions.addFunctionCallAccessKey
                const pubKey = PublicKey.fromString(publicKey);
                transactionsList.push({
                    receiverId: accountId,
                    actions: [
                        actions.addFunctionCallAccessKey(
                            pubKey,
                            contractId,
                            [], // All methods allowed
                            BigInt(nearToYocto(0.25))
                        )
                    ]
                });
            }

            // Purchase & Deposit Transaction
            const purchaseActions = [];
            // v7: Use nearToYocto
            const STORAGE_COST = nearToYocto(0.01);
            const priceYocto = nearToYocto(parseFloat(eventDetails.price));

            // Total deposit: ticket price + storage + 1N buffer for gas
            const totalDeposit = BigInt(priceYocto) + BigInt(STORAGE_COST) + BigInt(nearToYocto(1));

            // Step 1: Deposit all funds to prepaid balance
            // v7: Use actions.functionCall
            purchaseActions.push(
                actions.functionCall(
                    'deposit_funds',
                    {},
                    BigInt('30000000000000'),
                    totalDeposit
                )
            );

            // Step 2: Buy ticket from prepaid balance
            purchaseActions.push(
                actions.functionCall(
                    'buy_ticket_prepaid',
                    {
                        receiver_id: accountId,
                        encrypted_cid: cid
                    },
                    BigInt('50000000000000'),
                    BigInt('0')
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

            // Refetch session key status in React Query cache
            if (hasSessionKey === false) refetchSessionKey();

            // PKP minting is now handled automatically by WalletProvider on connect
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
    // Use React Query hook for creator check (cached), fallback to direct comparison
    const isCreator = isCreatorData === true || (accountId && eventDetails.uploader === accountId);

    return (
        <div className={`relative group overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl shadow-black/50 max-w-sm mx-auto ${className}`}>
            {/* Decorative Corner Glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-near-green/10 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-near-purple/10 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />

            {/* Image Container */}
            <div className="aspect-video relative overflow-hidden bg-zinc-800">
                <img
                    src={eventDetails.media || '/placeholder-video.svg'}
                    alt="Ticket Preview"
                    className="w-full h-full object-cover scale-105 blur-sm opacity-60 group-hover:opacity-80 transition-all duration-700"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/placeholder-video.svg';
                    }}
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />

                {/* Lock Icon or Play Icon for Creator */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                        {isCreator ? (
                            <Play className="w-7 h-7 text-white ml-1" />
                        ) : (
                            <Ticket className="w-7 h-7 text-white" />
                        )}
                    </div>
                </div>

                {/* Top Badges Row */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    {isCreator ? (
                        <div className="px-3 py-1.5 rounded-lg bg-green-500/90 backdrop-blur-sm border border-green-400/30 shadow-lg">
                            <span className="text-[10px] font-bold text-white tracking-wider uppercase">✨ Creator Access</span>
                        </div>
                    ) : (
                        <div className="px-3 py-1.5 rounded-lg bg-red-500/90 backdrop-blur-sm border border-red-400/30 shadow-lg">
                            <span className="text-[10px] font-bold text-white tracking-wider uppercase">🔒 Access Required</span>
                        </div>
                    )}

                    <div className={`px-3 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg ${isFree || isCreator
                        ? 'bg-near-green/90 border-near-green/30'
                        : 'bg-zinc-800 border-zinc-600'
                        }`}>
                        {isCreator ? (
                            <span className="text-[10px] font-bold text-near-black tracking-wider uppercase">Owner</span>
                        ) : isFree ? (
                            <span className="text-[10px] font-bold text-near-black tracking-wider uppercase">✨ Free Ticket</span>
                        ) : (
                            <span className="text-[10px] font-bold text-white tracking-wider">{eventDetails.price} NEAR</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="p-5 relative">
                <h4 className="font-bold text-white text-lg leading-tight line-clamp-1 mb-2">
                    {eventDetails.title}
                </h4>

                <p className="text-sm text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
                    {isCreator
                        ? "You are the creator of this event. You can watch it directly without purchasing a ticket."
                        : "Purchase this ticket NFT to unlock permanent access to exclusive content."}
                </p>

                {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 p-2.5 rounded-lg mb-4 border border-red-900/50">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

                {/* Creator Row */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-9 h-9 rounded-xl bg-zinc-700 p-0.5">
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

                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                        <div className="w-2 h-2 rounded-full bg-near-green animate-pulse" />
                        <span className="text-[10px] text-zinc-400 font-medium">NFT Ticket</span>
                    </div>
                </div>

                {/* Purchase Button */}
                <Button
                    onClick={isCreator ? () => window.location.href = `/watch?cid=${cid}` : isFree ? handleFreeTicketClaim : handlePurchase}
                    disabled={(!isCreator && (actionLoading || !accountId))}
                    className={`w-full font-bold py-3 shadow-lg border-0 ${isCreator
                        ? "bg-near-green hover:bg-near-green/80 text-near-black shadow-near-green/20"
                        : "bg-near-green text-near-black hover:bg-near-green/80"
                        }`}
                >
                    {actionLoading && !isCreator ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {hasSessionKey === false ? "Initializing..." : "Processing..."}
                        </>
                    ) : isCreator ? (
                        <>
                            <Play className="mr-2 h-4 w-4" />
                            Watch Now
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
