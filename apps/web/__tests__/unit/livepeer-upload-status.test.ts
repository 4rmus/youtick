import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    query: { data: undefined as unknown, isError: false },
    read: vi.fn(),
    remember: vi.fn(),
    reconcile: vi.fn(),
    authorize: vi.fn(),
    upload: vi.fn(),
    queryFn: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryFn: () => Promise<unknown> }) => {
        state.queryFn = options.queryFn;
        return state.query;
    },
}));
vi.mock('@/lib/livepeer-publication', () => ({ readLivepeerUploadProgress: state.read }));
vi.mock('@/lib/livepeer-upload', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/livepeer-upload')>(),
    rememberLivepeerUploadJob: state.remember,
    requestLivepeerUploadIntent: state.reconcile,
    fingerprintLivepeerSource: vi.fn().mockResolvedValue('a'.repeat(64)),
    authorizeLivepeerPaidJob: state.authorize,
    uploadLivepeerSource: state.upload,
}));
vi.mock('@/lib/constants', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    return { ...actual, FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, publicTestnetVideoV1: true } };
});

vi.mock('@/components/providers/WalletProvider', () => ({ useWallet: () => ({ accountId: 'creator.testnet', connect: vi.fn(), getWallet: vi.fn(), isReady: true }) }));

import { getLivepeerPublicationView, LivepeerPaidUploadForm, LivepeerUploadStatus, uploadErrorMessage } from '@/components/LivepeerPaidUploadForm';

describe('publication polling during the Published transition', () => {
    const pending = { job: { job_id: 'job-001', creator_id: 'creator.testnet', generation: 1, status: 'Authorized' }, publication: null, expired: false };
    const published = { ...pending, publication: { publication_id: 'job-001', creator_id: 'creator.testnet', generation: 1, availability: 'ACTIVE' } };

    beforeEach(() => {
        state.query = { data: undefined, isError: false };
        state.read.mockReset().mockResolvedValueOnce(pending);
        state.reconcile.mockReset().mockRejectedValue(new Error('on_chain_job_mismatch'));
        state.authorize.mockReset(); state.upload.mockReset();
        const useState = React.useState;
        let index = 0;
        vi.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
            const position = index++;
            return useState(position === 0 ? new File(['video'], 'video.mp4', { type: 'video/mp4' })
                : position === 4 ? 'job-001' : initial === 'draft' ? 'provider_processing' : initial);
        }) as typeof React.useState);
        renderToStaticMarkup(React.createElement(LivepeerPaidUploadForm));
    });
    afterEach(() => {
        expect(state.authorize).not.toHaveBeenCalled();
        expect(state.upload).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    it('confirms the same ACTIVE publication after one conflict without another Bridge request', async () => {
        state.read.mockResolvedValueOnce(published);
        const result = await state.queryFn!();
        expect(result).toEqual({ ...published, providerState: null });
        expect(getLivepeerPublicationView({ isError: false, data: result as typeof published }).kind).toBe('published');
        expect(state.read.mock.calls).toEqual([['job-001', 'creator.testnet'], ['job-001', 'creator.testnet']]);
        expect(state.reconcile).toHaveBeenCalledOnce();
        expect(state.reconcile).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-001', accountId: 'creator.testnet', recovery: 'reconcile' }));
    });

    it.each(['missing', 'other-job', 'other-creator', 'other-generation', 'takedown', 'read-failed'])('keeps the conflict when a fresh publication is not verified: %s', async condition => {
        const current = structuredClone(published);
        if (condition === 'other-job') current.publication.publication_id = 'job-other';
        if (condition === 'other-creator') current.publication.creator_id = 'other.testnet';
        if (condition === 'other-generation') current.publication.generation = 2;
        if (condition === 'takedown') current.publication.availability = 'TAKEDOWN';
        if (condition === 'read-failed') state.read.mockRejectedValueOnce(new Error('livepeer_job_creator_mismatch'));
        else state.read.mockResolvedValueOnce(condition === 'missing' ? pending : current);
        await expect(state.queryFn!()).rejects.toThrow('on_chain_job_mismatch');
        expect(state.read).toHaveBeenCalledTimes(2); expect(state.reconcile).toHaveBeenCalledOnce();
    });

    it.each(['provider_playback_mismatch', 'device_nonce_replayed', 'livepeer_control_http_409'])('does not hide a different rejection: %s', async code => {
        state.reconcile.mockRejectedValueOnce(new Error(code));
        await expect(state.queryFn!()).rejects.toThrow(code);
        expect(state.read).toHaveBeenCalledOnce(); expect(state.reconcile).toHaveBeenCalledOnce();
    });

    it('returns an already observed publication without a Bridge request', async () => {
        state.read.mockReset().mockResolvedValue(published);
        await expect(state.queryFn!()).resolves.toEqual({ ...published, providerState: null });
        expect(state.read).toHaveBeenCalledOnce(); expect(state.reconcile).not.toHaveBeenCalled();
    });
});

it.each([
    ['missing', 'is missing'], ['invalid', 'is invalid'], ['job_mismatch', 'belongs to another upload'],
    ['read_failed', 'could not be read'], ['write_failed', 'could not be saved'],
    ['readback_failed', 'could not be verified after saving'], ['unavailable', 'is unavailable'],
])('explains %s recovery information without claiming payment status', (code, reason) => {
    const message = uploadErrorMessage(new Error(`livepeer_draft_${code}`), true);
    expect(message).toBe(`Recovery information ${reason} (livepeer_draft_${code}). Keep this upload and check any existing signing or payment attempt before retrying.`);
    expect(uploadErrorMessage(new Error(`livepeer_draft_${code}: private-marker`), true)).not.toContain('private-marker');
});

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

    it('offers to abandon only a paid job that is still waiting for its file', () => {
        const onAbandon = vi.fn();
        const card = () => renderToStaticMarkup(React.createElement(LivepeerUploadStatus, {
            accountId: 'creator.testnet', jobId: 'job-001', onAbandon,
        }));
        state.query.data = { ...progress, job: { ...progress.job, status: 'Authorized', expected_source_bytes: '1000' } };
        expect(card()).toContain('Abandon this paid upload (no refund)');
        expect(render()).not.toContain('Abandon this paid upload');
        state.query.data = { ...progress, job: { ...progress.job, status: 'Authorized' }, expired: true };
        expect(card()).not.toContain('Abandon');
        state.query.data = { ...progress, job: { ...progress.job, status: 'Published' }, publication: { publication_id: 'job-001' } };
        expect(card()).not.toContain('Abandon');
        expect(uploadErrorMessage(new Error('livepeer_abandon_unavailable'), false)).toContain('could not save your choice');
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
