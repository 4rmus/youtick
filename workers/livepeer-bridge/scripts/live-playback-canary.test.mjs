import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { runLivePlaybackCanary } from './live-playback-canary.mjs';

const skipBrowserPreflight = async () => {};

function signingKey() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return {
        id: 'signing-key-123',
        privateKey: Buffer.from(pair.privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'),
        publicKey: Buffer.from(pair.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
    };
}

function signingKeyFetch(key, { createResponseLost = false } = {}) {
    const calls = [];
    let created = false;
    const fetchImpl = async (url, init = {}) => {
        const method = init.method || 'GET';
        const target = String(url);
        calls.push({ method, target });
        if (target.endsWith('/access-control/signing-key') && method === 'POST') {
            created = true;
            if (createResponseLost) throw new Error('simulated_signing_key_response_lost');
            return Response.json(key, { status: 201 });
        }
        if (target.endsWith(`/access-control/signing-key/${key.id}`) && method === 'DELETE') {
            return new Response(null, { status: 204 });
        }
        if (target.endsWith('/access-control/signing-key') && method === 'GET') {
            const deleted = calls.some((call) => call.target.endsWith(`/access-control/signing-key/${key.id}`)
                && call.method === 'DELETE');
            return Response.json(created && !deleted ? [key] : [], { status: 200 });
        }
        throw new Error(`unexpected ${method} ${target}`);
    };
    return { fetchImpl, calls };
}

test('live playback canary preflights browsers before signing-key mutation', async () => {
    const key = signingKey();
    const { fetchImpl, calls } = signingKeyFetch(key);
    await assert.rejects(
        runLivePlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            signingKeyMutationsEnabled: true,
            fileBytes: new Uint8Array([1]),
            fetchImpl,
            browserPreflight: async () => { throw new Error('browser_canary_chrome_unavailable'); },
        }),
        /browser_canary_chrome_unavailable/,
    );
    assert.equal(calls.length, 0);
});

test('live playback canary accepts 201 and redacts a cleaned signing key', async () => {
    const key = signingKey();
    const { fetchImpl, calls } = signingKeyFetch(key);
    const receipt = await runLivePlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        signingKeyMutationsEnabled: true,
        fileBytes: new Uint8Array([1]),
        fetchImpl,
        browserPreflight: skipBrowserPreflight,
        runPlayback: async () => ({ schema: 'test-receipt' }),
    });
    assert.deepEqual(receipt, {
        schema: 'test-receipt',
        signing_key: {
            id_sha256: '9d887e41c756601c847f9ebe08080d153776f1c97ba1606bf2cb523012df8f45',
            create_status: 201,
            delete_status: 204,
            post_delete_absent: true,
        },
    });
    assert.doesNotMatch(JSON.stringify(receipt), /signing-key-123/);
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('live playback canary deletes its signing key after a playback failure', async () => {
    const key = signingKey();
    const { fetchImpl, calls } = signingKeyFetch(key);
    await assert.rejects(
        runLivePlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            signingKeyMutationsEnabled: true,
            fileBytes: new Uint8Array([1]),
            fetchImpl,
            browserPreflight: skipBrowserPreflight,
            runPlayback: async () => { throw new Error('playback_gate_failed'); },
        }),
        /playback_gate_failed/,
    );
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
    assert.equal(calls.filter((call) => call.method === 'GET').length, 2);
});

test('live playback canary leaves an ambiguously created signing key for manual recovery', async () => {
    const key = signingKey();
    const { fetchImpl, calls } = signingKeyFetch(key, { createResponseLost: true });
    await assert.rejects(
        runLivePlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            signingKeyMutationsEnabled: true,
            fileBytes: new Uint8Array([1]),
            fetchImpl,
            browserPreflight: skipBrowserPreflight,
        }),
        (error) => {
            assert.match(error.message, /live_playback_canary_signing_key_create_ambiguous/);
            assert.deepEqual(error.recovery, {
                signing_key: {
                    cleanup: 'manual_required',
                    new_key_count: 1,
                    new_key_ids_sha256: ['9d887e41c756601c847f9ebe08080d153776f1c97ba1606bf2cb523012df8f45'],
                },
            });
            return true;
        },
    );
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0);
    assert.equal(calls.filter((call) => call.method === 'GET').length, 2);
});
