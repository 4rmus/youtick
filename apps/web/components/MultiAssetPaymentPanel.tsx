'use client';

import { CheckCircle2, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUsdc } from '@/lib/livepeer-publication';
import { multiAssetPaymentMode, type PaymentPurpose, type PaymentQuoteResponse } from '@/lib/multi-asset-payments';
import type { WalletInstance } from '@/lib/types';
import {
    CONVERSION_READY_STATES,
    CONVERSION_TERMINAL_STATES,
    CONVERSION_WAITING_STATES,
    checkoutStateLabel,
    formatAssetAmount,
    paymentErrorMessage,
} from '@/features/checkout/conversion-checkout';
import { useConversionCheckout } from '@/features/checkout/useConversionCheckout';

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
    const conversion = useConversionCheckout({ accountId, getWallet, purpose, requiredUsdcMicro, onUsdcReady });
    const {
        enabled,
        assets,
        assetId,
        selectedAsset,
        refundAddress,
        preview,
        checkout,
        preflight,
        shownQuote,
        routeSlow,
        busy,
        error,
    } = conversion;

    if (!enabled && !checkout) return null;

    return (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 text-left">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-medium text-white">Convert another asset · 2 approvals</p>
                    <p className="mt-1 text-xs text-zinc-400">The conversion lands as USDC in your NEAR account. You approve the existing USDC payment afterwards.</p>
                </div>
                {checkout && CONVERSION_TERMINAL_STATES.includes(checkout.state) && (
                    <Button type="button" variant="ghost" size="sm" onClick={conversion.resetTerminal}>
                        {enabled ? 'New quote' : 'Dismiss'}
                    </Button>
                )}
            </div>

            {!checkout && enabled && (
                <div className="mt-4 space-y-3">
                    <label className="block text-xs text-zinc-300">
                        Asset
                        <select
                            aria-label="Asset to convert"
                            className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                            value={assetId}
                            disabled={disabled || busy || assets.length === 0}
                            onChange={(event) => conversion.selectAsset(event.target.value)}
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
                        onChange={(event) => conversion.changeRefundAddress(event.target.value)}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        disabled={disabled || busy || !assetId || !refundAddress.trim()}
                        onClick={() => void conversion.getPreview()}
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
                    onClick={() => void conversion.createDeposit()}
                >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create deposit address
                </Button>
            )}
            {routeSlow && <p className="mt-3 text-xs text-amber-300">This route is temporarily too slow for checkout.</p>}

            {preflight && preflight.marketRegistered && preflight.gasSufficient && !preflight.userRegistered && (
                <div className="mt-3 rounded-lg border border-amber-700/50 p-3">
                    <p className="text-xs text-amber-200">Your NEAR account needs a one-time USDC registration before conversion.</p>
                    <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void conversion.prepareAccount()}>
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
                        {CONVERSION_READY_STATES.includes(checkout.state)
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            : <RefreshCw className={`h-4 w-4 ${CONVERSION_WAITING_STATES.includes(checkout.state) ? 'animate-spin' : ''}`} />}
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
