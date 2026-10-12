import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto, createPrivateKey, createPublicKey } from 'node:crypto';
import { KeyPair, PublicKey, baseEncode } from 'near-api-js';
import { convert, expectedQuotePublicKey } from './v2-testnet-quote-key.mjs';

// Fixed test key only; never a real quote key.
function keyFromSeed(byte) {
    const seed = Buffer.alloc(32, byte);
    const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
    const pub = createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).subarray(-32);
    return KeyPair.fromString(`ed25519:${baseEncode(Buffer.concat([seed, pub]))}`);
}
const TEST_KEY = keyFromSeed(7);
const fileFor = (pair) => JSON.stringify({ name: 'quote', public_key: pair.getPublicKey().toString(), private_key: pair.toString() });
const base64Public = (pair) => Buffer.from(PublicKey.from(pair.getPublicKey().toString()).data).toString('base64');

test('converts a NEAR quote key into PKCS8 the Bridge imports and signs with', async () => {
    const pkcs8 = convert(fileFor(TEST_KEY), base64Public(TEST_KEY));
    assert.ok(pkcs8.length >= 64);
    const key = await webcrypto.subtle.importKey('pkcs8', Buffer.from(pkcs8, 'base64'), 'Ed25519', false, ['sign']);
    const message = new TextEncoder().encode('quote');
    const signature = new Uint8Array(await webcrypto.subtle.sign('Ed25519', key, message));
    assert.ok(TEST_KEY.verify(message, signature));
});

test('refuses a key that does not match the expected public key', () => {
    assert.throws(() => convert(fileFor(TEST_KEY), base64Public(KeyPair.fromRandom('ed25519'))), /quote_public_key_mismatch/);
});

test('refuses a key file without an ed25519 private key', () => {
    assert.throws(() => convert(JSON.stringify({ private_key: 'secp256k1:abc' }), 'x'), /quote_key_not_ed25519/);
    assert.throws(() => convert('{}', 'x'), /quote_key_not_ed25519/);
});

test('checks against the quote key in the committed bootstrap policy', () => {
    assert.equal(expectedQuotePublicKey(), 'YYvahur/L80hl0moUnEBLkHjv1jNjzIgXQFMs/jkSf4=');
});
