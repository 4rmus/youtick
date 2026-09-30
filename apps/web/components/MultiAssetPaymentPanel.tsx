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
import { useLocale } from '@/lib/i18n/I18nProvider';
import { messages, type Messages } from '@/lib/i18n/messages';

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
    const locale = useLocale();
    const t = messages[locale].conversion;
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
                    <p className="font-medium text-white">{t.title}</p>
                    <p className="mt-1 text-xs text-zinc-400">{t.description}</p>
                </div>
                {checkout && CONVERSION_TERMINAL_STATES.includes(checkout.state) && (
                    <Button type="button" variant="ghost" size="sm" onClick={conversion.resetTerminal}>
                        {enabled ? t.newQuote : t.dismiss}
                    </Button>
                )}
            </div>

            {!checkout && enabled && (
                <div className="mt-4 space-y-3">
                    <label className="block text-xs text-zinc-300">
                        {t.asset}
                        <select
                            aria-label={t.assetLabel}
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
                        <p className="break-all text-xs text-zinc-500">{t.token(selectedAsset.contract_address)}</p>
                    )}
                    <Input
                        aria-label={t.refundLabel}
                        placeholder={t.refundPlaceholder}
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
                        {t.preview}
                    </Button>
                </div>
            )}

            {shownQuote && <QuoteDetails quote={shownQuote} t={t} />}

            {!checkout && preview && multiAssetPaymentMode === 'preview' && (
                <p className="mt-3 text-xs text-amber-300">{t.previewOnly}</p>
            )}
            {!checkout && preview && multiAssetPaymentMode === 'live' && (
                <Button
                    type="button"
                    className="mt-3"
                    disabled={disabled || busy || routeSlow}
                    onClick={() => void conversion.createDeposit()}
                >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t.createDeposit}
                </Button>
            )}
            {routeSlow && <p className="mt-3 text-xs text-amber-300">{t.routeSlow}</p>}

            {preflight && preflight.marketRegistered && preflight.gasSufficient && !preflight.userRegistered && (
                <div className="mt-3 rounded-lg border border-amber-700/50 p-3">
                    <p className="text-xs text-amber-200">{t.registrationNeeded}</p>
                    <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void conversion.prepareAccount()}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t.prepareAccount}
                    </Button>
                </div>
            )}

            {checkout?.quote.quote_response.quote.depositAddress && (
                <div className="mt-4 space-y-3 rounded-lg border border-zinc-700 p-3">
                    <CopyField label={t.depositAddress} copyLabel={t.copy(t.depositAddress)} value={checkout.quote.quote_response.quote.depositAddress} />
                    {checkout.quote.quote_response.quote.depositMemo && (
                        <CopyField label={t.memo} copyLabel={t.copy(t.memo)} value={checkout.quote.quote_response.quote.depositMemo} />
                    )}
                    <p role="status" className="flex items-center gap-2 text-xs text-zinc-300">
                        {CONVERSION_READY_STATES.includes(checkout.state)
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            : <RefreshCw className={`h-4 w-4 ${CONVERSION_WAITING_STATES.includes(checkout.state) ? 'animate-spin' : ''}`} />}
                        {checkoutStateLabel(checkout.state, locale)}
                    </p>
                </div>
            )}

            {error && <p role="alert" className="mt-3 text-xs text-red-400">{paymentErrorMessage(error, locale)}</p>}
        </div>
    );
}

function QuoteDetails({ quote, t }: { quote: PaymentQuoteResponse; t: Messages['conversion'] }) {
    const value = quote.quote_response.quote;
    const request = quote.quote_response.quoteRequest;
    const labels = t.quote;
    return (
        <dl className="mt-4 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
            <div><dt className="text-zinc-500">{labels.network}</dt><dd>{quote.origin_asset.network}</dd></div>
            <div><dt className="text-zinc-500">{labels.tokenContract}</dt><dd className="break-all">{quote.origin_asset.contract_address}</dd></div>
            <div><dt className="text-zinc-500">{labels.send}</dt><dd>{formatAssetAmount(value.amountIn, quote.origin_asset.decimals)} {quote.origin_asset.symbol}</dd></div>
            <div><dt className="text-zinc-500">{labels.receive}</dt><dd>{formatUsdc(value.amountOut)} USDC</dd></div>
            <div><dt className="text-zinc-500">{labels.estimatedTime}</dt><dd>{typeof value.timeEstimate === 'number' ? `${value.timeEstimate}s` : labels.unavailable}</dd></div>
            <div><dt className="text-zinc-500">{labels.deadline}</dt><dd>{value.deadline ? new Date(value.deadline).toLocaleString() : labels.setOnFirmQuote}</dd></div>
            <div><dt className="text-zinc-500">{labels.refundFee}</dt><dd>{labels.baseUnits(value.refundFee ?? '0')}</dd></div>
            <div><dt className="text-zinc-500">{labels.withdrawalFee}</dt><dd>{labels.baseUnits(value.withdrawFee ?? '0')}</dd></div>
            <div><dt className="text-zinc-500">{labels.refundAddress}</dt><dd className="break-all">{String(request?.refundTo || labels.unavailable)}</dd></div>
            <div><dt className="text-zinc-500">{labels.appFee}</dt><dd>{labels.none}</dd></div>
            <div><dt className="text-zinc-500">{labels.slippage}</dt><dd>1%</dd></div>
        </dl>
    );
}

function CopyField({ label, copyLabel, value }: { label: string; copyLabel: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-zinc-500">{label}</p>
            <div className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all text-xs text-zinc-200">{value}</code>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copyLabel}
                    onClick={() => void navigator.clipboard.writeText(value).catch(() => undefined)}
                >
                    <Copy className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
