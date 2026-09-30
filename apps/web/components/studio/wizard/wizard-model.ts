import { hasTitleContent } from '../../../../../protocol/paid-media-livepeer-v1/title';
import type { UploadStepState } from '@/features/upload/upload-job';

export type WizardStepState = UploadStepState;
export const WIZARD_STEP_COUNT = 5;

/** Same rule as the upload client: visible title content and at most 200 UTF-8 bytes. */
export function titleValid(title: string): boolean {
    const trimmed = title.trim();
    return hasTitleContent(trimmed) && new TextEncoder().encode(trimmed).length <= 200;
}

/** Ticket price in USDC with at most 6 decimals and at least 2 USDC. */
export function priceValid(price: string): boolean {
    const value = price.trim();
    if (!/^[0-9]+(\.[0-9]{1,6})?$/.test(value)) return false;
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')) >= 2_000_000n;
}

/**
 * File · Details · Fee and payment · Upload · Publish, built on the G3 upload step states
 * (Payment options, Wallet approval, Upload, Processing, Published).
 */
export function wizardSteps(input: {
    fileReady: boolean;
    fileFailed: boolean;
    detailsReady: boolean;
    uploadSteps: readonly UploadStepState[];
    expired: boolean;
}): WizardStepState[] {
    const [options, approval, upload, processing, published] = input.uploadSteps;
    const file: WizardStepState = input.fileFailed ? 'failed' : input.fileReady ? 'complete' : 'active';
    const details: WizardStepState = input.detailsReady ? 'complete' : input.fileReady ? 'active' : 'pending';
    const payment: WizardStepState = options === 'failed' || approval === 'failed' ? 'failed'
        : approval === 'complete' ? 'complete'
            : input.detailsReady ? 'active' : 'pending';
    const publish: WizardStepState = input.expired || processing === 'failed' || published === 'failed' ? 'failed'
        : published === 'complete' ? 'complete'
            : processing === 'active' || processing === 'complete' ? 'active' : 'pending';
    return [file, details, payment, upload, publish];
}

export type TimelineStage = 'uploaded' | 'processing' | 'verified' | 'writing' | 'published';
export const TIMELINE_STAGES: readonly TimelineStage[] = ['uploaded', 'processing', 'verified', 'writing', 'published'];

/** Maps Bridge providerState (and the NEAR job status) onto the processing timeline. */
export function timelineIndex(input: { providerState: string | null; jobStatus: string | null; published: boolean }): number {
    if (input.published || input.providerState === 'ONCHAIN_PUBLISHED' || input.jobStatus === 'Published') {
        return input.published ? 4 : 3;
    }
    if (input.providerState === 'FINALIZE_QUEUED' || input.providerState === 'FINALIZE_RETRY') return 3;
    if (input.providerState === 'READY_VERIFIED') return 2;
    if (input.providerState === 'PROCESSING') return 1;
    return 0;
}

export function timelineStates(index: number, failed: boolean): WizardStepState[] {
    return TIMELINE_STAGES.map((_stage, position) => position < index || (position === index && index === 4) ? 'complete'
        : position === index ? failed ? 'failed' : 'active' : 'pending');
}

export type FeeBreakdown = { gigabytes: string; byteFeeMicro: string; minimumApplied: boolean; uploadFeeMicro: string };

/** Display of livepeerUploadFeeUsdc: 0.30 USDC per GB (decimal), rounded up, at least 0.50 USDC. */
export function feeBreakdown(sourceBytes: number, uploadFeeMicro: string): FeeBreakdown {
    const byteFee = (BigInt(sourceBytes) * 3n + 9_999n) / 10_000n;
    return {
        gigabytes: (sourceBytes / 1_000_000_000).toFixed(2),
        byteFeeMicro: byteFee.toString(),
        minimumApplied: byteFee < 500_000n,
        uploadFeeMicro,
    };
}
