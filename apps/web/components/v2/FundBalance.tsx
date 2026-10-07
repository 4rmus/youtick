'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { CopyField, paymentErrorMessage, QuoteDetails } from '@/components/MultiAssetPaymentPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listPaymentAssets, multiAssetPaymentMode, readPaymentStatus, type PaymentQuoteResponse } from '@/lib/multi-asset-payments';
import { fundingStep, quoteTicketFunding, type FundingStep } from '@/lib/v2/funding';

const STATUS_POLL_MS = 5_000;

const STEP_LABELS: Record<FundingStep, string> = {
    awaiting_deposit: 'Waiting for your deposit…',
    converting: 'Converting to USDC…',
    funded: 'Your balance covers the ticket.',
    refunded: 'The deposit was refunded to your refund address.',
    failed: 'The conversion failed. Any deposit is refunded to your refund address.',
};

/**
 * Tops up the user's youtick balance (USDC in their own NEAR Auth account) from another token
 * through 1Click. Nothing is stored: if the page is reloaded, the converted USDC still arrives in
 * the account and the balance shows it.
 */
export function FundBalance({ accountId, publicationId, balanceCoversPrice, refreshBalance }: {
    accountId: string;
    publicationId: string;
    balanceCoversPrice: boolean;
    refreshBalance: () => void;
}) {
    const assets = useQuery({ queryKey: ['v2PaymentAssets'], queryFn: listPaymentAssets, staleTime: 60_000 });
    const [assetId, setAssetId] = useState('');
    const [refundAddress, setRefundAddress] = useState('');
    const [preview, setPreview] = useState<PaymentQuoteResponse | null>(null);
    const [deposit, setDeposit] = useState<PaymentQuoteResponse | null>(null);
    const [step, setStep] = useState<FundingStep>('awaiting_deposit');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const depositAddress = deposit?.quote_response.quote.depositAddress;
    const depositMemo = deposit?.quote_response.quote.depositMemo;
    useEffect(() => {
        if (!depositAddress) return;
        let active = true;
        const poll = async () => {
            try {
                const status = await readPaymentStatus(depositAddress, depositMemo);
                if (!active) return;
                if (status.status === 'SUCCESS') refreshBalance();
                setStep(fundingStep(status.status, balanceCoversPrice));
            } catch {
                // A missed poll changes nothing; the next one tries again.
            }
        };
        void poll();
        const timer = setInterval(() => void poll(), STATUS_POLL_MS);
        return () => { active = false; clearInterval(timer); };
    }, [depositAddress, depositMemo, balanceCoversPrice, refreshBalance]);

    async function quote(dry: boolean) {
        setBusy(true);
        setError('');
        try {
            const next = await quoteTicketFunding({ accountId, publicationId, originAssetId: assetId, refundAddress, dry });
            if (dry) setPreview(next);
            else setDeposit(next);
        } catch (failure) {
            setError(paymentErrorMessage(failure instanceof Error ? failure.message : ''));
        } finally {
            setBusy(false);
        }
    }

    if (assets.isLoading) return <p className="text-sm text-white/60" role="status">Loading payment options…</p>;
    if (!assets.data || assets.data.assets.length === 0) {
        return <p className="text-sm text-amber-200">Adding funds is unavailable right now. Please try again later.</p>;
    }
    const selected = assets.data.assets.find((asset) => asset.asset_id === assetId);

    return <section className="space-y-3 rounded-lg border border-white/10 p-4" aria-label="Add funds">
        <h2 className="text-sm font-semibold">Add funds from another token</h2>
        <p className="text-xs text-white/60">
            The ticket price is converted to USDC in your youtick account. You then buy with one approval as usual.
        </p>
        {!deposit && <div className="space-y-3">
            <select
                aria-label="Token to pay with"
                className="min-h-11 w-full rounded-md border border-white/20 bg-transparent px-3 text-sm"
                value={assetId}
                disabled={busy}
                onChange={(event) => { setAssetId(event.target.value); setPreview(null); }}
            >
                <option value="">Choose a token</option>
                {assets.data.assets.map((asset) => <option key={asset.asset_id} value={asset.asset_id}>
                    {asset.symbol} on {asset.network}
                </option>)}
            </select>
            <Input
                aria-label="Refund address"
                placeholder={selected?.network === 'near' ? 'Your NEAR account for refunds' : 'Your 0x address on the source network'}
                value={refundAddress}
                disabled={busy}
                onChange={(event) => { setRefundAddress(event.target.value); setPreview(null); }}
            />
            <Button type="button" variant="outline" className="min-h-11" disabled={busy || !assetId || !refundAddress.trim()}
                onClick={() => void quote(true)}>
                {busy && !preview && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                See the amount
            </Button>
        </div>}

        {(deposit ?? preview) && <QuoteDetails quote={(deposit ?? preview)!} />}

        {!deposit && preview && multiAssetPaymentMode === 'preview' && (
            <p className="text-xs text-amber-200">Preview only. No deposit address is created.</p>
        )}
        {!deposit && preview && multiAssetPaymentMode === 'live' && (
            <Button type="button" className="min-h-11" disabled={busy} onClick={() => void quote(false)}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Get a deposit address
            </Button>
        )}

        {depositAddress && <div className="space-y-3 rounded-lg border border-white/10 p-3">
            <CopyField label="Deposit address" value={depositAddress} />
            {depositMemo && <CopyField label="Memo" value={depositMemo} />}
            <p role="status" className="flex items-center gap-2 text-xs text-white/80">
                {step === 'funded'
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    : <RefreshCw className={`h-4 w-4 ${['awaiting_deposit', 'converting'].includes(step) ? 'animate-spin' : ''}`} aria-hidden="true" />}
                {STEP_LABELS[step]}
            </p>
        </div>}

        {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </section>;
}
