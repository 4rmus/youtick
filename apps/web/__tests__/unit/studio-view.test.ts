import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LivepeerPublication } from '@/lib/livepeer-publication';

const s = vi.hoisted(() => ({
    flags: { enablePaidMediaLivepeerV1: true, enableDerivedReadModel: true, enableCurrentCatalog: false, enableAccountReadModel: false },
    accountId: 'creator.testnet' as string | null,
    queries: {} as Record<string, unknown>,
    options: {} as Record<string, { enabled?: boolean; queryFn?: () => Promise<unknown> }>,
    infinite: {} as Record<string, unknown>,
    current: {} as Record<string, unknown>,
    handlers: new Map<string, () => unknown>(),
    withdraw: vi.fn(),
    invalidate: vi.fn(),
    remembered: null as string | null,
    progress: vi.fn(),
}));

vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    const FEATURE_FLAGS = { ...actual.FEATURE_FLAGS };
    for (const key of Object.keys(s.flags) as Array<keyof typeof s.flags>) {
        Object.defineProperty(FEATURE_FLAGS, key, { get: () => s.flags[key], enumerable: true });
    }
    return { ...actual, FEATURE_FLAGS };
});
vi.mock('@/components/providers/WalletProvider', () => ({ useWallet: () => ({ accountId: s.accountId, connect: vi.fn(), getWallet: async () => ({}), isReady: true }) }));
vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryKey: string[]; enabled?: boolean; queryFn?: () => Promise<unknown> }) => {
        s.options[options.queryKey[0]] = options;
        return s.queries[options.queryKey[0]] ?? { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
    },
    useInfiniteQuery: () => s.infinite,
    useQueryClient: () => ({ invalidateQueries: s.invalidate }),
}));
vi.mock('@/hooks/useCurrentCatalog', () => ({ useCurrentCatalog: () => s.current }));
vi.mock('@/lib/livepeer-publication', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/livepeer-publication')>(),
    withdrawCreatorBalance: s.withdraw,
    readLivepeerUploadProgress: s.progress,
}));
vi.mock('@/lib/livepeer-upload', () => ({ readRememberedLivepeerUploadJob: () => s.remembered }));
function textOf(node: React.ReactNode): string {
    return React.Children.toArray(node).map((child) => typeof child === 'string' ? child
        : React.isValidElement<{ children?: React.ReactNode }>(child) ? textOf(child.props.children) : '').join('');
}
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => unknown; disabled?: boolean }) => {
        if (onClick) s.handlers.set(textOf(children), onClick);
        return React.createElement('button', { disabled }, children);
    },
}));

import { StudioView } from '@/components/studio/StudioView';
import { canWithdraw, usdcSalesByPublication } from '@/components/studio/studio-model';
import ProfilePage from '@/app/profile/page';

function publication(id: string, availability: LivepeerPublication['availability'] = 'ACTIVE'): LivepeerPublication {
    return { publication_id: id, creator_id: 'creator.testnet', title: `Title ${id}`, price_usdc: '2000000', generation: 1,
        playback_id: `playback_${id}`, availability, published_at_ms: 1 } as LivepeerPublication;
}
const render = () => renderToStaticMarkup(React.createElement(StudioView));

describe('studio model', () => {
    it('sums USDC earnings per publication exactly and ignores NEAR rows', () => {
        const totals = usdcSalesByPublication([
            { publicationId: 'a', asset: 'USDC', saleCount: 2, grossAmount: '4000000', creatorAmount: '3800000', platformAmount: '200000', lastSaleBlockHeight: 1 },
            { publicationId: 'a', asset: 'NEAR', saleCount: 9, grossAmount: '10', creatorAmount: '9', platformAmount: '1', lastSaleBlockHeight: 1 },
            { publicationId: 'b', asset: 'USDC', saleCount: 1, grossAmount: '99999999999999999999', creatorAmount: '95000000000000000000', platformAmount: '4999999999999999999', lastSaleBlockHeight: 1 },
        ]);
        expect(totals.get('a')).toEqual({ saleCount: 2, creatorAmount: 3_800_000n });
        expect(totals.get('b')?.creatorAmount).toBe(95_000_000_000_000_000_000n);
    });

    it.each([[undefined, false], ['0', false], ['1', true], ['abc', false]])('can withdraw %s → %s', (balance, expected) => {
        expect(canWithdraw(balance)).toBe(expected);
    });
});

describe('studio', () => {
    afterEach(() => {
        Object.assign(s.flags, { enablePaidMediaLivepeerV1: true, enableDerivedReadModel: true, enableCurrentCatalog: false, enableAccountReadModel: false });
        s.accountId = 'creator.testnet'; s.queries = {}; s.options = {}; s.handlers.clear(); s.remembered = null;
        s.withdraw.mockReset(); s.invalidate.mockReset();
    });

    it('labels the withdrawable balance as the NEAR market amount and confirms before withdrawing', async () => {
        s.queries.creatorBalance = { data: '24500000', isLoading: false, error: null };
        const html = render();
        expect(html).toContain('Withdrawable balance');
        expect(html).toContain('24.5');
        expect(html).toContain('Read from the NEAR market contract');
        expect(html).toContain('Amount');
        expect(html).toContain('Recipient');
        expect(html).toContain('Paid in NEAR from your wallet');
        expect(s.withdraw).not.toHaveBeenCalled();
        s.handlers.get('Approve in wallet')!();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(s.withdraw).toHaveBeenCalledOnce();
        expect(s.invalidate).toHaveBeenCalledWith({ queryKey: ['creatorBalance', 'creator.testnet'] });
    });

    it('re-reads the balance when the wallet reply is lost', async () => {
        s.queries.creatorBalance = { data: '1', isLoading: false, error: null };
        s.withdraw.mockRejectedValue(new Error('wallet closed'));
        render();
        s.handlers.get('Approve in wallet')!();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(s.invalidate).toHaveBeenCalledOnce();
    });

    it('does not offer a withdrawal of a zero balance', () => {
        s.queries.creatorBalance = { data: '0', isLoading: false, error: null };
        expect(render()).toMatch(/<button disabled="">Withdraw<\/button>/);
    });

    it('lists screenings from the creator catalogue without sales columns until account data exists', () => {
        s.queries.creatorReadModel = { data: [publication('a'), publication('b', 'SALES_SUSPENDED')], isLoading: false, error: null, refetch: vi.fn() };
        const html = render();
        expect(s.options.creatorReadModel.enabled).toBe(true);
        expect(html).toContain('href="/s/a"');
        expect(html).toContain('sales suspended');
        expect(html).not.toContain('Tickets sold');
        expect(s.options.creatorSales.enabled).toBe(false);
    });

    it('uses the current catalogue creator view when enabled', () => {
        s.flags.enableCurrentCatalog = true;
        s.current = { publications: [publication('c')], loading: false, error: null, warning: 'The catalogue is being updated.', refetch: vi.fn() };
        const html = render();
        expect(s.options.creatorReadModel.enabled).toBe(false);
        expect(html).toContain('href="/s/c"');
        expect(html).toContain('The catalogue is being updated.');
    });

    it('adds sales and earnings columns only with account read-model data', () => {
        s.flags.enableAccountReadModel = true;
        s.queries.creatorReadModel = { data: [publication('a'), publication('b')], isLoading: false, error: null, refetch: vi.fn() };
        s.queries.creatorSales = { data: { indexedAtMs: Date.UTC(2026, 8, 30), items: [
            { publicationId: 'a', asset: 'USDC', saleCount: 3, grossAmount: '6000000', creatorAmount: '5700000', platformAmount: '300000', lastSaleBlockHeight: 1 },
        ] } };
        s.infinite = { data: { pages: [{ items: [{ withdrawalId: 'w1', asset: 'USDC', amount: '1900000', status: 'failed', reasonCode: null, sourceBlockHeight: 1 }] }] } };
        const html = render();
        expect(html).toContain('Tickets sold');
        expect(html).toContain('5.7 USDC');
        expect(html).toContain('Sales totals updated');
        expect(html).toContain('Withdrawals');
        expect(html).toContain('Failed');
    });

    it('shows the unfinished upload strip from this device and links back to the same job', async () => {
        s.remembered = 'job-9';
        s.queries.studioResumeUpload = { data: { jobId: 'job-9', publication: null, expired: false } };
        expect(render()).toContain('href="/studio/new?job=job-9"');
        s.progress.mockResolvedValue({ job: {}, publication: null, expired: false });
        await expect(s.options.studioResumeUpload.queryFn!()).resolves.toMatchObject({ jobId: 'job-9' });
        expect(s.progress).toHaveBeenCalledWith('job-9', 'creator.testnet');
        s.queries.studioResumeUpload = { data: { jobId: 'job-9', publication: null, expired: true } };
        const expired = render();
        expect(expired).toContain('deadline for the last upload');
        expect(expired).not.toContain('Continue upload');
        s.queries.studioResumeUpload = { data: { jobId: 'job-9', publication: publication('job-9'), expired: false } };
        expect(render()).not.toContain('Unfinished upload');
    });

    it('asks to connect, keeps the runtime gate and serves the old profile path', () => {
        s.accountId = null;
        expect(render()).toContain('Connect the NEAR wallet that owns your publications.');
        Object.assign(s.flags, { enablePaidMediaLivepeerV1: false, enableDerivedReadModel: false });
        expect(render()).toContain('Publishing is not open yet');
        expect(renderToStaticMarkup(React.createElement(ProfilePage))).toContain('Publishing is not open yet');
    });
});
