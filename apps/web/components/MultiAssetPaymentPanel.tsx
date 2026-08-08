'use client';

import React from 'react';
import { CheckCircle2, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUsdc } from '@/lib/livepeer-publication';
import {
    clearActivePaymentCheckout,
    listPaymentAssets,
    loadActivePaymentCheckout,
    multiAssetPaymentMode,
    multiAssetPaymentsEnabled,
    paymentCheckoutState,
    readPaymentPreflight,
    readPaymentStatus,
    registerUsdcAccount,
    requestPaymentQuote,
    saveActivePaymentCheckout,
    verifyConvertedUsdcReady,
    type ActivePaymentCheckout,
    type PaymentAsset,
    type PaymentPreflight,
    type PaymentPurpose,
    type PaymentQuoteResponse,
} from '@/lib/multi-asset-payments';
import type { WalletInstance } from '@/lib/types';

type Props = {
    accountId: string;
    getWallet(): Promise<WalletInstance>;
    purpose: PaymentPurpose;
    requiredUsdcMicro: string;
    disabled?: boolean;
    onUsdcReady?(): void;
};

export function MultiAssetPaymentPanel({
    accountId,
    getWallet,
    purpose,
    requiredUsdcMicro,
    disabled = false,
    onUsdcReady,
}: Props) {
    const [assets, setAssets] = React.useState<PaymentAsset[]>([]);
    const [assetId, setAssetId] = React.useState('');
    const [refundAddress, setRefundAddress] = React.useState('');
    const [preview, setPreview] = React.useState<PaymentQuoteResponse | null>(null);
    const [checkout, setCheckout] = React.useState<ActivePaymentCheckout | null>(null);
    const [preflight, setPreflight] = React.useState<PaymentPreflight | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const readyCallback = React.useRef(onUsdcReady);
    readyCallback.current = onUsdcReady;
    const checkoutRef = React.useRef<ActivePaymentCheckout | null>(null);
    checkoutRef.current = checkout;
    const purposeKey = purpose.type === 'ticket'
        ? `ticket:${purpose.publication_id}`
        : `upload:${purpose.expected_source_bytes}`;

    React.useEffect(() => {
        let disposed = false;
        setPreview(null);
        setPreflight(null);
        setError(null);
        const active = loadActivePaymentCheckout(accountId);
        if (active) {
            setCheckout(active);
            const matchesCurrent = checkoutMatches(active, purposeKey, requiredUsdcMicro);
            if (!matchesCurrent) {
                setError(purposeIdentity(active.quote.purpose) === purposeKey
                    ? 'payment_amount_changed'
                    : 'another_payment_checkout_active');
            } else if (active.state === 'usdc_final') {
                void verifyConvertedUsdcReady({
                    accountId,
                    requiredUsdcMicro,
                    status: 'SUCCESS',
                }).then((ready) => {
                    if (disposed) return;
                    if (ready) readyCallback.current?.();
                    else setError('payment_converted_usdc_not_ready');
                }).catch((reason) => {
                    if (!disposed) setError(errorCode(reason));
                });
            }
        } else {
            setCheckout(null);
        }
        if (multiAssetPaymentsEnabled) {
            void listPaymentAssets()
                .then((response) => {
                    if (disposed) return;
                    setAssets(response.assets);
                    setAssetId((current) => current || response.assets[0]?.asset_id || '');
                })
                .catch((reason) => {
                    if (!disposed) setError(errorCode(reason));
                });
        }
        return () => { disposed = true; };
    }, [accountId, purposeKey, requiredUsdcMicro]);

    const pollingQuoteIdentity = checkout
        && ['awaiting_deposit', 'converting', 'quoted'].includes(checkout.state)
        ? checkout.quote.quote_response.signature
        : null;
    React.useEffect(() => {
        if (!pollingQuoteIdentity) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            const current = checkoutRef.current;
            if (!current
                || current.quote.quote_response.signature !== pollingQuoteIdentity
                || !['awaiting_deposit', 'converting', 'quoted'].includes(current.state)) return;
            const depositAddress = current.quote.quote_response.quote.depositAddress;
            if (!depositAddress) return;
            const depositMemo = current.quote.quote_response.quote.depositMemo;
            try {
                const status = await readPaymentStatus(depositAddress, depositMemo);
                if (status.quote_response.signature !== current.quote.quote_response.signature) {
                    throw new Error('invalid_payment_status_response');
                }
                const usdcReady = await verifyConvertedUsdcReady({
                    accountId,
                    requiredUsdcMicro: current.required_usdc_micro,
                    status: status.status,
                });
                const state = paymentCheckoutState(status.status, usdcReady);
                if (disposed) return;
                if (state !== current.state) {
                    const now = Date.now();
                    const updated = saveActivePaymentCheckout({
                        account_id: current.account_id,
                        required_usdc_micro: current.required_usdc_micro,
                        state,
                        quote: current.quote,
                        created_at_ms: current.created_at_ms,
                        updated_at_ms: now,
                    }, now);
                    checkoutRef.current = updated;
                    setCheckout(updated);
                }
                if (state === 'usdc_final') {
                    if (checkoutMatches(current, purposeKey, requiredUsdcMicro)) {
                        setError(null);
                        readyCallback.current?.();
                    }
                    return;
                }
                if (status.status === 'SUCCESS') {
                    setError('payment_converted_usdc_not_ready');
                } else if (checkoutMatches(current, purposeKey, requiredUsdcMicro)) {
                    setError(null);
                }
                if (!['refunded', 'failed'].includes(state)) timer = setTimeout(poll, 5_000);
            } catch (reason) {
                if (disposed) return;
                setError(errorCode(reason));
                timer = setTimeout(poll, 5_000);
            }
        };
        void poll();
        return () => {
            disposed = true;
            if (timer) clearTimeout(timer);
        };
    }, [accountId, pollingQuoteIdentity, purposeKey, requiredUsdcMicro]);

    if (!multiAssetPaymentsEnabled && !checkout) return null;

    const selectedAsset = assets.find((asset) => asset.asset_id === assetId);
    const shownQuote = checkout?.quote ?? preview;
    const estimate = shownQuote?.quote_response.quote.timeEstimate;
    const routeSlow = typeof estimate === 'number' && estimate > 600;

    const getPreview = async () => {
        if (!assetId || !refundAddress.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const quote = await requestPaymentQuote({
                accountId,
                originAssetId: assetId,
                refundAddress: refundAddress.trim(),
                purpose,
                dry: true,
            });
            requireCurrentAmount(quote, requiredUsdcMicro);
            setPreview(quote);
        } catch (reason) {
            setError(errorCode(reason));
        } finally {
            setBusy(false);
        }
    };

    const prepareAccount = async () => {
        if (!preflight) return;
        setBusy(true);
        setError(null);
        try {
            await registerUsdcAccount(await getWallet(), accountId, preflight.storageMinYocto);
            const next = await waitForPreflight(accountId, requiredUsdcMicro);
            setPreflight(next);
            if (!next.userRegistered) throw new Error('payment_usdc_registration_pending');
            if (!next.marketRegistered) throw new Error('payment_market_usdc_not_registered');
            if (!next.gasSufficient) throw new Error('payment_gas_reserve_insufficient');
        } catch (reason) {
            setError(errorCode(reason));
        } finally {
            setBusy(false);
        }
    };

    const createDeposit = async () => {
        if (!assetId || !refundAddress.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const nextPreflight = await readPaymentPreflight(accountId, requiredUsdcMicro);
            setPreflight(nextPreflight);
            if (!nextPreflight.marketRegistered) throw new Error('payment_market_usdc_not_registered');
            if (!nextPreflight.gasSufficient) throw new Error('payment_gas_reserve_insufficient');
            if (!nextPreflight.userRegistered) return;
            if (nextPreflight.usdcSufficient) {
                readyCallback.current?.();
                return;
            }
            const quote = await requestPaymentQuote({
                accountId,
                originAssetId: assetId,
                refundAddress: refundAddress.trim(),
                purpose,
                dry: false,
            });
            requireCurrentAmount(quote, requiredUsdcMicro);
            const now = Date.now();
            const active = saveActivePaymentCheckout({
                account_id: accountId,
                required_usdc_micro: quote.amount_out_usdc,
                state: 'awaiting_deposit',
                quote,
                created_at_ms: now,
                updated_at_ms: now,
            }, now);
            setCheckout(active);
            setPreview(null);
        } catch (reason) {
            setError(errorCode(reason));
        } finally {
            setBusy(false);
        }
    };

    const resetTerminal = () => {
        clearActivePaymentCheckout(accountId);
        setCheckout(null);
        setPreview(null);
        setPreflight(null);
        setError(null);
    };

    return (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 text-left">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-medium text-white">Convert another asset · 2 approvals</p>
                    <p className="mt-1 text-xs text-zinc-400">The conversion lands as USDC in your NEAR account. You approve the existing USDC payment afterwards.</p>
                </div>
                {checkout && ['usdc_final', 'complete', 'refunded', 'failed'].includes(checkout.state) && (
                    <Button type="button" variant="ghost" size="sm" onClick={resetTerminal}>
                        {multiAssetPaymentsEnabled ? 'New quote' : 'Dismiss'}
                    </Button>
                )}
            </div>

            {!checkout && multiAssetPaymentsEnabled && (
                <div className="mt-4 space-y-3">
                    <label className="block text-xs text-zinc-300">
                        Asset
                        <select
                            aria-label="Asset to convert"
                            className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                            value={assetId}
                            disabled={disabled || busy || assets.length === 0}
                            onChange={(event) => {
                                setAssetId(event.target.value);
                                setPreview(null);
                            }}
                        >
                            {assets.map((asset) => (
                                <option key={asset.asset_id} value={asset.asset_id}>{asset.network} · {asset.symbol}</option>
                            ))}
                        </select>
                    </label>
                    {selectedAsset && (
                        <p className="break-all text-xs text-zinc-500">Token: {selectedAsset.contract_address}</p>
                    )}
                    <Input
                        aria-label="Refund address"
                        placeholder="Refund address on the source network"
                        value={refundAddress}
                        disabled={disabled || busy}
                        onChange={(event) => {
                            setRefundAddress(event.target.value);
                            setPreview(null);
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        disabled={disabled || busy || !assetId || !refundAddress.trim()}
                        onClick={() => void getPreview()}
                    >
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Preview conversion
                    </Button>
                </div>
            )}

            {shownQuote && <QuoteDetails quote={shownQuote} />}

            {!checkout && preview && multiAssetPaymentMode === 'preview' && (
                <p className="mt-3 text-xs text-amber-300">Preview only. No deposit address will be created.</p>
            )}
            {!checkout && preview && multiAssetPaymentMode === 'live' && (
                <Button
                    type="button"
                    className="mt-3"
                    disabled={disabled || busy || routeSlow}
                    onClick={() => void createDeposit()}
                >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create deposit address
                </Button>
            )}
            {routeSlow && <p className="mt-3 text-xs text-amber-300">This route is temporarily too slow for checkout.</p>}

            {preflight && preflight.marketRegistered && preflight.gasSufficient && !preflight.userRegistered && (
                <div className="mt-3 rounded-lg border border-amber-700/50 p-3">
                    <p className="text-xs text-amber-200">Your NEAR account needs a one-time USDC registration before conversion.</p>
                    <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void prepareAccount()}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Prepare USDC account
                    </Button>
                </div>
            )}

            {checkout?.quote.quote_response.quote.depositAddress && (
                <div className="mt-4 space-y-3 rounded-lg border border-zinc-700 p-3">
                    <CopyField label="Deposit address" value={checkout.quote.quote_response.quote.depositAddress} />
                    {checkout.quote.quote_response.quote.depositMemo && (
                        <CopyField label="Memo" value={checkout.quote.quote_response.quote.depositMemo} />
                    )}
                    <p role="status" className="flex items-center gap-2 text-xs text-zinc-300">
                        {['usdc_final', 'complete'].includes(checkout.state)
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            : <RefreshCw className={`h-4 w-4 ${['quoted', 'awaiting_deposit', 'converting', 'core_pending'].includes(checkout.state) ? 'animate-spin' : ''}`} />}
                        {checkoutStateLabel(checkout.state)}
                    </p>
                </div>
            )}

            {error && <p role="alert" className="mt-3 text-xs text-red-400">{paymentErrorMessage(error)}</p>}
        </div>
    );
}

function QuoteDetails({ quote }: { quote: PaymentQuoteResponse }) {
    const value = quote.quote_response.quote;
    const request = quote.quote_response.quoteRequest;
    return (
        <dl className="mt-4 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
            <div><dt className="text-zinc-500">Network</dt><dd>{quote.origin_asset.network}</dd></div>
            <div><dt className="text-zinc-500">Token contract</dt><dd className="break-all">{quote.origin_asset.contract_address}</dd></div>
            <div><dt className="text-zinc-500">Send</dt><dd>{formatAssetAmount(value.amountIn, quote.origin_asset.decimals)} {quote.origin_asset.symbol}</dd></div>
            <div><dt className="text-zinc-500">Receive</dt><dd>{formatUsdc(value.amountOut)} USDC</dd></div>
            <div><dt className="text-zinc-500">Estimated time</dt><dd>{typeof value.timeEstimate === 'number' ? `${value.timeEstimate}s` : 'Unavailable'}</dd></div>
            <div><dt className="text-zinc-500">Deadline</dt><dd>{value.deadline ? new Date(value.deadline).toLocaleString() : 'Set on firm quote'}</dd></div>
            <div><dt className="text-zinc-500">Refund fee</dt><dd>{value.refundFee ?? '0'} base units</dd></div>
            <div><dt className="text-zinc-500">Withdrawal fee</dt><dd>{value.withdrawFee ?? '0'} base units</dd></div>
            <div><dt className="text-zinc-500">Refund address</dt><dd className="break-all">{String(request?.refundTo || 'Unavailable')}</dd></div>
            <div><dt className="text-zinc-500">App fee</dt><dd>None</dd></div>
            <div><dt className="text-zinc-500">Slippage limit</dt><dd>1%</dd></div>
        </dl>
    );
}

function CopyField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-zinc-500">{label}</p>
            <div className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all text-xs text-zinc-200">{value}</code>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Copy ${label.toLowerCase()}`}
                    onClick={() => void navigator.clipboard.writeText(value).catch(() => undefined)}
                >
                    <Copy className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

async function waitForPreflight(accountId: string, requiredUsdcMicro: string): Promise<PaymentPreflight> {
    let result = await readPaymentPreflight(accountId, requiredUsdcMicro);
    for (const delay of [1_000, 2_000, 4_000]) {
        if (result.userRegistered) return result;
        await new Promise((resolve) => setTimeout(resolve, delay));
        result = await readPaymentPreflight(accountId, requiredUsdcMicro);
    }
    return result;
}

function requireCurrentAmount(quote: PaymentQuoteResponse, expected: string): void {
    if (quote.amount_out_usdc !== expected) throw new Error('payment_amount_changed');
}

function purposeIdentity(purpose: PaymentPurpose): string {
    return purpose.type === 'ticket'
        ? `ticket:${purpose.publication_id}`
        : `upload:${purpose.expected_source_bytes}`;
}

function checkoutMatches(
    checkout: ActivePaymentCheckout,
    purposeKey: string,
    requiredUsdcMicro: string,
): boolean {
    return purposeIdentity(checkout.quote.purpose) === purposeKey
        && checkout.required_usdc_micro === requiredUsdcMicro;
}

function formatAssetAmount(value: string, decimals: number): string {
    const amount = BigInt(value);
    const scale = 10n ** BigInt(decimals);
    const whole = amount / scale;
    const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}

function checkoutStateLabel(state: ActivePaymentCheckout['state']): string {
    if (state === 'awaiting_deposit') return 'Waiting for the source transfer.';
    if (state === 'converting') return 'Converting to USDC…';
    if (state === 'usdc_final') return 'USDC is ready. Continue with the existing payment.';
    if (state === 'core_pending') return 'The USDC payment is finalizing…';
    if (state === 'complete') return 'Payment completed.';
    if (state === 'refunded') return 'The source transfer was refunded.';
    if (state === 'failed') return 'The conversion failed.';
    return 'Conversion status updated.';
}

function errorCode(reason: unknown): string {
    return reason instanceof Error ? reason.message : 'payment_unknown_error';
}

function paymentErrorMessage(code: string): string {
    if (code === 'another_payment_checkout_active' || code === 'payment_checkout_active') {
        return 'Another conversion is active for this NEAR account. Complete it before starting a new one.';
    }
    if (code === 'payment_market_usdc_not_registered' || code === 'payment_usdc_contract_mismatch') {
        return 'Payments are temporarily unavailable because the USDC setup does not match the market.';
    }
    if (code === 'payment_gas_reserve_insufficient') {
        return 'Keep enough NEAR in this account for the final USDC payment and one-time setup.';
    }
    if (code === 'payment_amount_changed') {
        return 'The payment amount changed. Review it before creating another conversion.';
    }
    if (code === 'payment_route_temporarily_unavailable') {
        return 'This conversion route is temporarily unavailable. Try another asset.';
    }
    if (code === 'payment_usdc_registration_pending') {
        return 'USDC registration is still syncing. Try again shortly.';
    }
    if (code === 'payment_converted_usdc_not_ready') {
        return 'The conversion finished, but the final USDC balance or NEAR gas reserve is not ready.';
    }
    if (code === 'payment_mode_mismatch') {
        return 'Conversion is temporarily unavailable because the web and payment service modes do not match.';
    }
    return 'The conversion could not be prepared. Check the asset and refund address, then try again.';
}
