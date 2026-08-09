export type UploadStage = 'draft' | 'preflight' | 'payment_required' | 'payment_pending'
    | 'authorized' | 'intent_pending' | 'upload_ready' | 'uploading'
    | 'provider_processing' | 'published';

export type UploadRecoveryStage = 'payment_pending' | 'authorized' | 'upload_ready'
    | 'uploading' | 'provider_processing';

const UPLOAD_STAGE_TRANSITIONS: Record<UploadStage, ReadonlySet<UploadStage>> = {
    draft: new Set(['preflight', 'payment_required', 'authorized', 'upload_ready', 'provider_processing']),
    preflight: new Set(['payment_required']),
    payment_required: new Set(['payment_pending']),
    payment_pending: new Set(['authorized']),
    authorized: new Set(['intent_pending', 'payment_pending']),
    intent_pending: new Set(['upload_ready', 'payment_pending']),
    upload_ready: new Set(['uploading', 'payment_pending']),
    uploading: new Set(['provider_processing', 'payment_pending']),
    provider_processing: new Set(),
    published: new Set(),
};

export function transitionUploadStage(current: UploadStage, next: UploadStage): UploadStage {
    if (current === next || next === 'draft' || next === 'published'
        || UPLOAD_STAGE_TRANSITIONS[current].has(next)) {
        return next;
    }
    throw new Error('invalid_upload_stage_transition');
}

export function restoreUploadStage(stage: UploadRecoveryStage): UploadStage {
    if (stage === 'payment_pending') return 'payment_required';
    if (stage === 'uploading') return 'upload_ready';
    return stage;
}

export function publicationPollIntervalMs(observationCount: number): number {
    return Math.min(30_000, 5_000 * (2 ** Math.floor(observationCount / 2)));
}
