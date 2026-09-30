import { FEATURE_FLAGS } from '@/lib/constants';
import type { UploadStage } from '@/lib/livepeer-upload-state';
import type { ActivePaymentCheckout } from '@/lib/multi-asset-payments';

export const UPLOAD_STEPS = ['Payment options', 'Wallet approval', 'Upload', 'Processing', 'Published'] as const;
export const UPLOAD_EXPIRED_MESSAGE = 'The publication deadline has passed. This paid upload can no longer be published or retried.';
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

export function getLivepeerPublicationView(query: {
    isError: boolean;
    error?: unknown;
    data?: { publication?: unknown; expired?: boolean; providerState?: string | null; job?: { status?: string } };
}) {
    if (query.isError) {
        const code = query.error instanceof Error ? query.error.message : '';
        if (['provider_playback_mismatch', 'provider_verification_incomplete', 'provider_identity_mismatch',
            'provider_state_invalid', 'provider_playback_exposed', 'provider_asset_missing', 'provider_playback_missing',
            'on_chain_job_mismatch', 'livepeer_job_creator_mismatch'].includes(code)) {
            return { kind: 'verification_error', title: 'Publication verification blocked',
                message: 'The video outputs or upload details could not pass publication verification. Keep this paid job; no new payment or upload has been started.',
                buttonLabel: 'Verification blocked', failed: true, pending: false };
        }
        if (['provider_unavailable', 'near_job_query_failed', 'near_finalize_pending', 'rate_limited'].includes(code)
            || query.error instanceof TypeError && ['Failed to fetch', 'fetch failed', 'Load failed',
                'NetworkError when attempting to fetch resource.'].includes(query.error.message)
            || query.error instanceof Error && ['AbortError', 'TimeoutError'].includes(query.error.name)) {
            return { kind: 'temporary_error', title: 'Temporary connection problem',
                message: 'Publication status could not be checked because of a temporary connection problem. Keep this job and check its status again.',
                buttonLabel: 'Connection unavailable', failed: false, pending: false };
        }
        return { kind: 'unknown_error', title: 'Publication status unavailable',
            message: 'Publication status could not be verified. Keep this paid job; no new payment or upload has been started.',
            buttonLabel: 'Status unavailable', failed: false, pending: false };
    }
    if (query.data?.publication) return { kind: 'published', title: 'Publication ready', message: 'Publication ready.',
        buttonLabel: 'Open publication', failed: false, pending: false };
    if (query.data?.expired || query.data?.providerState === 'UPLOAD_EXPIRED') {
        return { kind: 'expired', title: 'Publication deadline passed', message: UPLOAD_EXPIRED_MESSAGE,
            buttonLabel: 'Publication deadline passed', failed: true, pending: false };
    }
    if (query.data?.providerState === 'PROVIDER_FAILED') {
        return { kind: 'provider_failed', title: 'Video processing failed',
            message: 'Livepeer could not process this upload. No new payment or upload has been started.',
            buttonLabel: 'Processing failed', failed: true, pending: false };
    }
    const finalizing = query.data?.job?.status === 'Published'
        || ['READY_VERIFIED', 'FINALIZE_QUEUED', 'FINALIZE_RETRY', 'ONCHAIN_PUBLISHED'].includes(query.data?.providerState || '');
    return { kind: 'pending', title: 'Upload complete; awaiting publication',
        message: finalizing ? 'Finalizing publication…' : query.data?.providerState === 'PROCESSING'
            ? 'Livepeer is processing the upload…' : 'Upload complete. Waiting for Livepeer processing…',
        buttonLabel: 'Waiting for publication', failed: false, pending: true };
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

export function fileValidationMessage(error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type'): string {
    if (error === 'empty_file') return 'Choose a non-empty video file.';
    if (error === 'source_limit_exceeded') {
        return `Choose a video file no larger than ${sourceSizeLimitLabel()}.`;
    }
    return 'Choose an MP4, MOV, AVI, WebM, WMV, MKV or FLV video file.';
}

export function uploadErrorMessage(reason: unknown, availabilityConfirmed: boolean): string {
    const code = reason instanceof Error ? reason.message : '';
    if (['device_session_storage_unavailable', 'device_session_crypto_unavailable'].includes(code)) {
        return 'Enable secure site storage and use a supported browser before continuing. No payment was sent.';
    }
    if (code === 'livepeer_resume_required') return 'This job is already paid. Resume the existing upload.';
    if (code === 'livepeer_resume_file_mismatch') return 'Select the same original file to resume this upload.';
    if (code === 'livepeer_key_replacement_pending') return 'The previous wallet action is not confirmed. Check it before trying this upload again.';
    if (code === 'livepeer_payment_pending' || code === 'livepeer_job_missing') return 'Payment is not confirmed yet. Check your wallet; no new payment was started.';
    if (code === 'livepeer_wallet_account_mismatch') return 'Reconnect the wallet account that paid for this upload.';
    if (['livepeer_draft_missing', 'livepeer_draft_invalid', 'livepeer_draft_job_mismatch',
        'livepeer_draft_read_failed', 'livepeer_draft_write_failed', 'livepeer_draft_readback_failed',
        'livepeer_draft_unavailable'].includes(code)) {
        const reason = code === 'livepeer_draft_missing' ? 'is missing'
            : code === 'livepeer_draft_invalid' ? 'is invalid'
            : code === 'livepeer_draft_job_mismatch' ? 'belongs to another upload'
            : code === 'livepeer_draft_read_failed' ? 'could not be read'
            : code === 'livepeer_draft_write_failed' ? 'could not be saved'
            : code === 'livepeer_draft_readback_failed' ? 'could not be verified after saving'
            : 'is unavailable';
        return `Recovery information ${reason} (${code}). Keep this upload and check any existing signing or payment attempt before retrying.`;
    }
    if (code === 'livepeer_wallet_rejected') return 'Wallet approval was cancelled. You can check this upload again.';
    if (code === 'livepeer_resume_in_progress') return 'This upload is being recovered in another tab. Wait for it to finish.';
    if (code === 'livepeer_resume_browser_unsupported') return 'Use a current Chrome or Edge browser to resume this upload.';
    if (code === 'provider_recovery_not_ready') return 'The original upload source is unavailable. No new upload was created.';
    if (code === 'livepeer_upload_expired') return UPLOAD_EXPIRED_MESSAGE;
    if (code === 'livepeer_upload_status_unavailable') {
        return 'Publication status could not be confirmed. Recovery has not been started.';
    }
    if (code === 'admission_closed' || code === 'admission_denied') {
        return availabilityConfirmed
            ? 'Upload availability changed after authorization. Retry this same upload job.'
            : 'Upload is not available for this account right now. No wallet approval was requested.';
    }
    if (code === 'livepeer_job_pending') {
        return 'The payment was sent, but the exact upload key is still finalizing. Retry this upload job.';
    }
    if (code === 'payment_converted_usdc_not_ready') {
        return 'The converted USDC balance or NEAR gas reserve is no longer sufficient.';
    }
    if (code === 'creator_fee_payment_options_changed') {
        return 'Payment options changed. Check payment options again.';
    }
    if (FEATURE_FLAGS.publicTestnetVideoV1 && code === 'creator_fee_balance_or_gas_insufficient') {
        return 'You need enough test USDC and NEAR. Use Get test tokens, then check payment options again.';
    }
    if (code === 'sponsor_balance_insufficient') {
        return 'Your USDC balance is below the quoted upload and gas-sponsor total.';
    }
    if (code === 'sponsored_upload_wallet_unsupported') {
        return 'This testnet requires a Meteor wallet that supports one-step sponsored approval.';
    }
    if (code === 'livepeer_upload_key_recovery_unavailable') {
        return 'This upload key is unavailable. Keep the existing job; no new payment or key change has been started.';
    }
    return 'The upload could not continue. Keep the original file and check this job before retrying.';
}
