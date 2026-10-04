// NEAR MPC Confidential Key Derivation, client side (JS port).
// Reference: near/mpc b826c85, crates/ckd-example-cli/src/ckd.rs and crates/contract/src/primitives/ckd.rs.
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { sha3_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { baseDecode, baseEncode } from 'near-api-js';

const G1 = bls.G1.Point;
const G2 = bls.G2.Point;
const Fr = G1.Fn;
export const NEAR_CKD_DOMAIN = 'NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_';
const APP_ID_DERIVATION_PREFIX = 'near-mpc v0.1.0 app_id derivation:';
const utf8 = (s) => new TextEncoder().encode(s);
const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of parts) { out.set(p, i); i += p.length; }
    return out;
};

export const encodeG1 = (p) => `bls12381g1:${baseEncode(p.toBytes(true))}`;
export const encodeG2 = (p) => `bls12381g2:${baseEncode(p.toBytes(true))}`;
function decode(value, prefix, Point, size) {
    if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error('invalid_point_encoding');
    const bytes = baseDecode(value.slice(prefix.length));
    if (bytes.length !== size) throw new Error('invalid_point_length');
    const point = Point.fromBytes(bytes);
    point.assertValidity();
    return point;
}
export const decodeG1 = (v) => decode(v, 'bls12381g1:', G1, 48);
export const decodeG2 = (v) => decode(v, 'bls12381g2:', G2, 96);

// sha3_256("near-mpc v0.1.0 app_id derivation:" + account + "," + path)
export const deriveAppId = (accountId, path) => sha3_256(utf8(`${APP_ID_DERIVATION_PREFIX}${accountId},${path}`));

export const hashAppIdWithPk = (mpcPublicKey, appId) =>
    bls.G1.hashToCurve(concat(mpcPublicKey.toBytes(true), appId), { DST: NEAR_CKD_DOMAIN });

// AppPublicKeyPV: the same scalar on G1 and G2 (pk1, pk2).
export function generateEphemeralKeyPV() {
    const scalar = Fr.fromBytes(bls.utils.randomSecretKey());
    return { scalar, pk1: G1.BASE.multiply(scalar), pk2: G2.BASE.multiply(scalar) };
}

export function requestArgs({ derivationPath, domainId, pk1, pk2 }) {
    return { request: { derivation_path: derivationPath, domain_id: domainId,
        app_public_key: { AppPublicKeyPV: { pk1: encodeG1(pk1), pk2: encodeG2(pk2) } } } };
}

// e(secret, g2) == e(H(pk || app_id), pk)
export function verifySecret(mpcPublicKey, appId, secret) {
    if (secret.is0() || !secret.isTorsionFree()) return false;
    const base = hashAppIdWithPk(mpcPublicKey, appId);
    return bls.fields.Fp12.eql(bls.pairing(base, mpcPublicKey), bls.pairing(secret, G2.BASE));
}

// secret = C - a*Y, verified, then HKDF-SHA256(salt, info) to 32 bytes.
export function decryptAndDerive({ response, scalar, accountId, path, mpcPublicKey,
    info = 'near-mpc-ckd-strong-key-v1', salt = 'near-mpc-ckd-hkdf-v1' }) {
    const bigY = decodeG1(response.big_y);
    const bigC = decodeG1(response.big_c);
    const appId = deriveAppId(accountId, path);
    const secret = bigC.subtract(bigY.multiply(scalar));
    if (!verifySecret(mpcPublicKey, appId, secret)) throw new Error('ckd_verification_failed');
    return hkdf(sha256, secret.toBytes(true), utf8(salt), utf8(info), 32);
}

export const fingerprint = (key) => Buffer.from(sha256(utf8(Buffer.from(key).toString('hex')))).toString('hex').slice(0, 16);

// MPC-side simulation for tests: sig = msk*H(pk, app_id); (Y, C) = (y*G1, sig + y*A).
export function simulateResponse(msk, appPk1, appId) {
    const mpcPublicKey = G2.BASE.multiply(msk);
    const sig = hashAppIdWithPk(mpcPublicKey, appId).multiply(msk);
    const y = Fr.fromBytes(bls.utils.randomSecretKey());
    return { mpcPublicKey, sig, response: { big_y: encodeG1(G1.BASE.multiply(y)), big_c: encodeG1(sig.add(appPk1.multiply(y))) } };
}
export { G1, G2, Fr };
