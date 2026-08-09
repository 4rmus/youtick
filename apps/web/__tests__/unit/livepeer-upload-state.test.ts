import { describe, expect, it } from 'vitest';
import {
    publicationPollIntervalMs,
    restoreUploadStage,
    transitionUploadStage,
    type UploadRecoveryStage,
    type UploadStage,
} from '@/lib/livepeer-upload-state';

describe('Livepeer upload UI state', () => {
    it('accepts the target lifecycle in order', () => {
        const stages: UploadStage[] = [
            'draft',
            'preflight',
            'payment_required',
            'payment_pending',
            'authorized',
            'intent_pending',
            'upload_ready',
            'uploading',
            'provider_processing',
            'published',
        ];
        expect(stages.slice(1).reduce(transitionUploadStage, stages[0])).toBe('published');
    });

    it('permits only explicit retry, reset and authoritative publication edges', () => {
        expect(transitionUploadStage('uploading', 'payment_pending')).toBe('payment_pending');
        expect(transitionUploadStage('provider_processing', 'draft')).toBe('draft');
        expect(transitionUploadStage('payment_required', 'published')).toBe('published');
        expect(transitionUploadStage('uploading', 'uploading')).toBe('uploading');
        expect(() => transitionUploadStage('draft', 'uploading'))
            .toThrow('invalid_upload_stage_transition');
        expect(() => transitionUploadStage('published', 'payment_pending'))
            .toThrow('invalid_upload_stage_transition');
    });

    it('restores only safe UI projections from a verified session draft', () => {
        const expected: Record<UploadRecoveryStage, UploadStage> = {
            payment_pending: 'payment_required',
            authorized: 'authorized',
            upload_ready: 'upload_ready',
            uploading: 'upload_ready',
            provider_processing: 'provider_processing',
        };
        for (const [recovery, stage] of Object.entries(expected) as Array<[
            UploadRecoveryStage,
            UploadStage,
        ]>) {
            expect(restoreUploadStage(recovery)).toBe(stage);
            expect(transitionUploadStage('draft', stage)).toBe(stage);
        }
    });

    it('backs visible publication polling off to a bounded interval', () => {
        expect([0, 1, 2, 3, 4, 5, 6].map(publicationPollIntervalMs))
            .toEqual([5_000, 5_000, 10_000, 10_000, 20_000, 20_000, 30_000]);
    });
});
