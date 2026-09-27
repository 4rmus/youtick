import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { actions, buildDelegateAction, encodeDelegateAction, createTransaction, encodeTransaction, PublicKey } from 'near-api-js';

const require = createRequire(import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHash = '9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b';
const patchedHash = 'a94580a12cedb347a7ea64e0cde4eb6a3da97b56f4967ce17f1812fd38ddb289';
const patchHash = 'aa5d5b095a6683ce402643599f2a66f2d005220053a918cd3cf56ad8eec81a78';
const LIMIT = 24_576;
const key = PublicKey.fromString('ed25519:11111111111111111111111111111111');
const account = 'a'.repeat(64), usdc = 'b'.repeat(64);
let temporary, original, patched;

function load(source) {
    const sandbox = { exports: {}, Uint8Array, require: name => {
        assert(['@near-js/transactions', 'borsh'].includes(name));
        return require(name);
    } };
    vm.runInNewContext(source, sandbox, { timeout: 1000 });
    return sandbox.exports;
}

before(() => {
    const source = readFileSync(new URL('./upstream/authorize-app.action.cjs', import.meta.url), 'utf8');
    const patch = fileURLToPath(new URL('../../docs/architecture/near-auth-prompt-size.patch', import.meta.url));
    assert.equal(sha(source), sourceHash, 'pinned upstream source changed');
    assert.equal(sha(readFileSync(patch)), patchHash, 'handoff patch changed');
    temporary = mkdtempSync(join(tmpdir(), 'near-auth-provider-test-'));
    const directory = join(temporary, 'packages/auth0/src/actions');
    mkdirSync(directory, { recursive: true });
    const target = join(directory, 'authorize-app.action.js');
    writeFileSync(target, source);
    // Exercise the delivered patch itself, not an independently reimplemented edit.
    execFileSync('git', ['apply', '--check', patch], { cwd: temporary });
    execFileSync('git', ['apply', patch], { cwd: temporary });
    const fixed = readFileSync(target, 'utf8');
    assert.equal(sha(fixed), patchedHash, 'patch must only remove display indentation');
    original = load(source); patched = load(fixed);
});
after(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); });

function upload(title) {
    assert(Buffer.byteLength(title) <= 200);
    const market = 'video-market-v1-260907.youtick-dev-v3.testnet';
    const request = { creator_id: account, job_id: 'lp-00000000-0000-4000-8000-000000000001', title,
        price_usdc: '2000000', expected_source_bytes: '9452298', profile_id: 'paid-media-livepeer-v1',
        profile_config_sha256: 'c'.repeat(64), upload_public_key: key.toString(), upload_key_expires_at_ms: '1790000000000' };
    const quote = { domain: 'youtick.sponsored-upload-quote', version: '1', network: 'testnet', contract_id: market,
        creator_id: account, job_id: request.job_id, request_sha256: sha(JSON.stringify(request)), expected_source_bytes: request.expected_source_bytes,
        upload_fee_usdc: '500000', sponsor_fee_usdc: '100000', total_fee_usdc: '600000', delegate_receiver_id: usdc,
        delegate_method: 'ft_transfer_call', delegate_gas: '100000000000000', delegate_deposit_yocto: '1', issued_at_ms: '1789999000000',
        quote_block_height: '268880300', max_delegate_block_height: '268880500', expires_at_ms: '1789999120000', quote_key_version: 1 };
    // Same canonical field order as the upload quote; only the signature is a synthetic placeholder.
    quote.quote_id = sha(Object.values(quote).map(String).join('\n'));
    const args = { receiver_id: market, amount: '600000', memo: 'YouTick creator upload fee', msg: JSON.stringify({ action: 'create_paid_job', ...request,
        playback_session: { session_public_key: key.toString(), certificate_sha256: 'e'.repeat(64), authorization_duration_ms: '2592000000' },
        sponsor_quote: quote, sponsor_quote_signature: Buffer.alloc(64, 7).toString('base64') }) };
    return actions.functionCall('ft_transfer_call', args, 100_000_000_000_000n, 1n);
}

function encode(kind, action) {
    if (kind === 'transaction') return encodeTransaction(createTransaction(account, key, usdc, 11n, [action], new Uint8Array(32).fill(1)));
    return encodeDelegateAction(buildDelegateAction({ senderId: account, receiverId: usdc, actions: [action],
        nonce: 11n, maxBlockHeight: 268880500n, publicKey: key }));
}

function event(query, audience = 'synthetic-signing') {
    return { secrets: { ONCHAIN_AUDIENCE: 'synthetic-signing', DELEGATE_ACTION_FORM: 'synthetic-form', TRANSACTION_FORM: 'synthetic-form' },
        request: { query }, resource_server: { identifier: audience }, client: { name: 'Synthetic test' } };
}

async function render(handler, kind, bytes, enforceLimit) {
    let options, fatxn;
    const removed = [];
    await handler.onExecutePostLogin(event({ [kind]: Array.from(bytes).join(',') }), {
        access: { deny: () => assert.fail('unexpected denial') },
        accessToken: { removeScope: scope => removed.push(scope), setCustomClaim: (name, value) => {
            assert.equal(name, 'fatxn'); fatxn = Array.from(value);
        } },
        prompt: { render: (_id, value) => {
            options = value;
            if (enforceLimit && Buffer.byteLength(JSON.stringify(value)) > LIMIT) throw Error('prompt_too_large');
        } },
    });
    return { options, fatxn, removed, size: Buffer.byteLength(JSON.stringify(options)) };
}

async function compare(kind, action) {
    const bytes = encode(kind, action);
    assert(bytes.length <= 4096);
    const before = await render(original, kind, bytes, false);
    const after = await render(patched, kind, bytes, true);
    const normalize = value => JSON.parse(JSON.stringify({ ...value.options,
        fields: { ...value.options.fields, actions: JSON.parse(value.options.fields.actions) } }));
    assert.deepEqual(normalize(after), normalize(before));
    assert.deepEqual(after.fatxn, Array.from(bytes));
    assert.deepEqual(after.fatxn, before.fatxn);
    assert.deepEqual(after.removed, ['profile', 'email', 'offline_access']);
    assert.deepEqual(after.removed, before.removed);
    return { bytes, before, after };
}

for (const [name, title] of [
    ['representative', 'Synthetic upload test'],
    ['max-ascii', 'A'.repeat(200)],
    ['max-turkish', 'İğüşöç'.repeat(16) + 'abcd1234'],
    ['max-escaped', '"\\\n'.repeat(66) + 'aa'],
]) {
    for (const kind of ['delegateAction', 'transaction']) test(`${name}: ${kind} preserves the approval and fits`, async t => {
        if (name.startsWith('max-')) assert.equal(Buffer.byteLength(title), 200);
        const result = await compare(kind, upload(title));
        if (name === 'representative' && kind === 'delegateAction') {
            assert(result.before.size > LIMIT);
            await assert.rejects(render(original, kind, result.bytes, true), /prompt_too_large/);
        }
        t.diagnostic(JSON.stringify({ scope: 'LOCAL_TEST_SYNTHETIC_ONLY', titleBytes: Buffer.byteLength(title), encodedBytes: result.bytes.length,
            originalPromptOptionsBytes: result.before.size, compactPromptOptionsBytes: result.after.size, limitBytes: LIMIT }));
    });
}

test('ordinary transfer preserves a deposit above Number.MAX_SAFE_INTEGER', async () => {
    const deposit = 10n ** 24n + 1n;
    const { after } = await compare('transaction', actions.transfer(deposit));
    assert.equal(JSON.parse(after.options.fields.actions)[0].transfer.deposit, deposit.toString());
});

test('user denial and signing-audience boundaries are unchanged', async () => {
    for (const handler of [original, patched]) {
        const denied = [];
        const api = { access: { deny: reason => denied.push(reason) } };
        await handler.onContinuePostLogin({ prompt: { fields: { decision: 'denied' } } }, api);
        await handler.onContinuePostLogin({ prompt: { fields: { decision: 'approved' } } }, api);
        await handler.onExecutePostLogin(event({}), api);
        await handler.onExecutePostLogin(event({ delegateAction: '1,2,3' }, 'wrong-audience'), api);
        assert.deepEqual(denied, ['User rejected the signing request', 'Signing audience requested without transaction payload',
            'Transaction payload only allowed with signing audience']);
    }
});
