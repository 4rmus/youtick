import { createHash } from 'node:crypto';
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { baseDecode } from 'near-api-js';
import { describe, expect, it, vi } from 'vitest';
import vectors from '../../../../protocol/youtick-market-v2/golden-vectors.json';
import { base64Decode, hexDecode, hexEncode } from '@/lib/crypto/codec';
import {
    CKD_TRUST_ROOTS, ckdGateNonce, ckdGatePath, createCkdDecryptor, decodeG1, decodeG2, decryptCkdKey, deriveAppId,
    encodeG1, encodeG2, generateEphemeralKeyPV, hashAppIdWithPk, requestKeyArgs,
} from '@/lib/ticket-keys/ckd';
import { deriveRootKey, deriveTicketSeed, ticketKey } from '@/lib/ticket-keys/keys';
import {
    buildAddDeviceArgs, buildCardPurchaseDevice, buildPlaybackV3Body, buildPurchaseTransferArgs, buildRefundArgs,
    buildRevokeDeviceArgs, playbackDeviceNonce, playbackMessage, signatureExpiry, ticketMessage,
} from '@/lib/ticket-keys/messages';
import { RECOVERY_GAP, scanTickets } from '@/lib/ticket-keys/recovery';

vi.unmock('near-api-js');

const G1 = bls.G1.Point;
const G2 = bls.G2.Point;
const Fr = G1.Fn;

// MPC-side simulation: sig = msk·H(pk, app_id); (Y, C) = (y·G1, sig + y·A).
function simulateCkdResponse(masterSecret: Uint8Array, pk1: string, appId: Uint8Array) {
    const msk = Fr.fromBytes(masterSecret);
    const mpcPublicKey = G2.BASE.multiply(msk);
    const sig = hashAppIdWithPk(mpcPublicKey, appId).multiply(msk);
    const y = Fr.fromBytes(bls.utils.randomSecretKey());
    return {
        mpcPublicKey: encodeG2(mpcPublicKey),
        response: { big_y: encodeG1(G1.BASE.multiply(y)), big_c: encodeG1(sig.add(decodeG1(pk1).multiply(y))) },
    };
}

const fixture = vectors.fixture;
const binding = { network: fixture.network, contractId: fixture.contract_id };
const root = deriveRootKey(hexDecode(vectors.key_derivation.ckd_key_hex));
const expiresAtMs = vectors.ticket_signatures.purchase_device.message.split('\n')[5];
const device = {
    sessionPublicKey: vectors.ticket_signatures.purchase_device.fields.session_public_key,
    certificateSha256: fixture.certificate_sha256,
};

describe('ticket key derivation', () => {
    it('matches the protocol root, seeds, public keys and ticket ids', () => {
        expect(hexEncode(root)).toBe(vectors.key_derivation.root_key_hex);
        for (const expected of vectors.key_derivation.tickets) {
            expect(hexEncode(deriveTicketSeed(root, expected.index))).toBe(expected.seed_hex);
            const key = ticketKey(root, expected.index);
            expect(key.publicKey).toBe(expected.public_key);
            expect(key.ticketId).toBe(expected.ticket_id);
        }
    });

    it('rejects a wrong-sized CKD key and indices outside u32', () => {
        expect(() => deriveRootKey(new Uint8Array(31))).toThrow('invalid_ckd_key');
        for (const index of [-1, 1.5, 0x1_0000_0000]) {
            expect(() => deriveTicketSeed(root, index)).toThrow('invalid_ticket_index');
        }
    });
});

describe('ticket-key signatures and call arguments', () => {
    const [first, second] = [ticketKey(root, 0), ticketKey(root, 1)];

    it('reproduces every ticket signature vector byte for byte', () => {
        for (const [action, vector] of Object.entries(vectors.ticket_signatures)) {
            const key = vector.signer_public_key === first.publicKey ? first : second;
            expect(key.publicKey).toBe(vector.signer_public_key);
            const message = ticketMessage(binding, action as 'add_device', vector.ticket_id, expiresAtMs,
                vector.fields as never);
            expect(message).toBe(vector.message);
            expect(key.sign(message)).toBe(vector.signature);
        }
    });

    it('builds the buy_ticket_v2 transfer exactly as the protocol vector', () => {
        const { vat } = vectors.purchase.msg;
        const args = buildPurchaseTransferArgs({
            binding, ticket: first, publicationId: fixture.publication_id, grossUsdcMicro: fixture.gross_usdc_micro,
            device, expiresAtMs, vat,
        });
        expect(args).toEqual(vectors.purchase.ft_transfer_call_args);
    });

    it('builds the card purchase device and holder calls exactly as the protocol vectors', () => {
        const card = vectors.card_ticket.issue_card_ticket_args;
        expect(buildCardPurchaseDevice({
            binding, ticket: second, publicationId: card.publication_id, device,
            paymentReferenceHmac: card.payment_reference_hmac, grossMinor: card.gross_minor, currency: card.currency,
            expiresAtMs,
        })).toEqual(card.device);

        const added = vectors.calls.add_device_args;
        expect(buildAddDeviceArgs({
            binding, ticket: first, expiresAtMs, deviceEpoch: added.device_epoch,
            device: { sessionPublicKey: added.session_public_key, certificateSha256: added.certificate_sha256 },
        })).toEqual(added);

        const revoked = vectors.calls.revoke_device_args;
        expect(buildRevokeDeviceArgs({
            binding, ticket: first, expiresAtMs, sessionPublicKey: revoked.session_public_key,
            deviceEpoch: revoked.device_epoch,
        })).toEqual(revoked);

        const refund = vectors.calls.refund_unwatched_args;
        expect(buildRefundArgs({ binding, ticket: first, expiresAtMs, refundTo: refund.refund_to })).toEqual(refund);
    });

    it('refuses non-canonical fields instead of signing them', () => {
        const fields = vectors.ticket_signatures.purchase_device.fields;
        const sign = (override: Record<string, string>, ticketId = first.ticketId, expiry = expiresAtMs) =>
            () => ticketMessage(binding, 'purchase_device', ticketId, expiry, { ...fields, ...override });
        expect(sign({})).not.toThrow();
        for (const call of [
            sign({ publication_id: 'job-001\nextra' }),
            sign({ publication_id: '' }),
            sign({ publication_id: 'job 001' }),
            sign({ publication_id: 'j'.repeat(129) }),
            sign({ session_public_key: fields.session_public_key.replace('ed25519:', '') }),
            sign({ session_public_key: 'ed25519:1111' }),
            sign({ certificate_sha256: fields.certificate_sha256.toUpperCase() }),
            sign({}, first.ticketId.toUpperCase()),
            sign({}, first.ticketId, '01791360600000'),
            sign({}, first.ticketId, '18446744073709551616'),
        ]) {
            expect(call).toThrow('invalid_ticket_message');
        }
        expect(() => ticketMessage(binding, 'add_device', first.ticketId, expiresAtMs, {
            session_public_key: fields.session_public_key, certificate_sha256: fields.certificate_sha256,
            device_epoch: '4294967296',
        })).toThrow('invalid_ticket_message');
        const refund = (refundTo: string) => () => ticketMessage(binding, 'refund_unwatched', first.ticketId, expiresAtMs,
            { refund_to: refundTo });
        for (const account of ['Fan.testnet', 'fan.testnet.', 'a', 'fan testnet']) expect(refund(account)).toThrow('invalid_ticket_message');
        const card = vectors.ticket_signatures.card_purchase.fields;
        expect(() => ticketMessage(binding, 'card_purchase', second.ticketId, expiresAtMs, { ...card, gross_minor: '0' }))
            .toThrow('invalid_ticket_message');
        expect(() => ticketMessage(binding, 'card_purchase', second.ticketId, expiresAtMs, { ...card, currency: 'usd' }))
            .toThrow('invalid_ticket_message');
    });

    it('rejects a zero or malformed purchase amount and VAT fields', () => {
        const { vat } = vectors.purchase.msg;
        const build = (grossUsdcMicro: string, override: Partial<typeof vat> = {}) => () => buildPurchaseTransferArgs({
            binding, ticket: first, publicationId: fixture.publication_id, grossUsdcMicro, device, expiresAtMs,
            vat: { ...vat, ...override },
        });
        expect(build(fixture.gross_usdc_micro)).not.toThrow();
        for (const call of [build('0'), build('5.0'), build(fixture.gross_usdc_micro, { vat_usdc_micro: '-1' }),
            build(fixture.gross_usdc_micro, { key_version: '4294967296' })]) {
            expect(call).toThrow('invalid_ticket_message');
        }
    });

    it('keeps signature expiry a clock-skew margin below the contract limit', () => {
        expect(signatureExpiry(1_000)).toBe(`${1_000 + 600_000}`);
        expect(signatureExpiry(1_000, 10 * 3_600_000)).toBe(`${1_000 + 3_300_000}`);
        expect(() => signatureExpiry(0)).toThrow('invalid_ticket_message');
    });
});

describe('playback v3 request', () => {
    const vector = vectors.playback_request;

    it('matches the protocol message and verifies the vector signature', () => {
        const message = playbackMessage(vector.input);
        expect(message).toBe(vector.message);
        const publicKey = baseDecode(vector.input.session_public_key.slice('ed25519:'.length));
        expect(ed25519.verify(base64Decode(vector.signature), new TextEncoder().encode(message), publicKey)).toBe(true);
    });

    it('passes the exact message to the session-key signer', async () => {
        const signer = vi.fn<(message: Uint8Array) => Promise<string>>(async () => vector.signature);
        const nowMs = Number(fixture.issued_at_ms);
        const body = await buildPlaybackV3Body(vector.input, signer, nowMs);
        expect(body).toEqual({ request: vector.input, signature: vector.signature });
        expect(new TextDecoder().decode(signer.mock.calls[0][0])).toBe(vector.message);
        await expect(buildPlaybackV3Body({ ...vector.input, device_nonce: 'A'.repeat(32) }, signer, nowMs))
            .rejects.toThrow('invalid_ticket_message');
        // The Bridge window: now < expires_at_ms <= now + 5 minutes.
        const expires = Number(vector.input.expires_at_ms);
        await expect(buildPlaybackV3Body(vector.input, signer, expires)).rejects.toThrow('invalid_ticket_message');
        await expect(buildPlaybackV3Body(vector.input, signer, expires - 5 * 60 * 1000 - 1))
            .rejects.toThrow('invalid_ticket_message');
        expect(signer).toHaveBeenCalledTimes(1);
    });

    it('creates 128-bit lowercase hex nonces', () => {
        const nonce = playbackDeviceNonce();
        expect(nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(playbackDeviceNonce()).not.toBe(nonce);
    });
});

describe('CKD through ckd-gate', () => {
    const hex = (bytes: Uint8Array) => hexEncode(bytes);

    it('derives app ids and hash points as near/mpc does', () => {
        // near-mpc-crypto-types kdf snapshot entries [0] and [5].
        expect(hex(deriveAppId('dwefqwg', 'frwewegwegweg')))
            .toBe('b8177b00468f97c337b3f921fbef7aaa959e9a49005aaa59768b795152f4c989');
        expect(hex(deriveAppId('qfweqwgwegqw', 'fwei2.3f230')))
            .toBe('6042862796895d3b0e5678f5bc2da01b245fb8bf7e3515d261a7e93a963e25e3');
        // near/mpc contract snapshot for H(G2 generator || 0^32).
        expect(hex(hashAppIdWithPk(bls.G2.Point.BASE, new Uint8Array(32)).toBytes(true)))
            .toBe('91a9e23bb0a79b6c542b80e8ee10c102a4903ffb8e8bd5592bc4aba557742dd352417b686c0d067714818275c22c886a');
    });

    it('round-trips the mainnet CKD domain public key', () => {
        const pk = 'bls12381g2:24mhN4RnB2CbiUkAfukyh4s1CT6dUNd9Pc8kRnL4LvAP3tcxhUupbphmfbmwHSi66aFCiZkMgiH2KqXWJLD7JUeAFhoLS3WQbzWcpUzhERLqxyocwT9Xrd4WNvEuKavxmXdR';
        expect(encodeG2(decodeG2(pk))).toBe(pk);
        expect(() => decodeG2(pk.replace('g2', 'g1'))).toThrow('invalid_point_encoding');
    });

    it('binds the id_token nonce to the gate and both ephemeral points', () => {
        const key = { pk1: 'bls12381g1:a', pk2: 'bls12381g2:b' };
        const expected = createHash('sha256').update('ckd-gate|gate.testnet|bls12381g1:a|bls12381g2:b').digest('base64url');
        expect(ckdGateNonce('gate.testnet', key)).toBe(expected);
        expect(ckdGateNonce('gate2.testnet', key)).not.toBe(expected);
        expect(requestKeyArgs('jwt', key)).toEqual({ jwt: 'jwt', app_public_key: key });
        expect(requestKeyArgs('jwt', key, 'fan.testnet')).toEqual({ jwt: 'jwt', app_public_key: key, account_id: 'fan.testnet' });
    });

    it('trusts no gate until one is pinned', () => {
        expect(CKD_TRUST_ROOTS.testnet).toEqual([]);
        expect(CKD_TRUST_ROOTS.mainnet).toEqual([]);
        expect(Object.isFrozen(CKD_TRUST_ROOTS) && Object.isFrozen(CKD_TRUST_ROOTS.mainnet)).toBe(true);
        const ephemeral = generateEphemeralKeyPV();
        expect(() => decryptCkdKey({
            network: 'mainnet', gateAccountId: 'ckd-gate.near', accountId: 'fan.near', scalar: ephemeral.scalar,
            result: { account_id: 'fan.near', derivation_path: 'v1/fan.near', response: { big_y: '', big_c: '' } },
        })).toThrow('ckd_gate_not_trusted');
    });

    it('decrypts the same key for any ephemeral key and rejects a wrong scalar, gate, account or MPC key', () => {
        const masterSecret = bls.utils.randomSecretKey();
        const gateAccountId = 'ckd-gate.youtick.testnet';
        const accountId = 'fan.testnet';
        const appId = deriveAppId(gateAccountId, ckdGatePath(accountId));
        const request = () => {
            const ephemeral = generateEphemeralKeyPV();
            const { mpcPublicKey, response } = simulateCkdResponse(masterSecret, ephemeral.pk1, appId);
            const result = { account_id: accountId, derivation_path: ckdGatePath(accountId), response };
            return { ephemeral, mpcPublicKey, result };
        };
        const first = request();
        const decrypt = createCkdDecryptor({
            testnet: [{ gateAccountId, mpcPublicKey: first.mpcPublicKey }, { gateAccountId: 'old-gate.testnet', mpcPublicKey: first.mpcPublicKey }],
            mainnet: [],
        });
        const keys = [first, request()].map(({ ephemeral, result }) =>
            decrypt({ network: 'testnet', result, scalar: ephemeral.scalar, gateAccountId, accountId }));
        expect(keys[0]).toHaveLength(32);
        expect(hex(keys[0])).toBe(hex(keys[1]));

        const { ephemeral, result } = request();
        const input = { network: 'testnet' as const, result, scalar: ephemeral.scalar, gateAccountId, accountId };
        expect(() => decrypt({ ...input, scalar: Fr.add(ephemeral.scalar, Fr.ONE) })).toThrow('ckd_verification_failed');
        expect(() => decrypt({ ...input, gateAccountId: 'old-gate.testnet' })).toThrow('ckd_verification_failed');
        expect(() => decrypt({ ...input, gateAccountId: 'unknown-gate.testnet' })).toThrow('ckd_gate_not_trusted');
        expect(() => decrypt({ ...input, network: 'mainnet' })).toThrow('ckd_gate_not_trusted');
        expect(() => decrypt({ ...input, accountId: 'other.testnet' })).toThrow('ckd_account_mismatch');
        expect(() => decrypt({
            ...input, result: { ...result, account_id: 'other.testnet', derivation_path: ckdGatePath('other.testnet') },
        })).toThrow('ckd_account_mismatch');

        // A self-consistent response from another master key fails against the pinned key.
        const forged = simulateCkdResponse(bls.utils.randomSecretKey(), ephemeral.pk1, appId);
        expect(() => decrypt({ ...input, result: { ...result, response: forged.response } })).toThrow('ckd_verification_failed');

        const infinity = encodeG1(G1.ZERO);
        expect(() => decrypt({ ...input, result: { ...result, response: { ...result.response, big_c: infinity } } }))
            .toThrow('ckd_verification_failed');
        expect(() => decrypt({ ...input, result: { ...result, response: { ...result.response, big_y: 'bls12381g1:1111' } } }))
            .toThrow('invalid_point_length');
    });
});

describe('recovery scan', () => {
    const ckdKey = hexDecode(vectors.key_derivation.ckd_key_hex);
    const idsAt = (indices: number[]) => new Set(indices.map((index) => ticketKey(root, index).ticketId));

    it('finds tickets across gaps shorter than 20 and stops after 20 misses', async () => {
        const present = idsAt([0, 1, 5, 24]);
        const getTicket = vi.fn(async (id: string) => (present.has(id) ? { ticket_id: id } : null));
        const result = await scanTickets(ckdKey, getTicket);
        expect(result.tickets.map((ticket) => ticket.key.index)).toEqual([0, 1, 5, 24]);
        expect(result.nextIndex).toBe(25);
        expect(getTicket).toHaveBeenCalledTimes(25 + RECOVERY_GAP);
    });

    it('does not see a ticket after a gap of 20 and starts at 0 for a new identity', async () => {
        const present = idsAt([21]);
        const result = await scanTickets(ckdKey, async (id) => (present.has(id) ? {} : null));
        expect(result).toEqual({ tickets: [], nextIndex: 0 });
    });

    it('honours a custom gap and the scan limit', async () => {
        const present = idsAt([0, 3]);
        const lookup = async (id: string) => (present.has(id) ? {} : null);
        expect((await scanTickets(ckdKey, lookup, { gap: 2 })).nextIndex).toBe(1);
        expect((await scanTickets(ckdKey, lookup, { gap: 3 })).nextIndex).toBe(4);
        await expect(scanTickets(ckdKey, lookup, { maxIndex: 10 })).rejects.toThrow('recovery_scan_limit');
        await expect(scanTickets(ckdKey, lookup, { gap: 0 })).rejects.toThrow('invalid_recovery_gap');
    });

    it('rejects an undefined lookup result instead of counting it as a ticket', async () => {
        await expect(scanTickets(ckdKey, async () => undefined as unknown as null)).rejects.toThrow('invalid_ticket_lookup');
    });

    it('propagates RPC failures instead of treating them as gaps', async () => {
        await expect(scanTickets(ckdKey, async () => {
            throw new Error('rpc_unavailable');
        })).rejects.toThrow('rpc_unavailable');
    });
});
