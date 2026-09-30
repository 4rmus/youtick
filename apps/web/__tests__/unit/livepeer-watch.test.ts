import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    buyTicket: vi.fn(),
    featureFlags: { enablePlaybackAuthorizerV2: false },
    getWallet: vi.fn(),
    hasEntitlement: vi.fn(),
    invalidateQueries: vi.fn(),
    loadCheckout: vi.fn(),
    handlers: new Map<string, () => unknown>(),
    readPublication: vi.fn(),
    setQueryData: vi.fn(),
    updateCheckout: vi.fn(),
    verifyUsdc: vi.fn(),
    publicationReady: true,
    entitlement: false as boolean | undefined,
    entitlementError: null as Error | null,
    entitlementFetching: false,
    refetch: vi.fn(),
    paymentPanel: vi.fn(),
    queries: [] as Array<{ queryKey: string[]; enabled?: boolean }>,
}));

vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    return { ...actual, FEATURE_FLAGS: state.featureFlags };
});

vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryKey: string[]; enabled?: boolean }) => {
        state.queries.push(options);
        if (options.queryKey[0] === 'livepeerPublication') {
            return { data: state.publicationReady ? PUBLICATION : undefined, error: null, isLoading: !state.publicationReady };
        }
        if (options.queryKey[0] === 'livepeerEntitlement') {
            return { data: state.entitlement, error: state.entitlementError, isLoading: state.entitlement === undefined, isFetching: state.entitlementFetching, refetch: state.refetch };
        }
        return { data: undefined, error: null, isLoading: false };
    },
    useInfiniteQuery: () => ({ data: undefined }),
    useQueryClient: () => ({
        invalidateQueries: state.invalidateQueries,
        setQueryData: state.setQueryData,
    }),
}));

vi.mock('@/components/providers/WalletProvider', () => ({
    useWallet: () => ({
        accountId: 'buyer.testnet',
        connect: vi.fn(),
        getWallet: state.getWallet,
        isReady: true,
    }),
}));

function textOf(node: React.ReactNode): string {
    return React.Children.toArray(node).map((child) => typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : React.isValidElement<{ children?: React.ReactNode }>(child) ? textOf(child.props.children) : '').join('');
}

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => unknown }) => {
        if (onClick) state.handlers.set(textOf(children), onClick);
        return children;
    },
}));

vi.mock('@/components/LivepeerPlayer', () => ({ LivepeerPlayer: () => null }));
vi.mock('@/components/MultiAssetPaymentPanel', () => ({ MultiAssetPaymentPanel: () => { state.paymentPanel(); return null; } }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/market-read-model', () => ({ readMarketCreatorPublicationPage: vi.fn() }));

vi.mock('@/lib/livepeer-publication', () => ({
    buyLivepeerTicket: state.buyTicket,
    formatUsdc: (value: string) => value,
    hasLivepeerEntitlement: state.hasEntitlement,
    livepeerPublicationCoverUrl: () => null,
    readLivepeerPublication: state.readPublication,
}));

vi.mock('@/lib/multi-asset-payments', () => ({
    multiAssetPaymentsEnabled: false,
    readPaymentPreflight: vi.fn(),
    loadActivePaymentCheckout: state.loadCheckout,
    updateActivePaymentCheckoutState: state.updateCheckout,
    verifyConvertedUsdcReady: state.verifyUsdc,
}));

import { ScreeningView as LivepeerWatch } from '@/components/screening/ScreeningView';

const purchaseHandler = () => [...state.handlers].find(([label]) => label.startsWith('Buy ticket'))?.[1];

const PUBLICATION = {
    publication_id: 'job-001',
    creator_id: 'creator.testnet',
    title: 'Paid video',
    price_usdc: '2000000',
    generation: 1,
    playback_id: 'playback-001',
    availability: 'ACTIVE',
    published_at_ms: 1,
};

const CHECKOUT = {
    state: 'core_pending',
    required_usdc_micro: PUBLICATION.price_usdc,
    quote: { purpose: { type: 'ticket', publication_id: PUBLICATION.publication_id } },
};

describe('Livepeer ticket payment recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        state.featureFlags.enablePlaybackAuthorizerV2 = false;
        state.handlers.clear();
        state.publicationReady = true;
        state.entitlement = false;
        state.entitlementError = null;
        state.entitlementFetching = false;
        state.queries = [];
        state.getWallet.mockResolvedValue({});
        state.readPublication.mockResolvedValue(PUBLICATION);
        state.loadCheckout.mockReturnValue(CHECKOUT);
        state.invalidateQueries.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it.each(['loading', 'refetching a stale false response', 'failed with a stale false response'])('does not present payment while access is %s', problem => {
        if (problem === 'loading') state.entitlement = undefined;
        else if (problem === 'refetching a stale false response') state.entitlementFetching = true;
        else state.entitlementError = new Error('rpc_failed');
        const markup = renderToStaticMarkup(React.createElement(LivepeerWatch, { jobId: PUBLICATION.publication_id }));
        expect(markup).not.toContain('Buy ticket');
        expect(state.paymentPanel).not.toHaveBeenCalled();
        expect(purchaseHandler()).toBeUndefined();
        expect(state.buyTicket).not.toHaveBeenCalled();
        if (state.entitlementError) {
            state.handlers.get('Check again')!();
            expect(state.refetch).toHaveBeenCalledOnce();
        }
    });

    it('starts the entitlement query while publication data is still loading', () => {
        state.publicationReady = false;
        renderToStaticMarkup(React.createElement(LivepeerWatch, { jobId: PUBLICATION.publication_id }));
        expect(state.queries.find((query) => query.queryKey[0] === 'livepeerEntitlement')?.enabled).toBe(true);
        expect(state.buyTicket).not.toHaveBeenCalled();
    });

    it('completes an already submitted ticket without another wallet call', async () => {
        state.hasEntitlement.mockResolvedValue(true);
        renderToStaticMarkup(React.createElement(LivepeerWatch, {
            jobId: PUBLICATION.publication_id,
        }));

        void purchaseHandler()!();
        await vi.advanceTimersByTimeAsync(1_000);

        expect(state.buyTicket).not.toHaveBeenCalled();
        expect(state.updateCheckout).toHaveBeenCalledWith(
            'buyer.testnet',
            {
                purpose: { type: 'ticket', publication_id: PUBLICATION.publication_id },
                requiredUsdcMicro: PUBLICATION.price_usdc,
            },
            'complete',
        );
    });

    it('reopens a fully refunded ticket payment after final balance verification', async () => {
        state.hasEntitlement.mockResolvedValue(false);
        state.verifyUsdc.mockResolvedValue(true);
        renderToStaticMarkup(React.createElement(LivepeerWatch, {
            jobId: PUBLICATION.publication_id,
        }));

        void purchaseHandler()!();
        await vi.advanceTimersByTimeAsync(15_000);

        expect(state.buyTicket).not.toHaveBeenCalled();
        expect(state.verifyUsdc).toHaveBeenCalledWith({
            accountId: 'buyer.testnet',
            requiredUsdcMicro: PUBLICATION.price_usdc,
            status: 'SUCCESS',
        });
        expect(state.updateCheckout).toHaveBeenCalledWith(
            'buyer.testnet',
            {
                purpose: { type: 'ticket', publication_id: PUBLICATION.publication_id },
                requiredUsdcMicro: PUBLICATION.price_usdc,
            },
            'usdc_final',
        );
    });

    it.each([
        ['legacy playback', false, true],
        ['playback v2', true, false],
    ])('%s handles legacy key guidance', (_label, enableV2, expected) => {
        state.featureFlags.enablePlaybackAuthorizerV2 = enableV2;

        const markup = renderToStaticMarkup(React.createElement(LivepeerWatch, {
            jobId: PUBLICATION.publication_id,
        }));

        expect(markup.includes('one-time playback-key setup')).toBe(expected);
    });
});
