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
import { FEATURE_FLAGS, NEAR_CONFIG } from '@/lib/constants';
import { getNearPrice, formatUsdCents } from '@/lib/price';

interface PaymentMethodSelectorProps {
    /** Ticket price in NEAR (as a number) */
    priceNear: number;
    /** Ticket price in USD cents (if set by creator). Null = calculate from NEAR price */
    priceUsdCents: number | null;
    /** NEAR account ID of the buyer (optional — MetaMask-only users may not have one yet) */
    accountId?: string;
    /** Called when payment method or chain changes */
    onSelectionChange: (selection: {
        method: PaymentMethod;
        chain: ChainId;
        quote: SwapQuote | null;
        estimatedNear: number;
    }) => void;
}

const TOKEN_OPTIONS: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'NEAR', label: 'NEAR', icon: 'Ⓝ' },
    { value: 'USDC', label: 'USDC', icon: '💲' },
    { value: 'USDT', label: 'USDT', icon: '💵' },
];

export function PaymentMethodSelector({
    priceNear,
    priceUsdCents,
    accountId,
    onSelectionChange,
}: PaymentMethodSelectorProps) {
    const crossChainEnabled = FEATURE_FLAGS.enableCrossChainCheckout;
    const [method, setMethod] = useState<PaymentMethod>('NEAR');
    const [chain, setChain] = useState<ChainId>('near');
    const [nearPrice, setNearPrice] = useState<number>(0);
    const [quote, setQuote] = useState<SwapQuote | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);

    // Fetch NEAR/USD price on mount
    useEffect(() => {
        getNearPrice().then(setNearPrice);
    }, []);

    // Calculate USD price
    const usdCents = priceUsdCents ?? (nearPrice > 0 ? Math.round(priceNear * nearPrice * 100) : 0);

    // Fetch dry quote when stablecoin is selected
    // For MetaMask-only users (no accountId), use a placeholder NEAR account for the quote
    const fetchQuote = useCallback(async () => {
        if (method === 'NEAR' || usdCents === 0) {
            setQuote(null);
            return;
        }

        setQuoteLoading(true);
        setQuoteError(null);

        try {
            // Use accountId if available, otherwise a placeholder for dry quote estimation
            const quoteRecipient = accountId || NEAR_CONFIG.marketContractId;
            const dryQuote = await getDryQuote(method, chain, usdCents, quoteRecipient);
            setQuote(dryQuote);
        } catch (err) {
            setQuoteError(err instanceof Error ? err.message : 'Failed to get quote');
            setQuote(null);
        } finally {
            setQuoteLoading(false);
        }
    }, [method, chain, usdCents, accountId]);

    useEffect(() => {
        fetchQuote();
    }, [fetchQuote]);

    // Notify parent of selection changes
    useEffect(() => {
        const estimatedNear = method === 'NEAR'
            ? priceNear
            : quote ? parseFloat(quote.amountOutFormatted) : priceNear;

        onSelectionChange({ method, chain, quote, estimatedNear });
    }, [method, chain, quote, priceNear, onSelectionChange]);

    const availableChains = method !== 'NEAR' ? getSupportedChains(method) : [];

    if (!crossChainEnabled) {
        return null;
    }

    return (
        <div className="space-y-3">
            {/* Token Selection */}
            <div className="flex gap-1 p-1 bg-black/30 rounded-lg border border-white/10">
                {TOKEN_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                            setMethod(opt.value);
                            if (opt.value === 'NEAR') setChain('near');
                            else setChain(accountId ? 'near' : 'arb'); // EVM-first for MetaMask-only users
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${
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

            {/* Chain Selection (only for stablecoins) */}
            {method !== 'NEAR' && availableChains.length > 0 && (
                <div className="flex gap-1 p-1 bg-black/20 rounded-lg border border-white/5">
                    {availableChains.map((tokenConfig) => {
                        const chainInfo = CHAIN_CONFIG[tokenConfig.chainId];
                        return (
                            <button
                                key={tokenConfig.chainId}
                                type="button"
                                onClick={() => setChain(tokenConfig.chainId)}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded text-xs font-medium transition-all ${
                                    chain === tokenConfig.chainId
                                        ? 'bg-white/10 text-white border border-white/15'
                                        : 'text-zinc-600 hover:text-zinc-400'
                                }`}
                            >
                                <span>{chainInfo.icon}</span>
                                <span>{chainInfo.name}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Quote Preview */}
            {method !== 'NEAR' && (
                <div className="rounded-lg bg-black/20 border border-white/5 p-3">
                    {quoteLoading ? (
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Getting best price...</span>
                        </div>
                    ) : quoteError ? (
                        <p className="text-xs text-red-400">{quoteError}</p>
                    ) : quote ? (
                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between text-zinc-400">
                                <span>You pay</span>
                                <span className="font-mono text-white">
                                    {quote.amountInFormatted} {method}
                                </span>
                            </div>
                            <div className="flex justify-between text-zinc-400">
                                <span>You receive</span>
                                <span className="font-mono text-near-green">
                                    ~{quote.amountOutFormatted} NEAR
                                </span>
                            </div>
                            <div className="flex justify-between text-zinc-500">
                                <span>Est. time</span>
                                <span className="font-mono">~{quote.timeEstimate}s</span>
                            </div>
                        </div>
                    ) : usdCents > 0 ? (
                        <p className="text-xs text-zinc-500">
                            ~{formatUsdCents(usdCents)} {method} on {CHAIN_CONFIG[chain].name}
                        </p>
                    ) : null}
                </div>
            )}

            {/* USD Price Reference */}
            {nearPrice > 0 && method === 'NEAR' && (
                <p className="text-[11px] text-zinc-600 text-center">
                    ≈ {formatUsdCents(usdCents)} USD
                </p>
            )}
        </div>
    );
}
