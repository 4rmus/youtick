'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clapperboard, Loader2 } from 'lucide-react';
import { ScreenState } from '@/components/ScreenState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FEATURE_FLAGS, NEAR_CONFIG } from '@/lib/constants';
import { formatUsdc, readLivepeerUploadProgress } from '@/lib/livepeer-publication';
import {
    LIVEPEER_SOURCE_ACCEPT,
    advanceLivepeerUploadDraftStage,
    clearLivepeerJobSessionKey,
    clearLivepeerUploadDraft,
    createLivepeerJobId,
    fingerprintLivepeerSource,
    heartbeatLivepeerUploadLease,
    livepeerUploadFeeUsdc,
    parseLivepeerPriceUsdc,
    preflightLivepeerUpload,
    requestLivepeerUploadIntent,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    type LivepeerUploadIntent,
} from '@/lib/livepeer-upload';
import { readAccessKey } from '@/lib/v2/near-reads';
import { authorizeV2PaidJob, MIN_TICKET_PRICE_USDC, prepareV2UploadResume, TERMINAL_UPLOAD_STATES, UploadError } from '@/lib/v2/upload';
import { useNearAuthV2 } from './NearAuthV2Provider';
import { SignInPanel } from './SignInPanel';

const ERRORS: Record<string, string> = {
    empty_file: 'Choose a video file first.',
    unsupported_video_type: 'This file type is not supported. Use MP4, MOV, WebM or MKV.',
    source_limit_exceeded: 'This file is larger than the upload limit.',
    invalid_title: 'Give the screening a title of up to 200 characters.',
    invalid_ticket_price: 'The ticket price must be at least 5 USDC.',
    insufficient_balance: 'Your youtick balance does not cover the upload fee.',
    near_auth_login_cancelled: 'The payment was not approved.',
    near_auth_access_denied: 'The payment was not approved.',
    approval_rejected: 'The payment was not approved. Please try again.',
    approval_expired: 'The approval expired. Please try again.',
    delegate_stale: 'The approval expired. Please try again.',
    identity_limit_reached: 'You have reached today’s upload limit.',
    daily_limit_reached: 'Uploads are paused for today. Please try again tomorrow.',
    rate_limited: 'Too many attempts. Please wait a minute and try again.',
    uploads_paused: 'Uploads are paused right now. Please try again later.',
    admission_closed: 'Your account is not enabled for uploads yet. Ask for an invite first.',
    admission_denied: 'Uploads are busy right now. Please try again in a few minutes.',
    job_conflict: 'This upload id is already in use. Reload the page and start again.',
    upload_not_confirmed: 'The fee was returned, so no upload was created. Please try again.',
    upload_pending: 'Your payment is still being processed. Wait a minute, then use Resume.',
    livepeer_processing_timeout: 'The fee is paid and the video is still being processed. Leave this page and come back later; Resume shows where it stands.',
    livepeer_upload_expired: 'This upload expired before the video was processed. The fee is not refunded; start a new upload.',
    livepeer_provider_failed: 'The video could not be processed. The fee is not refunded; start a new upload with another file.',
    provider_recovery_not_ready: 'This upload cannot be resumed from here. Start a new upload.',
    livepeer_resume_required: 'This upload was already paid. Use Resume to continue it.',
    livepeer_already_published: 'This screening is already published.',
    livepeer_resume_file_mismatch: 'Choose the same file you started this upload with.',
    account_not_ready: 'Your youtick account is still being set up. Please try again in a minute.',
    popup_blocked: 'Your browser blocked the approval window. Allow pop-ups for this site and try again.',
};

type Step = 'idle' | 'paying' | 'uploading' | 'processing' | 'published' | 'error';

function message(error: unknown): string {
    const code = error instanceof UploadError || error instanceof Error ? error.message : '';
    return ERRORS[code] ?? `The upload did not complete (${code || 'unknown'}). Nothing was published; please try again.`;
}

export function UploadForm() {
    const { config, session, view } = useNearAuthV2();
    const signedIn = session.status === 'signed_in';
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('5');
    const [step, setStep] = useState<Step>('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [resumable, setResumable] = useState(false);
    const operation = useRef<AbortController | null>(null);
    useEffect(() => () => operation.current?.abort(), []);

    const balance = useQuery({
        queryKey: ['v2UsdcBalance', signedIn ? session.accountId : null],
        queryFn: () => view<string>(NEAR_CONFIG.usdcContractId, 'ft_balance_of', { account_id: (session as { accountId: string }).accountId }),
        enabled: signedIn,
    });
    const fee = file ? (() => { try { return livepeerUploadFeeUsdc(file.size); } catch { return null; } })() : null;
    const enough = fee !== null && balance.data !== undefined && BigInt(balance.data) >= BigInt(fee);

    // The V1 upload client signs its Bridge envelopes with NEAR_CONFIG.marketContractId; V2 uploads
    // need that to be Market V2, which the V2 web environment sets.
    const configured = FEATURE_FLAGS.enablePaidMediaLivepeerV1 && NEAR_CONFIG.marketContractId === config.marketContractId;

    const fail = useCallback((reason: unknown) => {
        setStep('error');
        setError(message(reason));
    }, []);

    /** Livepeer processing and the Bridge's on-chain publication; the chain is the only source of truth. */
    const awaitPublication = useCallback(async (accountId: string, activeJobId: string, controller: AbortController) => {
        setProgress(100);
        setStep('processing');
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const state = await readLivepeerUploadProgress(activeJobId, accountId).catch(() => null);
            controller.signal.throwIfAborted();
            if (state?.publication) {
                clearLivepeerUploadDraft(accountId);
                clearLivepeerJobSessionKey(accountId, activeJobId);
                setResumable(false);
                setStep('published');
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
        // The fee stays paid and the job stays resumable; only this page stops waiting.
        throw new UploadError('livepeer_processing_timeout');
    }, []);

    const transfer = useCallback(async (accountId: string, activeJobId: string, intent: LivepeerUploadIntent, controller: AbortController) => {
        if (!file) throw new UploadError('empty_file');
        setStep('uploading');
        advanceLivepeerUploadDraftStage(accountId, activeJobId, 'uploading');
        await uploadLivepeerSource(file, intent, {
            signal: controller.signal,
            onProgress: (sent, total) => { if (!controller.signal.aborted) setProgress(total > 0 ? Math.min(99, Math.floor(sent / total * 100)) : 0); },
            heartbeat: () => heartbeatLivepeerUploadLease({ accountId, intent, signal: controller.signal }),
        });
        controller.signal.throwIfAborted();
        advanceLivepeerUploadDraftStage(accountId, activeJobId, 'provider_processing');
        await awaitPublication(accountId, activeJobId, controller);
    }, [file, awaitPublication]);

    async function start() {
        if (!signedIn || !file || operation.current) return;
        // Opened in the click handler so the browser does not block the approval window.
        const popup = window.open('about:blank', 'youtick-near-auth', 'width=480,height=720');
        if (!popup) return fail(new UploadError('popup_blocked'));
        const controller = new AbortController();
        operation.current = controller;
        setError('');
        setProgress(0);
        const accountId = session.accountId;
        try {
            const source = validateLivepeerSourceFile(file);
            if (!source.ok) throw new UploadError(source.error);
            const priceUsdc = parseLivepeerPriceUsdc(price);
            if (BigInt(priceUsdc) < MIN_TICKET_PRICE_USDC) throw new UploadError('invalid_ticket_price');
            const activeJobId = jobId ?? createLivepeerJobId();
            setJobId(activeJobId);
            writeLivepeerUploadDraft(accountId, {
                schema: 'youtick.livepeer-ui-draft.v2', stage: 'payment_pending', jobId: activeJobId, title: title.trim(), price,
                sourceBytes: file.size, sourceName: file.name, sourceLastModified: file.lastModified,
                sourceFingerprintSha256: await fingerprintLivepeerSource(file),
            });
            await preflightLivepeerUpload({ accountId, jobId: activeJobId, generation: 1, expectedSourceBytes: file.size });
            setStep('paying');
            await authorizeV2PaidJob({
                config, usdcContractId: NEAR_CONFIG.usdcContractId, session: { accountId, publicKey: session.publicKey },
                jobId: activeJobId, title, priceUsdc, expectedSourceBytes: file.size, popup, redirectUri: window.location.origin,
                deps: { view, accessKey: readAccessKey }, signal: controller.signal,
            });
            setResumable(true);
            advanceLivepeerUploadDraftStage(accountId, activeJobId, 'authorized');
            void balance.refetch();
            const intent = await requestLivepeerUploadIntent({
                accountId, jobId: activeJobId, generation: 1, expectedSourceBytes: file.size,
                sourceFingerprintSha256: await fingerprintLivepeerSource(file), sourceType: source.sourceType, signal: controller.signal,
            });
            await transfer(accountId, activeJobId, intent, controller);
        } catch (reason) {
            if (!popup.closed) popup.close();
            if (!controller.signal.aborted) fail(reason);
        } finally {
            if (operation.current === controller) operation.current = null;
        }
    }

    async function resume() {
        if (!signedIn || !file || !jobId || operation.current) return;
        const popup = window.open('about:blank', 'youtick-near-auth', 'width=480,height=720');
        if (!popup) return fail(new UploadError('popup_blocked'));
        const controller = new AbortController();
        operation.current = controller;
        setError('');
        setStep('paying');
        try {
            const result = await prepareV2UploadResume({
                config, session: { accountId: session.accountId, publicKey: session.publicKey }, jobId, file, popup,
                redirectUri: window.location.origin, deps: { view, accessKey: readAccessKey }, signal: controller.signal,
            });
            if ('state' in result) {
                if (result.state === 'ONCHAIN_PUBLISHED') {
                    await awaitPublication(session.accountId, jobId, controller);
                } else if (TERMINAL_UPLOAD_STATES.includes(result.state)) {
                    // Nothing more can happen on this job; the next attempt is a new job.
                    setResumable(false);
                    setJobId(null);
                    throw new UploadError(result.state === 'PROVIDER_FAILED' ? 'livepeer_provider_failed' : 'livepeer_upload_expired');
                } else {
                    // Source received; only Livepeer processing and the Bridge's publication remain.
                    await awaitPublication(session.accountId, jobId, controller);
                }
            } else {
                await transfer(session.accountId, jobId, result, controller);
            }
        } catch (reason) {
            if (!popup.closed) popup.close();
            if (!controller.signal.aborted) fail(reason);
        } finally {
            if (operation.current === controller) operation.current = null;
        }
    }

    if (!configured) {
        return <ScreenState icon={<Clapperboard className="h-7 w-7" />} title="Uploads are not open here"
            description="This environment is not configured for V2 uploads." />;
    }
    if (!signedIn) {
        return <ScreenState icon={<Clapperboard className="h-7 w-7" />} title="Upload a screening"
            description="Sign in with Google or a passkey. The upload fee is paid from your youtick balance with one approval; no wallet is needed.">
            <div className="mt-6 flex justify-center"><SignInPanel /></div>
        </ScreenState>;
    }
    if (step === 'published') {
        return <ScreenState tone="success" icon={<CheckCircle2 className="h-7 w-7" />} title="Your screening is published"
            description="Fans can buy tickets now.">
            <div className="mt-6 flex justify-center"><Button asChild><Link href={`/tickets/buy?publication=${encodeURIComponent(jobId ?? '')}`}>Open the ticket page</Link></Button></div>
        </ScreenState>;
    }

    const busy = step === 'paying' || step === 'uploading' || step === 'processing';
    return <Card className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Upload a screening</h1>
        <label className="block space-y-1 text-sm">
            <span className="text-white/80">Video file</span>
            <input type="file" accept={LIVEPEER_SOURCE_ACCEPT} disabled={busy || resumable}
                className="block w-full text-sm text-white/70"
                onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} />
        </label>
        <label className="block space-y-1 text-sm">
            <span className="text-white/80">Title</span>
            <input value={title} disabled={busy || resumable} maxLength={200} onChange={(event) => setTitle(event.target.value)}
                className="block w-full rounded-md border border-white/20 bg-transparent px-3 py-2" />
        </label>
        <label className="block space-y-1 text-sm">
            <span className="text-white/80">Ticket price (USDC, VAT included, at least 5)</span>
            <input value={price} disabled={busy || resumable} inputMode="decimal" onChange={(event) => setPrice(event.target.value)}
                className="block w-full rounded-md border border-white/20 bg-transparent px-3 py-2" />
        </label>
        <p className="text-sm text-white/60">
            Upload fee: {fee === null ? '—' : `${formatUsdc(fee)} USDC`} · Your youtick balance: {balance.data === undefined ? '…' : `${formatUsdc(balance.data)} USDC`}
        </p>
        {fee !== null && balance.data !== undefined && !enough && (
            <p className="text-sm text-amber-200">
                Your balance does not cover the fee. On testnet, send test USDC to your account <code className="break-all">{session.accountId}</code>.
            </p>
        )}
        {step === 'uploading' && <progress className="w-full" value={progress} max={100} aria-label="Upload progress" />}
        {step === 'processing' && <p className="text-sm text-white/70" role="status">Upload complete. Waiting for processing and publication…</p>}
        <div className="flex flex-wrap gap-3">
            {!resumable && <Button className="min-h-11 gap-2" disabled={busy || !file || !enough} onClick={() => void start()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {step === 'paying' ? 'Waiting for your approval…' : step === 'uploading' ? `Uploading ${progress}%` : step === 'processing' ? 'Processing…' : 'Pay the fee and upload'}
            </Button>}
            {resumable && !busy && <Button className="min-h-11" onClick={() => void resume()}>Resume this upload</Button>}
        </div>
        <p className="text-xs text-white/50">The fee pays for processing and is not refunded. Keep this tab open until the upload finishes.</p>
        {step === 'error' && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </Card>;
}
