import { KeyPair } from 'near-api-js';
import { describe, expect, it, vi } from 'vitest';
import { FUNNEL_FAILURE_CODES, parseFunnelEvent } from './funnel';
import { handle, type Env } from './index';

const ORIGIN = 'https://preview.youtick.net';

function setup(overrides: Partial<Env> = {}) {
    const points: AnalyticsEngineDataPoint[] = [];
    const limiter = vi.fn(async (_options: { key: string }) => ({ success: true }));
    const env: Env = {
        PAYMENT_SERVICE_ENABLED: 'true', NEAR_NETWORK: 'testnet', NEAR_RPC_URL: 'https://rpc.test', MARKET_V2_CONTRACT_ID: 'market-v2.testnet',
        VAT_POLICY: 'fixed-testnet', VAT_RATE_BPS: '2000', VAT_KEY_VERSION: '1', VAT_SIGNER_PRIVATE_KEY: KeyPair.fromRandom('ed25519').toString(),
        ALLOWED_ORIGINS: ORIGIN, FUNNEL: { writeDataPoint: (point) => { points.push(point!); } },
        PAYMENT_RATE_LIMITER: { limit: limiter } as unknown as RateLimit,
        ...overrides,
    };
    const view = vi.fn(async () => { throw new Error('no chain reads for funnel events'); });
    const send = async (body: unknown, origin = ORIGIN) => {
        const response = await handle(new Request('https://payments.test/v1/funnel', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'cf-connecting-ip': '203.0.113.9' },
            body: JSON.stringify(body),
        }), env, { view });
        return response.status;
    };
    return { send, points, limiter, view };
}

describe('checkout funnel', () => {
    it('writes only the step, the rail and a fixed failure code', async () => {
        const { send, points, view } = setup();
        expect(await send({ step: 'checkout_view', rail: 'crypto' })).toBe(204);
        expect(await send({ step: 'purchase_failed', rail: 'crypto', code: 'approval_rejected' })).toBe(204);
        // A code outside the fixed list is counted, but never stored as sent.
        expect(await send({ step: 'purchase_failed', rail: 'crypto', code: 'alice@example.com' })).toBe(204);
        expect(points).toEqual([
            { indexes: ['checkout_view'], blobs: ['checkout_view', 'crypto', ''], doubles: [1] },
            { indexes: ['purchase_failed'], blobs: ['purchase_failed', 'crypto', 'approval_rejected'], doubles: [1] },
            { indexes: ['purchase_failed'], blobs: ['purchase_failed', 'crypto', 'other'], doubles: [1] },
        ]);
        expect(JSON.stringify(points)).not.toContain('203.0.113.9');
        expect(view).not.toHaveBeenCalled();
    });

    it('refuses unknown steps, rails, extra fields and foreign origins', async () => {
        const { send, points } = setup();
        expect(await send({ step: 'login', rail: 'crypto' })).toBe(400);
        expect(await send({ step: 'checkout_view', rail: 'card' })).toBe(400);
        expect(await send({ step: 'checkout_view', rail: 'crypto', account_id: 'x' })).toBe(400);
        expect(await send({ step: 'checkout_view', rail: 'crypto', code: 'other' })).toBe(400);
        expect(await send(['checkout_view'])).toBe(400);
        expect(await send({ step: 'checkout_view', rail: 'crypto' }, 'https://evil.example')).toBe(403);
        expect(points).toEqual([]);
    });

    it('rate-limits per IP without writing it, and accepts events without a dataset bound', async () => {
        const limited = setup();
        limited.limiter.mockResolvedValueOnce({ success: false });
        expect(await limited.send({ step: 'checkout_view', rail: 'crypto' })).toBe(429);
        expect(limited.limiter).toHaveBeenCalledWith({ key: 'funnel:ip:203.0.113.9' });
        expect(await setup({ FUNNEL: undefined }).send({ step: 'ticket_confirmed', rail: 'crypto' })).toBe(204);
    });

    it('keeps the failure list to fixed identifiers', () => {
        expect(FUNNEL_FAILURE_CODES.every((code) => /^[a-z_]{1,48}$/.test(code))).toBe(true);
        expect(parseFunnelEvent({ step: 'purchase_failed', rail: 'crypto' })).toEqual({ step: 'purchase_failed', rail: 'crypto', code: 'other' });
    });
});
