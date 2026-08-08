import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    buyTicket: vi.fn(),
    getWallet: vi.fn(),
    hasEntitlement: vi.fn(),
    invalidateQueries: vi.fn(),
    loadCheckout: vi.fn(),
    onPurchase: null as null | (() => void),
    readPublication: vi.fn(),
    setQueryData: vi.fn(),
    updateCheckout: vi.fn(),
    verifyUsdc: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: ({ queryKey }: { queryKey: string[] }) => (queryKey[0] === 'livepeerPublication'
        ? { data: PUBLICATION, error: null, isLoading: false }
        : { data: false, error: null, isLoading: false }),
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

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => {
        if (onClick) state.onPurchase = onClick;
        return children;
    },
}));

vi.mock('@/components/PageShell', () => ({ PageShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/ScreenState', () => ({ ScreenState: () => null }));
vi.mock('@/components/LivepeerPlayer', () => ({ LivepeerPlayer: () => null }));
vi.mock('@/components/MultiAssetPaymentPanel', () => ({ MultiAssetPaymentPanel: () => null }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('lucide-react', () => ({
    ArrowLeft: () => null,
    Loader2: () => null,
    Lock: () => null,
    Video: () => null,
}));

vi.mock('@/lib/livepeer-publication', () => ({
    buyLivepeerTicket: state.buyTicket,
    formatUsdc: (value: string) => value,
    hasLivepeerEntitlement: state.hasEntitlement,
    livepeerPublicationCoverUrl: () => null,
    readLivepeerPublication: state.readPublication,
}));

vi.mock('@/lib/multi-asset-payments', () => ({
    loadActivePaymentCheckout: state.loadCheckout,
    updateActivePaymentCheckoutState: state.updateCheckout,
    verifyConvertedUsdcReady: state.verifyUsdc,
}));

import { LivepeerWatch } from '@/components/LivepeerWatch';

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
        state.onPurchase = null;
        state.getWallet.mockResolvedValue({});
        state.readPublication.mockResolvedValue(PUBLICATION);
        state.loadCheckout.mockReturnValue(CHECKOUT);
        state.invalidateQueries.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('completes an already submitted ticket without another wallet call', async () => {
        state.hasEntitlement.mockResolvedValue(true);
        renderToStaticMarkup(React.createElement(LivepeerWatch, {
            jobId: PUBLICATION.publication_id,
        }));

        state.onPurchase?.();
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

        state.onPurchase?.();
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
});
