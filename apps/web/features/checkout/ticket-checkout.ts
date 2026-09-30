import {
    buyLivepeerTicket,
    hasLivepeerEntitlement,
    readLivepeerPublication,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';
import {
    loadActivePaymentCheckout,
    updateActivePaymentCheckoutState,
    verifyConvertedUsdcReady,
    type PaymentPurpose,
} from '@/lib/multi-asset-payments';
import type { WalletInstance } from '@/lib/types';

// UI progress markers at the existing call sites; the payment state stays ActivePaymentCheckout.state.
export type TicketPurchaseStep =
    | 'verifying_price'
    | 'reconciling_conversion'
    | 'wallet_approval'
    | 'waiting_entitlement';

export type TicketPurchaseDeps = {
    readPublication: typeof readLivepeerPublication;
    hasEntitlement: typeof hasLivepeerEntitlement;
    buyTicket: typeof buyLivepeerTicket;
    loadCheckout: typeof loadActivePaymentCheckout;
    updateCheckout: typeof updateActivePaymentCheckoutState;
    verifyUsdc: typeof verifyConvertedUsdcReady;
    sleep(milliseconds: number): Promise<void>;
};

type ConversionExpectation = {
    purpose: PaymentPurpose;
    requiredUsdcMicro: string;
};

const ENTITLEMENT_POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

export const defaultTicketPurchaseDeps: TicketPurchaseDeps = {
    readPublication: (jobId) => readLivepeerPublication(jobId),
    hasEntitlement: (accountId, jobId) => hasLivepeerEntitlement(accountId, jobId),
    buyTicket: (wallet, accountId, publication) => buyLivepeerTicket(wallet, accountId, publication),
    loadCheckout: (accountId) => loadActivePaymentCheckout(accountId),
    updateCheckout: (accountId, expectation, state) => updateActivePaymentCheckoutState(accountId, expectation, state),
    verifyUsdc: (input) => verifyConvertedUsdcReady(input),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function purchaseLivepeerTicket(input: {
    accountId: string;
    jobId: string;
    publication: LivepeerPublication;
    purpose: PaymentPurpose;
    getWallet(): Promise<WalletInstance>;
    onPriceChanged(current: LivepeerPublication): void;
    onEntitlementConfirmed(): Promise<void>;
    onStep?(step: TicketPurchaseStep): void;
}, deps: TicketPurchaseDeps = defaultTicketPurchaseDeps): Promise<void> {
    const { accountId, jobId, publication, purpose } = input;
    let convertedCheckout = false;
    let conversionExpectation: ConversionExpectation | null = null;
    try {
        input.onStep?.('verifying_price');
        const current = await deps.readPublication(jobId);
        if (!current || current.availability !== 'ACTIVE') throw new Error('livepeer_sales_closed');
        if (current.price_usdc !== publication.price_usdc) {
            input.onPriceChanged(current);
            throw new Error('payment_amount_changed');
        }
        const activeCheckout = deps.loadCheckout(accountId);
        const matchingCheckout = activeCheckout
            && activeCheckout.quote.purpose.type === 'ticket'
            && activeCheckout.quote.purpose.publication_id === jobId
            ? activeCheckout
            : null;
        if (matchingCheckout?.state === 'usdc_final') {
            input.onStep?.('reconciling_conversion');
            const ready = await deps.verifyUsdc({
                accountId,
                requiredUsdcMicro: current.price_usdc,
                status: 'SUCCESS',
            });
            if (!ready) throw new Error('payment_converted_usdc_not_ready');
            conversionExpectation = {
                purpose,
                requiredUsdcMicro: matchingCheckout.required_usdc_micro,
            };
            convertedCheckout = deps.updateCheckout(
                accountId,
                conversionExpectation,
                'core_pending',
            ) !== null;
        } else if (matchingCheckout?.state === 'core_pending') {
            input.onStep?.('waiting_entitlement');
            conversionExpectation = {
                purpose,
                requiredUsdcMicro: matchingCheckout.required_usdc_micro,
            };
            convertedCheckout = true;
            if (await waitForLivepeerEntitlement(accountId, jobId, deps)) {
                await input.onEntitlementConfirmed();
                deps.updateCheckout(accountId, conversionExpectation, 'complete');
                return;
            }
            await recoverRefundedTicketPayment(
                accountId,
                conversionExpectation.requiredUsdcMicro,
                conversionExpectation,
                deps,
            );
        }
        input.onStep?.('wallet_approval');
        await deps.buyTicket(await input.getWallet(), accountId, current);
        input.onStep?.('waiting_entitlement');
        if (await waitForLivepeerEntitlement(accountId, jobId, deps)) {
            await input.onEntitlementConfirmed();
            if (convertedCheckout && conversionExpectation) {
                deps.updateCheckout(accountId, conversionExpectation, 'complete');
            }
            return;
        }
        if (convertedCheckout && conversionExpectation) {
            await recoverRefundedTicketPayment(
                accountId,
                current.price_usdc,
                conversionExpectation,
                deps,
            );
        }
        throw new Error('livepeer_entitlement_pending');
    } catch (reason) {
        if (convertedCheckout
            && conversionExpectation
            && !(reason instanceof Error && reason.message === 'livepeer_entitlement_pending')) {
            deps.updateCheckout(accountId, conversionExpectation, 'usdc_final');
        }
        throw reason;
    }
}

export async function waitForLivepeerEntitlement(
    accountId: string,
    jobId: string,
    deps: Pick<TicketPurchaseDeps, 'hasEntitlement' | 'sleep'> = defaultTicketPurchaseDeps,
): Promise<boolean> {
    for (const delay of ENTITLEMENT_POLL_DELAYS_MS) {
        await deps.sleep(delay);
        if (await deps.hasEntitlement(accountId, jobId).catch(() => false)) return true;
    }
    return false;
}

async function recoverRefundedTicketPayment(
    accountId: string,
    requiredUsdcMicro: string,
    expectation: ConversionExpectation,
    deps: TicketPurchaseDeps,
): Promise<never> {
    const refunded = await deps.verifyUsdc({
        accountId,
        requiredUsdcMicro,
        status: 'SUCCESS',
    }).catch(() => false);
    if (refunded) {
        deps.updateCheckout(accountId, expectation, 'usdc_final');
        throw new Error('livepeer_ticket_payment_refunded');
    }
    throw new Error('livepeer_entitlement_pending');
}

export function purchaseErrorMessage(reason: unknown): string {
    const message = reason instanceof Error ? reason.message : '';
    if (['device_session_storage_unavailable', 'device_session_crypto_unavailable'].includes(message)) {
        return 'Enable secure site storage and use a supported browser before continuing. No payment was sent.';
    }
    if (message === 'livepeer_entitlement_pending') {
        return 'Your ticket is still syncing. Try again shortly.';
    }
    if (message === 'livepeer_sales_closed') {
        return 'Ticket sales are paused for this video.';
    }
    if (message === 'payment_amount_changed') {
        return 'The ticket price changed. Review the updated amount before paying.';
    }
    if (message === 'payment_converted_usdc_not_ready') {
        return 'The converted USDC balance or NEAR gas reserve is no longer sufficient.';
    }
    if (message === 'livepeer_ticket_payment_refunded') {
        return 'The ticket payment did not settle. Your USDC is still available to retry.';
    }
    return 'The ticket could not be purchased. Check your wallet and try again.';
}

export type TicketAccessView = 'playable' | 'checking' | 'access_error' | 'locked';

export type TicketEntitlementState = {
    data?: boolean;
    error: unknown;
    isFetching: boolean;
};

export function ticketAccessView(input: {
    isReady: boolean;
    accountId: string | null | undefined;
    availability: LivepeerPublication['availability'];
    entitlement: TicketEntitlementState;
}): TicketAccessView {
    const { accountId, entitlement } = input;
    const canPlay = entitlement.data === true && input.availability !== 'TAKEDOWN';
    if (canPlay && accountId) return 'playable';
    if (!input.isReady || (accountId && (entitlement.error || entitlement.isFetching || entitlement.data !== false))) {
        return entitlement.error ? 'access_error' : 'checking';
    }
    return 'locked';
}

export function canStartTicketPurchase(input: {
    accountId: string | null | undefined;
    publication: LivepeerPublication | null | undefined;
    entitlement: TicketEntitlementState;
}): boolean {
    return Boolean(input.accountId && input.publication
        && !input.entitlement.error && !input.entitlement.isFetching && input.entitlement.data === false);
}
