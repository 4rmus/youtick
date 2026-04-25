import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Button } from "@/components/ui/button";
import { Loader2, Ticket, AlertCircle, Play, ChevronDown, ChevronUp, Check, Wallet } from "lucide-react";
import { actions, KeyPair, KeyPairSigner, Account, yoctoToNear, type KeyPairString } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { useIsCreator } from '@/lib/hooks/useSessionState';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { FEATURE_FLAGS, NEAR_CONFIG, GAS_CONSTANTS } from '@/lib/constants';
import { nearAmountToYocto } from '@/lib/near-amount';
import { IPFSThumbnail } from './IPFSThumbnail';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { useStablecoinPayment } from '@/lib/hooks/useStablecoinPayment';
import { getTokenConfig, submitDeposit, type PaymentMethod, type ChainId, type SwapQuote } from '@/lib/intents';
import { useNearPrice } from '@/hooks/useNearPrice';
import { useEvmPayment } from '@/lib/evm/useEvmPayment';
import { claimFreeTicketDirect, hasOnboardingKey } from '@/lib/gift-service';
import { claimFreeTicketAsGuest, getOrCreateGuestIdentity } from '@/lib/guest-account';
import { persistManagedKeyPair } from '@/lib/managed-near-account';
import { resolvePreferredMediaUrl } from '@/lib/video-delivery';
import { DEPOSIT_CONSTANTS } from '@/lib/constants';

interface TicketPurchaseCardProps {
    cid: string;
    onPurchaseSuccess?: () => void;
    className?: string;
}

interface EventDetails {
    price: string;
    priceUsdCents: number | null;
    accessMode: 'paid' | 'free_collectible' | 'public_free';
    title: string;
    media?: string;
    uploader?: string;
}

type PaymentSelection = {
    method: PaymentMethod;
    chain: ChainId;
    quote: SwapQuote | null;
    estimatedNear: number;
};

const STORAGE_DEPOSIT_NEAR = 0.01;
const GAS_BUFFER_NEAR = 0.01;

export function TicketPurchaseCard({ cid, onPurchaseSuccess, className }: TicketPurchaseCardProps) {
    const { accountId, isTrial, managedAccountKind, getWallet, connect, setEvmLinkedAccount, setManagedAccount } = useWallet();
    const { t } = useLanguage();
    const tp = t.ticket_purchase;

    const { data: isCreatorData } = useIsCreator(accountId, cid);
    const { nearPrice, nearToUsdStr } = useNearPrice();

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCostBreakdown, setShowCostBreakdown] = useState(false);


    // MetaMask / EVM payment hook
    const {
        connect: connectMetaMask,
        sendToken: sendEvmToken,
        isConnected: isEvmConnected,
        evmAddress,
        isSending: isEvmSending,
    } = useEvmPayment({
        onSuccess: (txHash) => {
            console.log('[EVM] Transfer confirmed:', txHash);
            // Polling is already active from initiateSwap — the swap will be detected
        },
        onError: (err) => {
            setError(`MetaMask transfer failed: ${err}`);
            setActionLoading(false);
        },
    });

    // Implicit NEAR account for MetaMask-only users (keypair only, no on-chain creation needed)
    // 1Click delivers NEAR to implicit account → auto-created on first receive
    const [evmSwapKeypair, setEvmSwapKeypair] = useState<{ secretKey: string; implicitAccountId: string } | null>(null);
    // Ref to avoid stale closure in onSwapComplete callback
    const evmSwapKeypairRef = useRef(evmSwapKeypair);
    useEffect(() => { evmSwapKeypairRef.current = evmSwapKeypair; }, [evmSwapKeypair]);

    // Payment method state
    const [paymentSelection, setPaymentSelection] = useState<PaymentSelection>({
        method: 'NEAR',
        chain: 'near',
        quote: null,
        estimatedNear: 0,
    });

    // Post-swap state: 1Click delivers native NEAR (not wNEAR), ready for purchase
    const [swapNearReady, setSwapNearReady] = useState(false);

    // Complete purchase from implicit account (MetaMask-only flow)
    // Called automatically after 1Click swap delivers NEAR to the implicit account
    const handleImplicitAccountPurchase = async (secretKey: string, implicitId: string) => {
        if (!eventDetails) return;
        setActionLoading(true);
        setError(null);

        try {
            const contractId = NEAR_CONFIG.contractId;
            const { getCurrentRpcUrl } = await import('@/lib/rpc-failover');

            const keyPair = KeyPair.fromString(secretKey as KeyPairString);
            const signer = new KeyPairSigner(keyPair);
            const account = new Account(implicitId, getCurrentRpcUrl(), signer);

            const priceYocto = nearAmountToYocto(eventDetails.price);
            const storageCostYocto = nearAmountToYocto(STORAGE_DEPOSIT_NEAR);
            const totalDeposit = priceYocto + storageCostYocto;

            await account.signAndSendTransaction({
                receiverId: contractId,
                actions: [
                    actions.functionCall(
                        'buy_ticket',
                        { receiver_id: implicitId, encrypted_cid: cid },
                        GAS_CONSTANTS.mediumGas,
                        totalDeposit
                    ),
                ],
            });

            console.log('[MetaMask Flow] Purchase complete on implicit account:', implicitId);

            // Store keypair for future access (viewing purchased content)
            await persistManagedKeyPair(implicitId, secretKey);

            // KMS access control uses ticket ownership — no group management needed

            // Batch all state updates after async work completes (single render)
            setEvmLinkedAccount(implicitId);
            setActionLoading(false);
            if (onPurchaseSuccess) onPurchaseSuccess();
        } catch (e) {
            console.error('[MetaMask Flow] Implicit account purchase failed:', e);
            setError(e instanceof Error ? e.message : tp.error_complete_purchase);
            setActionLoading(false);
        }
    };

    // Stablecoin swap hook
    const {
        status: swapStatus,
        error: swapError,
        initiateSwap,
        reset: resetSwap,
    } = useStablecoinPayment({
        accountId: accountId || '',
        onSwapComplete: async (nearAmount) => {
            // 1Click delivers NATIVE NEAR (not wNEAR) via NativeWithdraw intent.
            console.log('[Swap Complete] Native NEAR received. amountOut:', nearAmount);

            // EVM flow with implicit account: auto-complete purchase
            // Use ref to get the latest value (avoids stale closure from setInterval)
            const keypair = evmSwapKeypairRef.current;
            if (keypair) {
                console.log('[MetaMask Flow] Auto-completing purchase on implicit account:', keypair.implicitAccountId);
                await handleImplicitAccountPurchase(keypair.secretKey, keypair.implicitAccountId);
                return;
            }

            // NEAR wallet flow: mark ready for manual "Complete Purchase" click
            setSwapNearReady(true);
            setActionLoading(false);
        },
        onSwapFailed: (err) => {
            setError(`Swap failed: ${err}`);
            setActionLoading(false);
        },
    });

    // Initial Load: Fetch Event Details
    useEffect(() => {
        if (!cid || cid.length > 256) return;

        const init = async () => {
            setLoading(true);
            try {
                const contractId = NEAR_CONFIG.contractId;
                const provider = getProvider();

                const event = await viewContract<{
                    title: string;
                    price: string;
                    creator_id: string;
                    price_usd?: number | null;
                    access_mode?: 'paid' | 'free_collectible' | 'public_free';
                    banned?: boolean;
                }>(provider, contractId, 'get_event', { encrypted_cid: cid });

                if (event?.banned) {
                    setError(tp.error_banned);
                    setLoading(false);
                    return;
                }

                if (event) {
                    const parsed = parseTitleMetadata(event.title, "Exclusive Content");
                    const media = await resolvePreferredMediaUrl(parsed.thumbnailUrl, parsed.manifestCid);

                    setEventDetails({
                        price: yoctoToNear(BigInt(event.price)),
                        priceUsdCents: event.price_usd ?? null,
                        accessMode: event.access_mode ?? (event.price === '0' ? 'public_free' : 'paid'),
                        title: parsed.title,
                        media: media ?? parsed.thumbnailUrl,
                        uploader: event.creator_id
                    });
                }

            } catch (e) {
                console.error("Error loading ticket info:", e);
                setError(tp.error_load_ticket);
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [cid]);

    const handleSelectionChange = useCallback((selection: PaymentSelection) => {
        setPaymentSelection(selection);
    }, []);

    // Claim FREE Ticket (sponsored onboarding key or wallet fallback)
    const handleFreeTicketClaim = async () => {
        if (!eventDetails) return;
        const isGuestManagedAccount = managedAccountKind === 'guest';

        if (isGuestManagedAccount) {
            setActionLoading(true);
            setError(null);
            try {
                const identity = await getOrCreateGuestIdentity();
                const result = await claimFreeTicketAsGuest(cid, identity);
                setManagedAccount(result.accountId, 'guest');
                if (onPurchaseSuccess) onPurchaseSuccess();
            } catch (e: unknown) {
                console.error("Guest free ticket claim failed:", e);
                setError(e instanceof Error ? e.message : t.watch_page.claim_free_ticket);
            } finally {
                setActionLoading(false);
            }
            return;
        }

        if (!accountId) {
            if (eventDetails.accessMode === 'public_free') {
                setActionLoading(true);
                setError(null);
                try {
                    const identity = await getOrCreateGuestIdentity();
                    const result = await claimFreeTicketAsGuest(cid, identity);
                    setManagedAccount(result.accountId, 'guest');
                    if (onPurchaseSuccess) onPurchaseSuccess();
                } catch (e: unknown) {
                    console.error("Anonymous free ticket claim failed:", e);
                    setError(e instanceof Error ? e.message : t.watch_page.claim_free_ticket);
                } finally {
                    setActionLoading(false);
                }
                return;
            }
            // Redirect to trial page where user can connect wallet or create trial account
            const redirectUrl = encodeURIComponent(`/watch?cid=${cid}`);
            window.location.href = `/trial?redirect=${redirectUrl}`;
            return;
        }
        setActionLoading(true);
        setError(null);
        try {
            // Preferred path: sponsored NFT mint via onboarding key (signless + no user deposit).
            // Mints a real NFT into the user's collection for content access.
            if (hasOnboardingKey()) {
                const result = await claimFreeTicketDirect(accountId, cid);
                if (!result.success) {
                    console.warn("[FreeClaim] Direct NFT claim unavailable, falling back to wallet/session path:", result.error);
                } else {
                    if (onPurchaseSuccess) onPurchaseSuccess();
                    return;
                }
            }

            if (isTrial) {
                throw new Error("Secure sponsored free ticket claim is not configured for this trial account yet. Use a gift link or connect a wallet.");
            }

            const contractId = NEAR_CONFIG.contractId;
            const wallet = await getWallet();
            await wallet.signAndSendTransaction({
                receiverId: contractId,
                actions: [
                    actions.functionCall(
                        'buy_ticket',
                        { receiver_id: accountId, encrypted_cid: cid },
                        GAS_CONSTANTS.mediumGas,
                        DEPOSIT_CONSTANTS.smallStorageDeposit
                    ),
                ],
            });

            // KMS: Access control via on-chain ticket ownership — no group management needed
            if (onPurchaseSuccess) onPurchaseSuccess();

        } catch (e: unknown) {
            console.error("Free ticket claim failed:", e);
            setError(e instanceof Error ? e.message : tp.error_claim_free);
        } finally {
            setActionLoading(false);
        }
    };

    // Buy Ticket with NEAR (existing flow — also called after stablecoin swap completes)
    const handleNearPurchase = async () => {
        if (!eventDetails) return;
        if (!accountId) {
            connect();
            return;
        }
        setActionLoading(true);
        setError(null);
        try {
            const wallet = await getWallet();
            const contractId = NEAR_CONFIG.contractId;
            const storageCostYocto = nearAmountToYocto(STORAGE_DEPOSIT_NEAR);
            const priceYocto = nearAmountToYocto(eventDetails.price);
            const totalDeposit = priceYocto + storageCostYocto;

            await wallet.signAndSendTransaction({
                receiverId: contractId,
                actions: [
                    actions.functionCall(
                        'buy_ticket',
                        {
                            receiver_id: accountId,
                            encrypted_cid: cid
                        },
                        GAS_CONSTANTS.mediumGas,
                        totalDeposit
                    ),
                ],
            });

            // KMS: Access control via on-chain ticket ownership — no group management needed
            if (onPurchaseSuccess) onPurchaseSuccess();

        } catch (e) {
            console.error("Purchase failed:", e);
            setError(tp.error_tx_rejected);
        } finally {
            setActionLoading(false);
        }
    };

    // Buy Ticket with Stablecoin (1Click swap → native NEAR → direct buy_ticket)
    const handleStablecoinPurchase = async () => {
        if (!eventDetails) return;

        // For EVM chains: ensure MetaMask is connected
        const isEvmChain = paymentSelection.chain === 'arb' || paymentSelection.chain === 'base';
        if (isEvmChain && !isEvmConnected) {
            connectMetaMask();
            return;
        }

        setActionLoading(true);
        setError(null);

        // Determine NEAR recipient:
        // - Existing NEAR wallet user → use their accountId
        // - MetaMask-only user → generate implicit account (just math, no blockchain call)
        let nearRecipient: string;
        let refundOverride: string | undefined;
        let recipientOverride: string | undefined;

        if (accountId) {
            nearRecipient = accountId;
        } else if (isEvmChain) {
            // Generate keypair → implicit account (64-char hex, auto-created when NEAR arrives)
            const kp = KeyPair.fromRandom('ed25519');
            const pubKeyBytes = kp.getPublicKey().data;
            const implicitId = Array.from(pubKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            setEvmSwapKeypair({ secretKey: kp.toString(), implicitAccountId: implicitId });
            nearRecipient = implicitId;
            recipientOverride = implicitId;
            console.log('[MetaMask Flow] Generated implicit account:', implicitId);
        } else {
            setError(tp.error_connect_wallet);
            setActionLoading(false);
            return;
        }

        if (isEvmChain && evmAddress) {
            refundOverride = evmAddress;
        }

        const priceNear = parseFloat(eventDetails.price) || 0;
        // Total NEAR needed by contract: ticket price + NFT storage.
        // Plus gas buffer and slippage buffer to account for swap price impact.
        const contractCost = priceNear + STORAGE_DEPOSIT_NEAR;
        const totalWithBuffer = contractCost + GAS_BUFFER_NEAR;
        const totalWithSlippage = totalWithBuffer * 1.10;

        let usdCents: number;
        if (eventDetails.priceUsdCents && nearPrice > 0) {
            // USD-priced ticket: calculate overhead in USD and add slippage
            const overheadNear = STORAGE_DEPOSIT_NEAR + GAS_BUFFER_NEAR;
            const overheadUsdCents = Math.ceil(overheadNear * nearPrice * 100);
            usdCents = Math.ceil((eventDetails.priceUsdCents + overheadUsdCents) * 1.05);
        } else if (nearPrice > 0) {
            // NEAR-priced ticket: convert total NEAR to USD
            usdCents = Math.ceil(totalWithSlippage * nearPrice * 100);
        } else {
            // Fallback
            usdCents = eventDetails.priceUsdCents ?? Math.round(totalWithSlippage * 100);
        }
        // Sanity check: minimum swap amount to avoid dust swaps that won't cover ticket cost
        if (usdCents < 5) {
            setError('Calculated swap amount is too small. NEAR price data may be unavailable. Please try again or pay with NEAR.');
            setActionLoading(false);
            return;
        }

        try {
            const swapQuote = await initiateSwap(
                paymentSelection.method,
                paymentSelection.chain,
                usdCents,
                nearRecipient,
                refundOverride,
                recipientOverride,
            );

            if (!swapQuote?.depositAddress) {
                throw new Error('No deposit address received');
            }

            // For EVM chains (Arbitrum/Base): auto-send ERC-20 via MetaMask
            if (isEvmChain) {
                await sendEvmToken({
                    tokenSymbol: paymentSelection.method,
                    depositAddress: swapQuote.depositAddress,
                    rawAmount: swapQuote.amountIn, // raw units from 1Click API (not formatted)
                    targetChainId: paymentSelection.chain,
                });
                // MetaMask tx submitted → 1Click polling will detect the deposit
                // onSwapComplete auto-triggers handleImplicitAccountPurchase
                return;
            }

            // For NEAR chain: auto-send stablecoins to Intents deposit address
            if (paymentSelection.chain === 'near') {
                const tokenConfig = getTokenConfig(paymentSelection.method, 'near');
                if (!tokenConfig) throw new Error('Token not supported on NEAR');

                // Extract NEP-141 contract ID from assetId (strip 'nep141:' prefix)
                const tokenContractId = tokenConfig.assetId.replace('nep141:', '');
                const wallet = await getWallet();

                // 1Click delivers native NEAR (not wNEAR) via NativeWithdraw intent.
                // No wrap.near storage_deposit needed for user or contract.
                const txResult = await wallet.signAndSendTransactions({
                    transactions: [
                        // 1. Register Intents deposit address on the token contract
                        {
                            receiverId: tokenContractId,
                            actions: [
                                actions.functionCall(
                                    'storage_deposit',
                                    { account_id: swapQuote.depositAddress },
                                    GAS_CONSTANTS.smallGas,
                                    BigInt('1250000000000000000000') // 0.00125 NEAR min storage
                                )
                            ]
                        },
                        // 2. Send USDC/USDT to Intents deposit address
                        // Use ft_transfer (not ft_transfer_call) because the deposit
                        // address is an implicit account without a contract
                        {
                            receiverId: tokenContractId,
                            actions: [
                                actions.functionCall(
                                    'ft_transfer',
                                    {
                                        receiver_id: swapQuote.depositAddress,
                                        amount: swapQuote.amountIn,
                                        ...(swapQuote.depositMemo ? { memo: swapQuote.depositMemo } : {}),
                                    },
                                    GAS_CONSTANTS.smallGas,
                                    BigInt(1) // 1 yoctoNEAR required
                                )
                            ]
                        }
                    ]
                });

                // Notify 1Click of the deposit tx hash to speed up detection
                // NOTE: Use submitDeposit directly with local swapQuote.depositAddress
                // to avoid stale closure issue with notifyDeposit hook callback
                try {
                    const txHashes: string[] = Array.isArray(txResult)
                        ? txResult.map((tx: { transaction?: { hash?: string }; transaction_outcome?: { id?: string } }) =>
                            tx?.transaction?.hash || tx?.transaction_outcome?.id || ''
                        ).filter(Boolean)
                        : [];
                    const depositTxHash = txHashes[txHashes.length - 1]; // Last tx is the ft_transfer
                    if (depositTxHash && swapQuote.depositAddress) {
                        console.log('[1Click] Submitting deposit tx:', depositTxHash, 'to address:', swapQuote.depositAddress);
                        const depositResult = await submitDeposit(
                            depositTxHash,
                            swapQuote.depositAddress,
                            nearRecipient,
                            swapQuote.depositMemo,
                        );
                        console.log('[1Click] Deposit submission result:', depositResult);
                    } else {
                        console.warn('[1Click] Missing tx hash or deposit address:', { depositTxHash: txHashes, depositAddress: swapQuote.depositAddress });
                    }
                } catch (notifyErr) {
                    console.error('[1Click] Failed to submit deposit tx:', notifyErr);
                }

                // Deposit sent — 1Click polling will detect the swap.
                // onSwapComplete sets swapNearReady=true, then user clicks
                // "Complete Purchase" which calls direct buy_ticket.
            }
        } catch (e) {
            console.error("Stablecoin payment failed:", e);
            setError(e instanceof Error ? e.message : tp.error_complete_purchase);
            setActionLoading(false);
        }
    };

    // Handle the purchase button click based on payment method
    const handlePurchase = async () => {
        if (!FEATURE_FLAGS.enableCrossChainCheckout || paymentSelection.method === 'NEAR') {
            await handleNearPurchase();
        } else {
            await handleStablecoinPurchase();
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
    const isPublicFree = isFree && eventDetails.accessMode === 'public_free';
    const isCreator = isCreatorData === true || (accountId && eventDetails.uploader === accountId);
    const crossChainEnabled = FEATURE_FLAGS.enableCrossChainCheckout;
    const isStablecoinFlow = paymentSelection.method !== 'NEAR';
    const isEvmChain = paymentSelection.chain === 'arb' || paymentSelection.chain === 'base';
    const isSwapInProgress = swapStatus === 'awaiting_deposit' || swapStatus === 'processing' || swapStatus === 'quoting';

    return (
        <div className={`relative group overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl shadow-black/50 max-w-sm mx-auto ${className}`}>
            {/* Decorative Corner Glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-near-green/10 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-near-purple/10 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />

            {/* Image Container */}
            <div className="aspect-video relative overflow-hidden bg-zinc-800">
                <IPFSThumbnail
                    url={eventDetails.media}
                    alt={tp.ticket_preview}
                    className="w-full h-full object-cover scale-105 blur-sm opacity-60 group-hover:opacity-80 transition-all duration-700"
                    fallbackUrl="/placeholder-video.svg"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />

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
                <h3 className="text-xl font-bold text-white line-clamp-2 leading-tight">
                    {eventDetails.title}
                </h3>

                {/* Price Tag */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-near-green/20 flex items-center justify-center">
                            <span className="text-near-green font-bold text-sm">{eventDetails.priceUsdCents ? '$' : 'Ⓝ'}</span>
                        </div>
                        <div>
                            {isFree ? (
                                <p className="text-2xl font-bold text-white">{t.watch_page.free_badge}</p>
                            ) : eventDetails.priceUsdCents ? (
                                <>
                                    <p className="text-2xl font-bold text-white">
                                        ${(eventDetails.priceUsdCents / 100).toFixed(2)}
                                    </p>
                                    <p className="text-xs text-zinc-500">≈ {priceNear.toFixed(2)} NEAR</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-2xl font-bold text-white">{nearToUsdStr(priceNear)}</p>
                                    <p className="text-xs text-zinc-500">≈ {priceNear.toFixed(2)} NEAR</p>
                                </>
                            )}
                        </div>
                    </div>

                    {isCreator && (
                        <span className="px-3 py-1 text-xs font-medium bg-near-green/20 text-near-green rounded-full border border-near-green/30">
                            {tp.your_content}
                        </span>
                    )}
                </div>

                {/* Payment Method Selector (paid tickets, non-creator — always visible so MetaMask-only users can pick EVM chain) */}
                {!isFree && !isCreator && !isSwapInProgress && !swapNearReady && crossChainEnabled && (
                    <PaymentMethodSelector
                        priceNear={priceNear}
                        priceUsdCents={eventDetails.priceUsdCents}
                        accountId={accountId || undefined}
                        onSelectionChange={handleSelectionChange}
                    />
                )}

                {/* NEAR chain swap progress (auto-deposit) */}
                {isSwapInProgress && paymentSelection.chain === 'near' && (
                    <div className="space-y-2 rounded-lg border border-near-green/30 bg-near-green/5 p-4">
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-near-green" />
                            <span className="text-sm font-medium text-near-green">
                                {swapStatus === 'awaiting_deposit' ? tp.swap_awaiting_deposit :
                                    swapStatus === 'processing' ? tp.swap_processing :
                                        tp.swap_preparing}
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                            {swapStatus === 'awaiting_deposit'
                                ? tp.swap_detecting_near.replace('{method}', paymentSelection.method)
                                : tp.swap_converting_near.replace('{method}', paymentSelection.method)}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                resetSwap();
                                setSwapNearReady(false);
                                setEvmSwapKeypair(null);
                                setActionLoading(false);
                            }}
                            className="text-[11px] text-zinc-600 hover:text-zinc-400 underline"
                        >
                            {tp.cancel}
                        </button>
                    </div>
                )}

                {/* Cross-chain swap progress (Arbitrum/Base via MetaMask — auto-deposit + auto-purchase) */}
                {(isSwapInProgress || (actionLoading && evmSwapKeypair)) && (paymentSelection.chain === 'arb' || paymentSelection.chain === 'base') && (
                    <div className="space-y-2 rounded-lg border border-near-purple/30 bg-near-purple/5 p-4">
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-near-purple" />
                            <span className="text-sm font-medium text-near-purple">
                                {isEvmSending ? tp.swap_confirm_metamask :
                                    actionLoading && evmSwapKeypair && !isSwapInProgress ? tp.swap_purchasing_auto :
                                        swapStatus === 'awaiting_deposit' ? tp.swap_awaiting_deposit :
                                            swapStatus === 'processing' ? tp.swap_processing :
                                                tp.swap_preparing}
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                            {isEvmSending
                                ? tp.swap_confirm_metamask
                                : actionLoading && evmSwapKeypair && !isSwapInProgress
                                    ? tp.swap_purchasing_auto
                                    : swapStatus === 'awaiting_deposit'
                                        ? tp.swap_detecting_metamask.replace('{method}', paymentSelection.method)
                                        : tp.swap_converting_method.replace('{method}', paymentSelection.method)}
                        </p>
                        {evmSwapKeypair && (
                            <p className="text-[10px] text-zinc-600">
                                NEAR account: <span className="font-mono text-zinc-400">{evmSwapKeypair.implicitAccountId.slice(0, 8)}...{evmSwapKeypair.implicitAccountId.slice(-6)}</span>
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                resetSwap();
                                setSwapNearReady(false);
                                setEvmSwapKeypair(null);
                                setActionLoading(false);
                            }}
                            className="text-[11px] text-zinc-600 hover:text-zinc-400 underline"
                        >
                            {tp.cancel}
                        </button>
                    </div>
                )}

                {/* Cost Breakdown (NEAR payments, paid tickets only) */}
                {!isFree && !isCreator && !isStablecoinFlow && !isSwapInProgress && (() => {
                    const costItems = [
                        { label: tp.cost_ticket_price, amount: priceNear },
                        { label: tp.cost_nft_storage, amount: STORAGE_DEPOSIT_NEAR },
                        { label: tp.cost_gas_buffer, amount: GAS_BUFFER_NEAR },
                    ];
                    const total = costItems.reduce((sum, item) => sum + item.amount, 0);

                    return (
                        <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowCostBreakdown(!showCostBreakdown)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                            >
                                <span>{tp.total_wallet_cost}: ~{total.toFixed(2)} Ⓝ</span>
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
                                        <span>{tp.cost_total}</span>
                                        <span className="font-mono">{total.toFixed(2)} Ⓝ</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-600 pt-1">
                                        {tp.cost_refund_note}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Post-swap: 1Click delivered native NEAR, waiting for user to click to finish */}
                {swapNearReady && (
                    <div className="space-y-3 rounded-lg border border-near-green/30 bg-near-green/5 p-4">
                        <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-near-green" />
                            <span className="text-sm font-medium text-near-green">
                                {tp.swap_complete}
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                            {tp.swap_complete_desc}
                        </p>
                        <Button
                            onClick={evmSwapKeypair
                                ? () => handleImplicitAccountPurchase(evmSwapKeypair.secretKey, evmSwapKeypair.implicitAccountId)
                                : handleNearPurchase
                            }
                            disabled={actionLoading}
                            className="w-full h-10 bg-gradient-to-r from-near-green to-emerald-500 hover:from-near-green/90 hover:to-emerald-500/90 text-near-black font-bold text-sm rounded-xl"
                        >
                            {actionLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    {tp.completing_purchase}
                                </>
                            ) : (
                                <>
                                    <Ticket className="h-4 w-4 mr-2" />
                                    {tp.complete_purchase}
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* Error Message */}
                {(error || swapError) && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-400">{error || swapError}</p>
                    </div>
                )}

                {/* Action Button */}
                {!isCreator && !isSwapInProgress && !swapNearReady && (
                    <>
                        {isPublicFree ? (
                            <div className="space-y-3">
                                <Button
                                    onClick={handleFreeTicketClaim}
                                    disabled={actionLoading}
                                    className="w-full h-12 bg-gradient-to-r from-near-green to-emerald-500 hover:from-near-green/90 hover:to-emerald-500/90 text-near-black font-bold text-base rounded-xl shadow-lg shadow-near-green/20 transition-all duration-300"
                                >
                                    {actionLoading ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                            {t.watch_page.processing_claim}
                                        </>
                                    ) : (
                                        <>
                                            <Ticket className="h-5 w-5 mr-2" />
                                            {!accountId ? t.watch_page.test_account_claim : t.watch_page.claim_and_watch}
                                        </>
                                    )}
                                </Button>
                                <p className="text-xs text-zinc-400 text-center">
                                    {t.watch_page.public_free_claim_helper}
                                </p>
                            </div>
                        ) : crossChainEnabled && isStablecoinFlow && isEvmChain && !isEvmConnected ? (
                            <Button
                                onClick={connectMetaMask}
                                disabled={actionLoading}
                                className="w-full h-12 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-500/90 hover:to-amber-500/90 text-white font-bold text-base rounded-xl shadow-lg shadow-orange-500/20 transition-all duration-300"
                            >
                                <Wallet className="h-5 w-5 mr-2" />
                                {tp.connect_metamask}
                            </Button>
                        ) : (
                            <Button
                                onClick={isFree ? handleFreeTicketClaim : handlePurchase}
                                disabled={actionLoading}
                                className="w-full h-12 bg-gradient-to-r from-near-green to-emerald-500 hover:from-near-green/90 hover:to-emerald-500/90 text-near-black font-bold text-base rounded-xl shadow-lg shadow-near-green/20 transition-all duration-300"
                            >
                                {actionLoading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                        {tp.processing}
                                    </>
                                ) : (
                                    <>
                                        <Ticket className="h-5 w-5 mr-2" />
                                        {isFree
                                            ? t.watch_page.claim_free_ticket
                                            : crossChainEnabled && isStablecoinFlow && isEvmChain
                                                ? `${tp.pay_with_metamask} • ${paymentSelection.method}`
                                                : crossChainEnabled && isStablecoinFlow
                                                    ? `${tp.pay_with} ${paymentSelection.method}`
                                                    : eventDetails.priceUsdCents
                                                        ? `${tp.buy_ticket} • $${(eventDetails.priceUsdCents / 100).toFixed(2)}`
                                                        : `${tp.buy_ticket} • ${nearToUsdStr(priceNear)}`
                                        }
                                    </>
                                )}
                            </Button>
                        )}
                    </>
                )}

                {/* Creator Watch Button */}
                {isCreator && (
                    <Button
                        onClick={() => window.location.href = `/watch?cid=${cid}`}
                        className="w-full h-12 bg-gradient-to-r from-zinc-700 to-zinc-600 hover:from-zinc-600 hover:to-zinc-500 text-white font-bold text-base rounded-xl"
                    >
                        <Play className="h-5 w-5 mr-2" />
                        {tp.watch_your_video}
                    </Button>
                )}
            </div>
        </div>
    );
}
