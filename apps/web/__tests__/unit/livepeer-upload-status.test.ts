import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    query: { data: undefined as unknown, isError: false },
    read: vi.fn(),
    remember: vi.fn(),
    queryFn: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryFn: () => Promise<unknown> }) => {
        state.queryFn = options.queryFn;
        return state.query;
    },
}));
vi.mock('@/lib/livepeer-publication', () => ({ readLivepeerUploadProgress: state.read }));
vi.mock('@/lib/livepeer-upload', () => ({ rememberLivepeerUploadJob: state.remember }));

import { getLivepeerPublicationView, LivepeerUploadStatus } from '@/components/LivepeerPaidUploadForm';

const progress = { job: { creator_id: 'creator.testnet' }, publication: null, expired: false };
const render = () => renderToStaticMarkup(React.createElement(LivepeerUploadStatus, {
    accountId: 'creator.testnet', jobId: 'job-001',
}));

describe('upload status after closing its tab', () => {
    beforeEach(() => {
        state.query = { data: undefined, isError: false };
        state.read.mockReset();
        state.remember.mockReset();
    });

    it('reads the creator-owned job without a file or upload key and remembers only verified jobs', async () => {
        expect(render()).toContain('Checking upload status');
        state.read.mockResolvedValue(progress);
        await expect(state.queryFn!()).resolves.toEqual(progress);
        expect(state.read).toHaveBeenCalledWith('job-001', 'creator.testnet');
        expect(state.remember).toHaveBeenCalledWith('creator.testnet', 'job-001');
        state.remember.mockClear();
        state.read.mockRejectedValue(new Error('livepeer_job_creator_mismatch'));
        await expect(state.queryFn!()).rejects.toThrow('livepeer_job_creator_mismatch');
        expect(state.remember).not.toHaveBeenCalled();
    });

    it('shows pending publication without claiming Livepeer is processing or offering another payment', () => {
        state.query.data = progress;
        const html = render();
        expect(html).toContain('Payment confirmed. Publication is still pending.');
        expect(html).toContain('Livepeer processing details are unavailable');
        expect(html).toContain('/upload?job=job-001');
        expect(html).not.toContain('/watch');
        expect(html).not.toContain('<button');
    });

    it('opens a confirmed publication and explains deadline expiry', () => {
        state.query.data = { ...progress, publication: { publication_id: 'job-001' } };
        expect(render()).toContain('/watch?job=job-001');
        state.query.data = { ...progress, expired: true };
        const html = render();
        expect(html).toContain('publication deadline has passed');
        expect(html).not.toContain('/watch');
        expect(html).not.toContain('<button');
    });

    it('hides stale publication data when the current status cannot be verified', () => {
        state.query = { data: { ...progress, publication: {} }, isError: true };
        const html = render();
        expect(html).toContain('could not be verified for this account');
        expect(html).not.toContain('/watch');
    });
});

describe('publication view shared by the form status, alert and button', () => {
    it.each([
        ['provider_playback_mismatch', 'verification_error'],
        ['provider_verification_incomplete', 'verification_error'],
        ['provider_identity_mismatch', 'verification_error'],
        ['provider_state_invalid', 'verification_error'],
        ['provider_playback_exposed', 'verification_error'],
        ['livepeer_job_creator_mismatch', 'verification_error'],
        ['provider_unavailable', 'temporary_error'],
        ['near_job_query_failed', 'temporary_error'],
        ['rate_limited', 'temporary_error'],
        ['unrecognized provider error', 'unknown_error'],
    ])('classifies %s without trusting stale publication or expiry data', (code, kind) => {
        const result = getLivepeerPublicationView({ isError: true, error: new Error(code),
            data: { publication: {}, expired: true } });
        expect(result.kind).toBe(kind);
        expect(result.pending).toBe(false);
        expect(result.failed).toBe(kind === 'verification_error');
        expect(result.buttonLabel).not.toBe('Open publication');
        expect(JSON.stringify(result)).not.toContain(code);
    });

    it.each([
        [{ publication: {} }, 'published'],
        [{ expired: true }, 'expired'],
        [{ providerState: 'UPLOAD_EXPIRED' }, 'expired'],
        [{ providerState: 'PROVIDER_FAILED' }, 'provider_failed'],
        [{ job: { status: 'Published' } }, 'pending'],
        [{ providerState: 'FINALIZE_RETRY' }, 'pending'],
        [{ providerState: 'PROCESSING' }, 'pending'],
    ])('renders the current successful state %j', (data, kind) => {
        const view = getLivepeerPublicationView({ isError: false, data, error: new Error('provider_playback_mismatch') });
        expect(view.kind).toBe(kind);
        expect(view.pending).toBe(kind === 'pending');
        if ('job' in data && data.job.status === 'Published') expect(view.message).toBe('Finalizing publication…');
    });

    it('updates every visible decision through technical, connection, success and expiry transitions', () => {
        const results = [
            { isError: true, error: new Error('provider_playback_mismatch') },
            { isError: true, error: new Error('provider_unavailable') },
            { isError: false, data: { publication: {} } },
            { isError: false, data: { expired: true } },
        ].map(getLivepeerPublicationView);
        expect(results.map((result) => result.kind)).toEqual(['verification_error', 'temporary_error', 'published', 'expired']);
        expect(new Set(results.map((result) => result.message)).size).toBe(4);
        expect(new Set(results.map((result) => result.title)).size).toBe(4);
        expect(new Set(results.map((result) => result.buttonLabel)).size).toBe(4);
        expect(results.map((result) => result.failed)).toEqual([true, false, false, true]);
    });

    it('distinguishes known network failures from programming errors and never displays raw detail', () => {
        expect(getLivepeerPublicationView({ isError: true, error: new TypeError('Failed to fetch') }).kind).toBe('temporary_error');
        const raw = 'https://private.example/video?jwt=secret';
        const view = getLivepeerPublicationView({ isError: true, error: new TypeError(raw) });
        expect(view.kind).toBe('unknown_error');
        expect(JSON.stringify(view)).not.toContain(raw);
    });
});
