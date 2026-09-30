import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    canStartTicketPurchase,
    purchaseErrorMessage,
    purchaseLivepeerTicket,
    ticketAccessView,
    waitForLivepeerEntitlement,
    type TicketPurchaseDeps,
    type TicketPurchaseStep,
} from '@/features/checkout/ticket-checkout';
import type { LivepeerPublication } from '@/lib/livepeer-publication';
import type { ActivePaymentCheckout } from '@/lib/multi-asset-payments';

const PUBLICATION: LivepeerPublication = {
    publication_id: 'job-001',
    creator_id: 'creator.testnet',
    title: 'Paid video',
    price_usdc: '2000000',
    generation: 1,
    playback_id: 'playback-001',
    availability: 'ACTIVE',
    published_at_ms: 1,
};
const ACCOUNT = 'buyer.testnet';
const PURPOSE = { type: 'ticket' as const, publication_id: PUBLICATION.publication_id };
const EXPECTATION = { purpose: PURPOSE, requiredUsdcMicro: PUBLICATION.price_usdc };
const WALLET = { signAndSendTransaction: vi.fn(), signAndSendTransactions: vi.fn() };

function checkout(state: ActivePaymentCheckout['state'], publicationId = PUBLICATION.publication_id) {
    return {
        state,
        required_usdc_micro: PUBLICATION.price_usdc,
        quote: { purpose: { type: 'ticket', publication_id: publicationId } },
    } as unknown as ActivePaymentCheckout;
}

function setup(overrides: Partial<TicketPurchaseDeps> = {}) {
    const sleeps: number[] = [];
    const deps: TicketPurchaseDeps = {
        readPublication: vi.fn().mockResolvedValue(PUBLICATION),
        hasEntitlement: vi.fn().mockResolvedValue(true),
        buyTicket: vi.fn().mockResolvedValue(undefined),
        loadCheckout: vi.fn().mockReturnValue(null),
        updateCheckout: vi.fn().mockReturnValue({}),
        verifyUsdc: vi.fn().mockResolvedValue(true),
        sleep: vi.fn(async (milliseconds: number) => { sleeps.push(milliseconds); }),
        ...overrides,
    };
    const steps: TicketPurchaseStep[] = [];
    const callbacks = {
        getWallet: vi.fn().mockResolvedValue(WALLET),
        onPriceChanged: vi.fn(),
        onEntitlementConfirmed: vi.fn().mockResolvedValue(undefined),
        onStep: (step: TicketPurchaseStep) => steps.push(step),
    };
    const run = () => purchaseLivepeerTicket({
        accountId: ACCOUNT,
        jobId: PUBLICATION.publication_id,
        publication: PUBLICATION,
        purpose: PURPOSE,
        ...callbacks,
    }, deps);
    return { deps, callbacks, steps, sleeps, run };
}

describe('purchaseLivepeerTicket', () => {
    beforeEach(() => vi.clearAllMocks());

    it('buys once and confirms the entitlement without touching checkout state', async () => {
        const { deps, callbacks, steps, sleeps, run } = setup();
        await run();
        expect(deps.buyTicket).toHaveBeenCalledOnce();
        expect(deps.buyTicket).toHaveBeenCalledWith(WALLET, ACCOUNT, PUBLICATION);
        expect(callbacks.onEntitlementConfirmed).toHaveBeenCalledOnce();
        expect(deps.updateCheckout).not.toHaveBeenCalled();
        expect(steps).toEqual(['verifying_price', 'wallet_approval', 'waiting_entitlement']);
        expect(sleeps).toEqual([1_000]);
    });

    it.each([
        ['missing', null],
        ['suspended', { ...PUBLICATION, availability: 'SALES_SUSPENDED' as const }],
        ['taken down', { ...PUBLICATION, availability: 'TAKEDOWN' as const }],
    ])('refuses a %s publication before any wallet call', async (_label, current) => {
        const { deps, callbacks, run } = setup({ readPublication: vi.fn().mockResolvedValue(current) });
        await expect(run()).rejects.toThrow('livepeer_sales_closed');
        expect(callbacks.getWallet).not.toHaveBeenCalled();
        expect(deps.buyTicket).not.toHaveBeenCalled();
    });

    it('stops on a changed price and hands the current publication back', async () => {
        const changed = { ...PUBLICATION, price_usdc: '3000000' };
        const { deps, callbacks, run } = setup({ readPublication: vi.fn().mockResolvedValue(changed) });
        await expect(run()).rejects.toThrow('payment_amount_changed');
        expect(callbacks.onPriceChanged).toHaveBeenCalledWith(changed);
        expect(deps.buyTicket).not.toHaveBeenCalled();
    });

    it('reports a pending entitlement after the bounded 1+2+4+8 second wait', async () => {
        const { deps, sleeps, run } = setup({ hasEntitlement: vi.fn().mockRejectedValue(new Error('rpc')) });
        await expect(run()).rejects.toThrow('livepeer_entitlement_pending');
        expect(sleeps).toEqual([1_000, 2_000, 4_000, 8_000]);
        expect(deps.hasEntitlement).toHaveBeenCalledTimes(4);
        expect(deps.updateCheckout).not.toHaveBeenCalled();
    });

    it('ignores a conversion checkout for another publication', async () => {
        const { deps, run } = setup({ loadCheckout: vi.fn().mockReturnValue(checkout('usdc_final', 'job-other')) });
        await run();
        expect(deps.verifyUsdc).not.toHaveBeenCalled();
        expect(deps.updateCheckout).not.toHaveBeenCalled();
        expect(deps.buyTicket).toHaveBeenCalledOnce();
    });

    it('moves a final converted USDC checkout through core_pending to complete', async () => {
        const { deps, steps, run } = setup({ loadCheckout: vi.fn().mockReturnValue(checkout('usdc_final')) });
        await run();
        expect(deps.verifyUsdc).toHaveBeenCalledWith({
            accountId: ACCOUNT,
            requiredUsdcMicro: PUBLICATION.price_usdc,
            status: 'SUCCESS',
        });
        expect(vi.mocked(deps.updateCheckout).mock.calls.map((call) => call[2])).toEqual(['core_pending', 'complete']);
        expect(deps.updateCheckout).toHaveBeenCalledWith(ACCOUNT, EXPECTATION, 'complete');
        expect(steps).toEqual(['verifying_price', 'reconciling_conversion', 'wallet_approval', 'waiting_entitlement']);
    });

    it('stops before paying when converted USDC is no longer sufficient', async () => {
        const { deps, run } = setup({
            loadCheckout: vi.fn().mockReturnValue(checkout('usdc_final')),
            verifyUsdc: vi.fn().mockResolvedValue(false),
        });
        await expect(run()).rejects.toThrow('payment_converted_usdc_not_ready');
        expect(deps.buyTicket).not.toHaveBeenCalled();
        expect(deps.updateCheckout).not.toHaveBeenCalled();
    });

    it('returns a refunded converted payment to usdc_final after the wallet call', async () => {
        const { deps, run } = setup({
            loadCheckout: vi.fn().mockReturnValue(checkout('usdc_final')),
            hasEntitlement: vi.fn().mockResolvedValue(false),
        });
        await expect(run()).rejects.toThrow('livepeer_ticket_payment_refunded');
        expect(deps.buyTicket).toHaveBeenCalledOnce();
        expect(vi.mocked(deps.updateCheckout).mock.calls.map((call) => call[2]))
            .toEqual(['core_pending', 'usdc_final', 'usdc_final']);
    });

    it('keeps core_pending when a converted payment is neither settled nor refunded', async () => {
        const verifyUsdc = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const { deps, run } = setup({
            loadCheckout: vi.fn().mockReturnValue(checkout('usdc_final')),
            hasEntitlement: vi.fn().mockResolvedValue(false),
            verifyUsdc,
        });
        await expect(run()).rejects.toThrow('livepeer_entitlement_pending');
        expect(vi.mocked(deps.updateCheckout).mock.calls.map((call) => call[2])).toEqual(['core_pending']);
    });

    it('reverts a converted checkout to usdc_final when the wallet call fails', async () => {
        const { deps, run } = setup({
            loadCheckout: vi.fn().mockReturnValue(checkout('usdc_final')),
            buyTicket: vi.fn().mockRejectedValue(new Error('livepeer_wallet_rejected')),
        });
        await expect(run()).rejects.toThrow('livepeer_wallet_rejected');
        expect(vi.mocked(deps.updateCheckout).mock.calls.map((call) => call[2])).toEqual(['core_pending', 'usdc_final']);
    });

    it('completes an already submitted core_pending ticket without another wallet call', async () => {
        const { deps, callbacks, steps, run } = setup({ loadCheckout: vi.fn().mockReturnValue(checkout('core_pending')) });
        await run();
        expect(callbacks.getWallet).not.toHaveBeenCalled();
        expect(deps.buyTicket).not.toHaveBeenCalled();
        expect(callbacks.onEntitlementConfirmed).toHaveBeenCalledOnce();
        expect(deps.updateCheckout).toHaveBeenCalledWith(ACCOUNT, EXPECTATION, 'complete');
        expect(steps).toEqual(['verifying_price', 'waiting_entitlement']);
    });

    it('reopens a refunded core_pending ticket without another wallet call', async () => {
        const { deps, run } = setup({
            loadCheckout: vi.fn().mockReturnValue(checkout('core_pending')),
            hasEntitlement: vi.fn().mockResolvedValue(false),
        });
        await expect(run()).rejects.toThrow('livepeer_ticket_payment_refunded');
        expect(deps.buyTicket).not.toHaveBeenCalled();
        expect(vi.mocked(deps.updateCheckout).mock.calls.map((call) => call[2])).toEqual(['usdc_final', 'usdc_final']);
    });

    it('keeps an unresolved core_pending ticket pending without another wallet call', async () => {
        const { deps, run } = setup({
            loadCheckout: vi.fn().mockReturnValue(checkout('core_pending')),
            hasEntitlement: vi.fn().mockResolvedValue(false),
            verifyUsdc: vi.fn().mockRejectedValue(new Error('rpc')),
        });
        await expect(run()).rejects.toThrow('livepeer_entitlement_pending');
        expect(deps.buyTicket).not.toHaveBeenCalled();
        expect(deps.updateCheckout).not.toHaveBeenCalled();
    });
});

describe('waitForLivepeerEntitlement', () => {
    it('stops polling at the first confirmed entitlement', async () => {
        const sleeps: number[] = [];
        const hasEntitlement = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const confirmed = await waitForLivepeerEntitlement(ACCOUNT, PUBLICATION.publication_id, {
            hasEntitlement,
            sleep: async (milliseconds) => { sleeps.push(milliseconds); },
        });
        expect(confirmed).toBe(true);
        expect(sleeps).toEqual([1_000, 2_000]);
    });
});

describe('ticketAccessView', () => {
    const view = (overrides: Partial<Parameters<typeof ticketAccessView>[0]> = {}) => ticketAccessView({
        isReady: true,
        accountId: ACCOUNT,
        availability: 'ACTIVE',
        entitlement: { data: false, error: null, isFetching: false },
        ...overrides,
    });

    it.each([
        ['an owned active ticket', {}, { data: true }, 'playable'],
        ['an owned suspended ticket', { availability: 'SALES_SUSPENDED' as const }, { data: true }, 'playable'],
        ['an owned takedown as the existing checking view', { availability: 'TAKEDOWN' as const }, { data: true }, 'checking'],
        ['a loading entitlement', {}, { data: undefined }, 'checking'],
        ['a refetching stale false', {}, { isFetching: true }, 'checking'],
        ['a failed entitlement read', {}, { error: new Error('rpc') }, 'access_error'],
        ['a buyer without a ticket', {}, {}, 'locked'],
    ])('maps %s', (_label, input, entitlement, expected) => {
        expect(view({ ...input, entitlement: { data: false, error: null, isFetching: false, ...entitlement } })).toBe(expected);
    });

    it('waits for the wallet before showing a lock', () => {
        expect(view({ isReady: false, accountId: null, entitlement: { data: undefined, error: null, isFetching: false } })).toBe('checking');
    });

    it('shows the lock to a visitor without an account', () => {
        expect(view({ accountId: null, entitlement: { data: undefined, error: null, isFetching: false } })).toBe('locked');
    });
});

describe('canStartTicketPurchase', () => {
    it.each([
        [{ data: false, error: null, isFetching: false }, true],
        [{ data: true, error: null, isFetching: false }, false],
        [{ data: undefined, error: null, isFetching: false }, false],
        [{ data: false, error: null, isFetching: true }, false],
        [{ data: false, error: new Error('rpc'), isFetching: false }, false],
    ])('allows purchase only for a settled false entitlement (%o)', (entitlement, expected) => {
        expect(canStartTicketPurchase({ accountId: ACCOUNT, publication: PUBLICATION, entitlement })).toBe(expected);
    });

    it('requires an account and a publication', () => {
        const entitlement = { data: false, error: null, isFetching: false };
        expect(canStartTicketPurchase({ accountId: null, publication: PUBLICATION, entitlement })).toBe(false);
        expect(canStartTicketPurchase({ accountId: ACCOUNT, publication: undefined, entitlement })).toBe(false);
    });
});

describe('purchaseErrorMessage', () => {
    it.each([
        ['device_session_storage_unavailable', 'Enable secure site storage and use a supported browser before continuing. No payment was sent.'],
        ['device_session_crypto_unavailable', 'Enable secure site storage and use a supported browser before continuing. No payment was sent.'],
        ['livepeer_entitlement_pending', 'Your ticket is still syncing. Try again shortly.'],
        ['livepeer_sales_closed', 'Ticket sales are paused for this video.'],
        ['payment_amount_changed', 'The ticket price changed. Review the updated amount before paying.'],
        ['payment_converted_usdc_not_ready', 'The converted USDC balance or NEAR gas reserve is no longer sufficient.'],
        ['livepeer_ticket_payment_refunded', 'The ticket payment did not settle. Your USDC is still available to retry.'],
        ['livepeer_wallet_rejected', 'The ticket could not be purchased. Check your wallet and try again.'],
    ])('maps %s', (code, message) => {
        expect(purchaseErrorMessage(new Error(code))).toBe(message);
    });

    it('falls back for non-Error reasons', () => {
        expect(purchaseErrorMessage('boom')).toBe('The ticket could not be purchased. Check your wallet and try again.');
    });
});
