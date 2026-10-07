// Checkout funnel counts (roadmap E7: measurement without personal data). A data point holds only
// a fixed step name, the payment rail and, for failures, a code from a fixed list. No IP, account,
// session id, user agent, publication or timestamp beyond the platform's own is written, so steps
// cannot be joined into one person's path.

export const FUNNEL_STEPS = [
    'checkout_view', 'sign_in_prompt', 'balance_low', 'funding_quote', 'funding_deposit',
    'approval_started', 'purchase_submitted', 'ticket_confirmed', 'purchase_failed',
] as const;

export const FUNNEL_RAILS = ['crypto'] as const;

/** Failure codes the web checkout reports; anything else is counted as `other`. */
export const FUNNEL_FAILURE_CODES = [
    'publication_not_available', 'publication_unavailable', 'price_below_minimum', 'price_mismatch', 'insufficient_balance',
    'near_auth_login_cancelled', 'near_auth_access_denied', 'delegate_stale', 'identity_limit_reached', 'daily_limit_reached',
    'rate_limited', 'purchase_not_confirmed', 'ticket_exists', 'signature_expired', 'approval_rejected', 'approval_expired',
    'account_not_ready', 'purchase_pending', 'purchases_paused', 'popup_blocked', 'other',
] as const;

export interface FunnelEvent {
    step: (typeof FUNNEL_STEPS)[number];
    rail: (typeof FUNNEL_RAILS)[number];
    code: (typeof FUNNEL_FAILURE_CODES)[number] | '';
}

export function parseFunnelEvent(body: unknown): FunnelEvent {
    const value = body as Record<string, unknown> | null;
    const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort().join(',') : '';
    if (!value || (keys !== 'rail,step' && keys !== 'code,rail,step')
        || !(FUNNEL_STEPS as readonly unknown[]).includes(value.step) || !(FUNNEL_RAILS as readonly unknown[]).includes(value.rail)) {
        throw new Error('invalid_request');
    }
    const step = value.step as FunnelEvent['step'];
    if (step !== 'purchase_failed') {
        if ('code' in value) throw new Error('invalid_request');
        return { step, rail: value.rail as FunnelEvent['rail'], code: '' };
    }
    const code = (FUNNEL_FAILURE_CODES as readonly unknown[]).includes(value.code) ? value.code as FunnelEvent['code'] : 'other';
    return { step, rail: value.rail as FunnelEvent['rail'], code };
}

export function recordFunnelEvent(dataset: AnalyticsEngineDataset, event: FunnelEvent): void {
    dataset.writeDataPoint({ indexes: [event.step], blobs: [event.step, event.rail, event.code], doubles: [1] });
}
