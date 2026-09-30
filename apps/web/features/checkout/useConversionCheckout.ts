'use client';

import React from 'react';
import {
    clearActivePaymentCheckout,
    listPaymentAssets,
    loadActivePaymentCheckout,
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
import {
    CONVERSION_POLLING_STATES,
    checkoutMatches,
    errorCode,
    isRouteTooSlow,
    purposeIdentity,
    requireCurrentAmount,
    waitForPreflight,
} from './conversion-checkout';

export type ConversionCheckoutInput = {
    accountId: string;
    getWallet(): Promise<WalletInstance>;
    purpose: PaymentPurpose;
    requiredUsdcMicro: string;
    onUsdcReady?(): void;
};

export function useConversionCheckout({
    accountId,
    getWallet,
    purpose,
    requiredUsdcMicro,
    onUsdcReady,
}: ConversionCheckoutInput) {
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
    const purposeKey = purposeIdentity(purpose);

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

    const pollingQuoteIdentity = checkout && CONVERSION_POLLING_STATES.includes(checkout.state)
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
                || !CONVERSION_POLLING_STATES.includes(current.state)) return;
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

    const selectedAsset = assets.find((asset) => asset.asset_id === assetId);
    const shownQuote = checkout?.quote ?? preview;
    const routeSlow = isRouteTooSlow(shownQuote?.quote_response.quote.timeEstimate);

    const selectAsset = (next: string) => {
        setAssetId(next);
        setPreview(null);
    };

    const changeRefundAddress = (next: string) => {
        setRefundAddress(next);
        setPreview(null);
    };

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

    return {
        enabled: multiAssetPaymentsEnabled,
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
        selectAsset,
        changeRefundAddress,
        getPreview,
        prepareAccount,
        createDeposit,
        resetTerminal,
    };
}
