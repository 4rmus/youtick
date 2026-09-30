import { describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ publicTestnetVideoV1: false, publicTestnetBeta: false }));
vi.mock('@/lib/constants', () => ({ FEATURE_FLAGS: flags }));

import {
    UPLOAD_STAGE_STATE,
    UPLOAD_STEPS,
    fileValidationMessage,
    findMatchingUploadCheckout,
    formatMicroUsdc,
    formatYoctoNear,
    recordTransferSample,
    sourceSizeLimitLabel,
    transferStats,
    uploadErrorMessage,
    uploadPercent,
    uploadStepStates,
} from '@/features/upload/upload-job';
import type { UploadStage } from '@/lib/livepeer-upload-state';
import type { ActivePaymentCheckout } from '@/lib/multi-asset-payments';

function legacyStepStates(stage: UploadStage, failedStep: number | null) {
    const state = UPLOAD_STAGE_STATE[stage];
    return UPLOAD_STEPS.map((_label, index) => {
        const failed = failedStep === index;
        const complete = !failed && index <= state.completeThrough;
        const active = !failed && index === state.active;
        return failed ? 'failed' : complete ? 'complete' : active ? 'active' : 'pending';
    });
}

describe('uploadStepStates', () => {
    const stages = Object.keys(UPLOAD_STAGE_STATE) as UploadStage[];

    it.each(stages.flatMap((stage) => [null, 0, 1, 2, 3, 4].map((failed) => [stage, failed] as const)))(
        'matches the original stepper for %s with failed step %s', (stage, failed) => {
            expect(uploadStepStates(stage, failed)).toEqual(legacyStepStates(stage, failed));
        },
    );

    it('marks uploading as wallet approval done and upload active', () => {
        expect(uploadStepStates('uploading', null)).toEqual(['complete', 'complete', 'active', 'pending', 'pending']);
        expect(uploadStepStates('published', null)).toEqual(['complete', 'complete', 'complete', 'complete', 'complete']);
    });
});

describe('findMatchingUploadCheckout', () => {
    const checkout = (overrides: Record<string, unknown> = {}) => ({
        state: 'usdc_final',
        required_usdc_micro: '1146000',
        quote: { purpose: { type: 'upload', expected_source_bytes: '3820000000' } },
        ...overrides,
    }) as unknown as ActivePaymentCheckout;

    it('matches an open conversion for the same fee and source size', () => {
        const active = checkout();
        expect(findMatchingUploadCheckout(active, '1146000', 3_820_000_000)).toBe(active);
        expect(findMatchingUploadCheckout(checkout({ state: 'core_pending' }), '1146000', 3_820_000_000)).not.toBeNull();
    });

    it.each([
        ['no checkout', null],
        ['complete', checkout({ state: 'complete' })],
        ['refunded', checkout({ state: 'refunded' })],
        ['failed', checkout({ state: 'failed' })],
        ['another fee', checkout({ required_usdc_micro: '500000' })],
        ['a ticket purpose', checkout({ quote: { purpose: { type: 'ticket', publication_id: 'job-001' } } })],
        ['another source size', checkout({ quote: { purpose: { type: 'upload', expected_source_bytes: '1' } } })],
    ])('ignores %s', (_label, active) => {
        expect(findMatchingUploadCheckout(active, '1146000', 3_820_000_000)).toBeNull();
    });
});

describe('upload progress', () => {
    it('keeps the original percent rule: floored, capped at 99 until completion', () => {
        expect(uploadPercent(0, 0)).toBe(0);
        expect(uploadPercent(1, 3)).toBe(33);
        expect(uploadPercent(999, 1_000)).toBe(99);
        expect(uploadPercent(1_000, 1_000)).toBe(99);
    });

    it('reports no rate until samples span at least one second', () => {
        const samples = recordTransferSample([], { sent: 100, atMs: 0 });
        expect(transferStats(samples, 1_000)).toEqual({ sentBytes: 100, totalBytes: 1_000, bytesPerSecond: null, remainingSeconds: null });
        expect(transferStats(recordTransferSample(samples, { sent: 200, atMs: 500 }), 1_000).bytesPerSecond).toBeNull();
    });

    it('derives rate and remaining time from a rolling ten-second window', () => {
        let samples = recordTransferSample([], { sent: 0, atMs: 0 });
        samples = recordTransferSample(samples, { sent: 18_000_000, atMs: 1_000 });
        samples = recordTransferSample(samples, { sent: 36_000_000, atMs: 2_000 });
        expect(transferStats(samples, 72_000_000)).toEqual({
            sentBytes: 36_000_000,
            totalBytes: 72_000_000,
            bytesPerSecond: 18_000_000,
            remainingSeconds: 2,
        });
        samples = recordTransferSample(samples, { sent: 40_000_000, atMs: 12_000 });
        expect(samples.map((sample) => sample.atMs)).toEqual([2_000, 12_000]);
        expect(transferStats(samples, 72_000_000).bytesPerSecond).toBe(400_000);
    });

    it('restarts the window when a resumed upload reports fewer bytes', () => {
        let samples = recordTransferSample([], { sent: 500, atMs: 0 });
        samples = recordTransferSample(samples, { sent: 100, atMs: 2_000 });
        expect(samples).toEqual([{ sent: 100, atMs: 2_000 }]);
        expect(transferStats(samples, 1_000).bytesPerSecond).toBeNull();
    });
});

describe('upload formatting', () => {
    it.each([
        ['500000', '0.50'],
        ['1146000', '1.146'],
        ['2000000', '2.00'],
        ['100000', '0.10'],
    ])('formats %s micro-USDC as %s', (value, expected) => {
        expect(formatMicroUsdc(value)).toBe(expected);
    });

    it('formats yoctoNEAR without trailing zeros', () => {
        expect(formatYoctoNear('1000000000000000000000000')).toBe('1');
        expect(formatYoctoNear('1500000000000000000000000')).toBe('1.5');
    });

    it.each([
        [false, false, '20 GB'],
        [false, true, '1 GB'],
        [true, false, '5 GB'],
    ])('uses the source limit for video v1=%s beta=%s', (videoV1, beta, label) => {
        flags.publicTestnetVideoV1 = videoV1;
        flags.publicTestnetBeta = beta;
        expect(sourceSizeLimitLabel()).toBe(label);
        expect(fileValidationMessage('source_limit_exceeded')).toBe(`Choose a video file no larger than ${label}.`);
        flags.publicTestnetVideoV1 = false;
        flags.publicTestnetBeta = false;
    });

    it('explains the other file validation errors', () => {
        expect(fileValidationMessage('empty_file')).toBe('Choose a non-empty video file.');
        expect(fileValidationMessage('unsupported_video_type')).toBe('Choose an MP4, MOV, AVI, WebM, WMV, MKV or FLV video file.');
    });
});

describe('uploadErrorMessage', () => {
    it.each([
        ['device_session_storage_unavailable', false, 'Enable secure site storage and use a supported browser before continuing. No payment was sent.'],
        ['livepeer_resume_required', false, 'This job is already paid. Resume the existing upload.'],
        ['livepeer_resume_file_mismatch', false, 'Select the same original file to resume this upload.'],
        ['livepeer_payment_pending', false, 'Payment is not confirmed yet. Check your wallet; no new payment was started.'],
        ['livepeer_wallet_rejected', false, 'Wallet approval was cancelled. You can check this upload again.'],
        ['livepeer_upload_expired', false, 'The publication deadline has passed. This paid upload can no longer be published or retried.'],
        ['admission_denied', false, 'Upload is not available for this account right now. No wallet approval was requested.'],
        ['admission_denied', true, 'Upload availability changed after authorization. Retry this same upload job.'],
        ['payment_converted_usdc_not_ready', true, 'The converted USDC balance or NEAR gas reserve is no longer sufficient.'],
        ['creator_fee_payment_options_changed', false, 'Payment options changed. Check payment options again.'],
        ['sponsored_upload_wallet_unsupported', false, 'This testnet requires a Meteor wallet that supports one-step sponsored approval.'],
        ['creator_fee_balance_or_gas_insufficient', false, 'The upload could not continue. Keep the original file and check this job before retrying.'],
    ])('maps %s (availability confirmed: %s)', (code, confirmed, message) => {
        expect(uploadErrorMessage(new Error(code), confirmed)).toBe(message);
    });

    it('uses the test-token guidance only on public-testnet video v1', () => {
        flags.publicTestnetVideoV1 = true;
        expect(uploadErrorMessage(new Error('creator_fee_balance_or_gas_insufficient'), false))
            .toBe('You need enough test USDC and NEAR. Use Get test tokens, then check payment options again.');
        flags.publicTestnetVideoV1 = false;
    });
});
