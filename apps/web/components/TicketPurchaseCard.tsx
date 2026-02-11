import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from "@/components/ui/button";
import { Loader2, Ticket, AlertCircle, Play, ChevronDown, ChevronUp } from "lucide-react";
import { actions, KeyPair, KeyPairSigner, Account, yoctoToNear, nearToYocto, type KeyPairString } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { SessionManager } from '@/lib/session-manager';
import { useSessionState, useIsCreator } from '@/lib/hooks/useSessionState';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG, GAS_CONSTANTS } from '@/lib/constants';
import { NovaThumbnail } from './NovaThumbnail';
import { addBuyerToNovaGroup } from '@/lib/nova/post-purchase';

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
    const { accountId, getWallet } = useWallet();

    // React Query hooks for cached state
    const { hasSessionKey, refetchSessionKey } = useSessionState(accountId);
    const { data: isCreatorData, isLoading: isCreatorLoading } = useIsCreator(accountId, cid);

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCostBreakdown, setShowCostBreakdown] = useState(false);
    const [novaServiceFee, setNovaServiceFee] = useState(0); // Nova service fee in NEAR

    // Initial Load: Fetch Event Details
    // Note: Session key check is now handled by useSessionState hook (React Query)
    useEffect(() => {
        if (!cid || cid.length > 256) return;

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

                    // Query Nova service fee from contract (for paid tickets)
                    if (BigInt(event.price) > BigInt(0)) {
                        try {
                            const novaFeeYocto = await viewContract<string>(
                                provider, contractId, 'get_nova_service_fee', {}
                            );
                            if (novaFeeYocto) {
                                const feeNear = parseFloat(yoctoToNear(BigInt(novaFeeYocto))) || 0;
                                setNovaServiceFee(feeNear);
                            }
                        } catch {
                            // Nova fee not configured yet, default to 0
                        }
                    }
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

    // Claim FREE Ticket (Direct via onboarding key or session key - decentralized)
    const handleFreeTicketClaim = async () => {
        if (!accountId || !eventDetails) return;
        setActionLoading(true);
        setError(null);
        try {
            const contractId = NEAR_CONFIG.contractId;

            // Try direct claim via onboarding key first (decentralized, signless)
            const onboardingKeyStr = localStorage.getItem(`onboarding_key:${contractId}`);

            if (onboardingKeyStr) {
                const onboardingKeyPair = KeyPair.fromString(onboardingKeyStr as KeyPairString);
                const signer = new KeyPairSigner(onboardingKeyPair);
                const { getCurrentRpcUrl } = await import('@/lib/rpc-failover');
                const account = new Account(contractId, getCurrentRpcUrl(), signer);

                await account.signAndSendTransaction({
                    receiverId: contractId,
                    actions: [
                        actions.functionCall(
                            "claim_free_ticket_direct",
                            { receiver_id: accountId, encrypted_cid: cid },
                            GAS_CONSTANTS.mediumGas, // 100 TGas
                            BigInt(0)
                        )
                    ]
                });

            } else if (hasSessionKey) {
                // Signless fallback: use session key + buy_ticket_prepaid (free = 0 NEAR)
                const sessionManager = new SessionManager(accountId);
                await sessionManager.callMethod('buy_ticket_prepaid', {
                    receiver_id: accountId,
                    encrypted_cid: cid
                }, GAS_CONSTANTS.mediumGas.toString());
            } else {
                // Wallet-signed buy_ticket with price=0
                const wallet = await getWallet();

                await wallet.signAndSendTransactions({
                    transactions: [{
                        receiverId: contractId,
                        actions: [
                            actions.functionCall(
                                'buy_ticket',
                                { receiver_id: accountId, encrypted_cid: cid },
                                GAS_CONSTANTS.mediumGas,
                                BigInt(nearToYocto(0.01))
                            )
                        ]
                    }]
                });
            }

            // Add buyer to Nova group for video access (await completion before redirect)
            try {
                await addBuyerToNovaGroup(cid, accountId);
            } catch (err) {
                console.error('[Nova Post-Purchase] Group add failed — user may need manual grant:', err);
            }

            if (onPurchaseSuccess) onPurchaseSuccess();

        } catch (e: unknown) {
            console.error("Free ticket claim failed:", e);
            setError(e instanceof Error ? e.message : "Failed to claim free ticket");
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

            // Build purchase transaction (FunctionCall only — always wallet-compatible)
            const purchaseActions = [];
            const STORAGE_COST = nearToYocto(0.01);
            const priceYocto = nearToYocto(parseFloat(eventDetails.price));
            const novaFeeYocto = nearToYocto(novaServiceFee);

            // Total deposit: ticket price + storage + gas buffer + nova service fee
            const totalDeposit = BigInt(priceYocto) + BigInt(STORAGE_COST) + BigInt(nearToYocto(0.01)) + BigInt(novaFeeYocto);

            purchaseActions.push(
                actions.functionCall(
                    'deposit_funds',
                    {},
                    GAS_CONSTANTS.smallGas,
                    totalDeposit
                )
            );

            purchaseActions.push(
                actions.functionCall(
                    'buy_ticket_prepaid',
                    {
                        receiver_id: accountId,
                        encrypted_cid: cid
                    },
                    BigInt('50000000000000'), // 50 TGas
                    BigInt('0')
                )
            );

            const purchaseTransaction = {
                receiverId: contractId,
                actions: purchaseActions
            };

            // Session key is created by MyNearWallet during sign-in (no AddKey needed)
            await wallet.signAndSendTransactions({ transactions: [purchaseTransaction] });

            // Add buyer to Nova group for video access (await completion before redirect)
            try {
                await addBuyerToNovaGroup(cid, accountId);
            } catch (err) {
                console.error('[Nova Post-Purchase] Group add failed — user may need manual grant:', err);
            }

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
                <NovaThumbnail
                    url={eventDetails.media}
                    alt="Ticket Preview"
                    className="w-full h-full object-cover scale-105 blur-sm opacity-60 group-hover:opacity-80 transition-all duration-700"
                    fallbackUrl="/placeholder-video.svg"
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
            </div>

            {/* Content */}
            <div className="relative p-6 space-y-4">
                {/* Title */}
                <h3 className="text-xl font-bold text-white line-clamp-2 leading-tight">
                    {eventDetails.title}
                </h3>

                {/* Price Tag */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-near-green/20 flex items-center justify-center">
                            <span className="text-near-green font-bold text-sm">Ⓝ</span>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">
                                {isFree ? 'FREE' : `${priceNear.toFixed(2)}`}
                            </p>
                            {!isFree && <p className="text-xs text-zinc-500">NEAR</p>}
                        </div>
                    </div>

                    {/* Creator Badge */}
                    {isCreator && (
                        <span className="px-3 py-1 text-xs font-medium bg-near-green/20 text-near-green rounded-full border border-near-green/30">
                            Your Content
                        </span>
                    )}
                </div>

                {/* Cost Breakdown (paid tickets only) */}
                {!isFree && !isCreator && (() => {
                    const costItems = [
                        { label: 'Ticket price', amount: priceNear },
                        { label: 'NFT storage deposit', amount: 0.01 },
                        { label: 'Gas buffer', amount: 0.01 },
                        ...(novaServiceFee > 0 ? [{ label: 'Nova encryption fee', amount: novaServiceFee }] : []),
                    ];
                    const total = costItems.reduce((sum, item) => sum + item.amount, 0);

                    return (
                        <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowCostBreakdown(!showCostBreakdown)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                            >
                                <span>Total wallet cost: ~{total.toFixed(2)} Ⓝ</span>
                                {showCostBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {showCostBreakdown && (
                                <div className="px-3 pb-2 space-y-1 text-[11px] text-zinc-500 border-t border-white/5 pt-2">
                                    {costItems.map((item) => (
                                        <div key={item.label} className="flex justify-between">
                                            <span>{item.label}</span>
                                            <span className="font-mono">{item.amount.toFixed(2)} Ⓝ</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between font-medium text-zinc-300 border-t border-white/5 pt-1 mt-1">
                                        <span>Total</span>
                                        <span className="font-mono">{total.toFixed(2)} Ⓝ</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-600 pt-1">
                                        Excess deposit is refunded by the contract.
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Error Message */}
                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Action Button */}
                {!isCreator && (
                    <Button
                        onClick={isFree ? handleFreeTicketClaim : handlePurchase}
                        disabled={actionLoading}
                        className="w-full h-12 bg-gradient-to-r from-near-green to-emerald-500 hover:from-near-green/90 hover:to-emerald-500/90 text-near-black font-bold text-base rounded-xl shadow-lg shadow-near-green/20 transition-all duration-300"
                    >
                        {actionLoading ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Ticket className="h-5 w-5 mr-2" />
                                {isFree ? 'Claim Free Ticket' : `Buy Ticket • ${priceNear.toFixed(2)} Ⓝ`}
                            </>
                        )}
                    </Button>
                )}

                {/* Creator Watch Button */}
                {isCreator && (
                    <Button
                        onClick={() => window.location.href = `/watch?cid=${cid}`}
                        className="w-full h-12 bg-gradient-to-r from-zinc-700 to-zinc-600 hover:from-zinc-600 hover:to-zinc-500 text-white font-bold text-base rounded-xl"
                    >
                        <Play className="h-5 w-5 mr-2" />
                        Watch Your Video
                    </Button>
                )}
            </div>
        </div>
    );
}
