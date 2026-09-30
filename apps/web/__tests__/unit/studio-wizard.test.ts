import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLivepeerPublicationView, uploadStepStates } from '@/features/upload/upload-job';

const s = vi.hoisted(() => ({ job: {} as Record<string, unknown>, flags: { publicTestnetVideoV1: true, enableLivepeerNearCreatorFee: false } }));
vi.mock('@/features/upload/useUploadJob', () => ({ useUploadJob: () => s.job }));
vi.mock('@/components/MultiAssetPaymentPanel', () => ({ MultiAssetPaymentPanel: () => 'payment-panel' }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined, isError: false }) }));
vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    return { ...actual, FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, ...s.flags } };
});

import { feeBreakdown, priceValid, timelineIndex, timelineStates, titleValid, wizardSteps } from '@/components/studio/wizard/wizard-model';
import { NewScreeningWizard } from '@/components/studio/wizard/NewScreeningWizard';
import { livepeerUploadFeeUsdc } from '@/lib/livepeer-upload';

const FILE = { name: 'film.mp4', size: 1_670_000_000 } as File;
function job(overrides: Record<string, unknown> = {}) {
    return {
        locale: 'en', accountId: 'creator.testnet', connect: vi.fn(), getWallet: vi.fn(), isReady: true,
        file: FILE, fileError: null, title: 'Winter Concert', setTitle: vi.fn(), price: '12', setPrice: vi.fn(),
        rightsAccepted: true, setRightsAccepted: vi.fn(), jobId: null, trackedUpload: null, error: null, busy: false,
        resumeAvailable: false, uploadStage: 'draft', uploadProgress: 0, previewRef: { current: null },
        payment: null, paymentAsset: null, setPaymentAsset: vi.fn(), sponsorQuote: null,
        publicationView: getLivepeerPublicationView({ isError: false, data: {} }), providerState: null, jobStatus: null,
        publicationReady: false, publicationExpired: false, uploaded: false, displayedStatus: null,
        stepStates: uploadStepStates('draft', null), transfer: { sentBytes: 0, totalBytes: 0, bytesPerSecond: null, remainingSeconds: null },
        uploadFeeUsdc: livepeerUploadFeeUsdc(FILE.size), formReady: true,
        selectFile: vi.fn(), preparePayment: vi.fn(), start: vi.fn(), resume: vi.fn(), cancel: vi.fn(), ...overrides,
    };
}
const render = () => renderToStaticMarkup(React.createElement(NewScreeningWizard));

describe('wizard model', () => {
    it.each([
        ['Winter Concert', true], ['   ', false], ['', false], ['a'.repeat(200), true], ['a'.repeat(201), false], ['ç'.repeat(101), false],
    ])('validates title %j', (title, valid) => expect(titleValid(title)).toBe(valid));

    it.each([['2', true], ['12.5', true], ['2.000001', true], ['1.999999', false], ['2.0000001', false], ['-3', false], ['abc', false], ['', false]])(
        'validates price %j', (price, valid) => expect(priceValid(price)).toBe(valid));

    it.each([1, 1_000_000_000, 1_670_000_000, 5_000_000_000])('shows the fee of livepeerUploadFeeUsdc for %i bytes', (bytes) => {
        const fee = livepeerUploadFeeUsdc(bytes);
        const breakdown = feeBreakdown(bytes, fee);
        expect(breakdown.uploadFeeMicro).toBe(fee);
        expect(breakdown.minimumApplied).toBe(BigInt(breakdown.byteFeeMicro) < 500_000n);
        expect(breakdown.minimumApplied ? '500000' : breakdown.byteFeeMicro).toBe(fee);
    });

    it('maps G3 upload stages onto the five wizard steps', () => {
        const steps = (stage: Parameters<typeof uploadStepStates>[0], extra: Partial<Parameters<typeof wizardSteps>[0]> = {}, failed: number | null = null) =>
            wizardSteps({ fileReady: true, fileFailed: false, detailsReady: true, uploadSteps: uploadStepStates(stage, failed), expired: false, ...extra });
        expect(wizardSteps({ fileReady: false, fileFailed: false, detailsReady: false, uploadSteps: uploadStepStates('draft', null), expired: false }))
            .toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
        expect(steps('draft', { detailsReady: false })).toEqual(['complete', 'active', 'pending', 'pending', 'pending']);
        expect(steps('payment_pending')).toEqual(['complete', 'complete', 'active', 'pending', 'pending']);
        expect(steps('uploading')).toEqual(['complete', 'complete', 'complete', 'active', 'pending']);
        expect(steps('provider_processing')).toEqual(['complete', 'complete', 'complete', 'complete', 'active']);
        expect(steps('published')).toEqual(['complete', 'complete', 'complete', 'complete', 'complete']);
        expect(steps('payment_pending', {}, 1)[2]).toBe('failed');
        expect(steps('provider_processing', { expired: true })[4]).toBe('failed');
        expect(wizardSteps({ fileReady: false, fileFailed: true, detailsReady: false, uploadSteps: uploadStepStates('draft', null), expired: false })[0]).toBe('failed');
    });

    it.each([
        [null, null, false, 0], ['PROCESSING', null, false, 1], ['READY_VERIFIED', null, false, 2], ['FINALIZE_QUEUED', null, false, 3],
        ['FINALIZE_RETRY', null, false, 3], ['ONCHAIN_PUBLISHED', null, false, 3], [null, 'Published', false, 3], ['PROCESSING', null, true, 4],
    ])('maps providerState %s / job %s / published %s to timeline stage %i', (providerState, jobStatus, published, index) => {
        expect(timelineIndex({ providerState, jobStatus, published })).toBe(index);
    });

    it('marks timeline progress and failure', () => {
        expect(timelineStates(1, false)).toEqual(['complete', 'active', 'pending', 'pending', 'pending']);
        expect(timelineStates(2, true)).toEqual(['complete', 'complete', 'failed', 'pending', 'pending']);
        expect(timelineStates(4, false)).toEqual(['complete', 'complete', 'complete', 'complete', 'complete']);
    });
});

describe('new screening wizard', () => {
    afterEach(() => { s.job = {}; });

    it('keeps useUploadJob as the first hook so the observed useState order is unchanged', () => {
        const source = readFileSync('components/studio/wizard/NewScreeningWizard.tsx', 'utf8');
        const body = source.slice(source.indexOf('export function NewScreeningWizard'));
        expect(body.indexOf('useUploadJob()')).toBeGreaterThan(0);
        expect(body.slice(0, body.indexOf('useUploadJob()'))).not.toMatch(/use[A-Z]\w*\(/);
    });

    it('shows the five steps, details validation and the fee breakdown', () => {
        s.job = job({ title: '   ', price: '1.5' });
        const html = render();
        expect(html).toContain('aria-label="Publication steps"');
        for (const label of ['File', 'Details', 'Fee and payment', 'Upload', 'Publish']) expect(html).toContain(label);
        expect(html).toContain('Enter a title with visible characters');
        expect(html).toContain('Enter at least 2 USDC');
        expect(html).toContain('1.67 GB × 0.30 USDC per GB');
        expect(html).toContain('0.501 USDC');
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Check payment options/);
    });

    it('applies the minimum fee and shows the sponsor total when present', () => {
        s.job = job({ file: { name: 'a.mp4', size: 100_000_000 }, uploadFeeUsdc: '500000',
            sponsorQuote: { uploadFeeUsdc: '500000', sponsorFeeUsdc: '100000', totalFeeUsdc: '600000' } });
        const html = render();
        expect(html).toContain('Minimum upload fee 0.50 USDC applies');
        expect(html).toContain('Gas sponsor');
        expect(html).toContain('0.60 USDC');
    });

    it('offers cancel only while the job is authorized', () => {
        s.job = job({ jobId: 'job-1', uploadStage: 'authorized', stepStates: uploadStepStates('authorized', null) });
        expect(render()).toContain('Cancel job (no refund)');
        s.job = job({ jobId: 'job-1', uploadStage: 'uploading', stepStates: uploadStepStates('uploading', null), uploadProgress: 42,
            transfer: { sentBytes: 1, totalBytes: 2, bytesPerSecond: 12_500_000, remainingSeconds: 95 } });
        const uploading = render();
        expect(uploading).not.toContain('Cancel job');
        expect(uploading).toContain('12.5 MB/s · about 1:35 left');
        expect(uploading).toContain('href="/studio/new?job=job-1"');
    });

    it('resumes the same job with the same file', () => {
        s.job = job({ jobId: 'job-1', resumeAvailable: true });
        expect(render()).toContain('Resume / check existing upload');
    });

    it('shows the processing timeline, then the screening link and share when published', () => {
        s.job = job({ jobId: 'job-1', uploaded: true, uploadStage: 'provider_processing', providerState: 'READY_VERIFIED',
            stepStates: uploadStepStates('provider_processing', null) });
        const processing = render();
        expect(processing).toContain('Verifying outputs');
        expect(processing).toMatch(/aria-current="step"[^>]*>(?:(?!<\/li>).)*Verifying outputs/);
        expect(processing).not.toContain('Open screening');
        s.job = job({ jobId: 'job-1', uploaded: true, uploadStage: 'published', publicationReady: true,
            publicationView: getLivepeerPublicationView({ isError: false, data: { publication: {} } }), stepStates: uploadStepStates('published', null) });
        const published = render();
        expect(published).toContain('href="/s/job-1"');
        expect(published).toContain('Copy screening link');
    });

    it('asks to connect a wallet and shows a saved upload from another tab', () => {
        s.job = job({ accountId: null });
        expect(render()).toContain('Connect wallet');
        s.job = job({ trackedUpload: { accountId: 'creator.testnet', jobId: 'job-9' } });
        expect(render()).toContain('href="/studio/new?job=job-9"');
    });
});
