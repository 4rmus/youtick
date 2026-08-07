'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FEATURE_FLAGS } from '@/lib/constants';
import { readLivepeerMediaJob, readLivepeerPublication } from '@/lib/livepeer-publication';
import {
    authorizeLivepeerPaidJob,
    clearLivepeerUploadDraft,
    configuredCreatorFeeGasReserveYocto,
    createLivepeerJobId,
    LIVEPEER_SOURCE_ACCEPT,
    livepeerUploadFeeUsdc,
    parseLivepeerPriceUsdc,
    prepareCreatorFeePaymentOptions,
    readLivepeerUploadDraft,
    requestLivepeerUploadIntent,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    type CreatorFeeAsset,
    type SignedNearCreatorFeeQuote,
} from '@/lib/livepeer-upload';

export function LivepeerPaidUploadForm() {
    const { accountId, connect, getWallet, isReady } = useWallet();
    const [file, setFile] = React.useState<File | null>(null);
    const [fileError, setFileError] = React.useState<string | null>(null);
    const [title, setTitle] = React.useState('');
    const [price, setPrice] = React.useState('2.00');
    const [jobId, setJobId] = React.useState<string | null>(null);
    const [rightsAccepted, setRightsAccepted] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [uploaded, setUploaded] = React.useState(false);
    const [publicationReady, setPublicationReady] = React.useState(false);
    const [payment, setPayment] = React.useState<{
        usable: CreatorFeeAsset[];
        usdcFee: string;
        nearQuote?: SignedNearCreatorFeeQuote;
    } | null>(null);
    const [paymentAsset, setPaymentAsset] = React.useState<CreatorFeeAsset | null>(null);

    React.useEffect(() => {
        setPayment(null);
        setPaymentAsset(null);
    }, [accountId]);

    React.useEffect(() => {
        if (!uploaded || !jobId || !accountId) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const check = async () => {
            try {
                const job = await readLivepeerMediaJob(jobId);
                if (!job) throw new Error('livepeer_job_missing');
                const publication = await readLivepeerPublication(jobId);
                if (disposed) return;
                if (publication) {
                    clearLivepeerUploadDraft(accountId);
                    setPublicationReady(true);
                    setStatus('Publication ready.');
                    return;
                }
                setStatus(job.status === 'Published' ? 'Finalizing publication…' : 'Livepeer is processing the upload…');
            } catch {
                if (!disposed) setStatus('Waiting for the publication status…');
            }
            if (!disposed) timer = setTimeout(check, 5_000);
        };
        void check();
        return () => {
            disposed = true;
            if (timer) clearTimeout(timer);
        };
    }, [accountId, jobId, uploaded]);

    const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] || null;
        setFile(selected);
        setError(null);
        setUploaded(false);
        setPublicationReady(false);
        setPayment(null);
        setPaymentAsset(null);
        if (!selected) return setFileError(null);
        const validation = validateLivepeerSourceFile(selected);
        setFileError(validation.ok ? null : fileValidationMessage(validation.error));
        const draft = accountId ? readLivepeerUploadDraft(accountId, selected) : null;
        setJobId(draft?.jobId || null);
        if (draft) {
            setTitle(draft.title);
            setPrice(draft.price);
        }
    };

    const preparePayment = async () => {
        if (!accountId || !file || fileError || !title.trim() || !rightsAccepted) return;
        setBusy(true);
        setError(null);
        setStatus('Checking payment options…');
        try {
            parseLivepeerPriceUsdc(price);
            const activeJobId = jobId || createLivepeerJobId();
            setJobId(activeJobId);
            writeLivepeerUploadDraft(accountId, {
                jobId: activeJobId,
                title: title.trim(),
                price,
                sourceBytes: file.size,
                sourceName: file.name,
                sourceLastModified: file.lastModified,
            });
            const options = await prepareCreatorFeePaymentOptions({
                accountId,
                jobId: activeJobId,
                expectedSourceBytes: file.size,
                gasReserveYocto: configuredCreatorFeeGasReserveYocto(),
            });
            if (!options.selected) throw new Error('creator_fee_balance_or_gas_insufficient');
            setPayment(options);
            setPaymentAsset(options.selected);
            setStatus(null);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Payment options could not be loaded.');
        } finally {
            setBusy(false);
        }
    };

    const start = async () => {
        if (!accountId || !file || fileError || !title.trim() || !rightsAccepted || !jobId || !payment || !paymentAsset) return;
        setBusy(true);
        setError(null);
        try {
            const source = validateLivepeerSourceFile(file);
            if (!source.ok) throw new Error(source.error);
            if (!payment.usable.includes(paymentAsset)) throw new Error('creator_fee_asset_unavailable');
            if (paymentAsset === 'NEAR' && (!payment.nearQuote || BigInt(payment.nearQuote.quote.expires_at_ms) <= BigInt(Date.now()))) {
                setPayment(null);
                setPaymentAsset(null);
                throw new Error('near_creator_fee_quote_expired');
            }
            const wallet = await getWallet();
            setStatus('Authorizing the paid job…');
            await authorizeLivepeerPaidJob(wallet, {
                accountId,
                jobId,
                title: title.trim(),
                priceUsdc: parseLivepeerPriceUsdc(price),
                expectedSourceBytes: file.size,
                asset: paymentAsset,
                nearQuote: payment.nearQuote,
            });
            const intent = await requestLivepeerUploadIntent({
                accountId,
                jobId,
                generation: 1,
                expectedSourceBytes: file.size,
                sourceType: source.sourceType,
            });
            setStatus('Uploading directly to Livepeer…');
            await uploadLivepeerSource(file, intent, {
                onProgress: (sent, total) => setStatus(`Uploading directly to Livepeer… ${sent}/${total}`),
            });
            setUploaded(true);
            setStatus('Livepeer is processing the upload…');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Upload failed.');
        } finally {
            setBusy(false);
        }
    };

    const formReady = Boolean(accountId && file && !fileError && title.trim() && price.trim() && rightsAccepted);

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <p className="text-sm font-medium text-emerald-300">Livepeer paid media</p>
                <h1 className="mt-2 text-3xl font-semibold">Publish a video</h1>
                <p className="mt-2 text-zinc-400">The browser sends the source directly to Livepeer. NEAR records payment and publication state.</p>
            </div>

            {uploaded && (
                <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{publicationReady ? 'Publication ready' : 'Upload complete; processing'}</AlertTitle>
                    <AlertDescription>A watch link appears only after the publication exists on NEAR.</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Publication</CardTitle>
                    <CardDescription>MP4, MOV, AVI, WebM, WMV, MKV or FLV; maximum 20 GB and minimum ticket price 2 USDC.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Input type="file" accept={LIVEPEER_SOURCE_ACCEPT} disabled={busy || uploaded} onChange={selectFile} />
                    {fileError && <p role="alert" className="text-sm text-red-400">{fileError}</p>}
                    <Input aria-label="Title" placeholder="Title" maxLength={200} value={title} disabled={busy || uploaded} onChange={(event) => setTitle(event.target.value)} />
                    <Input aria-label="Ticket price in USDC" type="number" min="2" step="0.000001" value={price} disabled={busy || uploaded} onChange={(event) => setPrice(event.target.value)} />
                    <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" checked={rightsAccepted} disabled={busy || uploaded} onChange={(event) => setRightsAccepted(event.target.checked)} />
                        <span>I own the rights required to publish this video.</span>
                    </label>

                    {file && !fileError && <p className="text-sm">Creator upload fee: {formatMicroUsdc(livepeerUploadFeeUsdc(file.size))} USDC</p>}
                    {payment && (
                        <div className="space-y-2 text-sm">
                            {payment.usable.map((asset) => (
                                <label key={asset} className="flex items-center gap-2">
                                    <input type="radio" name="creator-fee" checked={paymentAsset === asset} disabled={busy} onChange={() => setPaymentAsset(asset)} />
                                    <span>{asset === 'USDC' ? `${formatMicroUsdc(payment.usdcFee)} USDC` : `${formatYoctoNear(payment.nearQuote!.quote.fee_near_yocto)} NEAR`}</span>
                                </label>
                            ))}
                            {FEATURE_FLAGS.enableLivepeerNearCreatorFee && !payment.nearQuote && <p className="text-xs text-zinc-400">NEAR payment is unavailable; USDC remains available.</p>}
                        </div>
                    )}

                    {!accountId ? (
                        <Button onClick={() => void connect()} disabled={!isReady}>Connect wallet</Button>
                    ) : publicationReady && jobId ? (
                        <Button asChild className="w-full"><Link href={`/watch?job=${encodeURIComponent(jobId)}`}>Open publication</Link></Button>
                    ) : uploaded ? (
                        <Button className="w-full" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing</Button>
                    ) : !payment ? (
                        <Button className="w-full" disabled={!formReady || busy} onClick={() => void preparePayment()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Check payment options</Button>
                    ) : (
                        <Button className="w-full" disabled={!formReady || busy} onClick={() => void start()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Upload</Button>
                    )}
                    {status && <p role="status" className="text-sm text-zinc-400">{status}</p>}
                    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                </CardContent>
            </Card>
        </div>
    );
}

function formatMicroUsdc(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return fraction ? `${amount / 1_000_000n}.${fraction}` : String(amount / 1_000_000n);
}

function fileValidationMessage(error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type'): string {
    if (error === 'empty_file') return 'Choose a non-empty video file.';
    if (error === 'source_limit_exceeded') return 'Choose a video file no larger than 20 GB.';
    return 'Choose an MP4, MOV, AVI, WebM, WMV, MKV or FLV video file.';
}

function formatYoctoNear(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % (10n ** 24n)).toString().padStart(24, '0').replace(/0+$/, '');
    return fraction ? `${amount / (10n ** 24n)}.${fraction}` : String(amount / (10n ** 24n));
}
