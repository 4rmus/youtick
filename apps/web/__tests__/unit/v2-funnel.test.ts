import { describe, expect, it, vi } from 'vitest';
import { trackFunnelStep, type FunnelEnvironment } from '@/lib/v2/funnel';

function environment(doNotTrack = false) {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    return { env: { fetch: fetcher as unknown as typeof fetch, doNotTrack } satisfies FunnelEnvironment, fetcher };
}

const bodies = (fetcher: ReturnType<typeof environment>['fetcher']) => fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

describe('V2 checkout funnel', () => {
    it('sends only the step, the rail and a fixed-format failure code', () => {
        const { env, fetcher } = environment();
        trackFunnelStep('https://payments.test', 'checkout_view', undefined, env);
        trackFunnelStep('https://payments.test', 'purchase_failed', 'approval_rejected', env);
        trackFunnelStep('https://payments.test', 'purchase_failed', 'Error: alice@example.com', env);
        expect(fetcher.mock.calls[0][0]).toBe('https://payments.test/v1/funnel');
        expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true });
        expect(bodies(fetcher)).toEqual([
            { step: 'checkout_view', rail: 'crypto' },
            { step: 'purchase_failed', rail: 'crypto', code: 'approval_rejected' },
            { step: 'purchase_failed', rail: 'crypto', code: 'other' },
        ]);
    });

    it('sends nothing under Do Not Track or Global Privacy Control, without a service, or outside the browser', () => {
        const blocked = environment(true);
        trackFunnelStep('https://payments.test', 'checkout_view', undefined, blocked.env);
        expect(blocked.fetcher).not.toHaveBeenCalled();
        const noService = environment();
        trackFunnelStep(null, 'checkout_view', undefined, noService.env);
        expect(noService.fetcher).not.toHaveBeenCalled();
        expect(() => trackFunnelStep('https://payments.test', 'checkout_view', undefined, null)).not.toThrow();
    });

    it('never lets a failed request reach the checkout', async () => {
        const fetcher = vi.fn(async () => { throw new TypeError('offline'); });
        expect(() => trackFunnelStep('https://payments.test', 'ticket_confirmed', undefined, { fetch: fetcher as unknown as typeof fetch, doNotTrack: false })).not.toThrow();
        await Promise.resolve();
        const throwing = vi.fn(() => { throw new TypeError('blocked'); });
        expect(() => trackFunnelStep('https://payments.test', 'ticket_confirmed', undefined, { fetch: throwing as unknown as typeof fetch, doNotTrack: false })).not.toThrow();
    });
});
