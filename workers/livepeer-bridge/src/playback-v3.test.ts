import { KeyPair } from 'near-api-js';
import { describe, expect, it, vi } from 'vitest';
import vectors from '../../../protocol/youtick-market-v2/golden-vectors.json';
import { base58Decode } from './base58';
import handler, { type Env } from './index';
import { canonicalPlaybackV3Message, decideTicketPlayback, parsePlaybackV3Body } from './playback-v3';

const ORIGIN = 'https://preview.youtick.net';
const RPC_URL = 'https://rpc.testnet.near.org';
const MARKET_ID = 'market-v2.youtick.testnet';
const BLOCK_HASH = '11111111111111111111111111111111';
const PLAYBACK_ID = 'playback_001';
const TICKET_ID = 'a'.repeat(64);

function base64(value: Uint8Array): string {
    return btoa(String.fromCharCode(...value));
}

describe('playback v3 protocol', () => {
    const vector = vectors.playback_request;
    const issuedAtMs = Number(vectors.fixture.issued_at_ms);
    const binding = {
        network: vector.input.network,
        contractId: vector.input.contract_id,
        origins: new Set([vector.input.origin]),
        nowMs: issuedAtMs,
    };

    it('accepts the protocol golden vector byte for byte', async () => {
        const input = parsePlaybackV3Body({ request: vector.input, signature: vector.signature }, binding);
        expect(canonicalPlaybackV3Message(input.request)).toBe(vector.message);
        const key = await crypto.subtle.importKey(
            'raw', base58Decode(vector.input.session_public_key), 'Ed25519', false, ['verify'],
        );
        const signature = Uint8Array.from(atob(vector.signature), (char) => char.charCodeAt(0));
        expect(await crypto.subtle.verify('Ed25519', key, signature, new TextEncoder().encode(vector.message))).toBe(true);
    });

    it('rejects unknown fields, foreign bindings, origins and expiry windows', () => {
        const body = { request: vector.input, signature: vector.signature };
        const cases: [unknown, Partial<typeof binding>, string][] = [
            [{ ...body, extra: 1 }, {}, 'invalid_playback_v3_request'],
            [{ request: { ...vector.input, account_id: 'x' }, signature: vector.signature }, {}, 'invalid_playback_v3_request'],
            [body, { network: 'mainnet' }, 'deployment_binding_mismatch'],
            [body, { contractId: 'market-v2.other.testnet' }, 'deployment_binding_mismatch'],
            [body, { origins: new Set(['https://evil.example']) }, 'origin_denied'],
            [body, { nowMs: Number(vector.input.expires_at_ms) }, 'control_request_expired'],
            [body, { nowMs: issuedAtMs - 5 * 60 * 1000 }, 'invalid_playback_v3_request'],
            [{ request: { ...vector.input, device_nonce: 'A'.repeat(32) }, signature: vector.signature }, {}, 'invalid_playback_v3_request'],
        ];
        for (const [value, override, code] of cases) {
            expect(() => parsePlaybackV3Body(value, { ...binding, ...override })).toThrow(code);
        }
    });

    it('decides from ticket status, publication availability and the listed device', () => {
        const request = { ...vector.input };
        const device = { session_public_key: request.session_public_key, expires_at_ms: String(issuedAtMs + 1_000_000) };
        const ticket = (status: string, devices = [device]) => ({
            ticket_id: request.ticket_id, publication_id: 'job-001', status, devices,
        });
        const publication = (availability = 'ACTIVE') => ({ publication_id: 'job-001', availability, playback_id: PLAYBACK_ID });
        expect(decideTicketPlayback(ticket('purchased'), publication(), request, issuedAtMs).kind).toBe('watch');
        expect(decideTicketPlayback(ticket('watched'), publication('SALES_SUSPENDED'), request, issuedAtMs).kind).toBe('play');
        expect(decideTicketPlayback(ticket('released'), publication(), request, issuedAtMs).kind).toBe('play');
        for (const [ticketValue, publicationValue] of [
            [null, publication()],
            [ticket('refunded'), publication()],
            [ticket('voided'), publication()],
            [ticket('watched'), publication('TAKEDOWN')],
            [ticket('watched', []), publication()],
            [ticket('watched', [{ ...device, expires_at_ms: String(issuedAtMs) }]), publication()],
            [ticket('watched', [{ ...device, session_public_key: 'ed25519:other' }]), publication()],
            [ticket('watched'), { ...publication(), publication_id: 'job-002' }],
        ]) {
            expect(() => decideTicketPlayback(ticketValue, publicationValue, request, issuedAtMs)).toThrow('playback_denied');
        }
    });
});

async function jwtKeys(): Promise<{ privatePem: string; publicKey: string }> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey) as ArrayBuffer);
    return {
        privatePem: base64(new TextEncoder().encode(`-----BEGIN PRIVATE KEY-----\n${base64(pkcs8)}\n-----END PRIVATE KEY-----`)),
        publicKey: base64(new TextEncoder().encode(`-----BEGIN PUBLIC KEY-----\n${base64(spki)}\n-----END PUBLIC KEY-----`)),
    };
}

let version = 0;

async function setup(input: { status: string; availability?: string; markWatched?: Response; flags?: Partial<Env> }) {
    const keys = await jwtKeys();
    const device = KeyPair.fromRandom('ed25519');
    const operator = KeyPair.fromRandom('ed25519');
    const session = device.getPublicKey().toString();
    const markWatched = vi.fn(async (_request: Request) => input.markWatched ?? Response.json({ accepted: true, watched: true }));
    version += 1;
    const env: Env = {
        CF_VERSION_METADATA: { id: `worker-version-v3-${version}`, tag: 'test', timestamp: '2026-10-07T00:00:00.000Z' },
        LIVEPEER_BRIDGE_ENABLED: 'true',
        LIVEPEER_PLAYBACK_ISSUANCE_ENABLED: 'true',
        LIVEPEER_PLAYBACK_V3_ENABLED: 'true',
        MARKET_PROTOCOL: 'v2',
        ALLOWED_ORIGINS: ORIGIN,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: MARKET_ID,
        NEAR_OPERATOR_ACCOUNT_ID: 'bridge.testnet',
        NEAR_OPERATOR_PRIVATE_KEY: operator.toString(),
        NEAR_OPERATOR_KEY_EPOCH: '1',
        LIVEPEER_API_KEY: 'test-livepeer-api-key',
        LIVEPEER_JWT_PRIVATE_KEY: keys.privatePem,
        LIVEPEER_JWT_PUBLIC_KEY: keys.publicKey,
        LIVEPEER_JWT_ISSUER: ORIGIN,
        LIVEPEER_CONTROL: {
            idFromName: () => 'operator-id',
            get: () => ({ fetch: markWatched }),
        } as unknown as DurableObjectNamespace,
        ...input.flags,
    };
    const views: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).startsWith('https://livepeer.studio/api/playback/')) {
            return Response.json({ type: 'vod', meta: { playbackPolicy: { type: 'jwt' }, source: [] } });
        }
        const rpc = JSON.parse(String(init?.body)) as { params: { method_name?: string } };
        views.push(rpc.params.method_name ?? '');
        const value = rpc.params.method_name === 'get_ticket'
            ? {
                ticket_id: TICKET_ID, publication_id: 'job-001', status: input.status,
                devices: [{ session_public_key: session, expires_at_ms: String(Date.now() + 86_400_000) }],
            }
            : { publication_id: 'job-001', availability: input.availability ?? 'ACTIVE', playback_id: PLAYBACK_ID };
        return Response.json({ result: { block_hash: BLOCK_HASH, result: Array.from(new TextEncoder().encode(JSON.stringify(value))) } });
    }));
    const request = {
        network: 'testnet',
        contract_id: MARKET_ID,
        ticket_id: TICKET_ID,
        session_public_key: session,
        origin: ORIGIN,
        device_nonce: '0123456789abcdef0123456789abcdef',
        expires_at_ms: String(Date.now() + 60_000),
    };
    const signature = base64(device.sign(new TextEncoder().encode(canonicalPlaybackV3Message(request))).signature);
    const call = (body: unknown = { request, signature }) => handler.fetch(new Request('https://bridge.test/v3/playback-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify(body),
    }), env);
    return { call, markWatched, views, request, signature };
}

describe('/v3/playback-tokens', () => {
    it('finalizes mark_watched before the first token and skips it afterwards', async () => {
        const first = await setup({ status: 'purchased' });
        const response = await first.call();
        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.schema).toBe('youtick.livepeer-playback-token.v3');
        expect(body.playback_id).toBe(PLAYBACK_ID);
        expect(typeof body.token).toBe('string');
        expect(first.markWatched).toHaveBeenCalledTimes(1);
        const forwarded = await first.markWatched.mock.calls[0][0].json() as Record<string, unknown>;
        expect(forwarded).toMatchObject({ ticketId: TICKET_ID, idempotencyKey: `${TICKET_ID}:mark-watched` });

        const later = await setup({ status: 'watched' });
        expect((await later.call()).status).toBe(200);
        expect(later.markWatched).not.toHaveBeenCalled();
    });

    it('issues no token while mark_watched is pending or refused', async () => {
        const pending = await setup({ status: 'purchased', markWatched: Response.json({ accepted: true, watched: false }, { status: 202 }) });
        const pendingResponse = await pending.call();
        expect(pendingResponse.status).toBe(503);
        expect(await pendingResponse.json()).toEqual({ error: 'playback_pending' });

        // Operator internals are not reported to the viewer.
        const internal = await setup({ status: 'purchased', markWatched: Response.json({ error: 'durable_object_record_limit' }, { status: 503 }) });
        const internalResponse = await internal.call();
        expect(internalResponse.status).toBe(503);
        expect(await internalResponse.json()).toEqual({ error: 'playback_pending' });

        const refused = await setup({ status: 'purchased', markWatched: Response.json({ error: 'playback_denied' }, { status: 403 }) });
        const refusedResponse = await refused.call();
        expect(refusedResponse.status).toBe(403);
        expect(await refusedResponse.json()).toEqual({ error: 'playback_denied' });
    });

    it('denies refunded tickets, taken-down publications and bad signatures without settling', async () => {
        for (const input of [{ status: 'refunded' }, { status: 'voided' }, { status: 'watched', availability: 'TAKEDOWN' }]) {
            const denied = await setup(input);
            const response = await denied.call();
            expect(response.status).toBe(403);
            expect(denied.markWatched).not.toHaveBeenCalled();
        }
        const forged = await setup({ status: 'purchased' });
        const response = await forged.call({ request: { ...forged.request, device_nonce: 'f'.repeat(32) }, signature: forged.signature });
        expect(response.status).toBe(403);
        expect(forged.views).toEqual([]);
        expect(forged.markWatched).not.toHaveBeenCalled();
    });

    it('stays disabled without the V2 protocol and the v3 flag', async () => {
        for (const flags of [{ MARKET_PROTOCOL: undefined }, { LIVEPEER_PLAYBACK_V3_ENABLED: 'false' }]) {
            const disabled = await setup({ status: 'purchased', flags });
            const response = await disabled.call();
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ error: 'control_plane_disabled' });
        }
    });
});
