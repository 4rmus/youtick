import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountTicket } from '@/lib/market-read-model';
import type { LivepeerPublication } from '@/lib/livepeer-publication';

const s = vi.hoisted(() => ({
    enabled: true,
    accountId: 'buyer.testnet' as string | null,
    tickets: {} as Record<string, unknown>,
    positions: { data: undefined as unknown },
    device: { status: null as string | null },
    revision: undefined as number | undefined,
    progress: new Map<string, unknown>(),
    opened: [] as string[],
    destroyed: 0,
    getDeviceSession: vi.fn().mockResolvedValue(null),
    positionsOptions: undefined as undefined | { enabled: boolean; queryFn(context: { signal: AbortSignal }): Promise<Map<string, unknown>> },
}));

vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/market-read-model', () => ({ readAccountTickets: vi.fn() }));
vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    const FEATURE_FLAGS = { ...actual.FEATURE_FLAGS };
    Object.defineProperty(FEATURE_FLAGS, 'enableAccountReadModel', { get: () => s.enabled, enumerable: true });
    return { ...actual, FEATURE_FLAGS };
});
vi.mock('@/components/providers/WalletProvider', () => ({ useWallet: () => ({ accountId: s.accountId, connect: vi.fn(), isReady: true }) }));
vi.mock('@tanstack/react-query', () => ({
    useInfiniteQuery: () => s.tickets,
    useQuery: (options: { queryKey: unknown[] }) => {
        if (options.queryKey[0] !== 'watchPositions') return { data: undefined };
        s.positionsOptions = options as unknown as typeof s.positionsOptions;
        return s.positions;
    },
}));
vi.mock('@/components/salon/useDeviceStatus', () => ({ useDeviceStatus: () => s.device }));
vi.mock('@/lib/device-session', () => ({ getDeviceSessionRevision: () => s.revision, getDeviceSession: s.getDeviceSession }));
vi.mock('@/lib/watch-progress', () => ({
    openWatchProgress: async (input: { jobId: string }) => {
        s.opened.push(input.jobId);
        return s.progress.has(input.jobId) ? { position: s.progress.get(input.jobId), destroy: () => { s.destroyed += 1; }, save: vi.fn() } : null;
    },
}));

import { continueWatching, ticketState } from '@/components/tickets/ticket-model';
import { TicketsView } from '@/components/tickets/TicketsView';

function publication(id: string, availability: LivepeerPublication['availability'] = 'ACTIVE'): LivepeerPublication {
    return { publication_id: id, creator_id: 'kule.testnet', title: `Title ${id}`, price_usdc: '2000000', generation: 1,
        playback_id: `playback_${id}`, availability, published_at_ms: 1 } as LivepeerPublication;
}
const ticket = (id: string, availability?: LivepeerPublication['availability'], missing = false): AccountTicket =>
    ({ publicationId: id, sourceBlockHeight: 1, publication: missing ? null : publication(id, availability) });
const page = (items: AccountTicket[], overrides: Record<string, unknown> = {}) => ({
    data: { pages: [{ items, nextCursor: null, indexedAtMs: Date.UTC(2026, 8, 30, 12), watermark: {} }] },
    isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...overrides,
});

describe('ticket model', () => {
    it.each([['ACTIVE', 'watchable'], ['SALES_SUSPENDED', 'paused'], ['TAKEDOWN', 'removed']] as const)('%s → %s', (availability, state) => {
        expect(ticketState(availability)).toBe(state);
    });

    it('continues the most recently watched watchable tickets on this device', () => {
        const tickets = [ticket('a'), ticket('b', 'SALES_SUSPENDED'), ticket('c', 'TAKEDOWN'), ticket('d'), ticket('e', undefined, true), ticket('f')];
        const positions = new Map([
            ['a', { position: 30, duration: 600, updatedAt: 1 }],
            ['b', { position: 30, duration: 600, updatedAt: 5 }],
            ['c', { position: 30, duration: 600, updatedAt: 9 }],
            ['e', { position: 30, duration: 600, updatedAt: 8 }],
            ['f', { position: 30, duration: 600, updatedAt: 3 }],
        ]);
        expect(continueWatching(tickets, positions).map((item) => item.ticket.publicationId)).toEqual(['b', 'f', 'a']);
        expect(continueWatching(tickets, positions, 1)).toHaveLength(1);
    });
});

describe('tickets page', () => {
    afterEach(() => {
        s.enabled = true; s.accountId = 'buyer.testnet'; s.positions = { data: undefined }; s.device = { status: null };
    });
    const render = () => renderToStaticMarkup(React.createElement(TicketsView));

    it('asks a visitor to connect for free', () => {
        s.accountId = null;
        const html = render();
        expect(html).toContain('Connect to see your tickets');
        expect(html).not.toContain('This device');
    });

    it('shows an informative state while the account read model flag is off', () => {
        s.enabled = false;
        const html = render();
        expect(html).toContain('The ticket list is not open yet');
        expect(html).toContain('Access is always checked on NEAR.');
        expect(html).toContain('href="/"');
        expect(html).toContain('Only this device is shown here.');
    });

    it('lists tickets with state from availability, freshness and continue watching', () => {
        s.tickets = page([ticket('a'), ticket('b', 'SALES_SUSPENDED'), ticket('c', 'TAKEDOWN'), ticket('gone', undefined, true)]);
        s.positions = { data: new Map([['a', { position: 754, duration: 4800, updatedAt: 2 }]]) };
        const html = render();
        expect(html).toContain('Continue watching');
        expect(html).toContain('12:34 of 1:20:00 on this device');
        expect(html).toContain('Watchable');
        expect(html).toContain('Sales paused · still watchable');
        expect(html).toContain('Taken down · not watchable');
        expect(html).toContain('Screening details are not available yet.');
        expect(html).toContain('href="/s/b"');
        expect(html).not.toContain('href="/s/c"');
        expect(html).not.toContain('href="/s/gone"');
        expect(html).toContain('access is checked on NEAR when you open a screening');
    });

    it.each([
        ['loading', { isLoading: true, data: undefined }, 'Loading releases…'],
        ['error', { error: new Error('x'), data: undefined }, 'Try again'],
        ['empty', {}, 'No tickets yet'],
    ])('keeps the %s state', (_label, overrides, text) => {
        s.tickets = page([], overrides);
        expect(render()).toContain(text);
    });

    it.each([
        ['ready', 'Authorized for viewing.'],
        ['needed', 'the first screening you open asks once'],
        ['unknown', 'the player checks again when you watch'],
    ])('shows only this device (%s)', (status, text) => {
        s.enabled = false;
        s.device = { status };
        const html = render();
        expect(html).toContain(text);
        expect(html).not.toMatch(/other devices|slot|yuva/i);
    });
});

describe('watch positions', () => {
    it('reads this device’s records for watchable tickets only and closes each one', async () => {
        const { useWatchPositions } = await import('@/components/tickets/useWatchPositions');
        function Probe() {
            useWatchPositions('buyer.testnet', [ticket('a'), ticket('b', 'SALES_SUSPENDED'), ticket('c', 'TAKEDOWN'), ticket('d', undefined, true)]);
            return null;
        }
        renderToStaticMarkup(React.createElement(Probe));
        s.progress = new Map([['a', { position: 30, duration: 600, updatedAt: 1 }]]);
        s.opened = []; s.destroyed = 0; s.revision = undefined;
        const positions = await s.positionsOptions!.queryFn({ signal: new AbortController().signal });
        expect(s.positionsOptions!.enabled).toBe(true);
        expect(s.getDeviceSession).toHaveBeenCalledWith('buyer.testnet');
        expect(s.opened).toEqual(['a', 'b']);
        expect([...positions.keys()]).toEqual(['a']);
        expect(s.destroyed).toBe(1);
    });

    it('does not re-read the device session when the revision is already known', async () => {
        const { useWatchPositions } = await import('@/components/tickets/useWatchPositions');
        function Probe() { useWatchPositions('buyer.testnet', [ticket('a')]); return null; }
        renderToStaticMarkup(React.createElement(Probe));
        s.getDeviceSession.mockClear(); s.revision = 3;
        await s.positionsOptions!.queryFn({ signal: new AbortController().signal });
        expect(s.getDeviceSession).not.toHaveBeenCalled();
    });
});
