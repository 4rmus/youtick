import { purchaseErrorMessage, type TicketAccessView, type TicketPurchaseStep } from '@/features/checkout/ticket-checkout';
import type { Locale } from '@/lib/i18n/locale';
import type { LivepeerPublication } from '@/lib/livepeer-publication';

/**
 * What the box-office bar shows. Derived from useTicketCheckout (G2): access view, busy flag,
 * the current TicketPurchaseStep and the last error. Payment state itself stays in
 * ActivePaymentCheckout; this is only a presentation mapping.
 */
export type GisePhase =
    | 'guest'
    | 'ready'
    | 'approving'
    | 'issuing'
    | 'owner'
    | 'error'
    | 'checking'
    | 'access_error'
    | 'closed';

export type GiseInput = {
    accountId: string | null;
    accessView: TicketAccessView | null;
    availability: LivepeerPublication['availability'];
    busy: boolean;
    step: TicketPurchaseStep | null;
    error: string | null;
};

export function gisePhase(input: GiseInput): GisePhase {
    if (input.accessView === 'playable') return 'owner';
    if (input.accessView === 'checking') return 'checking';
    if (input.accessView === 'access_error') return 'access_error';
    if (input.availability !== 'ACTIVE') return 'closed';
    if (!input.accountId) return 'guest';
    if (input.busy) return input.step === 'waiting_entitlement' ? 'issuing' : 'approving';
    if (input.error) return 'error';
    return 'ready';
}

export type StepMark = 'done' | 'active' | 'busy' | 'failed' | 'pending';

/** Wallet · Payment · Ticket · Watch, or null when the bar shows no purchase progress. */
export function giseSteps(phase: GisePhase): StepMark[] | null {
    const at = { guest: 0, ready: 1, approving: 1, error: 1, issuing: 2, owner: 4 }[phase as string];
    if (at === undefined) return null;
    return [0, 1, 2, 3].map((index) => {
        if (index < at) return 'done';
        if (index > at) return 'pending';
        if (phase === 'approving' || phase === 'issuing') return 'busy';
        return phase === 'error' ? 'failed' : 'active';
    });
}

/**
 * useTicketCheckout keeps only the localized message, so the pending case is recognised by the
 * same purchaseErrorMessage mapping. A retry there could send a second payment while the first one
 * settles, so it only re-checks the ticket. Other retries re-read the ticket first (see GiseBar).
 */
export function errorAction(error: string | null, locale: Locale): 'recheck' | 'retry' {
    return error === purchaseErrorMessage(new Error('livepeer_entitlement_pending'), locale) ? 'recheck' : 'retry';
}
