import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
    multiAsset: false,
    preflight: { data: undefined as unknown },
    queries: [] as Array<{ queryKey: unknown[]; enabled?: boolean }>,
    handlers: new Map<string, () => unknown>(),
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryKey: unknown[]; enabled?: boolean }) => { s.queries.push(options); return s.preflight; },
}));
vi.mock('@/lib/multi-asset-payments', () => ({
    get multiAssetPaymentsEnabled() { return s.multiAsset; },
    readPaymentPreflight: vi.fn(),
}));

function textOf(node: React.ReactNode): string {
    return React.Children.toArray(node).map((child) => typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : React.isValidElement<{ children?: React.ReactNode }>(child) ? textOf(child.props.children) : '').join('');
}
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => unknown; disabled?: boolean }) => {
        if (onClick) s.handlers.set(textOf(children), onClick);
        return React.createElement('button', { disabled }, children);
    },
}));

import { errorAction, gisePhase, giseSteps, type GiseInput } from '@/components/screening/gise-model';
import { GiseBar } from '@/components/screening/GiseBar';
import { CoverageSection } from '@/components/screening/CoverageSection';
import { purchaseErrorMessage } from '@/features/checkout/ticket-checkout';
import { messages } from '@/lib/i18n/messages';

const base: GiseInput = { accountId: 'buyer.testnet', accessView: 'locked', availability: 'ACTIVE', busy: false, step: null, error: null };
const PUBLICATION = {
    publication_id: 'job-001', creator_id: 'kule.testnet', title: 'Gece', price_usdc: '12000000', generation: 1,
    playback_id: 'playback_1', availability: 'ACTIVE' as const, published_at_ms: 1,
};

describe('box-office phase', () => {
    it.each([
        [{ accessView: 'playable' }, 'owner'],
        [{ accessView: 'playable', availability: 'SALES_SUSPENDED' }, 'owner'],
        [{ accessView: 'checking' }, 'checking'],
        [{ accessView: 'access_error' }, 'access_error'],
        [{ availability: 'SALES_SUSPENDED' }, 'closed'],
        [{ availability: 'TAKEDOWN', accountId: null }, 'closed'],
        [{ accountId: null }, 'guest'],
        [{ busy: true, step: 'verifying_price' }, 'approving'],
        [{ busy: true, step: 'reconciling_conversion' }, 'approving'],
        [{ busy: true, step: 'wallet_approval' }, 'approving'],
        [{ busy: true, step: 'waiting_entitlement' }, 'issuing'],
        [{ busy: true, step: null }, 'approving'],
        [{ error: 'x' }, 'error'],
        [{}, 'ready'],
    ] as Array<[Partial<GiseInput>, string]>)('%j → %s', (overrides, phase) => {
        expect(gisePhase({ ...base, ...overrides })).toBe(phase);
    });

    it('marks wallet, payment, ticket and watch steps', () => {
        expect(giseSteps('guest')).toEqual(['active', 'pending', 'pending', 'pending']);
        expect(giseSteps('ready')).toEqual(['done', 'active', 'pending', 'pending']);
        expect(giseSteps('approving')).toEqual(['done', 'busy', 'pending', 'pending']);
        expect(giseSteps('error')).toEqual(['done', 'failed', 'pending', 'pending']);
        expect(giseSteps('issuing')).toEqual(['done', 'done', 'busy', 'pending']);
        expect(giseSteps('owner')).toEqual(['done', 'done', 'done', 'done']);
        for (const phase of ['checking', 'access_error', 'closed'] as const) expect(giseSteps(phase)).toBeNull();
    });

    it.each(['en', 'tr'] as const)('only re-checks after a pending entitlement (%s)', (locale) => {
        expect(errorAction(purchaseErrorMessage(new Error('livepeer_entitlement_pending'), locale), locale)).toBe('recheck');
        for (const code of ['livepeer_sales_closed', 'payment_amount_changed', 'livepeer_ticket_payment_refunded', 'wallet_rejected']) {
            expect(errorAction(purchaseErrorMessage(new Error(code), locale), locale)).toBe('retry');
        }
    });
});

describe('box-office bar', () => {
    afterEach(() => { s.multiAsset = false; s.preflight = { data: undefined }; s.queries = []; s.handlers.clear(); });

    function checkout(overrides: Record<string, unknown> = {}) {
        return {
            locale: 'en', accountId: 'buyer.testnet', connect: vi.fn(), isReady: true, busy: false, step: null, error: null,
            purchase: vi.fn(), accessView: 'locked',
            entitlementQuery: { isLoading: false, isFetching: false, refetch: vi.fn().mockResolvedValue({ data: false }) },
            ...overrides,
        };
    }
    const render = (value: ReturnType<typeof checkout>, extra: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(GiseBar, {
        checkout: value as never, publication: PUBLICATION, otherAssetOpen: false, onToggleOtherAsset: vi.fn(), ...extra,
    }));

    it('asks a guest to connect for free', () => {
        const value = checkout({ accountId: null });
        const html = render(value);
        expect(html).toContain('Connecting is free; no payment is started.');
        s.handlers.get('Connect wallet')!();
        expect(value.connect).toHaveBeenCalledOnce();
        expect(html).not.toContain('Buy ticket');
    });

    it('offers the purchase with balance advice read in one preflight call', () => {
        s.preflight = { data: { usdcBalanceMicro: '24500000', usdcSufficient: true, gasSufficient: true } };
        const value = checkout();
        const html = render(value);
        expect(html).toContain('Buy ticket — 12 USDC');
        expect(html).toContain('No payment is sent unless you approve.');
        expect(html).toContain('Balance 24.5 USDC · enough');
        expect(s.queries.find((query) => query.queryKey[0] === 'ticketPreflight')?.enabled).toBe(true);
        s.handlers.get('Buy ticket — 12 USDC')!();
        expect(value.purchase).toHaveBeenCalledOnce();
    });

    it.each([
        [{ usdcBalanceMicro: '1000000', usdcSufficient: false, gasSufficient: true }, 'not enough USDC'],
        [{ usdcBalanceMicro: '99000000', usdcSufficient: true, gasSufficient: false }, 'not enough NEAR for network fees'],
    ])('explains an insufficient balance', (data, text) => {
        s.preflight = { data };
        expect(render(checkout())).toContain(text);
    });

    it.each([
        [{ busy: true, step: 'wallet_approval' }, 'Approve the 12 USDC payment in your wallet.'],
        [{ busy: true, step: 'waiting_entitlement' }, 'Do not pay again for this screening.'],
    ])('disables the purchase while it runs', (overrides, text) => {
        const html = render(checkout(overrides));
        expect(html).toContain(text);
        expect(html).toMatch(/<button disabled="">.*Buy ticket — 12 USDC<\/button>/);
        expect(s.queries.find((query) => query.queryKey[0] === 'ticketPreflight')?.enabled).toBe(false);
    });

    it('re-checks the ticket instead of paying again when the entitlement is still pending', () => {
        const value = checkout({ error: purchaseErrorMessage(new Error('livepeer_entitlement_pending'), 'en') });
        const html = render(value);
        expect(html).not.toContain('>Try again<');
        s.handlers.get('Check ticket status')!();
        expect(value.entitlementQuery.refetch).toHaveBeenCalledOnce();
        expect(value.purchase).not.toHaveBeenCalled();
    });

    it.each([
        [false, 1],
        [true, 0],
    ])('retries only after re-reading the ticket (owned=%s)', async (owned, purchases) => {
        const value = checkout({ error: purchaseErrorMessage(new Error('payment_amount_changed'), 'en') });
        value.entitlementQuery.refetch.mockResolvedValue({ data: owned });
        render(value);
        await s.handlers.get('Try again')!();
        expect(value.entitlementQuery.refetch).toHaveBeenCalledOnce();
        expect(value.purchase).toHaveBeenCalledTimes(purchases);
    });

    it('shows the owner state and no payment action', () => {
        const html = render(checkout({ accessView: 'playable' }));
        expect(html).toContain('Your ticket');
        expect(html).not.toContain('Buy ticket');
    });

    it.each([
        ['SALES_SUSPENDED', 'Ticket sales are paused.'],
        ['TAKEDOWN', 'This video is unavailable.'],
    ])('explains closed sales (%s)', (availability, text) => {
        const html = render(checkout(), { publication: { ...PUBLICATION, availability } });
        expect(html).toContain(text);
        expect(html).not.toContain('Buy ticket');
    });

    it('offers another asset only when multi-asset payments are enabled and not locked open', () => {
        expect(render(checkout())).not.toContain('Pay with another asset');
        s.multiAsset = true;
        expect(render(checkout())).toContain('aria-expanded="false"');
        expect(render(checkout(), { onToggleOtherAsset: undefined })).not.toContain('Pay with another asset');
        expect(render(checkout({ accountId: null }))).not.toContain('Pay with another asset');
    });

    it('describes ticket scope with the V1 terms wording', () => {
        for (const locale of ['en', 'tr'] as const) {
            const html = renderToStaticMarkup(React.createElement(CoverageSection, { t: messages[locale].watch }));
            expect(html).not.toMatch(/lifetime|ömür boyu|3 (devices|cihaz)|refund|iade/i);
        }
        expect(renderToStaticMarkup(React.createElement(CoverageSection, { t: messages.en.watch })))
            .toContain('A 30-day device authorization is a device access check, not the duration of your ticket right.');
    });
});
