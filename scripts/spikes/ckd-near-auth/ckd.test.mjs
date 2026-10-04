import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAppId, hashAppIdWithPk, generateEphemeralKeyPV, simulateResponse, decryptAndDerive, decodeG2, encodeG2, G2, Fr } from './ckd.mjs';
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';

const hex = (b) => Buffer.from(b).toString('hex');

test('deriveAppId matches the near/mpc snapshot', () => {
    // near-mpc-crypto-types kdf snapshot: [0] = (dwefqwg, frwewegwegweg), [5] = (qfweqwgwegqw, fwei2.3f230)
    assert.equal(hex(deriveAppId('dwefqwg', 'frwewegwegweg')), 'b8177b00468f97c337b3f921fbef7aaa959e9a49005aaa59768b795152f4c989');
    assert.equal(hex(deriveAppId('qfweqwgwegqw', 'fwei2.3f230')), '6042862796895d3b0e5678f5bc2da01b245fb8bf7e3515d261a7e93a963e25e3');
});

test('hashAppIdWithPk matches the contract snapshot', () => {
    const point = hashAppIdWithPk(G2.BASE, new Uint8Array(32));
    assert.equal(hex(point.toBytes(true)), '91a9e23bb0a79b6c542b80e8ee10c102a4903ffb8e8bd5592bc4aba557742dd352417b686c0d067714818275c22c886a');
});

test('mainnet CKD public key round-trips', () => {
    const pk = 'bls12381g2:24mhN4RnB2CbiUkAfukyh4s1CT6dUNd9Pc8kRnL4LvAP3tcxhUupbphmfbmwHSi66aFCiZkMgiH2KqXWJLD7JUeAFhoLS3WQbzWcpUzhERLqxyocwT9Xrd4WNvEuKavxmXdR';
    assert.equal(encodeG2(decodeG2(pk)), pk);
});

test('simulated MPC response: different ephemeral keys give the same key, wrong scalar or account is rejected', () => {
    const msk = Fr.fromBytes(bls.utils.randomSecretKey());
    const accountId = 'abc.testnet', path = 'v1';
    const appId = deriveAppId(accountId, path);
    const keys = [0, 1].map(() => {
        const eph = generateEphemeralKeyPV();
        const { mpcPublicKey, response } = simulateResponse(msk, eph.pk1, appId);
        return decryptAndDerive({ response, scalar: eph.scalar, accountId, path, mpcPublicKey });
    });
    assert.equal(hex(keys[0]), hex(keys[1]));
    const eph = generateEphemeralKeyPV();
    const { mpcPublicKey, response } = simulateResponse(msk, eph.pk1, appId);
    assert.throws(() => decryptAndDerive({ response, scalar: Fr.add(eph.scalar, Fr.ONE), accountId, path, mpcPublicKey }), /ckd_verification_failed/);
    assert.throws(() => decryptAndDerive({ response, scalar: eph.scalar, accountId: 'other.testnet', path, mpcPublicKey }), /ckd_verification_failed/);
});
