import { KeyPair, baseEncode } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../../protocol/youtick-market-v2/golden-vectors.json';
import { handle, resetKeyCheckForTests, type Env } from './index';
import { attestVat, inclusiveVat, vatMessage, withinCap } from './vat';

// The protocol reference derives its VAT test key from a public label; it must never hold value.
async function referenceVatKey(): Promise<KeyPair> {
    const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('youtick.market-v2.test.vat-signer')));
    const prefix = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
    const privateKey = await crypto.subtle.importKey('pkcs8', new Uint8Array([...prefix, ...seed]), 'Ed25519', true, ['sign']);
    const jwk = await crypto.subtle.exportKey('jwk', privateKey) as JsonWebKey;
    const publicKey = Uint8Array.from(atob(jwk.x!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    return KeyPair.fromString(`ed25519:${baseEncode(new Uint8Array([...seed, ...publicKey]))}`);
}

const vector = vectors.vat_attestation;
const fixture = vectors.fixture;
const ORIGIN = 'https://preview.youtick.net';
const NOW = Number(vector.input.expires_at_ms) - 10 * 60 * 1000;

describe('VAT attestation', () => {
    it('reproduces the protocol golden vector byte for byte', async () => {
        const signer = await referenceVatKey();
        expect(signer.getPublicKey().toString()).toBe(vector.signer_public_key);
        const attestation = attestVat({
            network: vector.input.network, contractId: vector.input.contract_id, ticketId: vector.input.ticket_id,
            publicationId: vector.input.publication_id, grossUsdcMicro: BigInt(vector.input.gross_usdc_micro), rateBps: 2_000n,
            keyVersion: Number(vector.input.key_version), nowMs: NOW,
        }, signer);
        expect(attestation).toEqual({
            gross_usdc_micro: vector.input.gross_usdc_micro, vat_usdc_micro: vector.input.vat_usdc_micro,
            expires_at_ms: vector.input.expires_at_ms, key_version: vector.input.key_version, signature: vector.signature,
        });
        expect(vatMessage({
            network: vector.input.network, contractId: vector.input.contract_id, ticketId: vector.input.ticket_id,
            publicationId: vector.input.publication_id, gross: vector.input.gross_usdc_micro, vat: vector.input.vat_usdc_micro,
            expiresAtMs: vector.input.expires_at_ms, keyVersion: vector.input.key_version,
        })).toBe(vector.message);
    });

    it('rounds VAT up but never past the contract cap', () => {
        expect(inclusiveVat(5_000_000n, 2_000n)).toBe(833_334n);
        expect(inclusiveVat(5_000_000n, 0n)).toBe(0n);
        expect(inclusiveVat(12_700_000n, 2_700n)).toBe(2_700_000n);
        // At the cap, rounding up would exceed it, so it falls back to rounding down.
        const atCap = inclusiveVat(5_000_001n, 2_700n);
        expect(withinCap(5_000_001n, atCap)).toBe(true);
        expect(withinCap(5_000_001n, atCap + 1n)).toBe(false);
        for (const gross of [5_000_000n, 7_777_777n, 123_456_789n]) {
            for (const rate of [0n, 500n, 1_800n, 2_000n, 2_100n, 2_700n]) expect(withinCap(gross, inclusiveVat(gross, rate))).toBe(true);
        }
        expect(() => inclusiveVat(5_000_000n, 2_701n)).toThrow('vat_rate_invalid');
    });

    it('refuses prices under 5 USDC and malformed identifiers', async () => {
        const base = { network: 'testnet', contractId: 'm.testnet', ticketId: 'a'.repeat(64), publicationId: 'job-1', grossUsdcMicro: 5_000_000n, rateBps: 2_000n, keyVersion: 1, nowMs: 1 };
        const signer = await referenceVatKey();
        expect(() => attestVat({ ...base, grossUsdcMicro: 4_999_999n }, signer)).toThrow('price_below_minimum');
        expect(() => attestVat({ ...base, ticketId: 'A'.repeat(64) }, signer)).toThrow('invalid_request');
        expect(() => attestVat({ ...base, publicationId: 'job 1' }, signer)).toThrow('invalid_request');
    });
});

async function setup(overrides: Partial<Env> = {}, chain: { price?: string; availability?: string; ticket?: unknown; vatKey?: string | null } = {}) {
    const signer = await referenceVatKey();
    const env: Env = {
        PAYMENT_SERVICE_ENABLED: 'true', NEAR_NETWORK: 'testnet', NEAR_RPC_URL: 'https://rpc.test', MARKET_V2_CONTRACT_ID: fixture.contract_id,
        VAT_POLICY: 'fixed-testnet', VAT_RATE_BPS: '2000', VAT_KEY_VERSION: '1', VAT_SIGNER_PRIVATE_KEY: signer.toString(), ALLOWED_ORIGINS: ORIGIN,
        ...overrides,
    };
    const view = vi.fn(async (contractId: string, method: string, args: Record<string, unknown>) => {
        expect(contractId).toBe(fixture.contract_id);
        if (method === 'get_vat_public_key') return (chain.vatKey === undefined ? signer.getPublicKey().toString() : chain.vatKey) as never;
        if (method === 'get_publication') return { publication_id: args.publication_id, price_usdc: chain.price ?? fixture.gross_usdc_micro, availability: chain.availability ?? 'ACTIVE' } as never;
        if (method === 'get_ticket') return (chain.ticket ?? null) as never;
        throw new Error(`unexpected ${method}`);
    });
    const call = async (body: unknown, headers: Record<string, string> = {}) => {
        const response = await handle(new Request('https://payments.test/v1/vat-attestations', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, body: JSON.stringify(body),
        }), env, { view: view as never, now: () => NOW });
        return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    return { env, view, call };
}

describe('POST /v1/vat-attestations', () => {
    beforeEach(() => resetKeyCheckForTests());
    const body = { ticket_id: vector.input.ticket_id, publication_id: vector.input.publication_id };

    it('attests the on-chain price for a new ticket and matches the golden vector', async () => {
        const { call } = await setup();
        expect(await call(body)).toEqual({ status: 200, body: {
            gross_usdc_micro: '5000000', vat_usdc_micro: '833334', expires_at_ms: vector.input.expires_at_ms, key_version: '1', signature: vector.signature,
        } });
    });

    it('takes the gross amount from the chain, never from the request, and accepts no buyer data', async () => {
        const { call } = await setup({}, { price: '7000000' });
        expect((await call(body)).body.gross_usdc_micro).toBe('7000000');
        for (const extra of [{ gross_usdc_micro: '1' }, { country: 'TR' }, { account_id: 'x.testnet' }]) {
            expect((await call({ ...body, ...extra })).status).toBe(400);
        }
    });

    it('refuses unavailable publications, existing tickets, low prices and an unregistered key', async () => {
        expect((await (await setup({}, { availability: 'TAKEDOWN' })).call(body)).body).toEqual({ error: 'publication_not_available' });
        expect((await (await setup({}, { ticket: { ticket_id: body.ticket_id } })).call(body)).body).toEqual({ error: 'ticket_exists' });
        expect((await (await setup({}, { price: '4000000' })).call(body)).body).toEqual({ error: 'price_below_minimum' });
        resetKeyCheckForTests();
        expect((await (await setup({}, { vatKey: null })).call(body)).body).toEqual({ error: 'vat_key_not_registered' });
        resetKeyCheckForTests();
        expect((await (await setup({}, { vatKey: KeyPair.fromRandom('ed25519').getPublicKey().toString() })).call(body)).status).toBe(503);
    });

    it('stays off for mainnet, unknown policies, bad rates, foreign origins and without a key', async () => {
        for (const overrides of [{ NEAR_NETWORK: 'mainnet' }, { VAT_POLICY: 'buyer-country' }, { VAT_RATE_BPS: '2701' },
            { VAT_SIGNER_PRIVATE_KEY: undefined }, { PAYMENT_SERVICE_ENABLED: 'false' }]) {
            expect((await (await setup(overrides)).call(body)).body).toEqual({ error: 'payment_service_disabled' });
        }
        expect((await (await setup()).call(body, { Origin: 'https://evil.example' })).status).toBe(403);
        const limited = await setup({ PAYMENT_RATE_LIMITER: { limit: async () => ({ success: false }) } as unknown as RateLimit });
        expect((await limited.call(body)).body).toEqual({ error: 'rate_limited' });
    });
});
