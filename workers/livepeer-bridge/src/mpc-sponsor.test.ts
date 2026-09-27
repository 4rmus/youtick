import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyPair, PublicKey, actions, baseEncode, createTransaction, encodeTransaction, decodeSignedTransaction,
    buildDelegateAction, encodeDelegateAction } from 'near-api-js';
import { mpcConfig, executeDevice, executeTicket, submitMpc, mpcStatus, validateMpcCommand, type MpcSponsorEnv } from './mpc-sponsor';
import type { MpcCommand } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { packCompactUpload, unpackCompactUpload } from '../../../protocol/paid-media-livepeer-v1/compact-upload';
import vectors from '../../../protocol/paid-media-livepeer-v1/compact-upload-vectors.json';
import handler, { LivepeerControl, type Env } from './index';
import { NearAuthMpcSponsor } from './mpc-entrypoint';

const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const sha = async (value: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value)));
const hex = (value: Uint8Array) => Array.from(value, n => n.toString(16).padStart(2, '0')).join('');
const user = KeyPair.fromRandom('ed25519'), sponsor = KeyPair.fromRandom('ed25519');
const accountId = hex(user.getPublicKey().data), market = 'market.testnet';
const usdc = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const block = '11111111111111111111111111111111';
const playbackDevice = { session_public_key: user.getPublicKey().toString(), certificate_sha256: 'c'.repeat(64), authorization_duration_ms: '2592000000' };
let env: MpcSponsorEnv, sent: ReturnType<typeof decodeSignedTransaction>[], outcome: unknown, innerOutcome: unknown;
let ticketEntitled = true, wrongDevice = false, protocolVersion = 85;
let uploadJob: unknown = null, uploadDevice: typeof playbackDevice | null = null;
function storageState() {
    const values = new Map<string, unknown>(); let tail = Promise.resolve();
    const storage = {
        get: async (key: string) => structuredClone(values.get(key)),
        put: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); },
        delete: async (key: string) => values.delete(key),
        list: async () => new Map(values),
        transaction: <T>(fn: (storage: DurableObjectTransaction) => Promise<T>) => {
            const next = tail.then(() => fn(storage as unknown as DurableObjectTransaction));
            tail = next.then(() => undefined, () => undefined); return next;
        },
    };
    return { values, state: { storage } as unknown as DurableObjectState };
}
async function command(change: Partial<MpcCommand> = {}): Promise<MpcCommand> {
    const tx = createTransaction(accountId, user.getPublicKey(), usdc, 1n, [actions.functionCall('ft_transfer_call', {
        receiver_id: market, amount: '2000000', memo: 'YouTick Livepeer ticket purchase',
        msg: JSON.stringify({ action: 'buy_ticket', publication_id: 'video-1', playback_session: playbackDevice }),
    }, 100_000_000_000_000n, 1n)], new Uint8Array(32));
    const bytes = encodeTransaction(tx);
    return { network: 'testnet', market, accountId, purpose: 'ticket', resourceId: 'video-1', attemptId: 'a'.repeat(64),
        payloadBase64: b64(bytes), payloadHash: hex(await sha(bytes)), amountUsdc: '2000000',
        approvalToken: 'approved.token.signature', approvalExpiresAtMs: Date.now() + 60_000, ...change };
}
function fetchMock() {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
        const { method, params } = JSON.parse(init.body);
        let result: unknown;
        if (method === 'broadcast_tx_async') {
            sent.push(decodeSignedTransaction(Uint8Array.from(atob(params[0]), c => c.charCodeAt(0))));
            throw new Error('synthetic lost response');
        }
        if (method === 'tx') { result = params.sender_account_id === 'mpc.testnet' ? outcome : innerOutcome; if (!result) return Response.json({ error: 'not found' }); }
        else if (method === 'block') result = { header: { hash: block, timestamp_nanosec: String(BigInt(Date.now()) * 1000000n) } };
        else if (method === 'EXPERIMENTAL_protocol_config') result = { protocol_version: protocolVersion, runtime_config: {
            min_gas_purchase_price: '1000000000', storage_amount_per_byte: '10000000000000000000' } };
        else if (method === 'gas_price') result = { gas_price: '1000000000' };
        else if (params.request_type === 'view_access_key') result = { permission: 'FullAccess', nonce: 0, block_hash: block, block_height: 100 };
        else if (params.request_type === 'view_account') result = { amount: '10000000000000000000000000', locked: '0', storage_usage: 1 };
        else if (params.request_type === 'view_state') result = { block_hash: block, values: [] };
        else if (params.method_name === 'get_publication') result = { block_hash: block, result: [...new TextEncoder().encode(JSON.stringify({ publication_id: 'video-1', availability: 'SALES_SUSPENDED' }))] };
        else if (params.method_name === 'get_governance_state') result = { block_hash: block, result: [...new TextEncoder().encode(JSON.stringify({ bridge_frozen: false, new_purchases_paused: true }))] };
        else if (params.method_name === 'get_media_job') result = { block_hash: block, result: [...new TextEncoder().encode(JSON.stringify(uploadJob))] };
        else if (params.method_name === 'has_entitlement') result = { block_hash: block, result: Array.from(new TextEncoder().encode(JSON.stringify(ticketEntitled))) };
        else if (params.method_name === 'get_playback_device') result = { block_hash: block, result: Array.from(new TextEncoder().encode(JSON.stringify({
            ...(uploadDevice || playbackDevice), certificate_sha256: wrongDevice ? 'd'.repeat(64) : (uploadDevice || playbackDevice).certificate_sha256, authorizing_public_key: uploadDevice ? null : user.getPublicKey().toString(), authorized_at_ms: String(Date.now() - 1000), expires_at_ms: String(Date.now() - 1000 + 2592000000) }))) };
        else result = { result: Array.from(new TextEncoder().encode(JSON.stringify({ paused: false,
            mpc_address: 'v1.signer-prod.testnet', mpc_domain_id: 1 }[params.method_name as 'paused']))) };
        return Response.json({ result });
    }));
}
async function success(input: MpcCommand, outerHash: string) {
    const tx = sent[0].transaction, call = tx.actions[0].functionCall!;
    const signature = user.sign(await sha(Uint8Array.from(atob(input.payloadBase64), c => c.charCodeAt(0)))).signature;
    const receipt = { outcome: { status: { SuccessValue: '' }, tokens_burnt: '10' } };
    return { final_execution_status: 'FINAL', status: { SuccessValue: b64(new TextEncoder().encode(JSON.stringify({ signature: Array.from(signature) }))) },
        transaction: { hash: outerHash, signer_id: 'mpc.testnet', public_key: sponsor.getPublicKey().toString(), nonce: '1', receiver_id: 'fast-auth.testnet',
            actions: [{ FunctionCall: { method_name: 'sign', gas: '300000000000000', deposit: '1', args: b64(call.args) } }] },
        transaction_outcome: receipt, receipts_outcome: [receipt] };
}
beforeEach(() => {
    vi.restoreAllMocks(); uploadJob = null; uploadDevice = null; sent = []; outcome = undefined; innerOutcome = undefined; ticketEntitled = true; wrongDevice = false; protocolVersion = 85;
    env = { NEAR_AUTH_TICKET_ENABLED: 'true', NEAR_AUTH_MPC_ENABLED: 'true', NEAR_NETWORK: 'testnet', VIDEO_ENVIRONMENT: 'public-testnet', MARKET_CONTRACT_ID: market,
        NEAR_AUTH_MPC_ACCOUNT_ID: 'mpc.testnet', NEAR_AUTH_MPC_PRIVATE_KEY: sponsor.toString(), NEAR_AUTH_MPC_KEY_EPOCH: '1',
        NEAR_AUTH_MPC_OPERATION_YOCTO: '350000000000000000000000', NEAR_AUTH_MPC_DAILY_YOCTO: '700000000000000000000000',
        NEAR_AUTH_MPC_ACCOUNT_DAILY_ATTEMPTS: '2', NEAR_AUTH_MPC_MIN_BALANCE_YOCTO: '10000000000000000000000' };
    fetchMock();
});
describe('private MPC sender', () => {
    it('concurrent duplicates broadcast once; timeout/restart preserves hash and never stores token/key', async () => {
        const { state, values } = storageState(), input = await command();
        const results = await Promise.all([submitMpc(state, env, input), submitMpc(state, env, input)]);
        expect(sent).toHaveLength(1);
        const record = await submitMpc({ storage: state.storage } as DurableObjectState, env, input);
        expect(record.outerHash).toBeTruthy(); expect(record.operationId).toBe(results[0].operationId);
        expect(await mpcStatus(state, env, accountId, record.operationId)).toEqual(record);
        expect(sent).toHaveLength(1);
        const stored = JSON.stringify([...values]);
        expect(stored).not.toContain(input.approvalToken); expect(stored).not.toContain(sponsor.toString());
        expect(stored).not.toContain('signedTxBase64');
    });
    it('expired approval can read an exact historical signature with sending disabled', async () => {
        const { state } = storageState(), input = await command(); const record = await submitMpc(state, env, input);
        outcome = await success(input, record.outerHash!);
        vi.spyOn(Date, 'now').mockReturnValue(input.approvalExpiresAtMs + 500000);
        env.NEAR_AUTH_MPC_ENABLED = 'false';
        const result = await mpcStatus(state, env, accountId, record.operationId);
        expect(result?.state).toBe('MPC_VERIFIED'); expect(result?.burntYocto).toBe('20'); expect(sent).toHaveLength(1);
        await expect(submitMpc(state, env, await command({ attemptId: 'b'.repeat(64) }))).rejects.toThrow('mpc_disabled');
    });
    it.each(['network', 'market', 'accountId', 'payloadHash', 'purpose', 'amountUsdc', 'resourceId'] as const)('rejects wrong %s before signing', async field => {
        const input = await command(); Object.assign(input, { [field]: 'wrong' });
        await expect(submitMpc(storageState().state, env, input)).rejects.toThrow(); expect(sent).toHaveLength(0);
    });
    it('rejects expired input and absent limits without spending', async () => {
        await expect(submitMpc(storageState().state, env, await command({ approvalExpiresAtMs: 1 }))).rejects.toThrow('expired');
        delete env.NEAR_AUTH_MPC_DAILY_YOCTO;
        await expect(submitMpc(storageState().state, env, await command())).rejects.toThrow(); expect(sent).toHaveLength(0);
    });
    it('rejects reused operational keys and sanitizes malformed key errors', async () => {
        const input = await command();
        env.NEAR_OPERATOR_PRIVATE_KEY = env.NEAR_AUTH_MPC_PRIVATE_KEY;
        await expect(submitMpc(storageState().state, env, input)).rejects.toThrow('mpc_not_configured');
        delete env.NEAR_OPERATOR_PRIVATE_KEY;
        env.NEAR_AUTH_MPC_PRIVATE_KEY = 'ed25519:invalid-synthetic-secret';
        await expect(submitMpc(storageState().state, env, input)).rejects.toThrow(/^mpc_not_configured$/);
        expect(sent).toHaveLength(0);
    });
    it('rejects wrong receipt and signature, account and key epoch', async () => {
        const { state } = storageState(), input = await command(), record = await submitMpc(state, env, input);
        const valid = await success(input, record.outerHash!);
        outcome = { ...valid, transaction: { ...valid.transaction, receiver_id: 'other.testnet' } };
        await expect(mpcStatus(state, env, accountId, record.operationId)).rejects.toThrow('outer_not_verified');
        outcome = { ...valid, status: { SuccessValue: b64(new TextEncoder().encode(JSON.stringify({ signature: new Array(64).fill(0) }))) } };
        await expect(mpcStatus(state, env, accountId, record.operationId)).rejects.toThrow('invalid_signature');
        await expect(mpcStatus(state, env, 'b'.repeat(64), record.operationId)).rejects.toThrow('account_mismatch');
        env.NEAR_AUTH_MPC_KEY_EPOCH = '2';
        await expect(mpcStatus(state, env, accountId, record.operationId)).rejects.toThrow('epoch_mismatch');
    });
    it('keeps same-user economic lock after MPC; honors global/user limits and minimum balance', async () => {
        const { state, values } = storageState(), input = await command();
        env.NEAR_AUTH_MPC_MIN_BALANCE_YOCTO = '999999999999999999999999999999';
        await expect(submitMpc(state, env, input)).rejects.toThrow('balance_insufficient');
        env.NEAR_AUTH_MPC_MIN_BALANCE_YOCTO = '1';
        const day = new Date().toISOString().slice(0, 10);
        values.set('mpc:daily', { day, reserved: env.NEAR_AUTH_MPC_DAILY_YOCTO });
        await expect(submitMpc(state, env, input)).rejects.toThrow('budget_exceeded');
        values.delete('mpc:daily'); values.set(`mpc:daily:${accountId}`, { day, attempts: 2 });
        await expect(submitMpc(state, env, input)).rejects.toThrow('budget_exceeded');
        values.delete(`mpc:daily:${accountId}`);
        const record = await submitMpc(state, env, input); outcome = await success(input, record.outerHash!);
        await mpcStatus(state, env, accountId, record.operationId);
        await expect(submitMpc(state, env, await command({ attemptId: 'b'.repeat(64) }))).rejects.toThrow('mpc_pending');
    });
    it('a reservation before a crash is never retried', async () => {
        const { state, values } = storageState();
        const originalPut = state.storage.put.bind(state.storage);
        vi.spyOn(state.storage, 'put').mockImplementation(async (...args: unknown[]) => {
            if ((args[1] as { state?: string })?.state === 'SUBMITTED') throw new Error('crash');
            return (originalPut as (...args: unknown[]) => Promise<void>)(...args);
        });
        const input = await command(); await expect(submitMpc(state, env, input)).rejects.toThrow('crash');
        expect(sent).toHaveLength(0); expect(values.get('mpc:active')).toBeTruthy();
        expect((await submitMpc(state, env, input)).state).toBe('RESERVED'); expect(sent).toHaveLength(0);
    });
    it('private entrypoint forwards only to its sponsor DO; public HTTP cannot reach it', async () => {
        const { state } = storageState(); const object = new LivepeerControl(state, env as Env);
        const fetcher = vi.fn((request: Request) => object.fetch(request));
        const configured = { ...env, LIVEPEER_CONTROL: { idFromName: vi.fn(v => v), get: vi.fn(() => ({ fetch: fetcher })) } } as unknown as Env;
        const entry = new NearAuthMpcSponsor({} as ExecutionContext, configured);
        const result = await entry.submit(await command()); expect(result.outerHash).toBeTruthy();
        sent = [];
        for (const path of ['/internal/mpc/submit', '/internal/mpc/status', '/internal/mpc/ticket', '/internal/mpc/device', '/v1/mpc/submit']) {
            const response = await handler.fetch(new Request(`https://bridge.test${path}`, { method: 'POST', body: '{}' }), configured);
            expect(response.status).not.toBe(200);
        }
        expect(sent).toHaveLength(0); expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each(['receiver', 'gas', 'deposit', 'extra-action', 'signer'] as const)('rejects canonical but unauthorized %s', async field => {
        const input = await command();
        const tx = createTransaction(field === 'signer' ? 'other.testnet' : accountId, user.getPublicKey(),
            field === 'receiver' ? market : usdc, 1n, [actions.functionCall('ft_transfer_call', {
                receiver_id: market, amount: '2000000', memo: 'YouTick Livepeer ticket purchase',
                msg: JSON.stringify({ action: 'buy_ticket', publication_id: 'video-1', playback_session: playbackDevice }),
            }, field === 'gas' ? 1n : 100000000000000n, field === 'deposit' ? 2n : 1n)], new Uint8Array(32));
        if (field === 'extra-action') tx.actions.push(actions.transfer(1n));
        const bytes = encodeTransaction(tx);
        await expect(submitMpc(storageState().state, env, { ...input, payloadBase64: b64(bytes), payloadHash: hex(await sha(bytes)) })).rejects.toThrow();
        expect(sent).toHaveLength(0);
    });
    it('restores a user operation without browser review/id and binds duplicate payload', async () => {
        const { state } = storageState(), input = await command(); const record = await submitMpc(state, env, input);
        expect((await mpcStatus(state, env, accountId))?.outerHash).toBe(record.outerHash);
        const other = await command();
        // A different valid inner ticket nonce still cannot overwrite the existing operation.
        const originalBytes = Uint8Array.from(atob(other.payloadBase64), c => c.charCodeAt(0));
        const decoded = (await import('near-api-js')).decodeTransaction(originalBytes);
        decoded.nonce = 2n; const changed = encodeTransaction(decoded);
        await expect(submitMpc(state, env, { ...other, payloadBase64: b64(changed), payloadHash: hex(await sha(changed)) })).rejects.toThrow('mpc_conflict');
        expect(sent).toHaveLength(1);
    });
    it('validates compact upload bytes and rejects a wrong delegate domain prefix', async () => {
        const fixture = vectors[0];
        const msg = await packCompactUpload(fixture.normal_message, key => PublicKey.fromString(key).data, {
            network: 'testnet', market, creator: fixture.request.creator_id, usdc, keyString: value => `ed25519:${baseEncode(value)}` });
        const input = await command({ purpose: 'upload', accountId: fixture.request.creator_id, resourceId: fixture.request.job_id,
            amountUsdc: fixture.quote.total_fee_usdc });
        const delegate = buildDelegateAction({ senderId: input.accountId, receiverId: usdc, publicKey: PublicKey.fromString(fixture.account_public_key),
            nonce: 1n, maxBlockHeight: 200n, actions: [actions.functionCall('ft_transfer_call', {
                receiver_id: market, amount: input.amountUsdc, msg,
            }, 100000000000000n, 1n)] });
        const validBytes = encodeDelegateAction(delegate);
        await expect(validateMpcCommand({ ...input, payloadBase64: b64(validBytes), payloadHash: hex(await sha(validBytes)) }, env)).resolves.toBeTruthy();
        const bytes = encodeDelegateAction(delegate); bytes[0] ^= 1;
        await expect(validateMpcCommand({ ...input, purpose: 'upload', payloadBase64: b64(bytes), payloadHash: hex(await sha(bytes)) }, env)).rejects.toThrow();
    });
});

async function settledOutcome(innerHash: string) {
    const tx = sent[1].transaction, call = tx.actions[0].functionCall!;
    const receipt = { outcome: { status: { SuccessValue: '' }, tokens_burnt: '10', executor_id: market,
        logs: ['EVENT_JSON:' + JSON.stringify({ standard: 'youtick_market', version: '1.0.0', event: 'entitlement_purchased',
            data: [{ account_id: accountId, contract_id: market, publication_id: 'video-1', asset: 'USDC', amount: '2000000' }] })] } };
    return { final_execution_status: 'FINAL', status: { SuccessValue: b64(new TextEncoder().encode(JSON.stringify('2000000'))) },
        transaction: { hash: innerHash, signer_id: accountId, public_key: user.getPublicKey().toString(), nonce: '1', receiver_id: usdc,
            actions: [{ FunctionCall: { method_name: 'ft_transfer_call', gas: '100000000000000', deposit: '1', args: b64(call.args) } }] },
        transaction_outcome: receipt, receipts_outcome: [receipt] };
}
it('inner ticket is sent once across concurrent calls and restart, then unlocks only after final payment, entitlement and device', async () => {
    const { state, values } = storageState(), input = await command(); const outer = await submitMpc(state, env, input);
    outcome = await success(input, outer.outerHash!); await mpcStatus(state, env, accountId, outer.operationId);
    const result = await Promise.all([executeTicket(state, env, accountId, outer.operationId), executeTicket(state, env, accountId, outer.operationId)]);
    expect(sent).toHaveLength(2); expect(sent[1].transaction.signerId).toBe(accountId);
    const pending = result[0]!; expect(pending.state).toBe('TICKET_SUBMITTED'); expect(pending.innerHash).toBeTruthy();
    await executeTicket({ storage: state.storage } as DurableObjectState, env, accountId, outer.operationId); expect(sent).toHaveLength(2);
    innerOutcome = await settledOutcome(pending.innerHash!);
    env.NEAR_AUTH_TICKET_ENABLED = 'false'; env.NEAR_AUTH_MPC_ENABLED = 'false';
    const final = await mpcStatus(state, env, accountId);
    expect(final?.state).toBe('TICKET_SETTLED'); expect(final?.innerBurntYocto).toBe('20'); expect(sent).toHaveLength(2);
    expect((values.get(`mpc:op:${outer.operationId}`) as { state: string }).state).toBe('TICKET_SETTLED');
});
it.each(['refund', 'wrong-account', 'wrong-event', 'wrong-args', 'receipt-failure', 'missing-entitlement'] as const)('does not unlock a ticket after %s', async failure => {
    const { state, values } = storageState(), input = await command(); const outer = await submitMpc(state, env, input);
    outcome = await success(input, outer.outerHash!); const pending = await executeTicket(state, env, accountId, outer.operationId);
    const final = await settledOutcome(pending!.innerHash!);
    if (failure === 'refund') final.status.SuccessValue = b64(new TextEncoder().encode(JSON.stringify('0')));
    if (failure === 'wrong-account') final.transaction.signer_id = 'other.testnet';
    if (failure === 'wrong-event') final.receipts_outcome[0].outcome.logs = [];
    if (failure === 'wrong-args') final.transaction.actions[0].FunctionCall.args = 'e30=';
    if (failure === 'receipt-failure') Object.assign(final.receipts_outcome[0].outcome.status, { Failure: {} });
    if (failure === 'missing-entitlement') ticketEntitled = false;
    innerOutcome = final;
    await expect(mpcStatus(state, env, accountId, outer.operationId)).rejects.toThrow('ticket_not_settled');
    expect((values.get(`mpc:op:${outer.operationId}`) as { state: string }).state).toBe('TICKET_SUBMITTED'); expect(sent).toHaveLength(2);
});
it('inner send rejects wrong account, closed flag and expired initial-send window', async () => {
    const { state } = storageState(), input = await command(); const outer = await submitMpc(state, env, input);
    outcome = await success(input, outer.outerHash!);
    await expect(executeTicket(state, env, 'b'.repeat(64), outer.operationId)).rejects.toThrow('account_mismatch');
    env.NEAR_AUTH_TICKET_ENABLED = 'false'; await expect(executeTicket(state, env, accountId, outer.operationId)).rejects.toThrow('ticket_disabled');
    env.NEAR_AUTH_TICKET_ENABLED = 'true'; vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 301000);
    await expect(executeTicket(state, env, accountId, outer.operationId)).rejects.toThrow('ticket_send_expired'); expect(sent).toHaveLength(1);
});

it('a crash after persisting the inner hash cannot cause another broadcast', async () => {
    const { state } = storageState(), input = await command(); const outer = await submitMpc(state, env, input);
    outcome = await success(input, outer.outerHash!); await mpcStatus(state, env, accountId, outer.operationId);
    const put = state.storage.put.bind(state.storage);
    vi.spyOn(state.storage, 'put').mockImplementation(async (...args: unknown[]) => {
        await (put as (...args: unknown[]) => Promise<void>)(...args);
        if ((args[1] as { state?: string })?.state === 'TICKET_SUBMITTED') throw new Error('crash-after-reservation');
    });
    await expect(executeTicket(state, env, accountId, outer.operationId)).rejects.toThrow('crash-after-reservation');
    expect((await executeTicket(state, env, accountId, outer.operationId))?.state).toBe('TICKET_SUBMITTED');
    expect(sent).toHaveLength(1);
});
it('a late outer verifier cannot overwrite an already submitted inner transaction', async () => {
    const { state } = storageState(), input = await command(); const outer = await submitMpc(state, env, input);
    outcome = await success(input, outer.outerHash!);
    const originalFetch = fetch; let release: (() => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (...args: Parameters<typeof fetch>) => {
        const body = JSON.parse(args[1]!.body as string);
        if (body.method === 'tx') return new Promise<Response>(resolve => { release = () => resolve(Response.json({ result: outcome })); });
        return originalFetch(...args);
    }));
    const slow = mpcStatus(state, env, accountId, outer.operationId);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    vi.stubGlobal('fetch', originalFetch);
    const inner = await executeTicket(state, env, accountId, outer.operationId);
    release!(); expect((await slow)?.state).toBe('TICKET_SUBMITTED');
    expect((await mpcStatus(state, env, accountId, outer.operationId))?.innerHash).toBe(inner?.innerHash);
    expect(sent).toHaveLength(2);
});

it('accepts a dedicated implicit sponsor only when its address matches the signer key; Market stays named testnet', async () => {
    env.NEAR_AUTH_MPC_ACCOUNT_ID = hex(sponsor.getPublicKey().data);
    expect((await mpcConfig(env, true)).accountId).toBe(env.NEAR_AUTH_MPC_ACCOUNT_ID);
    env.NEAR_AUTH_MPC_ACCOUNT_ID = 'a'.repeat(64);
    await expect(mpcConfig(env, true)).rejects.toThrow('mpc_not_configured');
    env.NEAR_AUTH_MPC_ACCOUNT_ID = hex(sponsor.getPublicKey().data);
    env.MARKET_CONTRACT_ID = 'b'.repeat(64);
    await expect(mpcConfig(env, true)).rejects.toThrow('mpc_not_configured');
});

it('allows PV87 ticket submission without widening unknown protocol support', async () => {
    protocolVersion = 87;
    expect((await submitMpc(storageState().state, env, await command())).state).toBe('SUBMITTED');
    expect(sent).toHaveLength(1);
    protocolVersion = 88;
    await expect(submitMpc(storageState().state, env, await command())).rejects.toThrow('mpc_provider_changed');
    expect(sent).toHaveLength(1);
});

async function uploadCommand() {
    // Reconstruct the same compact payload for the synthetic signer; hashes are derived by the real decoder.
    const context = { network: 'testnet', market, creator: accountId, usdc, keyString: (bytes: Uint8Array) => `ed25519:${baseEncode(bytes)}` };
    const msg = await unpackCompactUpload(vectors[0].compact_message, context);
    uploadDevice = msg.playback_session as typeof playbackDevice;
    const compact = await packCompactUpload(msg, key => PublicKey.fromString(key).data, context);
    const quote = msg.sponsor_quote as Record<string, string>;
    const delegate = buildDelegateAction({ senderId: accountId, receiverId: usdc, publicKey: user.getPublicKey(), nonce: 1n,
        maxBlockHeight: 300n, actions: [actions.functionCall('ft_transfer_call', { receiver_id: market,
            amount: quote.total_fee_usdc, msg: compact }, 100000000000000n, 1n)] });
    const bytes = encodeDelegateAction(delegate);
    return { msg, delegate, input: await command({ purpose: 'upload', resourceId: msg.job_id as string,
        amountUsdc: quote.total_fee_usdc, payloadBase64: b64(bytes), payloadHash: hex(await sha(bytes)) }) };
}
function paidUpload(msg: Record<string, unknown>) {
    const quote = msg.sponsor_quote as Record<string, string>;
    return { ...msg, generation: 1, status: 'Authorized', fee_asset: 'USDC', fee_amount: quote.total_fee_usdc,
        fee_usd_micro: quote.total_fee_usdc, fee_quote_hash: quote.quote_id };
}
it('PV87 upload has its own closed flag and retains the economic lock after MPC; status never relays', async () => {
    protocolVersion = 87;
    const { state, values } = storageState(), { input, msg } = await uploadCommand();
    await expect(submitMpc(state, env, input)).rejects.toThrow('upload_disabled'); expect(sent).toHaveLength(0);
    env.NEAR_AUTH_UPLOAD_ENABLED = 'true';
    const [first, duplicate] = await Promise.all([submitMpc(state, env, input), submitMpc(state, env, input)]);
    expect(first.operationId).toBe(duplicate.operationId); expect(sent).toHaveLength(1);
    // Either request can win the reservation; the other may return before the hash is stored.
    outcome = await success(input, (first.outerHash ?? duplicate.outerHash)!);
    expect((await mpcStatus(state, env, accountId))?.state).toBe('MPC_VERIFIED');
    await expect(submitMpc(state, env, await command())).rejects.toThrow('mpc_pending');
    env.NEAR_AUTH_UPLOAD_ENABLED = 'false'; env.NEAR_AUTH_MPC_ENABLED = 'false';
    vi.spyOn(Date, 'now').mockReturnValue(input.approvalExpiresAtMs + 600000);
    const restored = await mpcStatus({ storage: state.storage } as DurableObjectState, env, accountId);
    expect(restored?.upload?.request.job_id).toBe(input.resourceId);
    expect(restored?.upload?.signedDelegateBase64).toBeTruthy(); expect(sent).toHaveLength(1);
    uploadJob = paidUpload(msg);
    expect(await mpcStatus(state, env, accountId)).toMatchObject({ operationId: first.operationId, state: 'UPLOAD_SETTLED', settledBlockHash: block });
    expect(sent).toHaveLength(1); expect(JSON.stringify([...values])).not.toContain(input.approvalToken);
    env.NEAR_AUTH_MPC_ENABLED = 'true';
    await submitMpc(state, env, await command()); expect(sent).toHaveLength(2);
});
it.each(['creator_id', 'job_id', 'title', 'price_usdc', 'expected_source_bytes', 'profile_config_sha256', 'profile_id',
    'fee_asset', 'fee_amount', 'fee_usd_micro', 'fee_quote_hash', 'generation'])('upload completion refuses mismatched %s and keeps the lock', async field => {
    env.NEAR_AUTH_UPLOAD_ENABLED = 'true'; const { state } = storageState(), { input, msg } = await uploadCommand();
    const record = await submitMpc(state, env, input); outcome = await success(input, record.outerHash!);
    await mpcStatus(state, env, accountId);
    uploadJob = { ...paidUpload(msg), [field]: 'wrong' };
    await expect(mpcStatus(state, env, accountId)).rejects.toThrow('upload_not_settled');
    await expect(submitMpc(state, env, await command())).rejects.toThrow('mpc_pending'); expect(sent).toHaveLength(1);
});
it('published upload settles without temporary relay history or a new approval', async () => {
    env.NEAR_AUTH_UPLOAD_ENABLED = 'true'; const { state } = storageState(), { input, msg } = await uploadCommand();
    const record = await submitMpc(state, env, input); outcome = await success(input, record.outerHash!);
    await mpcStatus(state, env, accountId); uploadJob = { ...paidUpload(msg), status: 'Published' };
    expect((await mpcStatus(state, env, accountId))?.state).toBe('UPLOAD_SETTLED');
    expect((await mpcStatus(state, env, accountId))?.state).toBe('UPLOAD_SETTLED'); expect(sent).toHaveLength(1);
});
it.each([86, 88])('upload refuses unreviewed protocol %s before spending', async version => {
    protocolVersion = version; env.NEAR_AUTH_UPLOAD_ENABLED = 'true';
    await expect(submitMpc(storageState().state, env, (await uploadCommand()).input)).rejects.toThrow('mpc_provider_changed'); expect(sent).toHaveLength(0);
});
it('legacy upload refuses gas keys and changed gas/deposit/action before spending', async () => {
    env.NEAR_AUTH_UPLOAD_ENABLED = 'true'; const { input, delegate } = await uploadCommand();
    for (const field of ['gas', 'deposit', 'methodName'] as const) {
        const saved = delegate.actions[0].functionCall![field];
        Object.assign(delegate.actions[0].functionCall!, { [field]: field === 'methodName' ? 'transfer' : 2n });
        const bytes = encodeDelegateAction(delegate);
        await expect(submitMpc(storageState().state, env, { ...input, payloadBase64: b64(bytes), payloadHash: hex(await sha(bytes)) })).rejects.toThrow();
        Object.assign(delegate.actions[0].functionCall!, { [field]: saved });
    }
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        const body = JSON.parse(init!.body as string);
        if (body.params.request_type === 'view_access_key') return Response.json({ result: { permission: { GasKey: {} }, nonce: 0, block_hash: block, block_height: 100 } });
        return original(url, init);
    });
    await expect(submitMpc(storageState().state, env, input)).rejects.toThrow('mpc_account_changed'); expect(sent).toHaveLength(0);
});


async function deviceCommand(change = '') {
    const tx = createTransaction(accountId, user.getPublicKey(), change === 'receiver' ? usdc : market, 1n,
        [actions.functionCall(change === 'method' ? 'ft_transfer_call' : 'activate_playback_device', {
            publication_id: 'video-1', playback_session: { ...playbackDevice, ...(change === 'duration' ? { authorization_duration_ms: '1' } : {}) },
        }, change === 'gas' ? 1n : 100000000000000n, change === 'deposit' ? 0n : 1n)], new Uint8Array(32));
    if (change === 'extra-action') tx.actions.push(actions.transfer(1n));
    const bytes = encodeTransaction(tx);
    return command({ purpose: change === 'ticket-purpose' ? 'ticket' : 'device', amountUsdc: change === 'amount' ? '1' : '0',
        payloadBase64: b64(bytes), payloadHash: hex(await sha(bytes)) });
}
function deviceOutcome(innerHash: string) {
    const tx = sent[1].transaction, call = tx.actions[0].functionCall!;
    const receipt = { block_hash: block, outcome: { executor_id: market, status: { SuccessValue: '' }, tokens_burnt: '10' } };
    return { final_execution_status: 'FINAL', status: { SuccessValue: '' },
        transaction: { hash: innerHash, signer_id: accountId, public_key: user.getPublicKey().toString(), nonce: '1', receiver_id: market,
            actions: [{ FunctionCall: { method_name: 'activate_playback_device', gas: call.gas.toString(), deposit: '1', args: b64(call.args) } }] },
        transaction_outcome: receipt, receipts_outcome: [receipt] };
}
it.each(['receiver', 'method', 'duration', 'gas', 'deposit', 'extra-action', 'ticket-purpose', 'amount'])('device boundary rejects %s without RPC/send', async change => {
    env.NEAR_AUTH_DEVICE_ENABLED = 'true';
    await expect(submitMpc(storageState().state, env, await deviceCommand(change))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled(); expect(sent).toHaveLength(0);
});
it('device has a separate closed flag and preserves a pending ticket even when recovery is requested', async () => {
    const { state, values } = storageState();
    await expect(submitMpc(state, env, await deviceCommand())).rejects.toThrow('disabled');
    env.NEAR_AUTH_DEVICE_ENABLED = 'true';
    const input = await command(), outer = await submitMpc(state, env, input); outcome = await success(input, outer.outerHash!);
    await executeTicket(state, env, accountId, outer.operationId);
    const snapshot = JSON.stringify([...values]);
    await expect(submitMpc(state, env, await deviceCommand())).rejects.toThrow('mpc_pending');
    expect(JSON.stringify([...values])).toBe(snapshot); expect(sent).toHaveLength(2);
});
it('device sends once across duplicate clicks/restart, status never sends, and settles exact final proof with flags closed', async () => {
    env.NEAR_AUTH_DEVICE_ENABLED = 'true'; protocolVersion = 87;
    const { state } = storageState(), input = await deviceCommand();
    const [outer, duplicate] = await Promise.all([submitMpc(state, env, input), submitMpc(state, env, input)]);
    expect(duplicate.operationId).toBe(outer.operationId); expect(sent).toHaveLength(1);
    outcome = await success(input, (outer.outerHash ?? duplicate.outerHash)!);
    expect((await mpcStatus(state, env, accountId))?.state).toBe('MPC_VERIFIED'); expect(sent).toHaveLength(1);
    const [pending] = await Promise.all([executeDevice(state, env, accountId, outer.operationId), executeDevice(state, env, accountId, outer.operationId)]);
    expect(pending?.state).toBe('DEVICE_SUBMITTED'); expect(sent).toHaveLength(2);
    innerOutcome = deviceOutcome(pending!.innerHash!);
    env.NEAR_AUTH_DEVICE_ENABLED = 'false'; env.NEAR_AUTH_MPC_ENABLED = 'false';
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 40 * 86400000);
    const final = await mpcStatus({ storage: state.storage } as DurableObjectState, env, accountId);
    expect(final).toMatchObject({ state: 'DEVICE_SETTLED', innerBurntYocto: '20', amountUsdc: '0', settledBlockHash: block });
    expect(sent).toHaveLength(2);
});
it.each(['wrong-device', 'wrong-account', 'receipt-failure', 'missing-right', 'wrong-method', 'wrong-block'])('device rejects %s final proof and retains the operation lock', async failure => {
    env.NEAR_AUTH_DEVICE_ENABLED = 'true'; const { state, values } = storageState(), input = await deviceCommand();
    const outer = await submitMpc(state, env, input); outcome = await success(input, outer.outerHash!);
    const pending = await executeDevice(state, env, accountId, outer.operationId), final = deviceOutcome(pending!.innerHash!);
    if (failure === 'wrong-device') wrongDevice = true;
    if (failure === 'wrong-account') final.transaction.signer_id = 'b'.repeat(64);
    if (failure === 'receipt-failure') Object.assign(final.receipts_outcome[0].outcome.status, { Failure: {} });
    if (failure === 'missing-right') ticketEntitled = false;
    if (failure === 'wrong-method') final.transaction.actions[0].FunctionCall.method_name = 'ft_transfer_call';
    if (failure === 'wrong-block') final.receipts_outcome[0].block_hash = baseEncode(new Uint8Array(32).fill(9));
    innerOutcome = final;
    await expect(mpcStatus(state, env, accountId)).rejects.toThrow('device_not_settled');
    expect((values.get(`mpc:op:${outer.operationId}`) as { state: string }).state).toBe('DEVICE_SUBMITTED'); expect(sent).toHaveLength(2);
});
it('device checks rights again before inner send and never retries after a persisted send reservation', async () => {
    env.NEAR_AUTH_DEVICE_ENABLED = 'true'; const { state } = storageState(), input = await deviceCommand();
    const outer = await submitMpc(state, env, input); outcome = await success(input, outer.outerHash!);
    ticketEntitled = false;
    await expect(executeDevice(state, env, accountId, outer.operationId)).rejects.toThrow('playback_denied'); expect(sent).toHaveLength(1);
    ticketEntitled = true;
    const put = state.storage.put.bind(state.storage);
    vi.spyOn(state.storage, 'put').mockImplementation(async (...args: unknown[]) => {
        await (put as (...args: unknown[]) => Promise<void>)(...args);
        if ((args[1] as { state?: string })?.state === 'DEVICE_SUBMITTED') throw new Error('crash-after-reservation');
    });
    await expect(executeDevice(state, env, accountId, outer.operationId)).rejects.toThrow('crash-after-reservation');
    expect((await executeDevice(state, env, accountId, outer.operationId))?.state).toBe('DEVICE_SUBMITTED'); expect(sent).toHaveLength(1);
});
it('a paid ticket with a lost device settles read-only and releases its economic lock without activating a device', async () => {
    const { state, values } = await pendingPaidOperation('ticket'), sends = sent.length;
    const original = fetch;
    vi.stubGlobal('fetch', vi.fn(async (...args: Parameters<typeof fetch>) => {
        const body = JSON.parse(args[1]!.body as string);
        if (body.params.method_name === 'get_playback_device') return Response.json({ result: { block_hash: block, result: [...new TextEncoder().encode('null')] } });
        return original(...args);
    }));
    const settled = await mpcStatus(state, env, accountId);
    expect(settled?.state).toBe('TICKET_SETTLED');
    expect((values.get(`mpc:op:${settled!.operationId}`) as { state: string }).state).toBe('TICKET_SETTLED');
    expect(values.get('mpc:active')).toBeUndefined(); expect(sent.length).toBe(sends);
});
it('private device entrypoint reaches only the existing sponsor object', async () => {
    env.NEAR_AUTH_DEVICE_ENABLED = 'true'; const { state } = storageState(), object = new LivepeerControl(state, env as Env);
    const fetcher = vi.fn((request: Request) => object.fetch(request));
    const configured = { ...env, LIVEPEER_CONTROL: { idFromName: vi.fn(v => v), get: vi.fn(() => ({ fetch: fetcher })) } } as unknown as Env;
    const entry = new NearAuthMpcSponsor({} as ExecutionContext, configured), input = await deviceCommand();
    const outer = await entry.submit(input); outcome = await success(input, outer.outerHash!);
    expect((await entry.status(accountId))?.state).toBe('MPC_VERIFIED'); expect(sent).toHaveLength(1);
    expect((await entry.executeDevice(accountId, outer.operationId))?.state).toBe('DEVICE_SUBMITTED'); expect(sent).toHaveLength(2);
});

// Payment settlement must survive changes to access credentials after the charge.
async function pendingPaidOperation(purpose: 'ticket' | 'upload') {
    const { state, values } = storageState();
    env.NEAR_AUTH_UPLOAD_ENABLED = 'true';
    const upload = purpose === 'upload' ? await uploadCommand() : null;
    const input = upload?.input ?? await command(), record = await submitMpc(state, env, input);
    outcome = await success(input, record.outerHash!);
    if (purpose === 'ticket') {
        const pending = await executeTicket(state, env, accountId, record.operationId);
        innerOutcome = await settledOutcome(pending!.innerHash!);
    } else { await mpcStatus(state, env, accountId); uploadJob = paidUpload(upload!.msg); }
    env.NEAR_AUTH_MPC_ENABLED = 'false'; env.NEAR_AUTH_TICKET_ENABLED = 'false'; env.NEAR_AUTH_UPLOAD_ENABLED = 'false';
    return { state, values, record };
}
for (const purpose of ['ticket', 'upload'] as const) {
    it.each(['expired', 'evicted', 'certificate-replaced', 'reauthorized'])('settles late ' + purpose + ' payment with an %s device without sending', async change => {
        const { state, values, record } = await pendingPaidOperation(purpose), sends = sent.length;
        const original = vi.mocked(fetch).getMockImplementation()!;
        vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
            const response = await original(url, init), request = JSON.parse(init!.body as string);
            if (request.params.method_name !== 'get_playback_device') return response;
            const body = await response.json() as { result: { result: number[] } };
            let device = JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result)));
            if (change === 'evicted') device = null;
            if (change === 'expired') { device.authorized_at_ms = String(Date.now() - 2592000001); device.expires_at_ms = String(Date.now() - 1); }
            if (change === 'certificate-replaced') device.certificate_sha256 = 'e'.repeat(64);
            if (change === 'reauthorized') device.authorizing_public_key = purpose === 'upload' ? user.getPublicKey().toString() : null;
            body.result.result = [...new TextEncoder().encode(JSON.stringify(device))]; return Response.json(body);
        });
        const expected = purpose === 'ticket' ? 'TICKET_SETTLED' : 'UPLOAD_SETTLED';
        expect(await mpcStatus({ storage: state.storage } as DurableObjectState, env, accountId)).toMatchObject({ state: expected, operationId: record.operationId });
        expect(values.get(`mpc:user:${accountId}`)).toBe(record.operationId); expect(sent.length).toBe(sends);
        const queries = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string));
        expect(queries.some(q => q.params.method_name === 'get_playback_device' || q.params.request_type === 'view_access_key')).toBe(false);
        vi.mocked(fetch).mockRejectedValue(new Error('unexpected terminal RPC'));
        expect((await mpcStatus(state, env, accountId))?.state).toBe(expected); expect(sent.length).toBe(sends);
    });
}
it('settles late ticket after its signing key is removed, using final entitlement instead of a current access key', async () => {
    const { state } = await pendingPaidOperation('ticket'), sends = sent.length, original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
        const body = JSON.parse(init!.body as string);
        if (body.params.request_type === 'view_access_key') return Response.json({ error: { cause: { name: 'UNKNOWN_ACCESS_KEY' } } });
        return original(url, init);
    });
    expect((await mpcStatus(state, env, accountId))?.state).toBe('TICKET_SETTLED'); expect(sent.length).toBe(sends);
    const requests = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(requests.find(q => q.params.method_name === 'has_entitlement')?.params).toMatchObject({ finality: 'final', account_id: market });
});
it.each(['upload_public_key', 'upload_key_expires_at_ms'])('settles late upload after an authorized %s replacement', async field => {
    const { state } = await pendingPaidOperation('upload'), sends = sent.length;
    uploadJob = { ...uploadJob as object, [field]: field === 'upload_public_key' ? sponsor.getPublicKey().toString() : String(Date.now() + 60000) };
    expect((await mpcStatus(state, env, accountId))?.state).toBe('UPLOAD_SETTLED'); expect(sent.length).toBe(sends);
});
it.each(['unavailable', 'bad-block', 'bad-bytes', 'string-true'])('keeps late ticket pending on %s final entitlement proof', async failure => {
    const { state, values } = await pendingPaidOperation('ticket'), sends = sent.length, before = JSON.stringify([...values]);
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        const body = JSON.parse(init!.body as string);
        if (body.params.method_name !== 'has_entitlement') return original(url, init);
        if (failure === 'unavailable') return Response.json({ error: 'unavailable' });
        return Response.json({ result: { block_hash: failure === 'bad-block' ? 'invalid!' : block,
            result: failure === 'bad-bytes' ? [300] : [...new TextEncoder().encode(failure === 'string-true' ? '"true"' : 'true')] } });
    });
    await expect(mpcStatus(state, env, accountId)).rejects.toThrow();
    expect(JSON.stringify([...values])).toBe(before); expect(sent.length).toBe(sends);
});
it('does not settle an uncreated upload after expiry or alter the original relay request', async () => {
    const { state, values } = await pendingPaidOperation('upload'), sends = sent.length, before = JSON.stringify([...values]);
    const expected = uploadJob as { upload_public_key: string; upload_key_expires_at_ms: string };
    uploadJob = null;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 86400000);
    const status = await mpcStatus(state, env, accountId);
    expect(status?.state).toBe('MPC_VERIFIED');
    expect(status?.upload?.request).toMatchObject({ upload_public_key: expected.upload_public_key, upload_key_expires_at_ms: expected.upload_key_expires_at_ms });
    expect(status?.upload?.playbackSession).toEqual(uploadDevice);
    expect(JSON.stringify([...values])).toBe(before); expect(sent.length).toBe(sends);
});

const primaryRpc = 'https://test.rpc.fastnear.com/', archiveRpc = 'https://archival-rpc.testnet.near.org/';
async function archivalFixture(kind: 'outer' | 'ticket' | 'device') {
    if (kind === 'ticket') {
        const fixture = await pendingPaidOperation('ticket');
        return { ...fixture, expected: 'TICKET_SETTLED' };
    }
    const { state, values } = storageState(); env.NEAR_AUTH_DEVICE_ENABLED = 'true';
    const input = kind === 'device' ? await deviceCommand() : await command();
    const record = await submitMpc(state, env, input); outcome = await success(input, record.outerHash!);
    if (kind === 'device') {
        const pending = await executeDevice(state, env, accountId, record.operationId);
        innerOutcome = deviceOutcome(pending!.innerHash!);
    }
    env.NEAR_AUTH_MPC_ENABLED = 'false'; env.NEAR_AUTH_DEVICE_ENABLED = 'false';
    return { state, values, record, expected: kind === 'device' ? 'DEVICE_SETTLED' : 'MPC_VERIFIED' };
}
it.each(['outer', 'ticket', 'device'] as const)('archival %s: successful primary never uses another endpoint', async kind => {
    const { state, expected } = await archivalFixture(kind), sends = sent.length;
    vi.mocked(fetch).mockClear();
    expect((await mpcStatus(state, env, accountId))?.state).toBe(expected);
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === primaryRpc)).toBe(true); expect(sent.length).toBe(sends);
});
it.each(['outer', 'ticket', 'device'] as const)('archival %s: timeout retries exactly the same read, never a send', async kind => {
    const { state, expected } = await archivalFixture(kind), sends = sent.length, original = vi.mocked(fetch).getMockImplementation()!;
    const reads: Array<{ url: unknown; body: string }> = [];
    vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
        const body = JSON.parse(init!.body as string);
        if (body.method === 'tx') {
            reads.push({ url, body: init!.body as string });
            if (url === primaryRpc) throw new DOMException('synthetic timeout', 'TimeoutError');
        }
        return original(url, init);
    });
    expect((await mpcStatus(state, env, accountId))?.state).toBe(expected);
    expect(reads.map(r => r.url)).toEqual([primaryRpc, archiveRpc]); expect(reads[1].body).toBe(reads[0].body);
    const request = JSON.parse(reads[1].body); expect(request.method).toBe('tx'); expect(request.params.wait_until).toBe('FINAL');
    expect(Object.keys(request.params).sort()).toEqual(['sender_account_id', 'tx_hash', 'wait_until']); expect(sent.length).toBe(sends);
});
it.each(['network', 'stream', 'http429', 'http503', 'UNKNOWN_TRANSACTION', 'TIMEOUT_ERROR', 'INTERNAL_ERROR'])('archival ticket: one fallback for %s availability failure', async failure => {
    const { state } = await archivalFixture('ticket'), sends = sent.length, original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
        const body = JSON.parse(init!.body as string);
        if (body.method === 'tx' && url === primaryRpc) {
            if (failure === 'network') throw new TypeError('network unavailable');
            if (failure === 'stream') return new Response(new ReadableStream({ start(c) { c.error(new TypeError('stream interrupted')); } }));
            if (failure.startsWith('http')) return new Response('', { status: Number(failure.slice(4)) });
            return Response.json({ error: { name: 'HANDLER_ERROR', cause: { name: failure } } });
        }
        return original(url, init);
    });
    expect((await mpcStatus(state, env, accountId))?.state).toBe('TICKET_SETTLED');
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === archiveRpc)).toHaveLength(1); expect(sent.length).toBe(sends);
});
it.each(['outer', 'ticket', 'device'] as const)('archival %s: both providers unavailable preserves the exact pending record', async kind => {
    const { state, values } = await archivalFixture(kind), sends = sent.length, before = JSON.stringify([...values]);
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
        if (JSON.parse(init!.body as string).method === 'tx') throw new TypeError('offline');
        return original(url, init);
    });
    expect((await mpcStatus(state, env, accountId))?.state).toBe(kind === 'outer' ? 'SUBMITTED' : kind === 'ticket' ? 'TICKET_SUBMITTED' : 'DEVICE_SUBMITTED');
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([primaryRpc, archiveRpc]);
    expect(JSON.stringify([...values])).toBe(before); expect(sent.length).toBe(sends);
});
for (const provider of ['primary', 'archive'] as const) {
    it.each(['wrong-hash', 'wrong-sender', 'receipt-failure', 'execution-failure'])('archival ' + provider + ': rejects %s proof without further retries', async invalid => {
        const { state, values } = await archivalFixture('ticket'), sends = sent.length, before = JSON.stringify([...values]);
        const final = structuredClone(innerOutcome) as Awaited<ReturnType<typeof settledOutcome>>;
        if (invalid === 'wrong-hash') final.transaction.hash = baseEncode(new Uint8Array(32).fill(9));
        if (invalid === 'wrong-sender') final.transaction.signer_id = 'other.testnet';
        if (invalid === 'receipt-failure') Object.assign(final.receipts_outcome[0].outcome.status, { Failure: {} });
        if (invalid === 'execution-failure') Object.assign(final, { status: { Failure: {} } });
        const original = vi.mocked(fetch).getMockImplementation()!;
        vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
            if (JSON.parse(init!.body as string).method !== 'tx') return original(url, init);
            if (provider === 'archive' && url === primaryRpc) throw new TypeError('offline');
            return Response.json({ result: final });
        });
        await expect(mpcStatus(state, env, accountId)).rejects.toThrow('ticket_not_settled');
        expect(vi.mocked(fetch).mock.calls).toHaveLength(provider === 'primary' ? 1 : 2);
        expect(JSON.stringify([...values])).toBe(before); expect(sent.length).toBe(sends);
    });
}
it.each(['bad-json', 'oversize', 'null-result', 'invalid-params'])('archival: malformed %s response is not repaired by another provider', async invalid => {
    const { state, values } = await archivalFixture('ticket'), before = JSON.stringify([...values]);
    vi.mocked(fetch).mockClear().mockImplementation(async () => {
        if (invalid === 'bad-json') return new Response('{');
        if (invalid === 'oversize') return new Response(' '.repeat(262145));
        if (invalid === 'invalid-params') return Response.json({ error: { code: -32602, name: 'REQUEST_VALIDATION_ERROR' } });
        return Response.json({ result: null });
    });
    expect((await mpcStatus(state, env, accountId))?.state).toBe('TICKET_SUBMITTED');
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1); expect(JSON.stringify([...values])).toBe(before);
});
it('archival: a missing primary transaction is not permission to query state or broadcast through the archive', async () => {
    const { state } = storageState(), input = await command(); await submitMpc(state, env, input);
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => JSON.parse(init!.body as string).method === 'broadcast_tx_async').map(([url]) => url)).toEqual([primaryRpc]);
    expect(sent).toHaveLength(1);
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
        if (JSON.parse(init!.body as string).method === 'query') throw new TypeError('offline');
        return original(url, init);
    });
    await expect(submitMpc(storageState().state, env, input)).rejects.toThrow();
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === primaryRpc)).toBe(true); expect(sent).toHaveLength(1);
});
it('archival: each provider has a 15-second deadline and the read stops after two attempts', async () => {
    const { state, values } = await archivalFixture('ticket'), before = JSON.stringify([...values]);
    vi.useFakeTimers();
    const deadlines: number[] = [];
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
        deadlines.push(ms); const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms); return controller.signal;
    });
    try {
        vi.mocked(fetch).mockClear().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
        }));
        const reading = mpcStatus(state, env, accountId);
        await vi.advanceTimersByTimeAsync(15000);
        expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([primaryRpc, archiveRpc]);
        await vi.advanceTimersByTimeAsync(15000);
        expect((await reading)?.state).toBe('TICKET_SUBMITTED'); expect(deadlines).toEqual([15000, 15000]);
        expect(vi.mocked(fetch).mock.calls).toHaveLength(2); expect(JSON.stringify([...values])).toBe(before);
    } finally { timeout.mockRestore(); vi.useRealTimers(); }
});
it('archival: oversized archive body is cancelled without writing a record or making a third request', async () => {
    const { state, values } = await archivalFixture('ticket'), before = JSON.stringify([...values]), cancel = vi.fn();
    vi.mocked(fetch).mockClear().mockImplementation(async url => {
        if (url === primaryRpc) throw new TypeError('offline');
        return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(262145)); }, cancel }));
    });
    expect((await mpcStatus(state, env, accountId))?.state).toBe('TICKET_SUBMITTED');
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    expect(JSON.stringify([...values])).toBe(before);
});
it('archival: a non-final primary response stays pending without asking another provider', async () => {
    const { state, values } = await archivalFixture('ticket'), before = JSON.stringify([...values]);
    vi.mocked(fetch).mockClear().mockResolvedValue(Response.json({ result: { final_execution_status: 'EXECUTED_OPTIMISTIC' } }));
    expect((await mpcStatus(state, env, accountId))?.state).toBe('TICKET_SUBMITTED');
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1); expect(JSON.stringify([...values])).toBe(before);
});

it.each(['success', 'UNKNOWN_BLOCK', 'GARBAGE_COLLECTED_BLOCK', 'TIMEOUT_ERROR', 'http503', 'timeout'])('historical state: %s keeps both views on the exact receipt block', async failure => {
    const { state, values, record } = await archivalFixture('device'), sends = sent.length;
    const original = vi.mocked(fetch).getMockImplementation()!;
    const reads: Array<{ url: unknown; body: string }> = [];
    vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
        const request = JSON.parse(init!.body as string);
        if (request.method === 'query') {
            reads.push({ url, body: init!.body as string });
            expect(init!.redirect).toBe('manual'); expect(init!.signal).toBeTruthy();
            if (url === primaryRpc && failure !== 'success') {
                if (failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
                if (failure === 'http503') return new Response('', { status: 503 });
                return Response.json({ error: { name: 'HANDLER_ERROR', cause: { name: failure } } });
            }
        }
        return original(url, init);
    });
    expect((await mpcStatus(state, env, accountId))?.state).toBe('DEVICE_SETTLED');
    for (const [method_name, args] of [
        ['has_entitlement', { account_id: accountId, publication_id: 'video-1' }],
        ['get_playback_device', { account_id: accountId, session_public_key: playbackDevice.session_public_key }],
    ] as const) {
        const matching = reads.filter(r => JSON.parse(r.body).params.method_name === method_name);
        expect(matching.map(r => r.url)).toEqual(failure === 'success' ? [primaryRpc] : [primaryRpc, archiveRpc]);
        expect(JSON.parse(matching[0].body).params).toEqual({ request_type: 'call_function', block_id: block,
            account_id: market, method_name, args_base64: b64(new TextEncoder().encode(JSON.stringify(args))) });
        if (failure !== 'success') expect(matching[1].body).toBe(matching[0].body);
    }
    expect(reads).toHaveLength(failure === 'success' ? 2 : 4);
    expect(values.get(`mpc:op:${record.operationId}`)).toMatchObject({ settledBlockHash: block });
    expect(sent.length).toBe(sends);
});
for (const provider of ['primary', 'archive'] as const) {
    it.each(['wrong-block', 'no-entitlement', 'no-device', 'wrong-key', 'wrong-certificate', 'wrong-authorizer', 'oversize-view', 'bad-json'])('historical state ' + provider + ': rejects %s without seeking another proof', async invalid => {
        const { state, values } = await archivalFixture('device'), before = JSON.stringify([...values]), sends = sent.length;
        const original = vi.mocked(fetch).getMockImplementation()!;
        const target = invalid === 'no-entitlement' ? 'has_entitlement' : 'get_playback_device';
        const reads: unknown[] = [];
        vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
            const request = JSON.parse(init!.body as string);
            if (request.method !== 'query' || request.params.method_name !== target) return original(url, init);
            reads.push(url);
            if (provider === 'archive' && url === primaryRpc) return Response.json({ error: { cause: { name: 'UNKNOWN_BLOCK' } } });
            if (invalid === 'bad-json') return new Response('{');
            const body = await (await original(url, init)).json() as { result: { block_hash: string; result: number[] } };
            if (invalid === 'wrong-block') body.result.block_hash = baseEncode(new Uint8Array(32).fill(9));
            else if (invalid === 'oversize-view') body.result.result = Array(4097).fill(32);
            else {
                let value = JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result)));
                if (invalid === 'no-entitlement') value = false;
                if (invalid === 'no-device') value = null;
                if (invalid === 'wrong-key') value.session_public_key = sponsor.getPublicKey().toString();
                if (invalid === 'wrong-certificate') value.certificate_sha256 = 'd'.repeat(64);
                if (invalid === 'wrong-authorizer') value.authorizing_public_key = sponsor.getPublicKey().toString();
                body.result.result = Array.from(new TextEncoder().encode(JSON.stringify(value)));
            }
            return Response.json(body);
        });
        await expect(mpcStatus(state, env, accountId)).rejects.toThrow();
        expect(reads).toEqual(provider === 'primary' ? [primaryRpc] : [primaryRpc, archiveRpc]);
        expect(JSON.stringify([...values])).toBe(before); expect(sent.length).toBe(sends);
    });
}
it.each(['UNKNOWN_BLOCK', 'oversize'])('historical state: unavailable %s archive preserves every pending record', async failure => {
    const { state, values } = await archivalFixture('device'), before = JSON.stringify([...values]), sends = sent.length;
    const original = vi.mocked(fetch).getMockImplementation()!, cancel = vi.fn();
    const reads: unknown[] = [];
    vi.mocked(fetch).mockClear().mockImplementation(async (url, init) => {
        const request = JSON.parse(init!.body as string);
        if (request.method !== 'query' || request.params.method_name !== 'get_playback_device') return original(url, init);
        reads.push(url);
        if (url === archiveRpc && failure === 'oversize') return new Response(new ReadableStream({
            start(c) { c.enqueue(new Uint8Array(262145)); }, cancel,
        }));
        return Response.json({ error: { cause: { name: 'UNKNOWN_BLOCK' } } });
    });
    await expect(mpcStatus(state, env, accountId)).rejects.toThrow();
    expect(reads).toEqual([primaryRpc, archiveRpc]);
    if (failure === 'oversize') expect(cancel).toHaveBeenCalledOnce();
    expect(JSON.stringify([...values])).toBe(before); expect(sent.length).toBe(sends);
});
it('historical state: invalid receipt cannot initiate either view', async () => {
    const { state, values } = await archivalFixture('device'), before = JSON.stringify([...values]);
    const result = innerOutcome as ReturnType<typeof deviceOutcome>;
    result.receipts_outcome[0].block_hash = 'invalid';
    vi.mocked(fetch).mockClear();
    await expect(mpcStatus(state, env, accountId)).rejects.toThrow();
    expect(vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string).method)).toEqual(['tx']);
    expect(JSON.stringify([...values])).toBe(before);
});
it('historical state: each view stops after two 15-second deadlines without sending', async () => {
    const { state, values } = await archivalFixture('device'), before = JSON.stringify([...values]), sends = sent.length;
    const original = vi.mocked(fetch).getMockImplementation()!, reads: unknown[] = [];
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
        expect(ms).toBe(15000); const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms); return controller.signal;
    });
    try {
        vi.mocked(fetch).mockClear().mockImplementation((url, init) => {
            if (JSON.parse(init!.body as string).method !== 'query') return original(url, init);
            reads.push(url);
            return new Promise((_resolve, reject) => {
                init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
            });
        });
        const reading = expect(mpcStatus(state, env, accountId)).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(15000);
        expect(reads).toEqual([primaryRpc, primaryRpc, archiveRpc, archiveRpc]);
        await vi.advanceTimersByTimeAsync(15000); await reading;
        expect(reads).toHaveLength(4); expect(JSON.stringify([...values])).toBe(before); expect(sent.length).toBe(sends);
    } finally { timeout.mockRestore(); vi.useRealTimers(); }
});
