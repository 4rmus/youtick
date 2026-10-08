// NEAR MPC Confidential Key Derivation (CKD), client side, through the youtick `ckd-gate` contract.
// Ported from the youtick-v2-spikes client (near/mpc b826c85, crates/ckd-example-cli/src/ckd.rs and
// crates/contract/src/primitives/ckd.rs). The ephemeral scalar never leaves this module's caller;
// the MPC response is encrypted to it and the decrypted secret is checked with a pairing.
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha3_256 } from '@noble/hashes/sha3.js';
import { baseDecode, baseEncode } from 'near-api-js';

const G1 = bls.G1.Point;
const G2 = bls.G2.Point;
const Fr = G1.Fn;
type G1Point = InstanceType<typeof G1>;
type G2Point = InstanceType<typeof G2>;
type Scalar = bigint;

export const NEAR_CKD_DOMAIN = 'NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_';
const APP_ID_DERIVATION_PREFIX = 'near-mpc v0.1.0 app_id derivation:';
const CKD_HKDF_SALT = 'near-mpc-ckd-hkdf-v1';
const CKD_HKDF_INFO = 'near-mpc-ckd-strong-key-v1';
const G1_PREFIX = 'bls12381g1:';
const G2_PREFIX = 'bls12381g2:';

const utf8 = (value: string) => new TextEncoder().encode(value);

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function base64UrlNoPad(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const encodeG1 = (point: G1Point) => `${G1_PREFIX}${baseEncode(point.toBytes(true))}`;
export const encodeG2 = (point: G2Point) => `${G2_PREFIX}${baseEncode(point.toBytes(true))}`;

function decodePoint<P extends { assertValidity(): void }>(
    value: unknown, prefix: string, size: number, fromBytes: (bytes: Uint8Array) => P,
): P {
    if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error('invalid_point_encoding');
    const bytes = baseDecode(value.slice(prefix.length));
    if (bytes.length !== size) throw new Error('invalid_point_length');
    const point = fromBytes(bytes);
    point.assertValidity();
    return point;
}

export const decodeG1 = (value: unknown): G1Point => decodePoint(value, G1_PREFIX, 48, (bytes) => G1.fromBytes(bytes));
export const decodeG2 = (value: unknown): G2Point => decodePoint(value, G2_PREFIX, 96, (bytes) => G2.fromBytes(bytes));

/** MPC binds the secret to (predecessor, path); for youtick the predecessor is the gate contract. */
export const ckdGatePath = (accountId: string) => `v1/${accountId}`;

/** sha3_256("near-mpc v0.1.0 app_id derivation:" + predecessor + "," + path) */
export const deriveAppId = (predecessorId: string, path: string) =>
    sha3_256(utf8(`${APP_ID_DERIVATION_PREFIX}${predecessorId},${path}`));

export const hashAppIdWithPk = (mpcPublicKey: G2Point, appId: Uint8Array): G1Point =>
    bls.G1.hashToCurve(concat(mpcPublicKey.toBytes(true), appId), { DST: NEAR_CKD_DOMAIN }) as unknown as G1Point;

export interface EphemeralKeyPV {
    scalar: Scalar;
    pk1: string;
    pk2: string;
}

/** AppPublicKeyPV: the same fresh scalar on G1 and G2. Use each one for a single request. */
export function generateEphemeralKeyPV(): EphemeralKeyPV {
    const scalar = Fr.fromBytes(bls.utils.randomSecretKey());
    return { scalar, pk1: encodeG1(G1.BASE.multiply(scalar)), pk2: encodeG2(G2.BASE.multiply(scalar)) };
}

/** The id_token nonce the gate requires: b64url(sha256("ckd-gate|<gate>|<pk1>|<pk2>")), no padding. */
export const ckdGateNonce = (gateAccountId: string, key: Pick<EphemeralKeyPV, 'pk1' | 'pk2'>) =>
    base64UrlNoPad(sha256(utf8(`ckd-gate|${gateAccountId}|${key.pk1}|${key.pk2}`)));

/** Arguments for the gate's `request_key` (rules a and b). Omit `accountId` for rule (a). */
export function requestKeyArgs(jwt: string, key: Pick<EphemeralKeyPV, 'pk1' | 'pk2'>, accountId?: string) {
    return {
        jwt,
        app_public_key: { pk1: key.pk1, pk2: key.pk2 },
        ...(accountId === undefined ? {} : { account_id: accountId }),
    };
}

// e(secret, g2) == e(H(pk || app_id), pk)
export function verifyCkdSecret(mpcPublicKey: G2Point, appId: Uint8Array, secret: G1Point): boolean {
    if (secret.is0() || !secret.isTorsionFree()) return false;
    const base = hashAppIdWithPk(mpcPublicKey, appId);
    return bls.fields.Fp12.eql(bls.pairing(base, mpcPublicKey), bls.pairing(secret, G2.BASE));
}

export interface CkdGateResult {
    account_id: string;
    derivation_path: string;
    response: { big_y: string; big_c: string };
}

/** A deployed `ckd-gate` and the MPC public key of the CKD domain it requests from. */
export interface CkdTrustRoot {
    gateAccountId: string;
    mpcPublicKey: string;
}

export type CkdNetwork = 'testnet' | 'mainnet';

/**
 * The only gates and MPC keys the app trusts. The pairing check proves a response matches the key
 * it is given, so these must never come from RPC results, URLs or runtime config: a forged key
 * would hand an attacker every ticket seed. Entries are added only after the gate is deployed
 * (keyless, reproducible build) and the CKD domain key is read from the MPC contract; an empty list
 * means CKD is unavailable on that network. Keep old gates listed after a rotation so their
 * tickets stay recoverable.
 */
export const CKD_TRUST_ROOTS: Readonly<Record<CkdNetwork, readonly CkdTrustRoot[]>> = Object.freeze({
    testnet: Object.freeze([
        // V2 testnet bootstrap, GitHub run 37832347847 (source 9592674): keyless, code hash = CI ckd_gate.wasm.
        // MPC key: v1.signer-prod.testnet `public_key({ domain_id: 2 })`, domain 2 = ConfidentialKeyDerivation.
        Object.freeze({
            gateAccountId: 'v2-ckd-gate-261007.youtick-dev-v3.testnet',
            mpcPublicKey: 'bls12381g2:xeYho48G2Sr9oJz4gw9sLGZGspeeKpHZvMDAwWvoNTRnVMFJH96GxX98TT2MRhTtsot1wcGR1Ti2Xh8PCsbYJ2enbLNdJXDvTYSK8aTE3nJ5NZXU7Kt1F6mFtReWs5pR4kj',
        }),
    ]),
    mainnet: Object.freeze([]),
});

export interface DecryptCkdKeyInput {
    network: CkdNetwork;
    gateAccountId: string;
    accountId: string;
    result: CkdGateResult;
    scalar: Scalar;
}

/**
 * Builds a decryptor bound to a fixed trust-root registry. Production code uses `decryptCkdKey`;
 * tests build one over simulated roots.
 */
export function createCkdDecryptor(roots: Readonly<Record<CkdNetwork, readonly CkdTrustRoot[]>>) {
    /**
     * Decrypts the gate's `on_ckd` result into the 32-byte `ckd_key`.
     * secret = C − a·Y, checked against the pinned MPC key, then HKDF-SHA256 to 32 bytes.
     */
    return function decrypt(input: DecryptCkdKeyInput): Uint8Array {
        const root = roots[input.network]?.find((entry) => entry.gateAccountId === input.gateAccountId);
        if (!root) throw new Error('ckd_gate_not_trusted');
        const { result } = input;
        if (result?.account_id !== input.accountId || result.derivation_path !== ckdGatePath(input.accountId)) {
            throw new Error('ckd_account_mismatch');
        }
        const bigY = decodeG1(result.response?.big_y);
        const bigC = decodeG1(result.response?.big_c);
        const appId = deriveAppId(root.gateAccountId, result.derivation_path);
        const secret = bigC.subtract(bigY.multiply(input.scalar));
        if (!verifyCkdSecret(decodeG2(root.mpcPublicKey), appId, secret)) throw new Error('ckd_verification_failed');
        return hkdf(sha256, secret.toBytes(true), utf8(CKD_HKDF_SALT), utf8(CKD_HKDF_INFO), 32);
    };
}

export const decryptCkdKey = createCkdDecryptor(CKD_TRUST_ROOTS);
