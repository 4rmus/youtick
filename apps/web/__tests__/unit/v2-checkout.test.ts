import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import vectors from '../../../../protocol/youtick-market-v2/golden-vectors.json';
import { hexDecode } from '@/lib/crypto/codec';
import { NEAR_AUTH_PROVIDERS } from '@/lib/near-auth/config';
import type { OidcEnvironment, PopupLike } from '@/lib/near-auth/oidc';
import { deriveRootKey, ticketKey } from '@/lib/ticket-keys/keys';
import type { V2Config } from '@/lib/v2/config';
import type { DeviceKey } from '@/lib/v2/device-key';
import { buyTicket, CheckoutError, purchaseDelegateBytes, PURCHASE_GAS } from '@/lib/v2/purchase';

vi.unmock('near-api-js');

const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const MARKET = 'v2-market-261007.youtick-dev-v3.testnet';
const ACCOUNT = 'a'.repeat(64);
const USER_KEY = 'ed25519:11111111111111111111111111111112';
const config: V2Config = {
    auth: { network: 'testnet', clientId: 'client-1', provider: NEAR_AUTH_PROVIDERS.testnet! },
    marketContractId: MARKET, gateAccountId: 'ckd-gate.testnet', relayerUrl: 'https://relayer.test', bridgeUrl: 'https://bridge.test',
    paymentServiceUrl: 'https://payments.test',
};
const ckdKey = hexDecode(vectors.key_derivation.ckd_key_hex);
const firstTicket = ticketKey(deriveRootKey(ckdKey), 0);
const device: DeviceKey = {
    sessionPublicKey: vectors.ticket_signatures.purchase_device.fields.session_public_key,
    certificate: '{}', certificateSha256: vectors.fixture.certificate_sha256, sign: async () => '',
};
const vat = { gross_usdc_micro: '5000000', vat_usdc_micro: '833334', expires_at_ms: '1791360600000', key_version: '1', signature: vectors.vat_attestation.signature };

describe('purchase delegate', () => {
    const args = { receiver_id: MARKET, amount: '5000000', msg: JSON.stringify({ action: 'buy_ticket_v2', publication_id: 'job-001' }) };

    it('encodes the NEP-461 prefixed delegate the relayer rebuilds', () => {
        const bytes = purchaseDelegateBytes({ senderId: ACCOUNT, publicKey: USER_KEY, usdcContractId: USDC, args, nonce: 8n, maxBlockHeight: 1_600n });
        expect(Array.from(bytes.slice(0, 4))).toEqual([110, 1, 0, 64]);
        const text = new TextDecoder().decode(bytes);
        expect(text).toContain(ACCOUNT);
        expect(text).toContain(USDC);
        expect(text).toContain('ft_transfer_call');
        // The args JSON keeps the order the relayer requires.
        expect(text).toContain(JSON.stringify(args));
        expect(PURCHASE_GAS).toBe(300_000_000_000_000n);
    });

    it('stays within the protocol size budget for the NEAR Auth token', () => {
        const worst = vectors.size_budget.worst;
        const msg = JSON.stringify({
            action: 'buy_ticket_v2', publication_id: 'p'.repeat(128), ticket_public_key: `ed25519:${'z'.repeat(44)}`,
            device: { session_public_key: `ed25519:${'z'.repeat(44)}`, certificate_sha256: 'f'.repeat(64), expires_at_ms: '9'.repeat(13), signature: `${'A'.repeat(86)}==` },
            vat: { vat_usdc_micro: '9'.repeat(12), expires_at_ms: '9'.repeat(13), key_version: '99', signature: `${'A'.repeat(86)}==` },
        });
        const bytes = purchaseDelegateBytes({
            senderId: 'f'.repeat(64), publicKey: USER_KEY, usdcContractId: USDC,
            args: { receiver_id: 'market-v2.youtick.near', amount: '9'.repeat(12), msg }, nonce: 123456789n, maxBlockHeight: 987654321n,
        });
        expect(bytes.length).toBe(worst.delegate_bytes);
    });
});

class FakePopup implements PopupLike {
    closed = false;
    location = { href: 'about:blank' };
    close() { this.closed = true; }
}

function harness(options: { vatStatus?: number; relayer?: Array<[number, unknown]>; ticketAfter?: number; accessToken?: string } = {}) {
    const popup = new FakePopup();
    let listener: ((event: { origin: string; data: unknown; source?: unknown }) => void) | null = null;
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const relayer = [...(options.relayer ?? [[202, { pending: true }], [200, { submitted: true, txHash: 'h' }]])];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requests.push({ url: String(url), body });
        if (String(url) === 'https://payments.test/v1/vat-attestations') {
            return Response.json(options.vatStatus ? { error: 'publication_not_available' } : vat, { status: options.vatStatus ?? 200 });
        }
        if (String(url).endsWith('/oauth/token')) return Response.json({ access_token: options.accessToken ?? 'signing-token', id_token: 'id' });
        const [status, value] = relayer.shift() ?? [500, {}];
        return Response.json(value, { status });
    }) as unknown as typeof fetch;
    const oidc: OidcEnvironment = {
        addMessageListener(next) { listener = next; return () => { listener = null; }; },
        fetch: fetcher,
        randomBytes: (length) => new Uint8Array(length).fill(9),
        sha256: async (data) => new Uint8Array(createHash('sha256').update(data).digest()),
        setInterval: () => 1,
        clearInterval: () => undefined,
    };
    let reads = 0;
    const view = vi.fn(async () => {
        reads += 1;
        return (reads > (options.ticketAfter ?? 1) ? {
            ticket_id: firstTicket.ticketId, ticket_public_key: firstTicket.publicKey, publication_id: 'job-001', creator_id: 'creator.testnet',
            rail: 'crypto', status: 'purchased', gross_usdc_micro: '5000000', purchased_at_ms: '1791360000000', device_epoch: 0, devices: [],
        } : null) as never;
    });
    const run = () => {
        const pending = buyTicket({
            config, paymentServiceUrl: 'https://payments.test', usdcContractId: USDC,
            session: { accountId: ACCOUNT, publicKey: USER_KEY, ckdKey }, publicationId: 'job-001', ticketIndex: 0, device, popup,
            redirectUri: 'https://youtick.test',
            deps: {
                view, accessKey: async () => ({ nonce: 7n, blockHeight: 1_000n }), fetch: fetcher, sleep: async () => undefined,
                now: () => 1_791_360_000_000, oidc, randomNonce: () => 'n',
            },
        });
        pending.catch(() => undefined);
        void vi.waitFor(() => expect(popup.location.href).not.toBe('about:blank'), { timeout: 2_000 }).then(() => {
            const state = new URL(popup.location.href).searchParams.get('state');
            listener?.({ origin: new URL(config.auth.provider.issuer).origin, source: popup, data: { type: 'authorization_response', response: { state, code: 'code' } } });
        }, () => undefined);
        return pending;
    };
    return { run, popup, requests, view };
}

describe('NEAR Auth checkout', () => {
    it('attests VAT, asks for approval of the exact delegate, relays it and confirms the ticket on chain', async () => {
        const h = harness();
        const ticket = await h.run();
        expect(ticket.ticket_id).toBe(firstTicket.ticketId);
        expect(h.requests[0]).toEqual({ url: 'https://payments.test/v1/vat-attestations', body: { ticket_id: firstTicket.ticketId, publication_id: 'job-001' } });

        const authorize = new URL(h.popup.location.href);
        expect(authorize.searchParams.get('audience')).toBe('auth0.jwt.fast-auth.testnet');
        expect(authorize.searchParams.get('scope')).toBe('openid transaction:sign');
        const relayed = h.requests.filter((r) => r.url === 'https://relayer.test/v1/purchases');
        expect(relayed).toHaveLength(2);
        const body = relayed[1].body as { access_token: string; args: { receiver_id: string; amount: string; msg: string }; nonce: string; max_block_height: string };
        expect(body.access_token).toBe('signing-token');
        expect(body.nonce).toBe('8');
        expect(body.max_block_height).toBe('1600');
        expect(body.args.receiver_id).toBe(MARKET);
        expect(body.args.amount).toBe('5000000');
        expect(JSON.parse(body.args.msg)).toMatchObject({ action: 'buy_ticket_v2', publication_id: 'job-001', ticket_public_key: firstTicket.publicKey,
            vat: { vat_usdc_micro: '833334', key_version: '1' } });
        // The approval carries exactly the bytes the relayer will rebuild from this body.
        const expected = purchaseDelegateBytes({ senderId: ACCOUNT, publicKey: USER_KEY, usdcContractId: USDC, args: body.args, nonce: 8n, maxBlockHeight: 1_600n });
        expect(authorize.searchParams.get('delegateAction')).toBe(Array.from(expected).join(','));
    });

    it('closes the approval window when VAT cannot be attested and reports relayer and chain outcomes', async () => {
        const noVat = harness({ vatStatus: 409 });
        await expect(noVat.run()).rejects.toThrow('publication_not_available');
        expect(noVat.popup.closed).toBe(true);
        expect(noVat.popup.location.href).toBe('about:blank');

        await expect(harness({ relayer: [[409, { error: 'insufficient_balance' }]] }).run()).rejects.toThrow('insufficient_balance');
        const refunded = harness({ ticketAfter: 100 });
        await expect(refunded.run()).rejects.toThrow(CheckoutError);
        await expect(harness({ ticketAfter: 100 }).run()).rejects.toThrow('purchase_not_confirmed');
    });
});
