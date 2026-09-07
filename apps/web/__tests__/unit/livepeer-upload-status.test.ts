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

import { LivepeerUploadStatus } from '@/components/LivepeerPaidUploadForm';

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
