import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
    type PaymentMethod,
    type ChainId,
    type SwapQuote,
    CHAIN_CONFIG,
    getSupportedChains,
    getDryQuote,
} from '@/lib/intents';
import { FEATURE_FLAGS } from '@/lib/constants';
import { getNearPrice, formatUsdCents } from '@/lib/price';
import { quoteNearToUsdc } from '@/lib/rhea/client';
import { useLanguage } from '@/components/providers/LanguageContext';

interface PaymentMethodSelectorProps {
    /** Ticket price in NEAR (as a number) */
    priceNear: number;
    /** Ticket price in USDC 6-decimal units. Null = not USDC-priced */
    priceUsdc: number | null;
    /** Ticket price in USD cents (if set by creator). Null = calculate from NEAR price */
    priceUsdCents: number | null;
    /** NEAR account ID of the buyer. Cross-chain checkout requires this during Near Connect migration. */
    accountId?: string;
    /** Called when payment method or chain changes */
    onSelectionChange: (selection: {
        method: PaymentMethod;
        chain: ChainId;
        quote: SwapQuote | null;
        estimatedNear: number;
        rheaQuoteError: string | null;
    }) => void;
}

const TOKEN_OPTIONS: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'NEAR', label: 'NEAR', icon: 'N' },
    { value: 'USDC', label: 'USDC', icon: '$' },
    { value: 'USDT', label: 'USDT', icon: '$' },
];

export function PaymentMethodSelector({
    priceNear,
    priceUsdc,
    priceUsdCents,
    accountId,
    onSelectionChange,
}: PaymentMethodSelectorProps) {
    const { t } = useLanguage();
    const p = t.payment_method_selector;
    const crossChainEnabled = FEATURE_FLAGS.enableCrossChainCheckout && !!accountId;
    const hasUsdcPrice = !!priceUsdc && priceUsdc > 0;
    const [method, setMethod] = useState<PaymentMethod>('NEAR');
    const [chain, setChain] = useState<ChainId>('near');
    const [nearPrice, setNearPrice] = useState<number>(0);
    const [quote, setQuote] = useState<SwapQuote | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [rheaQuoteNear, setRheaQuoteNear] = useState<string | null>(null);
    const [rheaQuoteLoading, setRheaQuoteLoading] = useState(false);
    const [rheaQuoteError, setRheaQuoteError] = useState<string | null>(null);

    // Fetch NEAR/USD price on mount
    useEffect(() => {
        getNearPrice().then(setNearPrice);
    }, []);

    // Calculate USD price. V1 prefers the contract's USDC price when present.
    const usdCents = priceUsdc
        ? Math.ceil(priceUsdc / 10_000)
        : priceUsdCents ?? (nearPrice > 0 ? Math.round(priceNear * nearPrice * 100) : 0);

    // Fetch dry quote when stablecoin is selected (cross-chain only).
    // Cross-chain checkout is shown only after a real NEAR wallet is connected.
    const fetchQuote = useCallback(async () => {
        if (method === 'NEAR' || chain === 'near' || usdCents === 0 || !crossChainEnabled || !accountId) {
            setQuote(null);
            return;
        }

        setQuoteLoading(true);
        setQuoteError(null);

        try {
            // Cross-chain V1 settles into NEAR-native USDC before mint.
            const destinationAsset = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
            const dryQuote = await getDryQuote(method, chain, usdCents, accountId, destinationAsset);
            setQuote(dryQuote);
        } catch (err) {
            setQuoteError(err instanceof Error ? err.message : p.quote_failed);
            setQuote(null);
        } finally {
            setQuoteLoading(false);
        }
    }, [method, chain, usdCents, accountId, crossChainEnabled, p.quote_failed]);

    useEffect(() => {
        fetchQuote();
    }, [fetchQuote]);

    useEffect(() => {
        let cancelled = false;

        if (method !== 'NEAR' || !priceUsdc || priceUsdc <= 0 || !crossChainEnabled) {
            setRheaQuoteNear(null);
            setRheaQuoteError(null);
            setRheaQuoteLoading(false);
            return;
        }

        setRheaQuoteLoading(true);
        setRheaQuoteError(null);

        quoteNearToUsdc(priceUsdc)
            .then((rheaQuote) => {
                if (cancelled) return;
                setRheaQuoteNear(rheaQuote.amountInNear);
            })
            .catch(() => {
                if (cancelled) return;
                setRheaQuoteNear(null);
                setRheaQuoteError(p.swap_unavailable);
            })
            .finally(() => {
                if (!cancelled) setRheaQuoteLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [method, priceUsdc, crossChainEnabled, p.swap_unavailable]);

    // Notify parent of selection changes
    useEffect(() => {
        const estimatedNear = method === 'NEAR'
            ? rheaQuoteNear ? parseFloat(rheaQuoteNear) : priceNear
            : quote ? parseFloat(quote.amountOutFormatted) : priceNear;

        onSelectionChange({ method, chain, quote, estimatedNear, rheaQuoteError });
    }, [method, chain, quote, priceNear, rheaQuoteNear, rheaQuoteError, onSelectionChange]);

    const stablecoinAvailable = hasUsdcPrice || crossChainEnabled;
    const tokenOptions = TOKEN_OPTIONS.filter((opt) => opt.value === 'NEAR' || stablecoinAvailable);
    const availableChains = method !== 'NEAR' ? getSupportedChains(method) : [];

    // Filter chains: if cross-chain disabled, only NEAR chain is available
    const displayChains = crossChainEnabled
        ? availableChains.filter((c) => hasUsdcPrice || c.chainId !== 'near')
        : availableChains.filter((c) => c.chainId === 'near' && hasUsdcPrice);
    const firstAvailableChain = displayChains[0]?.chainId;
    const hasSelectedChain = displayChains.some((c) => c.chainId === chain);

    useEffect(() => {
        if (method !== 'NEAR' && (!stablecoinAvailable || displayChains.length === 0)) {
            setMethod('NEAR');
            setChain('near');
            return;
        }

        if (method !== 'NEAR' && firstAvailableChain && !hasSelectedChain) {
            setChain(firstAvailableChain);
        }
    }, [method, stablecoinAvailable, displayChains.length, firstAvailableChain, hasSelectedChain]);

    return (
        <div className="space-y-3">
            {/* Token Selection */}
            <div className="flex gap-1 p-1 bg-black/30 rounded-lg border border-white/10">
                {tokenOptions.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={method === opt.value}
                        onClick={() => {
                            setMethod(opt.value);
                            if (opt.value === 'NEAR') setChain('near');
                            else if (hasUsdcPrice) setChain('near');
                            else setChain('arb');
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green ${
                            method === opt.value
                                ? 'bg-white/10 text-white border border-white/20'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                    </button>
                ))}
            </div>

            {/* Chain Selection (only for stablecoins, cross-chain) */}
            {method !== 'NEAR' && displayChains.length > 0 && crossChainEnabled && (
                <div className="flex gap-1 p-1 bg-black/20 rounded-lg border border-white/5">
                    {displayChains.map((tokenConfig) => {
                        const chainInfo = CHAIN_CONFIG[tokenConfig.chainId];
                        return (
                            <button
                                key={tokenConfig.chainId}
                                type="button"
                                aria-pressed={chain === tokenConfig.chainId}
                                onClick={() => setChain(tokenConfig.chainId)}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green ${
                                    chain === tokenConfig.chainId
                                        ? 'bg-white/10 text-white border border-white/15'
                                        : 'text-zinc-600 hover:text-zinc-400'
                                }`}
                            >
                                <span>{chainInfo.name}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Quote Preview */}
            {method !== 'NEAR' && (
                <div className="rounded-lg bg-black/20 border border-white/5 p-3">
                    {!crossChainEnabled ? (
                        <p className="text-xs text-near-green">
                            {p.direct_transfer.replace('{method}', method)}
                        </p>
                    ) : quoteLoading ? (
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>{p.getting_best_price}</span>
                        </div>
                    ) : quoteError ? (
                        <p className="text-xs text-red-400">{quoteError}</p>
                    ) : quote ? (
                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between text-zinc-400">
                                <span>{p.you_pay}</span>
                                <span className="font-mono text-white">
                                    {quote.amountInFormatted} {method}
                                </span>
                            </div>
                            <div className="flex justify-between text-zinc-400">
                                <span>{p.you_receive}</span>
                                <span className="font-mono text-near-green">
                                    ~{quote.amountOutFormatted} USDC
                                </span>
                            </div>
                            <div className="flex justify-between text-zinc-500">
                                <span>{p.estimated_time}</span>
                                <span className="font-mono">~{quote.timeEstimate}s</span>
                            </div>
                        </div>
                    ) : usdCents > 0 ? (
                        <p className="text-xs text-zinc-500">
                            {p.cross_chain_estimate
                                .replace('{amount}', formatUsdCents(usdCents))
                                .replace('{method}', method)
                                .replace('{chain}', CHAIN_CONFIG[chain].name)}
                        </p>
                    ) : null}
                </div>
            )}

            {/* USD Price Reference */}
            {method === 'NEAR' && priceUsdc && priceUsdc > 0 && (
                <div className="rounded-lg bg-black/20 border border-white/5 p-3">
                    {rheaQuoteLoading ? (
                        <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>{p.getting_rhea_price}</span>
                        </div>
                    ) : rheaQuoteError ? (
                        <p className="text-xs text-red-400 text-center">{rheaQuoteError}</p>
                    ) : rheaQuoteNear ? (
                        <div className="flex justify-between text-xs text-zinc-400">
                            <span>{p.you_pay}</span>
                            <span className="font-mono text-white">~{rheaQuoteNear} NEAR</span>
                        </div>
                    ) : null}
                </div>
            )}

            {nearPrice > 0 && method === 'NEAR' && (
                <p className="text-[11px] text-zinc-600 text-center">
                    {p.usd_reference.replace('{amount}', formatUsdCents(usdCents))}
                </p>
            )}
        </div>
    );
}
