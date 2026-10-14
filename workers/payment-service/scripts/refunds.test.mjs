import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { KeyPair } from 'near-api-js';
import { parseArgs, readKeyFile, run, settings } from './refunds.mjs';

const TOKEN = 't'.repeat(40);
const NOW = 1_792_005_000_000;
const TX = '9DnzFAJjxjX2xsi6K3ZbESRUjp2RKxvLu45ntYAUzngf';
const operatorKey = KeyPair.fromRandom('ed25519');

function row(overrides = {}) {
    return {
        request_id: 'a'.repeat(32), ticket_id: 'b'.repeat(64), publication_id: 'lp-job', refund_to: 'fan.testnet',
        expires_at_ms: NOW + 6 * 24 * 60 * 60 * 1000, signature: 's'.repeat(86) + '==', reason: 'The video stops after a minute.',
        status: 'pending', created_at_ms: NOW - 1000, decided_at_ms: null, decision_note: null, tx_hash: null, ...overrides,
    };
}

function harness({ chain = 'watched_in_escrow', afterSend = 'refunded', requests = [row()], accessKey = true } = {}) {
    const calls = { service: [], sent: [], out: [] };
    let status = chain;
    const fetcher = async (url, init = {}) => {
        calls.service.push({ url: String(url), method: init.method ?? 'GET', body: init.body, auth: init.headers?.Authorization });
        if (String(url).includes('/decision')) {
            const body = JSON.parse(init.body);
            return Response.json({ request: { ...requests[0], status: body.decision, tx_hash: body.tx_hash ?? null, decision_note: body.note ?? null } });
        }
        return Response.json({ requests });
    };
    const deps = {
        env: { REFUND_ADMIN_TOKEN: TOKEN },
        fetch: fetcher,
        now: () => NOW,
        out: (text) => calls.out.push(text),
        view: async (_contract, method) => {
            assert.equal(method, 'get_ticket');
            return { status };
        },
        readKeyFile: () => operatorKey.toString(),
        hasAccessKey: async (_rpc, _fetch, account, publicKey) => {
            calls.keyCheck = { account, publicKey };
            return accessKey;
        },
        confirm: async () => 'REFUND',
        sendRefund: async (input) => {
            calls.sent.push(input);
            status = afterSend;
            return TX;
        },
    };
    return { calls, deps };
}

test('list shows pending requests with the chain status and the 72-hour answer time', async () => {
    const { calls, deps } = harness({ requests: [row(), row({ request_id: 'c'.repeat(32), created_at_ms: NOW - 80 * 60 * 60 * 1000 })] });
    await run(['list'], deps);
    assert.equal(calls.service[0].url, 'https://pay-v2-testnet.youtick.net/internal/refund-requests?status=pending');
    assert.equal(calls.service[0].auth, `Bearer ${TOKEN}`);
    assert.match(calls.out[0], /chain: watched_in_escrow/);
    assert.match(calls.out[0], /answer by 2026-10-/);
    assert.match(calls.out[1], /OVERDUE/);
});

test('approve sends refund_ticket with the signed arguments and records the transaction', async () => {
    const { calls, deps } = harness();
    const request = await run(['approve', 'a'.repeat(32), '--key-file', '/keys/payment_operator.json'], deps);
    assert.deepEqual(calls.keyCheck, { account: 'v2-payments-261007.youtick-dev-v3.testnet', publicKey: operatorKey.getPublicKey().toString() });
    assert.equal(calls.sent.length, 1);
    assert.deepEqual(calls.sent[0].args, {
        ticket_id: 'b'.repeat(64), refund_to: 'fan.testnet', expires_at_ms: String(row().expires_at_ms), signature: row().signature,
    });
    assert.equal(calls.sent[0].market, 'v2-market-261007.youtick-dev-v3.testnet');
    const decision = calls.service.find((call) => call.url.endsWith('/decision'));
    assert.deepEqual(JSON.parse(decision.body), { decision: 'refunded', tx_hash: TX });
    assert.equal(request.status, 'refunded');
    // The private key never reaches the output.
    assert.ok(!calls.out.join('\n').includes(operatorKey.toString()));
});

test('approve refuses before sending when anything does not hold', async () => {
    const cases = [
        [{ chain: 'released' }, /ticket_not_refundable:released/],
        [{ chain: 'refunded' }, /ticket_not_refundable:refunded/],
        [{ accessKey: false }, /key_not_on_payment_operator/],
        [{ requests: [row({ expires_at_ms: NOW + 30_000 })] }, /request_signature_expired/],
        [{ requests: [] }, /request_not_pending/],
    ];
    for (const [options, error] of cases) {
        const { calls, deps } = harness(options);
        await assert.rejects(run(['approve', 'a'.repeat(32), '--key-file', '/k.json'], deps), error);
        assert.equal(calls.sent.length, 0);
    }
    const { calls, deps } = harness();
    await assert.rejects(run(['approve', 'a'.repeat(32), '--key-file', '/k.json'], { ...deps, confirm: async () => 'no' }), /cancelled/);
    assert.equal(calls.sent.length, 0);
    await assert.rejects(run(['approve', 'a'.repeat(32)], deps), /key_file_required/);
});

test('a refund whose transfer failed on chain is not recorded', async () => {
    const { calls, deps } = harness({ afterSend: 'watched_in_escrow' });
    await assert.rejects(run(['approve', 'a'.repeat(32), '--key-file', '/k.json', '--yes'], deps), new RegExp(`ticket_not_refunded_after_tx:${TX}`));
    assert.equal(calls.sent.length, 1);
    assert.ok(!calls.service.some((call) => call.url.endsWith('/decision')));
});

test('decline needs a note and record needs a transaction hash', async () => {
    const { calls, deps } = harness();
    await assert.rejects(run(['decline', 'a'.repeat(32)], deps), /note_required/);
    await run(['decline', 'a'.repeat(32), '--note', 'The video plays normally.'], deps);
    assert.deepEqual(JSON.parse(calls.service.at(-1).body), { decision: 'declined', note: 'The video plays normally.' });
    await assert.rejects(run(['record', 'a'.repeat(32), '--tx', 'nope'], deps), /tx_hash_invalid/);
    await run(['record', 'a'.repeat(32), '--tx', TX], deps);
    assert.deepEqual(JSON.parse(calls.service.at(-1).body), { decision: 'refunded', tx_hash: TX });
});

test('settings, arguments and key files', () => {
    assert.throws(() => settings({}), /refund_admin_token_missing/);
    assert.throws(() => settings({ REFUND_ADMIN_TOKEN: TOKEN, PAYMENT_SERVICE_URL: 'http://pay.example' }), /payment_service_url_not_https/);
    assert.deepEqual(parseArgs(['approve', 'x', '--key-file', 'k', '--yes']), { command: 'approve', options: { positional: ['x'], key_file: 'k', yes: true } });
    assert.throws(() => parseArgs(['list', '--force']), /unknown_option/);
    const dir = mkdtempSync(join(tmpdir(), 'refunds-test-'));
    writeFileSync(join(dir, 'keygen.json'), JSON.stringify({ name: 'payment_operator', public_key: 'ed25519:x', private_key: operatorKey.toString() }));
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ private_key: 'nope' }));
    assert.equal(readKeyFile(join(dir, 'keygen.json')), operatorKey.toString());
    assert.throws(() => readKeyFile(join(dir, 'bad.json')), /key_file_invalid/);
    assert.throws(() => readKeyFile(join(dir, 'missing.json')), /key_file_unreadable/);
});
