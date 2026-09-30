import { FEATURE_FLAGS } from '@/lib/constants';
import type { UploadStage } from '@/lib/livepeer-upload-state';
import type { ActivePaymentCheckout } from '@/lib/multi-asset-payments';
import type { Locale } from '@/lib/i18n/locale';
import { messages } from '@/lib/i18n/messages';

export const UPLOAD_STEPS = messages.en.upload.steps;
export const UPLOAD_EXPIRED_MESSAGE = messages.en.upload.publication.expiredMessage;
export const UPLOAD_STAGE_STATE: Record<UploadStage, { active: number; completeThrough: number }> = {
    draft: { active: -1, completeThrough: -1 },
    preflight: { active: 0, completeThrough: -1 },
    payment_required: { active: -1, completeThrough: 0 },
    payment_pending: { active: 1, completeThrough: 0 },
    authorized: { active: 2, completeThrough: 1 },
    intent_pending: { active: 2, completeThrough: 1 },
    upload_ready: { active: 2, completeThrough: 1 },
    uploading: { active: 2, completeThrough: 1 },
    provider_processing: { active: 3, completeThrough: 2 },
    published: { active: -1, completeThrough: 4 },
};

export type UploadStepState = 'failed' | 'complete' | 'active' | 'pending';

export function uploadStepStates(stage: UploadStage, failedStep: number | null): UploadStepState[] {
    const state = UPLOAD_STAGE_STATE[stage];
    return UPLOAD_STEPS.map((_label, index) => {
        if (failedStep === index) return 'failed';
        if (index <= state.completeThrough) return 'complete';
        if (index === state.active) return 'active';
        return 'pending';
    });
}

type PublicationQueryState = {
    isError: boolean;
    error?: unknown;
    data?: { publication?: unknown; expired?: boolean; providerState?: string | null; job?: { status?: string } };
};

// Kept single-argument so it stays safe as an Array.map callback.
export function getLivepeerPublicationView(query: PublicationQueryState) {
    return localizedPublicationView(query, 'en');
}

export function localizedPublicationView(query: PublicationQueryState, locale: Locale) {
    const t = messages[locale].upload.publication;
    if (query.isError) {
        const code = query.error instanceof Error ? query.error.message : '';
        if (['provider_playback_mismatch', 'provider_verification_incomplete', 'provider_identity_mismatch',
            'provider_state_invalid', 'provider_playback_exposed', 'provider_asset_missing', 'provider_playback_missing',
            'on_chain_job_mismatch', 'livepeer_job_creator_mismatch'].includes(code)) {
            return { kind: 'verification_error', title: t.verificationTitle, message: t.verificationMessage,
                buttonLabel: t.verificationButton, failed: true, pending: false };
        }
        if (['provider_unavailable', 'near_job_query_failed', 'near_finalize_pending', 'rate_limited'].includes(code)
            || query.error instanceof TypeError && ['Failed to fetch', 'fetch failed', 'Load failed',
                'NetworkError when attempting to fetch resource.'].includes(query.error.message)
            || query.error instanceof Error && ['AbortError', 'TimeoutError'].includes(query.error.name)) {
            return { kind: 'temporary_error', title: t.temporaryTitle, message: t.temporaryMessage,
                buttonLabel: t.temporaryButton, failed: false, pending: false };
        }
        return { kind: 'unknown_error', title: t.unknownTitle, message: t.unknownMessage,
            buttonLabel: t.unknownButton, failed: false, pending: false };
    }
    if (query.data?.publication) return { kind: 'published', title: t.readyTitle, message: t.readyMessage,
        buttonLabel: t.readyButton, failed: false, pending: false };
    if (query.data?.expired || query.data?.providerState === 'UPLOAD_EXPIRED') {
        return { kind: 'expired', title: t.expiredTitle, message: t.expiredMessage,
            buttonLabel: t.expiredButton, failed: true, pending: false };
    }
    if (query.data?.providerState === 'PROVIDER_FAILED') {
        return { kind: 'provider_failed', title: t.failedTitle, message: t.failedMessage,
            buttonLabel: t.failedButton, failed: true, pending: false };
    }
    const finalizing = query.data?.job?.status === 'Published'
        || ['READY_VERIFIED', 'FINALIZE_QUEUED', 'FINALIZE_RETRY', 'ONCHAIN_PUBLISHED'].includes(query.data?.providerState || '');
    return { kind: 'pending', title: t.pendingTitle,
        message: finalizing ? t.finalizing : query.data?.providerState === 'PROCESSING' ? t.processing : t.waiting,
        buttonLabel: t.pendingButton, failed: false, pending: true };
}

export function findMatchingUploadCheckout(
    checkout: ActivePaymentCheckout | null,
    uploadFeeUsdc: string,
    sourceBytes: number,
): ActivePaymentCheckout | null {
    return checkout
        && !['complete', 'refunded', 'failed'].includes(checkout.state)
        && checkout.required_usdc_micro === uploadFeeUsdc
        && checkout.quote.purpose.type === 'upload'
        && checkout.quote.purpose.expected_source_bytes === String(sourceBytes)
        ? checkout
        : null;
}

export function uploadPercent(sent: number, total: number): number {
    return total > 0 ? Math.min(99, Math.floor(sent / total * 100)) : 0;
}

export type TransferSample = { sent: number; atMs: number };
export type TransferStats = {
    sentBytes: number;
    totalBytes: number;
    bytesPerSecond: number | null;
    remainingSeconds: number | null;
};

const TRANSFER_RATE_WINDOW_MS = 10_000;
const TRANSFER_RATE_MIN_SPAN_MS = 1_000;

// Keeps only the samples needed for a rolling rate; derived from existing onProgress callbacks.
export function recordTransferSample(samples: TransferSample[], sample: TransferSample): TransferSample[] {
    const recent = samples.filter((item) => item.sent <= sample.sent && sample.atMs - item.atMs <= TRANSFER_RATE_WINDOW_MS);
    return [...recent, sample];
}

export function transferStats(samples: TransferSample[], totalBytes: number): TransferStats {
    const last = samples.at(-1);
    const first = samples[0];
    const sentBytes = last?.sent ?? 0;
    if (!last || !first || last.atMs - first.atMs < TRANSFER_RATE_MIN_SPAN_MS || last.sent <= first.sent) {
        return { sentBytes, totalBytes, bytesPerSecond: null, remainingSeconds: null };
    }
    const bytesPerSecond = (last.sent - first.sent) / ((last.atMs - first.atMs) / 1_000);
    return {
        sentBytes,
        totalBytes,
        bytesPerSecond,
        remainingSeconds: Math.max(0, Math.ceil((totalBytes - sentBytes) / bytesPerSecond)),
    };
}

export function formatMicroUsdc(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return `${amount / 1_000_000n}.${fraction.padEnd(2, '0')}`;
}

export function formatYoctoNear(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % (10n ** 24n)).toString().padStart(24, '0').replace(/0+$/, '');
    return fraction ? `${amount / (10n ** 24n)}.${fraction}` : String(amount / (10n ** 24n));
}

export function sourceSizeLimitLabel(): string {
    return FEATURE_FLAGS.publicTestnetVideoV1 ? '5 GB' : FEATURE_FLAGS.publicTestnetBeta ? '1 GB' : '20 GB';
}

export function fileValidationMessage(
    error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type',
    locale: Locale = 'en',
): string {
    const t = messages[locale].upload.fileErrors;
    if (error === 'empty_file') return t.empty;
    if (error === 'source_limit_exceeded') return t.tooLarge(sourceSizeLimitLabel());
    return t.unsupported;
}

const DRAFT_ERROR_CODES = [
    'livepeer_draft_missing', 'livepeer_draft_invalid', 'livepeer_draft_job_mismatch',
    'livepeer_draft_read_failed', 'livepeer_draft_write_failed', 'livepeer_draft_readback_failed',
    'livepeer_draft_unavailable',
] as const;

export function uploadErrorMessage(reason: unknown, availabilityConfirmed: boolean, locale: Locale = 'en'): string {
    const t = messages[locale].upload.errors;
    const code = reason instanceof Error ? reason.message : '';
    if (['device_session_storage_unavailable', 'device_session_crypto_unavailable'].includes(code)) return t.storage;
    if (code === 'livepeer_resume_required') return t.resumeRequired;
    if (code === 'livepeer_resume_file_mismatch') return t.resumeFileMismatch;
    if (code === 'livepeer_key_replacement_pending') return t.keyReplacementPending;
    if (code === 'livepeer_payment_pending' || code === 'livepeer_job_missing') return t.paymentPending;
    if (code === 'livepeer_wallet_account_mismatch') return t.walletMismatch;
    const draftCode = DRAFT_ERROR_CODES.find((item) => item === code);
    if (draftCode) return t.draft(t.draftReasons[draftCode], draftCode);
    if (code === 'livepeer_wallet_rejected') return t.walletRejected;
    if (code === 'livepeer_resume_in_progress') return t.resumeInProgress;
    if (code === 'livepeer_resume_browser_unsupported') return t.resumeBrowser;
    if (code === 'provider_recovery_not_ready') return t.recoveryNotReady;
    if (code === 'livepeer_upload_expired') return messages[locale].upload.publication.expiredMessage;
    if (code === 'livepeer_upload_status_unavailable') return t.statusUnavailable;
    if (code === 'admission_closed' || code === 'admission_denied') {
        return availabilityConfirmed ? t.admissionAfter : t.admissionBefore;
    }
    if (code === 'livepeer_job_pending') return t.jobPending;
    if (code === 'payment_converted_usdc_not_ready') return t.convertedNotReady;
    if (code === 'creator_fee_payment_options_changed') return t.optionsChanged;
    if (FEATURE_FLAGS.publicTestnetVideoV1 && code === 'creator_fee_balance_or_gas_insufficient') return t.testTokens;
    if (code === 'sponsor_balance_insufficient') return t.sponsorBalance;
    if (code === 'sponsored_upload_wallet_unsupported') return t.sponsorWallet;
    if (code === 'livepeer_upload_key_recovery_unavailable') return t.keyUnavailable;
    return t.fallback;
}
