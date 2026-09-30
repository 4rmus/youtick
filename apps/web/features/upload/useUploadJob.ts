'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { hasTitleContent } from '../../../../protocol/paid-media-livepeer-v1/title';
import { useWallet } from '@/components/providers/WalletProvider';
import { FEATURE_FLAGS } from '@/lib/constants';
import { startVideoMeasurement } from '@/lib/video-measurements';
import {
    publicationPollIntervalMs,
    restoreUploadStage,
    transitionUploadStage,
    type UploadStage,
} from '@/lib/livepeer-upload-state';
import {
    loadActivePaymentCheckout,
    multiAssetPaymentsEnabled,
    updateActivePaymentCheckoutState,
    verifyConvertedUsdcReady,
} from '@/lib/multi-asset-payments';
import {
    readLivepeerMediaJob,
    readLivepeerUploadProgress,
    waitForAuthorizedLivepeerJob,
} from '@/lib/livepeer-publication';
import {
    advanceLivepeerUploadDraftStage,
    authorizeLivepeerPaidJob,
    cancelLivepeerUpload,
    clearLivepeerJobSessionKey,
    clearLivepeerUploadDraft,
    configuredCreatorFeeGasReserveYocto,
    createLivepeerJobId,
    fingerprintLivepeerSource,
    heartbeatLivepeerUploadLease,
    livepeerUploadFeeUsdc,
    parseLivepeerPriceUsdc,
    preflightLivepeerUpload,
    prepareCreatorFeePaymentOptions,
    prepareLivepeerUploadResume,
    readLivepeerUploadDraft,
    readRememberedLivepeerUploadJob,
    requestLivepeerUploadIntent,
    sponsoredUploadPaymentOptionsChanged,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    type CreatorFeeAsset,
    type LivepeerUploadIntent,
    type SignedNearCreatorFeeQuote,
    type SponsoredUploadQuoteSummary,
} from '@/lib/livepeer-upload';
import {
    fileValidationMessage,
    findMatchingUploadCheckout,
    formatMicroUsdc,
    getLivepeerPublicationView,
    recordTransferSample,
    transferStats,
    uploadErrorMessage,
    uploadPercent,
    uploadStepStates,
    type TransferSample,
} from './upload-job';

export type UploadPaymentOptions = {
    usable: CreatorFeeAsset[];
    usdcFee: string;
    nearQuote?: SignedNearCreatorFeeQuote;
    sponsoredUsdc: boolean;
};

export function useUploadJob() {
    const { accountId, connect, getWallet, isReady } = useWallet();
    // The React.useState order is observed by existing tests; append new state at the end.
    const [file, setFile] = React.useState<File | null>(null);
    const [fileError, setFileError] = React.useState<string | null>(null);
    const [title, setTitle] = React.useState('');
    const [price, setPrice] = React.useState('2.00');
    const [jobId, setJobId] = React.useState<string | null>(null);
    const [trackedUpload, setTrackedUpload] = React.useState<{ accountId: string; jobId: string } | null>(null);
    const [rightsAccepted, setRightsAccepted] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [resumeAvailable, setResumeAvailable] = React.useState(false);
    const operation = React.useRef<AbortController | null>(null);
    const [uploadStage, setUploadStage] = React.useState<UploadStage>('draft');
    const [failedStep, setFailedStep] = React.useState<number | null>(null);
    const [uploadProgress, setUploadProgress] = React.useState(0);
    const previewRef = React.useRef<HTMLVideoElement>(null);
    const [payment, setPayment] = React.useState<UploadPaymentOptions | null>(null);
    const [paymentAsset, setPaymentAsset] = React.useState<CreatorFeeAsset | null>(null);
    const [sponsorQuote, setSponsorQuote] = React.useState<SponsoredUploadQuoteSummary | null>(null);
    const fileSelectionVersion = React.useRef(0);
    const [transferSamples, setTransferSamples] = React.useState<TransferSample[]>([]);
    const moveUploadStage = React.useCallback((next: UploadStage) => {
        setUploadStage((current) => transitionUploadStage(current, next));
    }, []);
    const resetProgress = () => {
        setUploadProgress(0);
        setTransferSamples([]);
    };
    const uploaded = uploadStage === 'provider_processing' || uploadStage === 'published';
    const publicationPollingEnabled = Boolean(uploaded && jobId && accountId);
    const publicationQuery = useQuery({
        queryKey: ['livepeerUploadPublication', accountId, jobId],
        queryFn: async () => {
            if (!jobId) throw new Error('livepeer_job_missing');
            const progress = await readLivepeerUploadProgress(jobId, accountId || undefined);
            if (progress.publication || progress.expired || !(FEATURE_FLAGS.publicTestnetBeta || FEATURE_FLAGS.publicTestnetVideoV1)) {
                return { ...progress, providerState: null };
            }
            if (!file || !accountId) throw new Error('livepeer_upload_status_unavailable');
            const source = validateLivepeerSourceFile(file);
            if (!source.ok) throw new Error(source.error);
            try {
                const provider = await requestLivepeerUploadIntent({
                    accountId, jobId, generation: 1, expectedSourceBytes: file.size,
                    sourceFingerprintSha256: await fingerprintLivepeerSource(file),
                    sourceType: source.sourceType, recovery: 'reconcile',
                });
                return { ...progress, providerState: provider.state };
            } catch (error) {
                if (error instanceof Error && error.message === 'on_chain_job_mismatch') {
                    // Finalization can win between the Web read and the Bridge read.
                    const current = await readLivepeerUploadProgress(jobId, accountId).catch(() => null);
                    if (current?.publication?.publication_id === jobId
                        && current.publication.creator_id === accountId
                        && current.publication.generation === 1 && current.publication.availability === 'ACTIVE') {
                        return { ...current, providerState: null };
                    }
                }
                throw error;
            }
        },
        enabled: publicationPollingEnabled,
        retry: false,
        refetchInterval: (query) => query.state.status === 'success' && query.state.data?.publication
            ? false
            : publicationPollIntervalMs(
                query.state.dataUpdateCount + query.state.fetchFailureCount,
            ),
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    });
    const publicationView = getLivepeerPublicationView(publicationQuery);
    const publicationReady = publicationView.kind === 'published';
    const publicationExpired = publicationView.kind === 'expired';
    const displayedStage = uploaded && !publicationReady ? 'provider_processing' : uploadStage;
    const displayedFailedStep = uploaded ? publicationView.failed ? 3 : null : failedStep;
    const displayedStatus = uploaded ? publicationView.message : status;

    React.useEffect(() => {
        const preview = previewRef.current;
        if (!file || !preview) return;
        const url = URL.createObjectURL(file);
        preview.src = url;
        return () => {
            preview.removeAttribute('src');
            preview.load();
            URL.revokeObjectURL(url);
        };
    }, [file]);

    React.useEffect(() => {
        const abort = () => operation.current?.abort();
        window.addEventListener('pagehide', abort);
        return () => { abort(); window.removeEventListener('pagehide', abort); };
    }, []);

    React.useEffect(() => {
        operation.current?.abort();
        operation.current = null;
        setBusy(false);
        setResumeAvailable(false);
        fileSelectionVersion.current += 1;
        const trackedJobId = accountId
            ? new URL(window.location.href).searchParams.get('job') || readRememberedLivepeerUploadJob(accountId)
            : null;
        setTrackedUpload(accountId && trackedJobId ? { accountId, jobId: trackedJobId } : null);
        setJobId(null);
        setStatus(null);
        setError(null);
        moveUploadStage('draft');
        setFailedStep(null);
        setUploadProgress(0);
        setTransferSamples([]);
        setPayment(null);
        setPaymentAsset(null);
        setSponsorQuote(null);
    }, [accountId, moveUploadStage]);

    React.useEffect(() => {
        if (!publicationPollingEnabled || !accountId || !publicationReady) return;
        clearLivepeerUploadDraft(accountId);
        if (jobId) clearLivepeerJobSessionKey(accountId, jobId);
        moveUploadStage('published');
        setFailedStep(null);
        setError(null);
    }, [accountId, jobId, moveUploadStage, publicationPollingEnabled, publicationReady]);

    const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        operation.current?.abort();
        operation.current = null;
        setBusy(false);
        setResumeAvailable(false);
        const selectionVersion = ++fileSelectionVersion.current;
        const selected = event.target.files?.[0] || null;
        setError(null);
        moveUploadStage('draft');
        setFailedStep(null);
        resetProgress();
        setPayment(null);
        setPaymentAsset(null);
        setSponsorQuote(null);
        setJobId(null);
        if (typeof selected !== 'object' || !(selected instanceof File)) {
            setFile(null);
            return setFileError(null);
        }
        setFile(selected);
        const validation = validateLivepeerSourceFile(selected);
        if (!validation.ok) return setFileError(fileValidationMessage(validation.error));
        setFileError(null);
        const draft = accountId ? await readLivepeerUploadDraft(accountId, selected) : null;
        if (selectionVersion !== fileSelectionVersion.current) return;
        setJobId(draft?.jobId || null);
        if (draft) {
            setResumeAvailable(Boolean(FEATURE_FLAGS.publicTestnetVideoV1
                && (draft.stage !== 'payment_pending' || draft.paymentAttempted || draft.keyReplacementPending)));
            setTitle(draft.title);
            setPrice(draft.price);
            moveUploadStage(restoreUploadStage(draft.stage));
        }
    };

    const preparePayment = async () => {
        if (!accountId || !file || fileError || !hasTitleContent(title.trim()) || !rightsAccepted) return;
        if (operation.current) return;
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setError(null);
        setFailedStep(null);
        moveUploadStage('draft');
        moveUploadStage('preflight');
        setStatus('Checking payment options…');
        let finishPreparation: ReturnType<typeof startVideoMeasurement> | undefined;
        try {
            parseLivepeerPriceUsdc(price);
            const activeJobId = jobId || createLivepeerJobId();
            finishPreparation = startVideoMeasurement('payment_preparation', file.size);
            setJobId(activeJobId);
            writeLivepeerUploadDraft(accountId, {
                schema: 'youtick.livepeer-ui-draft.v2',
                stage: 'payment_pending',
                jobId: activeJobId,
                title: title.trim(),
                price,
                sourceBytes: file.size,
                sourceName: file.name,
                sourceLastModified: file.lastModified,
                sourceFingerprintSha256: await fingerprintLivepeerSource(file),
            });
            controller.signal.throwIfAborted();
            await preflightLivepeerUpload({
                accountId,
                jobId: activeJobId,
                generation: 1,
                expectedSourceBytes: file.size,
            });
            const wallet = await getWallet();
            if ((FEATURE_FLAGS.publicTestnetBeta || FEATURE_FLAGS.publicTestnetVideoV1)
                && typeof wallet.signDelegateActions !== 'function') {
                throw new Error('sponsored_upload_wallet_unsupported');
            }
            const uploadFeeUsdc = livepeerUploadFeeUsdc(file.size);
            const activeCheckout = loadActivePaymentCheckout(accountId);
            const matchingCheckout = multiAssetPaymentsEnabled
                && Boolean(findMatchingUploadCheckout(activeCheckout, uploadFeeUsdc, file.size));
            const sponsoredUsdc = FEATURE_FLAGS.enableSponsoredLivepeerUploads
                && typeof wallet.signDelegateActions === 'function'
                && !matchingCheckout;
            const options = await prepareCreatorFeePaymentOptions({
                accountId,
                jobId: activeJobId,
                expectedSourceBytes: file.size,
                gasReserveYocto: configuredCreatorFeeGasReserveYocto(),
                gasSponsoredUsdc: sponsoredUsdc,
            });
            if (!options.selected && !multiAssetPaymentsEnabled) {
                throw new Error('creator_fee_balance_or_gas_insufficient');
            }
            controller.signal.throwIfAborted();
            setPayment({ ...options, sponsoredUsdc });
            setPaymentAsset(options.selected);
            setSponsorQuote(null);
            moveUploadStage('payment_required');
            setStatus(null);
            finishPreparation('completed');
        } catch (reason) {
            if (controller.signal.aborted) return;
            finishPreparation?.('failed');
            setFailedStep(0);
            setError(uploadErrorMessage(reason, false));
        } finally {
            if (operation.current === controller) { operation.current = null; setBusy(false); }
        }
    };

    const transfer = async (intent: LivepeerUploadIntent, controller: AbortController) => {
        if (!file || !accountId || !jobId) throw new Error('livepeer_job_missing');
        controller.signal.throwIfAborted();
        advanceLivepeerUploadDraftStage(accountId, jobId, 'upload_ready');
        moveUploadStage('upload_ready');
        advanceLivepeerUploadDraftStage(accountId, jobId, 'uploading');
        moveUploadStage('uploading');
        setStatus('Uploading directly to Livepeer…');
        await uploadLivepeerSource(file, intent, {
            signal: controller.signal,
            onProgress: (sent, total) => {
                if (controller.signal.aborted) return;
                setUploadProgress(uploadPercent(sent, total));
                setTransferSamples((samples) => recordTransferSample(samples, { sent, atMs: Date.now() }));
            },
            heartbeat: () => heartbeatLivepeerUploadLease({ accountId, intent, signal: controller.signal }),
        });
        controller.signal.throwIfAborted();
        advanceLivepeerUploadDraftStage(accountId, jobId, 'provider_processing');
        setUploadProgress(100);
        setResumeAvailable(false);
        moveUploadStage('provider_processing');
        setStatus('Upload complete. Waiting for Livepeer processing…');
    };

    const start = async () => {
        if (!accountId || !file || fileError || !hasTitleContent(title.trim()) || !rightsAccepted || !jobId || !payment || !paymentAsset) return;
        if (operation.current) return;
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setError(null);
        setFailedStep(null);
        let activeStep = 1;
        let availabilityConfirmed = false;
        let convertedCheckout = false;
        try {
            const source = validateLivepeerSourceFile(file);
            if (!source.ok) throw new Error(source.error);
            if (!payment.usable.includes(paymentAsset)) throw new Error('creator_fee_asset_unavailable');
            if (paymentAsset === 'NEAR' && (!payment.nearQuote || BigInt(payment.nearQuote.quote.expires_at_ms) <= BigInt(Date.now()))) {
                setPayment(null);
                setPaymentAsset(null);
                setSponsorQuote(null);
                throw new Error('near_creator_fee_quote_expired');
            }
            const existingJob = await readLivepeerMediaJob(jobId);
            controller.signal.throwIfAborted();
            if (existingJob?.status === 'Published') {
                clearLivepeerUploadDraft(accountId);
                clearLivepeerJobSessionKey(accountId, jobId);
                moveUploadStage('published');
                setStatus('Publication ready.');
                await publicationQuery.refetch();
                return;
            }
            controller.signal.throwIfAborted();
            if (FEATURE_FLAGS.publicTestnetVideoV1 && existingJob) {
                setResumeAvailable(true);
                throw new Error('livepeer_resume_required');
            }
            setStatus('Checking upload availability…');
            await preflightLivepeerUpload({
                accountId,
                jobId,
                generation: 1,
                expectedSourceBytes: file.size,
            });
            controller.signal.throwIfAborted();
            availabilityConfirmed = true;
            moveUploadStage('payment_pending');
            setStatus('Authorizing the paid job…');
            const wallet = await getWallet();
            const conversionExpectation = {
                purpose: { type: 'upload' as const, expected_source_bytes: String(file.size) },
                requiredUsdcMicro: payment.usdcFee,
            };
            const activeCheckout = paymentAsset === 'USDC'
                ? loadActivePaymentCheckout(accountId)
                : null;
            const matchingCheckout = multiAssetPaymentsEnabled
                ? findMatchingUploadCheckout(activeCheckout, payment.usdcFee, file.size)
                : null;
            if (sponsoredUploadPaymentOptionsChanged(
                payment.sponsoredUsdc,
                Boolean(matchingCheckout),
            )) {
                setPayment(null);
                setPaymentAsset(null);
                setSponsorQuote(null);
                activeStep = 0;
                throw new Error('creator_fee_payment_options_changed');
            }
            if (matchingCheckout?.state === 'usdc_final') {
                const ready = await verifyConvertedUsdcReady({
                    accountId,
                    requiredUsdcMicro: payment.usdcFee,
                    status: 'SUCCESS',
                });
                if (!ready) throw new Error('payment_converted_usdc_not_ready');
                convertedCheckout = updateActivePaymentCheckoutState(
                    accountId,
                    conversionExpectation,
                    'core_pending',
                ) !== null;
            } else if (matchingCheckout?.state === 'core_pending') {
                convertedCheckout = true;
            }
            const uploadPublicKey = await authorizeLivepeerPaidJob(wallet, {
                accountId,
                jobId,
                title: title.trim(),
                priceUsdc: parseLivepeerPriceUsdc(price),
                expectedSourceBytes: file.size,
                asset: paymentAsset,
                nearQuote: payment.nearQuote,
                allowSponsoredUsdc: payment.sponsoredUsdc && !matchingCheckout,
                signal: controller.signal,
                onSponsoredQuote: async (quote) => {
                    controller.signal.throwIfAborted();
                    setSponsorQuote(quote);
                    setStatus(`Confirm the ${formatMicroUsdc(quote.totalFeeUsdc)} USDC total in your wallet.`);
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                },
            });
            controller.signal.throwIfAborted();
            setStatus('Waiting for the payment to finalize…');
            await waitForAuthorizedLivepeerJob(jobId, accountId, uploadPublicKey);
            controller.signal.throwIfAborted();
            advanceLivepeerUploadDraftStage(accountId, jobId, 'authorized');
            moveUploadStage('authorized');
            if (convertedCheckout) {
                updateActivePaymentCheckoutState(accountId, conversionExpectation, 'complete');
                convertedCheckout = false;
            }
            activeStep = 2;
            moveUploadStage('intent_pending');
            resetProgress();
            setStatus('Preparing the Livepeer upload…');
            const intent = await requestLivepeerUploadIntent({
                accountId,
                jobId,
                generation: 1,
                expectedSourceBytes: file.size,
                sourceFingerprintSha256: await fingerprintLivepeerSource(file),
                sourceType: source.sourceType,
                signal: controller.signal,
            });
            await transfer(intent, controller);
        } catch (reason) {
            if (controller.signal.aborted) return;
            if (convertedCheckout && accountId && file && payment) {
                updateActivePaymentCheckoutState(accountId, {
                    purpose: { type: 'upload', expected_source_bytes: String(file.size) },
                    requiredUsdcMicro: payment.usdcFee,
                }, 'usdc_final');
            }
            if (FEATURE_FLAGS.publicTestnetVideoV1 && file) {
                const draft = await readLivepeerUploadDraft(accountId, file);
                if (!controller.signal.aborted && draft?.paymentAttempted) setResumeAvailable(true);
            }
            if (controller.signal.aborted) return;
            setFailedStep(activeStep);
            setStatus(null);
            setError(uploadErrorMessage(reason, availabilityConfirmed));
        } finally {
            if (operation.current === controller) { operation.current = null; setBusy(false); }
        }
    };

    const resume = async () => {
        if (!accountId || !jobId || !file || operation.current) return;
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setError(null);
        setFailedStep(null);
        setStatus('Checking your existing upload…');
        try {
            const result = await prepareLivepeerUploadResume(await getWallet(), { accountId, jobId, file, signal: controller.signal });
            controller.signal.throwIfAborted();
            moveUploadStage('draft');
            if ('state' in result) {
                moveUploadStage('provider_processing');
                setResumeAvailable(false);
                await publicationQuery.refetch();
            } else {
                moveUploadStage('authorized');
                moveUploadStage('intent_pending');
                await transfer(result, controller);
            }
        } catch (reason) {
            if (controller.signal.aborted) return;
            if (reason instanceof Error && reason.message === 'livepeer_already_published') {
                moveUploadStage('published');
                setResumeAvailable(false);
                clearLivepeerUploadDraft(accountId);
                clearLivepeerJobSessionKey(accountId, jobId);
                setStatus('Publication ready.');
                await publicationQuery.refetch();
            } else {
                const publicationError = getLivepeerPublicationView({ isError: true, error: reason });
                setError(publicationError.kind === 'unknown_error'
                    ? uploadErrorMessage(reason, true) : publicationError.message);
                setStatus(null);
            }
        } finally {
            if (operation.current === controller) { operation.current = null; setBusy(false); }
        }
    };

    const cancel = async () => {
        if (!accountId || !jobId || uploadStage !== 'authorized' || operation.current) return;
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setError(null);
        setStatus('Cancelling the upload job…');
        try {
            await cancelLivepeerUpload({ accountId, jobId, generation: 1, signal: controller.signal });
            controller.signal.throwIfAborted();
            clearLivepeerJobSessionKey(accountId, jobId);
            clearLivepeerUploadDraft(accountId);
            setJobId(null);
            setPayment(null);
            setPaymentAsset(null);
            setSponsorQuote(null);
            setFailedStep(null);
            resetProgress();
            moveUploadStage('draft');
            setStatus('Upload job cancelled. The technical-pilot fee is non-refundable.');
        } catch (reason) {
            if (controller.signal.aborted) return;
            setStatus(null);
            setError(reason instanceof Error ? reason.message : 'Upload job could not be cancelled.');
        } finally {
            if (operation.current === controller) { operation.current = null; setBusy(false); }
        }
    };

    const formReady = Boolean(accountId && file && !fileError && hasTitleContent(title.trim()) && price.trim() && rightsAccepted);

    return {
        accountId,
        connect,
        getWallet,
        isReady,
        file,
        fileError,
        title,
        setTitle,
        price,
        setPrice,
        rightsAccepted,
        setRightsAccepted,
        jobId,
        trackedUpload,
        status,
        error,
        busy,
        resumeAvailable,
        uploadStage,
        uploadProgress,
        previewRef,
        payment,
        paymentAsset,
        setPaymentAsset,
        sponsorQuote,
        publicationView,
        publicationReady,
        publicationExpired,
        uploaded,
        displayedStage,
        displayedFailedStep,
        displayedStatus,
        stepStates: uploadStepStates(displayedStage, displayedFailedStep),
        transfer: transferStats(transferSamples, file?.size ?? 0),
        uploadFeeUsdc: file && !fileError ? livepeerUploadFeeUsdc(file.size) : null,
        formReady,
        selectFile,
        preparePayment,
        start,
        resume,
        cancel,
    };
}
