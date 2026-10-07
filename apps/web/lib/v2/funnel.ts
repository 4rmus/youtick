// Checkout funnel counts (roadmap E7e), sent to the payment service's `/v1/funnel`. Only a fixed
// step name, the rail and, for failures, an error code are sent: no account, publication, session
// id or device. Browsers asking not to be tracked (Do Not Track, Global Privacy Control) send nothing.

export type FunnelStep =
    | 'checkout_view' | 'sign_in_prompt' | 'balance_low' | 'funding_quote' | 'funding_deposit'
    | 'approval_started' | 'purchase_submitted' | 'ticket_confirmed' | 'purchase_failed';

export interface FunnelEnvironment {
    fetch: typeof fetch;
    doNotTrack: boolean;
}

function browserEnvironment(): FunnelEnvironment | null {
    if (typeof window === 'undefined') return null;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    return {
        fetch: (...args) => fetch(...args),
        doNotTrack: nav.doNotTrack === '1' || nav.globalPrivacyControl === true,
    };
}

/** Fire and forget: a lost or refused count never affects the checkout. */
export function trackFunnelStep(
    paymentServiceUrl: string | null, step: FunnelStep, code?: string, environment = browserEnvironment(),
): void {
    if (!paymentServiceUrl || !environment || environment.doNotTrack) return;
    const body = step === 'purchase_failed'
        ? { step, rail: 'crypto', code: code && /^[a-z_]{1,48}$/.test(code) ? code : 'other' }
        : { step, rail: 'crypto' };
    try {
        void environment.fetch(`${paymentServiceUrl}/v1/funnel`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            credentials: 'omit', cache: 'no-store', keepalive: true,
        }).catch(() => undefined);
    } catch {
        // Ignored on purpose.
    }
}
