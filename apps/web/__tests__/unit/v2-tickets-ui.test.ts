import { ed25519 } from '@noble/curves/ed25519.js';
import { baseDecode } from 'near-api-js';
import { describe, expect, it, vi } from 'vitest';
import vectors from '../../../../protocol/youtick-market-v2/golden-vectors.json';
import { base64Decode, hexDecode, hexEncode } from '@/lib/crypto/codec';
import { NEAR_AUTH_PROVIDERS, type NearAuthConfig } from '@/lib/near-auth/config';
import { deriveRootKey, ticketKey } from '@/lib/ticket-keys/keys';
import { playbackMessage, refundRequestExpiry } from '@/lib/ticket-keys/messages';
import { v2Config } from '@/lib/v2/config';
import { deviceCertificate, loadDeviceKey, type DeviceKeyBackend } from '@/lib/v2/device-key';
import { requestPlaybackV3Token } from '@/lib/v2/playback';
import { createRelayerClient, relayerSubmitter } from '@/lib/v2/relayer-client';
import { deviceIsListed, findOwnedTickets, parseTicket, playableStatus, refundRequestable, takenDownPublications } from '@/lib/v2/tickets';
import { refundRequestMailto } from '@/components/v2/RefundRequest';
import { refundErrorMessage, submitRefundRequest } from '@/lib/v2/refunds';
import { addGateKey, canUnlock, pendingGates } from '@/lib/v2/gates';

vi.unmock('near-api-js');

const auth: NearAuthConfig = { network: 'testnet', clientId: 'client-1', provider: NEAR_AUTH_PROVIDERS.testnet! };
const MARKET = 'market-v2.youtick.testnet';
const RELAYER = 'https://relayer.youtick.test';
const BRIDGE = 'https://bridge.youtick.test';
const ORIGIN = 'https://preview.youtick.net';

describe('V2 config', () => {
    it('needs NEAR Auth and every V2 endpoint', () => {
        const env = { auth, marketContractId: MARKET, gateAccountId: 'ckd-gate.youtick.testnet', relayerUrl: RELAYER, bridgeUrl: BRIDGE };
        expect(v2Config(env)).toEqual({ auth, marketContractId: MARKET, gateAccountId: 'ckd-gate.youtick.testnet', relayerUrl: RELAYER, bridgeUrl: BRIDGE, paymentServiceUrl: null });
        for (const override of [{ auth: null }, { relayerUrl: 'http://relayer.test' }, { relayerUrl: `${RELAYER}/path` },
            { bridgeUrl: '' }, { marketContractId: 'Bad Id' }, { gateAccountId: undefined }]) {
            expect(v2Config({ ...env, ...override })).toBeNull();
        }
    });
});

function fakeFetch(responses: Array<[number, unknown]>) {
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        const [status, body] = responses.shift() ?? [500, {}];
        return Response.json(body, { status });
    });
    return { fetcher: fetcher as unknown as typeof fetch, calls };
}

describe('relayer client', () => {
    const args = { jwt: 'h.p.s', app_public_key: { pk1: 'bls12381g1:a', pk2: 'bls12381g2:b' } };
    const ckdResult = { account_id: 'a'.repeat(64), derivation_path: `v1/${'a'.repeat(64)}`, response: { big_y: 'y', big_c: 'c' } };

    it('opens the account, redeems the invite and requests the CKD key with the same token', async () => {
        const { fetcher, calls } = fakeFetch([
            [202, { ready: false }], [200, { accountId: 'a'.repeat(64), ready: true }],
            [200, { amountMicro: '5000000', paid: true }], [202, { pending: true }], [200, { result: ckdResult }],
        ]);
        const onInvite = vi.fn();
        const client = createRelayerClient({ relayerUrl: RELAYER, fetch: fetcher, sleep: async () => undefined });
        const submit = relayerSubmitter(client, { inviteCode: `yt_${'A'.repeat(24)}`, onInvite });
        await expect(submit({ gateAccountId: 'ckd-gate.youtick.testnet', args })).resolves.toEqual(ckdResult);
        expect(calls.map((call) => call.url)).toEqual([
            `${RELAYER}/v1/accounts`, `${RELAYER}/v1/accounts`, `${RELAYER}/v1/invites/redeem`, `${RELAYER}/v1/ckd`, `${RELAYER}/v1/ckd`,
        ]);
        expect(calls[0].body).toEqual({ id_token: 'h.p.s' });
        expect(calls[2].body).toEqual({ id_token: 'h.p.s', code: `yt_${'A'.repeat(24)}` });
        expect(calls[3].body).toEqual({ gate_account_id: 'ckd-gate.youtick.testnet', args });
        expect(onInvite).toHaveBeenCalledWith({ amountMicro: '5000000', paid: true });
    });

    it('reports an invite problem without blocking sign-in, and maps relayer errors to fixed codes', async () => {
        const { fetcher } = fakeFetch([
            [200, { accountId: 'a'.repeat(64), ready: true }], [409, { error: 'invite_already_used' }], [200, { result: ckdResult }],
        ]);
        const onInvite = vi.fn();
        const client = createRelayerClient({ relayerUrl: RELAYER, fetch: fetcher, sleep: async () => undefined });
        await expect(relayerSubmitter(client, { inviteCode: `yt_${'B'.repeat(24)}`, onInvite })({ gateAccountId: 'g', args })).resolves.toEqual(ckdResult);
        expect(onInvite).toHaveBeenCalledWith({ error: 'invite_already_used' });

        const failing = createRelayerClient({ relayerUrl: RELAYER, sleep: async () => undefined, pendingRetries: 1,
            fetch: fakeFetch([[429, { error: 'daily_limit_reached' }]]).fetcher });
        await expect(failing.ensureAccount('t')).rejects.toThrow('daily_limit_reached');
        const weird = createRelayerClient({ relayerUrl: RELAYER, fetch: fakeFetch([[500, { error: '<script>' }]]).fetcher });
        await expect(weird.ensureAccount('t')).rejects.toThrow('relayer_failed');
        const pending = createRelayerClient({ relayerUrl: RELAYER, sleep: async () => undefined, pendingRetries: 1,
            fetch: fakeFetch([[202, {}], [202, {}]]).fetcher });
        await expect(pending.requestCkd({ gateAccountId: 'g', args })).rejects.toThrow('relayer_pending');
    });
});

function memoryBackend(): DeviceKeyBackend & { values: Map<string, CryptoKeyPair> } {
    const values = new Map<string, CryptoKeyPair>();
    return { values, get: async (name) => values.get(name), put: async (name, value) => { values.set(name, value); } };
}

describe('V2 device key', () => {
    const scope = { network: 'testnet', contractId: MARKET, origin: ORIGIN };

    it('creates one non-extractable key per scope, hashes its certificate and signs playback messages', async () => {
        const backend = memoryBackend();
        const first = await loadDeviceKey(scope, backend);
        const again = await loadDeviceKey(scope, backend);
        const other = await loadDeviceKey({ ...scope, origin: 'https://youtick.net' }, backend);
        expect(again.sessionPublicKey).toBe(first.sessionPublicKey);
        expect(other.sessionPublicKey).not.toBe(first.sessionPublicKey);
        expect(first.sessionPublicKey).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/);
        expect([...backend.values.values()][0].privateKey.extractable).toBe(false);
        expect(first.certificate).toBe(deviceCertificate({ ...scope, sessionPublicKey: first.sessionPublicKey }));
        expect(JSON.parse(first.certificate)).toEqual({
            domain: 'youtick.market-v2.device', version: '1', network: 'testnet', contract_id: MARKET, origin: ORIGIN,
            session_public_key: first.sessionPublicKey,
        });
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first.certificate)));
        expect(first.certificateSha256).toBe(hexEncode(digest));
        const message = new TextEncoder().encode('hello');
        const signature = base64Decode(await first.sign(message));
        expect(ed25519.verify(signature, message, baseDecode(first.sessionPublicKey.slice(8)))).toBe(true);
    });
});

const root = deriveRootKey(hexDecode(vectors.key_derivation.ckd_key_hex));
function ticketValue(ticketId: string, extra: Record<string, unknown> = {}) {
    return {
        ticket_id: ticketId, ticket_public_key: 'ed25519:x', publication_id: 'job-001', creator_id: 'creator.testnet', rail: 'crypto',
        status: 'purchased', gross_usdc_micro: '5000000', vat_usdc_micro: '833334', platform_usdc_micro: '208333',
        creator_usdc_micro: '3958333', vat_key_version: 1, purchased_at_ms: '1791360000000', device_epoch: 0,
        devices: [{ session_public_key: 'ed25519:dev', certificate_sha256: 'c'.repeat(64), authorized_at_ms: '1', expires_at_ms: '2000' }],
        card: null, ...extra,
    };
}

describe('V2 tickets', () => {
    it('finds tickets with the recovery scan through get_ticket on the V2 Market', async () => {
        const owned = new Set([0, 2].map((index) => ticketKey(root, index).ticketId));
        const view = vi.fn(async (contractId: string, method: string, args: Record<string, unknown>) => {
            expect([contractId, method]).toEqual([MARKET, 'get_ticket']);
            return owned.has(String(args.ticket_id)) ? ticketValue(String(args.ticket_id)) : null;
        }) as unknown as Parameters<typeof findOwnedTickets>[0];
        const result = await findOwnedTickets(view, MARKET, [{ gateAccountId: 'gate.testnet', ckdKey: hexDecode(vectors.key_derivation.ckd_key_hex) }]);
        expect(result.tickets.map(({ key }) => key.index)).toEqual([0, 2]);
        expect(result.tickets.every((ticket) => ticket.gateAccountId === 'gate.testnet')).toBe(true);
        expect(result.nextIndex).toBe(3);
    });

    it('scans every gate secret of the session and takes the next index from the current gate only', async () => {
        const current = hexDecode(vectors.key_derivation.ckd_key_hex);
        const retired = new Uint8Array(32).fill(7);
        const retiredRoot = deriveRootKey(retired);
        // Current gate: tickets 0 and 1. Retired gate: tickets 0, 1, 2 and 5.
        const owned = new Set([
            ...[0, 1].map((index) => ticketKey(root, index).ticketId),
            ...[0, 1, 2, 5].map((index) => ticketKey(retiredRoot, index).ticketId),
        ]);
        const view = vi.fn(async (_contract: string, _method: string, args: Record<string, unknown>) =>
            owned.has(String(args.ticket_id)) ? ticketValue(String(args.ticket_id)) : null) as unknown as Parameters<typeof findOwnedTickets>[0];
        const result = await findOwnedTickets(view, MARKET, [
            { gateAccountId: 'new-gate.testnet', ckdKey: current },
            { gateAccountId: 'old-gate.testnet', ckdKey: retired },
        ]);
        expect(result.tickets.map((ticket) => [ticket.gateAccountId, ticket.key.index])).toEqual([
            ['new-gate.testnet', 0], ['new-gate.testnet', 1],
            ['old-gate.testnet', 0], ['old-gate.testnet', 1], ['old-gate.testnet', 2], ['old-gate.testnet', 5],
        ]);
        // A retired gate's tickets sign with their own keys, never the current gate's.
        expect(result.tickets[2].key.publicKey).toBe(ticketKey(retiredRoot, 0).publicKey);
        expect(result.nextIndex).toBe(2);
        await expect(findOwnedTickets(view, MARKET, [])).rejects.toThrow('no_ckd_key');
    });

    it('unlocks a retired gate only once, only for the same account', () => {
        const key = 'bls12381g2:x';
        const retired = [{ gateAccountId: 'old-gate.testnet', mpcPublicKey: key, role: 'retired' as const }];
        const current = { gateAccountId: 'new-gate.testnet', ckdKey: new Uint8Array(32).fill(1) };
        expect(pendingGates(retired, [current], {})).toEqual([{ gateAccountId: 'old-gate.testnet', state: 'idle' }]);
        expect(pendingGates(retired, [current], { 'old-gate.testnet': { state: 'error', error: 'popup_blocked' } }))
            .toEqual([{ gateAccountId: 'old-gate.testnet', state: 'error', error: 'popup_blocked' }]);
        expect(canUnlock(retired, [current], 'old-gate.testnet')).toBe(true);
        expect(canUnlock(retired, [current], 'new-gate.testnet')).toBe(false);
        expect(canUnlock(retired, [current], 'unknown.testnet')).toBe(false);
        const old = { accountId: 'fan.testnet', gateAccountId: 'old-gate.testnet', ckdKey: new Uint8Array(32).fill(2) };
        const keys = addGateKey([current], 'fan.testnet', old);
        expect(keys.map((entry) => entry.gateAccountId)).toEqual(['new-gate.testnet', 'old-gate.testnet']);
        expect(addGateKey(keys, 'fan.testnet', old)).toHaveLength(2);
        expect(() => addGateKey([current], 'fan.testnet', { ...old, accountId: 'other.testnet' })).toThrow('ckd_account_changed');
        expect(pendingGates(retired, keys, {})).toEqual([]);
        expect(canUnlock(retired, keys, 'old-gate.testnet')).toBe(false);
    });

    it('rejects a ticket for another id or with unexpected shapes', () => {
        const id = 'a'.repeat(64);
        expect(parseTicket(null, id)).toBeNull();
        expect(parseTicket(ticketValue(id), id)?.status).toBe('purchased');
        for (const bad of [ticketValue('b'.repeat(64)), ticketValue(id, { status: 'stolen' }), ticketValue(id, { gross_usdc_micro: 5 }),
            ticketValue(id, { devices: [{ session_public_key: 1 }] }), ticketValue(id, { rail: 'cash' }), undefined]) {
            expect(() => parseTicket(bad, id)).toThrow('invalid_ticket');
        }
    });

    it('plays only listed, unexpired devices and playable statuses', () => {
        const ticket = parseTicket(ticketValue('a'.repeat(64)), 'a'.repeat(64))!;
        expect(deviceIsListed(ticket, 'ed25519:dev', 1999)).toBe(true);
        expect(deviceIsListed(ticket, 'ed25519:dev', 2000)).toBe(false);
        expect(deviceIsListed(ticket, 'ed25519:other', 1)).toBe(false);
        expect(['purchased', 'watched', 'watched_in_escrow', 'released', 'refunded', 'voided']
            .map((status) => playableStatus(status as never)))
            .toEqual([true, true, true, true, false, false]);
    });

    it('offers a refund request only for crypto tickets in escrow, until 27 days after purchase', () => {
        const id = 'a'.repeat(64);
        const purchasedAt = 1_791_360_000_000;
        const at = (overrides: Record<string, unknown>) =>
            parseTicket(ticketValue(id, { purchased_at_ms: String(purchasedAt), ...overrides }), id)!;
        // 30-day contract window less youtick's 72-hour decision time.
        const window = 27 * 24 * 60 * 60 * 1000;
        expect(refundRequestable(at({ status: 'purchased' }), purchasedAt + window - 1)).toBe(true);
        expect(refundRequestable(at({ status: 'watched_in_escrow' }), purchasedAt)).toBe(true);
        expect(refundRequestable(at({ status: 'purchased' }), purchasedAt + window)).toBe(false);
        for (const status of ['watched', 'released', 'refunded', 'voided']) {
            expect(refundRequestable(at({ status }), purchasedAt)).toBe(false);
        }
        expect(refundRequestable(at({ status: 'purchased', rail: 'card' }), purchasedAt)).toBe(false);
        // After a takedown there is no deadline, but only for tickets still in escrow.
        expect(refundRequestable(at({ status: 'watched_in_escrow' }), purchasedAt + 400 * 24 * 60 * 60 * 1000, true)).toBe(true);
        for (const status of ['watched', 'released', 'refunded', 'voided']) {
            expect(refundRequestable(at({ status }), purchasedAt, true)).toBe(false);
        }
        expect(refundRequestable(at({ status: 'purchased', rail: 'card' }), purchasedAt, true)).toBe(false);
    });

    it('reads which of the ticket publications are taken down, once per publication', async () => {
        const calls: string[] = [];
        const view = vi.fn(async (_contract: string, method: string, args: Record<string, unknown>) => {
            calls.push(`${method}:${String(args.publication_id)}`);
            const id = String(args.publication_id);
            return id === 'missing' ? null : { publication_id: id, availability: id === 'gone' ? 'TAKEDOWN' : 'ACTIVE' };
        }) as unknown as Parameters<typeof takenDownPublications>[0];
        expect([...await takenDownPublications(view, MARKET, ['gone', 'live', 'gone', 'missing'])]).toEqual(['gone']);
        expect(calls).toEqual(['get_publication:gone', 'get_publication:live', 'get_publication:missing']);
    });

    it('posts the signed refund request with the reason to the payment service inbox', async () => {
        const args = { ticket_id: 'a'.repeat(64), refund_to: 'fan.testnet', expires_at_ms: '1792610005189', signature: 'sig' };
        const calls: { url: string; body: unknown }[] = [];
        const ok = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
            return Response.json({ request_id: 'b'.repeat(32), status: 'pending', answer_by_ms: '1792264200000' }, { status: 201 });
        });
        expect(await submitRefundRequest('https://pay.example', args, '  The video stops.  ', ok as unknown as typeof fetch))
            .toEqual({ requestId: 'b'.repeat(32), answerByMs: 1792264200000 });
        expect(calls).toEqual([{ url: 'https://pay.example/v1/refund-requests', body: { ...args, reason: 'The video stops.' } }]);
        const pending = vi.fn(async () => Response.json({ error: 'refund_request_pending' }, { status: 409 }));
        await expect(submitRefundRequest('https://pay.example', args, 'The video stops.', pending as unknown as typeof fetch))
            .rejects.toThrow('refund_request_pending');
        const offline = vi.fn(async () => { throw new TypeError('network'); });
        await expect(submitRefundRequest('https://pay.example', args, 'The video stops.', offline as unknown as typeof fetch))
            .rejects.toThrow('refund_service_unreachable');
        expect(refundErrorMessage('refund_request_pending')).toMatch(/already waiting/);
        expect(refundErrorMessage('anything')).toMatch(/by e-mail/);
    });

    it('signs a refund request to the buyer\'s own account with a 7-day expiry', () => {
        const now = 1_791_360_000_000;
        const expiry = refundRequestExpiry(now);
        expect(Number(expiry) - now).toBe(7 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000);
        const mailto = refundRequestMailto({ ticketId: 'a'.repeat(64), reason: 'The video stops after a minute.',
            args: { ticket_id: 'a'.repeat(64), refund_to: 'fan.testnet', expires_at_ms: expiry, signature: 'sig' } });
        expect(mailto.startsWith('mailto:contact@youtick.net?subject=Refund%20request%20aaaaaaaa&body=')).toBe(true);
        const body = decodeURIComponent(mailto.split('&body=')[1]);
        expect(body).toContain('The video stops after a minute.');
        expect(JSON.parse(body.split('\n').at(-1)!)).toMatchObject({ refund_to: 'fan.testnet', expires_at_ms: expiry });
    });
});

describe('playback v3 client', () => {
    const NOW = 1_791_360_000_000;

    async function device() {
        return loadDeviceKey({ network: 'testnet', contractId: MARKET, origin: ORIGIN }, memoryBackend());
    }

    it('sends a device-signed request the Bridge can verify and retries while the ticket settles', async () => {
        const key = await device();
        const token = { schema: 'youtick.livepeer-playback-token.v3', playback_id: 'pb', token: 'jwt', hls_url: 'https://livepeercdn.studio/hls/pb/index.m3u8', expires_at_ms: String(NOW + 600_000) };
        const { fetcher, calls } = fakeFetch([[503, { error: 'playback_pending' }], [200, token]]);
        const access = await requestPlaybackV3Token({
            bridgeUrl: BRIDGE, network: 'testnet', contractId: MARKET, ticketId: 'a'.repeat(64), origin: ORIGIN, device: key,
            fetch: fetcher, sleep: async () => undefined, now: () => NOW,
        });
        expect(access).toEqual({ playbackId: 'pb', token: 'jwt', hlsUrl: token.hls_url, expiresAtMs: NOW + 600_000 });
        expect(calls[0].url).toBe(`${BRIDGE}/v3/playback-tokens`);
        const body = calls[1].body as { request: Parameters<typeof playbackMessage>[0]; signature: string };
        expect(body.request).toMatchObject({ network: 'testnet', contract_id: MARKET, ticket_id: 'a'.repeat(64), session_public_key: key.sessionPublicKey, origin: ORIGIN });
        expect(Number(body.request.expires_at_ms) - NOW).toBeLessThanOrEqual(5 * 60 * 1000);
        expect(body.request.device_nonce).not.toBe((calls[0].body as typeof body).request.device_nonce);
        expect(ed25519.verify(base64Decode(body.signature), new TextEncoder().encode(playbackMessage(body.request)),
            baseDecode(key.sessionPublicKey.slice(8)))).toBe(true);
    });

    it('surfaces denials and refuses malformed token responses', async () => {
        const key = await device();
        const run = (responses: Array<[number, unknown]>) => requestPlaybackV3Token({
            bridgeUrl: BRIDGE, network: 'testnet', contractId: MARKET, ticketId: 'a'.repeat(64), origin: ORIGIN, device: key,
            fetch: fakeFetch(responses).fetcher, sleep: async () => undefined, now: () => NOW, pendingRetries: 1,
        });
        await expect(run([[403, { error: 'playback_denied' }]])).rejects.toThrow('playback_denied');
        await expect(run([[503, { error: 'playback_pending' }], [503, { error: 'playback_pending' }]])).rejects.toThrow('playback_pending');
        await expect(run([[200, { schema: 'youtick.livepeer-playback-token.v2', playback_id: 'pb', token: 't', hls_url: 'h', expires_at_ms: '1' }]]))
            .rejects.toThrow('playback_unavailable');
    });

    describe('Stream answers (provider cloudflare-stream)', () => {
        // Synthetic token: base64url of fake JSON, never a signed one.
        const CODE = '7v4my51gigdqb5jn';
        const TOKEN = 'eyJmYWtlIjoiaGVhZGVyIn0.eyJmYWtlIjoicGF5bG9hZCJ9.ZmFrZS1zaWduYXR1cmU';
        const OTHER = 'eyJmYWtlIjoib3RoZXIifQ.eyJmYWtlIjoib3RoZXIifQ.b3RoZXI';
        const HLS = `https://customer-${CODE}.cloudflarestream.com/${TOKEN}/manifest/video.m3u8`;
        const answer = (overrides: Record<string, unknown> = {}) => ({
            schema: 'youtick.livepeer-playback-token.v3', playback_id: '0123456789abcdef0123456789abcdef', token: TOKEN, hls_url: HLS,
            expires_at_ms: String(NOW + 180_000), provider: 'cloudflare-stream', ...overrides,
        });
        const run = async (body: Record<string, unknown>, streamCustomerCode: string = CODE) => requestPlaybackV3Token({
            bridgeUrl: BRIDGE, network: 'testnet', contractId: MARKET, ticketId: 'a'.repeat(64), origin: ORIGIN, device: await device(),
            fetch: fakeFetch([[200, body]]).fetcher, sleep: async () => undefined, now: () => NOW, streamCustomerCode,
        });

        it('accepts the path-token URL on the configured customer host', async () => {
            await expect(run(answer())).resolves.toEqual({
                playbackId: '0123456789abcdef0123456789abcdef', token: TOKEN, hlsUrl: HLS, expiresAtMs: NOW + 180_000, provider: 'cloudflare-stream',
            });
        });

        it.each([
            ['another customer host', { hls_url: HLS.replace(CODE, 'otherotherother1') }],
            ['a lookalike host', { hls_url: HLS.replace('.cloudflarestream.com', '.cloudflarestream.com.example.test') }],
            ['plain http', { hls_url: HLS.replace('https:', 'http:') }],
            ['a different path', { hls_url: HLS.replace('/manifest/video.m3u8', '/manifest/video.mpd') }],
            ['a path token other than the token field', { hls_url: HLS.replace(TOKEN, OTHER) }],
            ['a token field other than the path token', { token: OTHER }],
            ['a token that is not a JWT', { token: 'jwt', hls_url: HLS.replace(TOKEN, 'jwt') }],
            ['a query', { hls_url: `${HLS}?jwt=${TOKEN}` }],
            ['an empty query', { hls_url: `${HLS}?` }],
            ['a fragment', { hls_url: `${HLS}#t=1` }],
            ['an unknown provider', { provider: 'other-provider' }],
            ['a provider that is not a string', { provider: true }],
        ])('refuses %s as playback_unavailable', async (_name, overrides) => {
            await expect(run(answer(overrides))).rejects.toThrow('playback_unavailable');
        });

        it('refuses a Stream answer when the build has no customer code', async () => {
            await expect(run(answer(), '')).rejects.toThrow('playback_unavailable');
        });

        it('keeps a Studio answer as before: no provider key, any https URL shape', async () => {
            const studio = { schema: 'youtick.livepeer-playback-token.v3', playback_id: 'pb', token: 'jwt', hls_url: 'https://livepeercdn.studio/hls/pb/index.m3u8', expires_at_ms: String(NOW + 600_000) };
            const access = await run(studio, '');
            expect(access).toStrictEqual({ playbackId: 'pb', token: 'jwt', hlsUrl: studio.hls_url, expiresAtMs: NOW + 600_000 });
        });
    });
});
