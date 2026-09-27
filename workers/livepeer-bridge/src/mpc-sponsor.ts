import { actions, baseDecode, baseEncode, createTransaction, decodeTransaction, encodeTransaction,
    encodeSignedDelegate, encodeDelegateAction, KeyPairSigner, SCHEMA, SignedTransaction, Signature, type DelegateAction } from 'near-api-js';
import { DEVICE_GAS, DEVICE_NEAR_LIMIT, readDeviceRecoveryState } from '../../../protocol/paid-media-livepeer-v1/device-recovery';
import { deserialize } from 'borsh';
import { unpackCompactUpload, COMPACT_UPLOAD_PREFIX } from '../../../protocol/paid-media-livepeer-v1/compact-upload';
import { isMpcSettled, type MpcCommand, type MpcStatus, type MpcUploadResult } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';

export interface MpcSponsorEnv {
    NEAR_AUTH_MPC_ENABLED?: string;
    NEAR_AUTH_TICKET_ENABLED?: string;
    NEAR_AUTH_UPLOAD_ENABLED?: string;
    NEAR_AUTH_DEVICE_ENABLED?: string;
    NEAR_AUTH_MPC_ACCOUNT_ID?: string;
    NEAR_AUTH_MPC_PRIVATE_KEY?: string;
    NEAR_AUTH_MPC_KEY_EPOCH?: string;
    NEAR_AUTH_MPC_OPERATION_YOCTO?: string;
    NEAR_AUTH_MPC_DAILY_YOCTO?: string;
    NEAR_AUTH_MPC_ACCOUNT_DAILY_ATTEMPTS?: string;
    NEAR_AUTH_MPC_MIN_BALANCE_YOCTO?: string;
    NEAR_NETWORK?: string; VIDEO_ENVIRONMENT?: string; MARKET_CONTRACT_ID?: string;
    NEAR_OPERATOR_ACCOUNT_ID?: string; NEAR_SPONSOR_RELAYER_ACCOUNT_ID?: string;
    NEAR_OPERATOR_PRIVATE_KEY?: string; NEAR_SPONSOR_RELAYER_PRIVATE_KEY?: string;
}
const RPC = 'https://test.rpc.fastnear.com/';
const ARCHIVAL_RPC = 'https://archival-rpc.testnet.near.org/';
const FAST_AUTH = 'fast-auth.testnet';
const GUARD = 'jwt#https://login.testnet.fast-auth.com/';
const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const GAS = 300_000_000_000_000n;
const CEILING = 350_000_000_000_000_000_000_000n;
const digest = async (value: Uint8Array | string) => new Uint8Array(await crypto.subtle.digest('SHA-256',
    typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)));
const hexBytes = (value: Uint8Array) => Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const json64 = (value: string) => JSON.parse(new TextDecoder().decode(unb64(value)));
const fail = (code = 'mpc_invalid_request'): never => { throw new Error(code); };
const amount = (value: unknown): bigint => typeof value === 'string' && /^[1-9][0-9]{0,38}$/.test(value) ? BigInt(value) : fail();
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const account = (value: string | undefined) => !!value && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(value);
function exact(value: object, keys: string[]) {
    if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== keys.sort().join(',')) fail();
}
export async function mpcConfig(env: MpcSponsorEnv, sending = false) {
    if (env.NEAR_NETWORK !== 'testnet' || env.VIDEO_ENVIRONMENT !== 'public-testnet'
        || !account(env.MARKET_CONTRACT_ID) || (!account(env.NEAR_AUTH_MPC_ACCOUNT_ID) && !hex(env.NEAR_AUTH_MPC_ACCOUNT_ID))
        || env.NEAR_AUTH_MPC_ACCOUNT_ID === env.NEAR_OPERATOR_ACCOUNT_ID
        || env.NEAR_AUTH_MPC_ACCOUNT_ID === env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID
        || !/^[A-Za-z0-9_-]{1,64}$/.test(env.NEAR_AUTH_MPC_KEY_EPOCH || '')
        || !env.NEAR_AUTH_MPC_PRIVATE_KEY?.startsWith('ed25519:')
        || env.NEAR_AUTH_MPC_PRIVATE_KEY === env.NEAR_OPERATOR_PRIVATE_KEY
        || env.NEAR_AUTH_MPC_PRIVATE_KEY === env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY) fail('mpc_not_configured');
    let signer: KeyPairSigner;
    try { signer = KeyPairSigner.fromSecretKey(env.NEAR_AUTH_MPC_PRIVATE_KEY as `ed25519:${string}`); }
    catch { return fail('mpc_not_configured'); }
    const publicKey = await signer.getPublicKey();
    if (hex(env.NEAR_AUTH_MPC_ACCOUNT_ID) && hexBytes(publicKey.data) !== env.NEAR_AUTH_MPC_ACCOUNT_ID) fail('mpc_not_configured');
    if (sending && env.NEAR_AUTH_MPC_ENABLED !== 'true') fail('mpc_disabled');
    // One existing DO owns the sponsor key's nonce and budget across every user/job.
    return { signer, publicKey, accountId: env.NEAR_AUTH_MPC_ACCOUNT_ID!,
        objectName: `mpc:testnet:${publicKey.toString()}:${env.NEAR_AUTH_MPC_KEY_EPOCH}` };
}
function limits(env: MpcSponsorEnv) {
    const operation = amount(env.NEAR_AUTH_MPC_OPERATION_YOCTO), daily = amount(env.NEAR_AUTH_MPC_DAILY_YOCTO);
    const attempts = amount(env.NEAR_AUTH_MPC_ACCOUNT_DAILY_ATTEMPTS), minimum = amount(env.NEAR_AUTH_MPC_MIN_BALANCE_YOCTO);
    // The fixed lab reserve is required, not a claimed actual fee or a tunable lower safety floor.
    if (operation !== CEILING || daily < operation || attempts > 1000n) fail('mpc_invalid_limits');
    return { operation, daily, attempts, minimum };
}
async function rpc(method: string, params: object) {
    const response = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000), body: JSON.stringify({ jsonrpc: '2.0', id: 'mpc', method, params }) });
    if (!response.ok) fail('mpc_rpc_unavailable');
    const text = await response.text();
    if (text.length > 262144) fail('mpc_rpc_unavailable');
    const body = JSON.parse(text);
    if (body.error || !body.result || body.result.error) fail('mpc_rpc_unavailable');
    return body.result;
}

async function readFinalTransaction(txHash: string, senderAccountId: string) {
    return readHistory('tx', { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: 'FINAL' });
}
// Only transaction and receipt-block reads can fail over. Sending and proof validation stay outside this loop.
async function readHistory(method: 'tx' | 'query', params: object) {
    const request = JSON.stringify({ jsonrpc: '2.0', id: 'mpc', method, params });
    const unavailable = method === 'tx' ? ['UNKNOWN_TRANSACTION'] : ['UNKNOWN_BLOCK', 'GARBAGE_COLLECTED_BLOCK'];
    for (const endpoint of [RPC, ARCHIVAL_RPC]) {
        let text = '';
        try {
            const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: request, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
            if (!response.ok) {
                await response.body?.cancel().catch(() => undefined);
                fail('mpc_rpc_unavailable');
            }
            if (!response.body) fail('mpc_rpc_invalid_response');
            const reader = response.body!.getReader(), decoder = new TextDecoder();
            let size = 0;
            try {
                for (;;) {
                    const part = await reader.read(); if (part.done) break;
                    size += part.value.byteLength;
                    if (size > 262144) fail('mpc_rpc_invalid_response');
                    text += decoder.decode(part.value, { stream: true });
                }
                text += decoder.decode();
            } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
        } catch (error) {
            if (error instanceof Error && error.message === 'mpc_rpc_invalid_response') throw error;
            if (endpoint === RPC) continue;
            return fail('mpc_rpc_unavailable');
        }
        const body = JSON.parse(text);
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail('mpc_rpc_invalid_response');
        if (body.error) {
            if (body.result !== undefined) fail('mpc_rpc_invalid_response');
            const reason = body.error.cause?.name ?? body.error.name;
            if (endpoint === RPC && [...unavailable, 'TIMEOUT_ERROR', 'INTERNAL_ERROR'].includes(reason)) continue;
            return fail('mpc_rpc_unavailable');
        }
        if (!body.result || typeof body.result !== 'object' || Array.isArray(body.result) || body.result.error) fail('mpc_rpc_invalid_response');
        return body.result;
    }
    return fail('mpc_rpc_unavailable');
}
export async function validateMpcCommand(input: MpcCommand, env: MpcSponsorEnv) {
    exact(input, ['network', 'market', 'accountId', 'purpose', 'resourceId', 'attemptId', 'payloadBase64',
        'payloadHash', 'amountUsdc', 'approvalToken', 'approvalExpiresAtMs']);
    if (input.network !== 'testnet' || input.market !== env.MARKET_CONTRACT_ID || !hex(input.accountId)
        || !['ticket', 'upload', 'device'].includes(input.purpose) || !hex(input.attemptId) || !hex(input.payloadHash)
        || typeof input.resourceId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.resourceId)
        || typeof input.payloadBase64 !== 'string' || input.payloadBase64.length > 5500
        || typeof input.approvalToken !== 'string' || input.approvalToken.length > 7168
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.approvalToken)
        || !Number.isSafeInteger(input.approvalExpiresAtMs)) fail();
    const bytes = unb64(input.payloadBase64);
    if (bytes.length > 4096 || b64(bytes) !== input.payloadBase64 || hexBytes(await digest(bytes)) !== input.payloadHash) fail();
    const tx = input.purpose !== 'upload' ? decodeTransaction(bytes) : deserialize(SCHEMA.DelegateAction, bytes.subarray(4)) as unknown as DelegateAction;
    const canonical = input.purpose !== 'upload' ? encodeTransaction(tx as ReturnType<typeof decodeTransaction>) : encodeDelegateAction(tx as DelegateAction);
    const sender = 'signerId' in tx ? tx.signerId : tx.senderId;
    // Decode/re-encode enforces the NEP-461 domain prefix as well as all Borsh bytes.
    const key = tx.publicKey as unknown as { ed25519Key?: { data: Uint8Array } };
    const publicKeyBytes = key.ed25519Key?.data;
    if (!same(canonical, bytes) || sender !== input.accountId || tx.receiverId !== (input.purpose === 'device' ? input.market : USDC)
        || !publicKeyBytes || hexBytes(publicKeyBytes) !== input.accountId || tx.nonce < 1n
        || tx.actions.length !== 1 || Object.keys(tx.actions[0]).join(',') !== 'functionCall') fail();
    const call = tx.actions[0].functionCall!;
    if (call.methodName !== (input.purpose === 'device' ? 'activate_playback_device' : 'ft_transfer_call') || call.gas !== 100_000_000_000_000n || call.deposit !== 1n) fail();
    const args = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(new Uint8Array(call.args)));
    if (input.purpose === 'device') {
        exact(args, ['publication_id', 'playback_session']);
        const device = args.playback_session;
        exact(device, ['session_public_key', 'certificate_sha256', 'authorization_duration_ms']);
        if (input.amountUsdc !== '0' || args.publication_id !== input.resourceId || call.gas !== DEVICE_GAS
            || typeof device.session_public_key !== 'string' || !device.session_public_key.startsWith('ed25519:')
            || baseDecode(device.session_public_key.slice(8)).length !== 32 || !hex(device.certificate_sha256)
            || device.authorization_duration_ms !== '2592000000') fail();
    } else if (args.receiver_id !== input.market || args.amount !== input.amountUsdc || amount(args.amount) < 1n || typeof args.msg !== 'string') fail();
    let uploadMessage: Record<string, unknown> | undefined;
    if (input.purpose === 'ticket') {
        exact(args, ['receiver_id', 'amount', 'memo', 'msg']);
        const msg = JSON.parse(args.msg);
        exact(msg, ['action', 'publication_id', 'playback_session']);
        if (msg.action !== 'buy_ticket' || msg.publication_id !== input.resourceId || args.memo !== 'YouTick Livepeer ticket purchase'
            || amount(args.amount) < 2_000_000n) fail();
    } else if (input.purpose === 'upload') {
        exact(args, ['receiver_id', 'amount', 'msg']);
        if (!args.msg.startsWith(COMPACT_UPLOAD_PREFIX)) fail();
        const msg = await unpackCompactUpload(args.msg, { network: 'testnet', market: input.market, creator: input.accountId,
            usdc: USDC, keyString: value => `ed25519:${baseEncode(value)}` });
        uploadMessage = msg;
        if (msg.action !== 'create_paid_job' || msg.creator_id !== input.accountId || msg.job_id !== input.resourceId
            || (msg.sponsor_quote as { total_fee_usdc?: unknown })?.total_fee_usdc !== input.amountUsdc) fail();
    }
    return { bytes, uploadMessage, publicKeyBytes: new Uint8Array(publicKeyBytes!), nonce: tx.nonce,
        maxBlockHeight: 'maxBlockHeight' in tx ? tx.maxBlockHeight : undefined };
}
type RecordValue = MpcStatus & {
    payloadBase64: string; approvalHash: string; nonce: string; blockHash: string; sponsor: string;
    sponsorPublicKey: string; epoch: string; createdAtMs: number;
};
function publicStatus(record: RecordValue): MpcStatus {
    const { network, market, amountUsdc, payloadBase64, operationId, accountId, purpose, resourceId, state, payloadHash, outerHash, signatureBase64, reservedYocto, burntYocto, innerHash, innerBurntYocto, settledBlockHash } = record;
    return { network, market, amountUsdc, payloadBase64, operationId, accountId, purpose, resourceId, state, payloadHash, outerHash, signatureBase64, reservedYocto, burntYocto, innerHash, innerBurntYocto, settledBlockHash };
}
async function signingHead(config: Awaited<ReturnType<typeof mpcConfig>>, input: MpcCommand, parsed: Awaited<ReturnType<typeof validateMpcCommand>>) {
    const query = (account_id: string, request_type: string, public_key?: string) => rpc('query', {
        finality: 'final', request_type, account_id, ...(public_key ? { public_key } : {}) });
    const key = await query(config.accountId, 'view_access_key', config.publicKey.toString());
    const user = await query(input.accountId, 'view_access_key', `ed25519:${baseEncode(parsed.publicKeyBytes)}`);
    if (key.permission !== 'FullAccess' || user.permission !== 'FullAccess'
        || !Number.isSafeInteger(key.nonce) || key.nonce < 0 || !Number.isSafeInteger(user.nonce) || user.nonce < 0
        || BigInt(user.nonce) + 1n !== parsed.nonce || typeof key.block_hash !== 'string' || baseDecode(key.block_hash).length !== 32
        || !Number.isSafeInteger(key.block_height) || (parsed.maxBlockHeight && BigInt(key.block_height) >= parsed.maxBlockHeight)) fail('mpc_account_changed');
    const [balance, protocol, price] = await Promise.all([query(config.accountId, 'view_account'),
        rpc('EXPERIMENTAL_protocol_config', { block_id: key.block_hash }), rpc('gas_price', [key.block_hash])]);
    // Reviewed PV87 paths: ordinary ticket and Ed25519 FullAccess legacy Delegate, never DelegateV2/gas keys.
    if ((protocol.protocol_version !== 85 && protocol.protocol_version !== 87) || amount(price.gas_price) > 1_000_000_000n
        || protocol.runtime_config.min_gas_purchase_price !== '1000000000') fail('mpc_provider_changed');
    for (const [method_name, expected] of Object.entries({ paused: false, mpc_address: 'v1.signer-prod.testnet', mpc_domain_id: 1 })) {
        const result = await rpc('query', { request_type: 'call_function', block_id: key.block_hash,
            account_id: FAST_AUTH, method_name, args_base64: 'e30=' });
        if (!Array.isArray(result.result) || result.result.length > 256 || JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) !== expected) fail('mpc_provider_changed');
    }
    const unsigned = (value: unknown) => typeof value === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(value) ? BigInt(value) : fail();
    if (!Number.isSafeInteger(balance.storage_usage) || balance.storage_usage < 0) fail();
    return { nonce: BigInt(key.nonce), blockHash: key.block_hash as string,
        available: amount(balance.amount) - unsigned(balance.locked) - BigInt(balance.storage_usage) * amount(protocol.runtime_config.storage_amount_per_byte) };
}
export async function submitMpc(state: DurableObjectState, env: MpcSponsorEnv, input: MpcCommand): Promise<MpcStatus> {
    const config = await mpcConfig(env, true), budget = limits(env);
    if (input.purpose === 'upload' && env.NEAR_AUTH_UPLOAD_ENABLED !== 'true') fail('upload_disabled');
    if (input.purpose === 'device' && env.NEAR_AUTH_DEVICE_ENABLED !== 'true') fail('device_activation_disabled');
    const parsed = await validateMpcCommand(input, env);
    const id = hexBytes(await digest(JSON.stringify([input.network, input.market, input.accountId, input.purpose, input.resourceId, input.attemptId])));
    const recordKey = `mpc:op:${id}`;
    const previous = await state.storage.get<RecordValue>(recordKey);
    if (previous) {
        if (previous.payloadHash !== input.payloadHash) fail('mpc_conflict');
        return publicStatus(previous);
    }
    if (input.approvalExpiresAtMs <= Date.now() || input.approvalExpiresAtMs > Date.now() + 300_000) fail('mpc_approval_expired');
    const revision = await state.storage.get<string>('mpc:nonce');
    const head = await signingHead(config, input, parsed);
    if (input.purpose === 'device') await checkDeviceSend(decodeTransaction(parsed.bytes), input.market, head.blockHash);
    const reserved = await state.storage.transaction(async storage => {
        const existing = await storage.get<RecordValue>(recordKey);
        if (existing) {
            if (existing.payloadHash !== input.payloadHash) fail('mpc_conflict');
            return { record: existing, fresh: false };
        }
        if (input.approvalExpiresAtMs <= Date.now()) fail('mpc_approval_expired');
        // ponytail: one outer request at a time per sponsor; introduce a nonce send queue only if throughput requires it.
        const userOperation = await storage.get<string>(`mpc:user:${input.accountId}`);
        const userRecord = userOperation ? await storage.get<RecordValue>(`mpc:op:${userOperation}`) : null;
        if (await storage.get('mpc:active') || (userOperation && !isMpcSettled(userRecord))) fail('mpc_pending');
        const day = new Date().toISOString().slice(0, 10), dailyKey = 'mpc:daily', userKey = `mpc:daily:${input.accountId}`;
        const total = await storage.get<{ day: string; reserved: string }>(dailyKey);
        const user = await storage.get<{ day: string; attempts: number }>(userKey);
        const totalReserved = total?.day === day ? BigInt(total.reserved) : 0n;
        const attempts = user?.day === day ? user.attempts : 0;
        if (totalReserved + budget.operation > budget.daily || BigInt(attempts) >= budget.attempts) fail('mpc_budget_exceeded');
        if (head.available < budget.minimum + budget.operation) fail('mpc_balance_insufficient');
        const currentRevision = await storage.get<string>('mpc:nonce');
        if (currentRevision !== revision) fail('mpc_head_changed');
        const last = BigInt(currentRevision || '0');
        const nonce = (last > head.nonce ? last : head.nonce) + 1n;
        const record: RecordValue = { network: input.network, market: input.market, amountUsdc: input.amountUsdc, operationId: id, accountId: input.accountId, purpose: input.purpose, resourceId: input.resourceId,
            state: 'RESERVED', payloadHash: input.payloadHash, payloadBase64: input.payloadBase64,
            approvalHash: hexBytes(await digest(input.approvalToken)), nonce: nonce.toString(), blockHash: head.blockHash,
            sponsor: config.accountId, sponsorPublicKey: config.publicKey.toString(), epoch: env.NEAR_AUTH_MPC_KEY_EPOCH!,
            reservedYocto: budget.operation.toString(), createdAtMs: Date.now() };
        // ponytail: retain records up to the existing 256-record DO cap; add verified archival before expanding beyond this bounded pilot.
        await assertDurableObjectRecordCapacity(storage, [recordKey, 'mpc:nonce', 'mpc:active', `mpc:user:${input.accountId}`, dailyKey, userKey], 'operator');
        await storage.put(recordKey, record);
        await storage.put('mpc:nonce', nonce.toString());
        await storage.put('mpc:active', id);
        await storage.put(`mpc:user:${input.accountId}`, id);
        await storage.put(dailyKey, { day, reserved: (totalReserved + budget.operation).toString() });
        await storage.put(userKey, { day, attempts: attempts + 1 });
        return { record, fresh: true };
    });
    if (!reserved.fresh) return publicStatus(reserved.record);
    const record = reserved.record;
    const tx = createTransaction(config.accountId, config.publicKey, FAST_AUTH, BigInt(record.nonce), [actions.functionCall('sign', {
        guard_id: GUARD, verify_payload: input.approvalToken, sign_payload: Array.from(parsed.bytes), algorithm: 'eddsa',
    }, GAS, 1n)], baseDecode(record.blockHash));
    const signed = await config.signer.signTransaction(tx);
    record.outerHash = baseEncode(signed.txHash);
    // Store hash before the network boundary, never the JWT-bearing signed outer transaction.
    record.state = 'SUBMITTED';
    await state.storage.put(recordKey, record);
    if (input.approvalExpiresAtMs <= Date.now()) return publicStatus(record);
    try { await rpc('broadcast_tx_async', [b64(signed.signedTransaction.encode())]); }
    catch { /* Ambiguous is durable; no automatic re-sign/re-send, including after restart. */ }
    return publicStatus(record);
}
export async function mpcStatus(state: DurableObjectState, env: MpcSponsorEnv, accountId: string, id = ''): Promise<MpcStatus | null> {
    if (!hex(accountId) || (id !== '' && !hex(id))) fail();
    if (!id) id = await state.storage.get<string>(`mpc:user:${accountId}`) || '';
    if (!id) return null;
    const record = await state.storage.get<RecordValue>(`mpc:op:${id}`);
    if (!record) return null;
    if (record.accountId !== accountId) fail('mpc_account_mismatch');
    const config = await mpcConfig(env);
    if (record.epoch !== env.NEAR_AUTH_MPC_KEY_EPOCH || record.sponsor !== config.accountId
        || record.sponsorPublicKey !== config.publicKey.toString()) fail('mpc_epoch_mismatch');
    if (record.state === 'DEVICE_SUBMITTED') return reconcileDevice(state, record);
    if (record.state === 'TICKET_SUBMITTED') return reconcileTicket(state, record);
    if (record.purpose === 'upload' && record.state === 'MPC_VERIFIED') return reconcileUpload(state, record);
    if (!record.outerHash || record.state === 'MPC_VERIFIED' || isMpcSettled(record)) return publicStatus(record);
    let outcome;
    try { outcome = await readFinalTransaction(record.outerHash, record.sponsor); }
    catch { return publicStatus(record); }
    const tx = outcome.transaction, call = tx?.actions?.length === 1 ? tx.actions[0].FunctionCall : null;
    if (outcome.final_execution_status !== 'FINAL') return publicStatus(record);
    if (typeof outcome.status?.SuccessValue !== 'string' || tx?.hash !== record.outerHash
        || tx.signer_id !== record.sponsor || tx.public_key !== record.sponsorPublicKey || String(tx.nonce) !== record.nonce
        || tx.receiver_id !== FAST_AUTH || call?.method_name !== 'sign' || String(call.gas) !== GAS.toString() || call.deposit !== '1'
        || typeof call.args !== 'string' || call.args.length > 32768 || !Array.isArray(outcome.receipts_outcome)) fail('mpc_outer_not_verified');
    const args = json64(call.args);
    exact(args, ['guard_id', 'verify_payload', 'sign_payload', 'algorithm']);
    const bytes = unb64(record.payloadBase64);
    if (args.guard_id !== GUARD || args.algorithm !== 'eddsa' || typeof args.verify_payload !== 'string'
        || hexBytes(await digest(args.verify_payload)) !== record.approvalHash || !Array.isArray(args.sign_payload)
        || !args.sign_payload.every((v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255)
        || !same(new Uint8Array(args.sign_payload), bytes)) fail('mpc_outer_not_verified');
    // Historical verification binds the exact token hash approved before send; expiry cannot authorize another send.
    let burnt = 0n;
    for (const receipt of [outcome.transaction_outcome, ...outcome.receipts_outcome]) {
        const value = receipt?.outcome;
        if (!value?.status || 'Failure' in value.status || typeof value.tokens_burnt !== 'string' || !/^(0|[1-9][0-9]{0,38})$/.test(value.tokens_burnt)) fail('mpc_outer_not_verified');
        burnt += BigInt(value.tokens_burnt);
    }
    if (burnt + 1n > BigInt(record.reservedYocto) || outcome.status.SuccessValue.length > 4096) fail('mpc_budget_exceeded');
    const signature = json64(outcome.status.SuccessValue).signature;
    if (!Array.isArray(signature) || signature.length !== 64 || !signature.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) fail('mpc_invalid_signature');
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(record.accountId.match(/../g)!, v => parseInt(v, 16)), 'Ed25519', false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, new Uint8Array(signature), await digest(bytes))) fail('mpc_invalid_signature');
    record.state = 'MPC_VERIFIED'; record.signatureBase64 = b64(new Uint8Array(signature)); record.burntYocto = burnt.toString();
    return state.storage.transaction(async storage => {
        const current = await storage.get<RecordValue>(`mpc:op:${id}`);
        if (!current) fail('mpc_missing_record');
        if (current!.state !== 'SUBMITTED') return publicStatus(current!);
        await storage.put(`mpc:op:${id}`, record);
        if (await storage.get('mpc:active') === id) await storage.delete('mpc:active');
        return publicStatus(record);
    });
}

// Read-only upload completion. The existing upload relay remains the only delegate sender.
async function reconcileUpload(state: DurableObjectState, record: RecordValue): Promise<MpcStatus> {
    if (!record.signatureBase64) fail('upload_not_settled');
    const bytes = unb64(record.payloadBase64);
    const delegate = deserialize(SCHEMA.DelegateAction, bytes.subarray(4)) as unknown as DelegateAction;
    if (!same(encodeDelegateAction(delegate), bytes) || hexBytes(await digest(bytes)) !== record.payloadHash
        || delegate.senderId !== record.accountId || delegate.receiverId !== USDC) fail('upload_not_settled');
    const args = JSON.parse(new TextDecoder().decode(new Uint8Array(delegate.actions[0].functionCall!.args)));
    const msg = await unpackCompactUpload(args.msg, { network: 'testnet', market: record.market, creator: record.accountId,
        usdc: USDC, keyString: value => `ed25519:${baseEncode(value)}` });
    const request: Record<string, string> = {};
    for (const field of ['creator_id', 'job_id', 'title', 'price_usdc', 'expected_source_bytes', 'profile_id',
        'profile_config_sha256', 'upload_public_key', 'upload_key_expires_at_ms']) {
        if (typeof msg[field] !== 'string') fail('upload_not_settled');
        request[field] = msg[field] as string;
    }
    const deviceExpected = msg.playback_session as MpcUploadResult['playbackSession'];
    const quote = msg.sponsor_quote as { total_fee_usdc: string; quote_id: string };
    if (request.creator_id !== record.accountId || request.job_id !== record.resourceId
        || args.amount !== record.amountUsdc || quote.total_fee_usdc !== record.amountUsdc
        || !deviceExpected || deviceExpected.authorization_duration_ms !== '2592000000') fail('upload_not_settled');
    const upload: MpcUploadResult = { request, playbackSession: deviceExpected,
        signedDelegateBase64: b64(encodeSignedDelegate({ delegateAction: delegate,
            signature: new Signature({ keyType: 0, data: unb64(record.signatureBase64!) }) })) };
    const result = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: record.market,
        method_name: 'get_media_job', args_base64: b64(new TextEncoder().encode(JSON.stringify({ job_id: record.resourceId }))) });
    const decode = (value: { result?: unknown; block_hash?: string }) => {
        if (typeof result.block_hash !== 'string' || baseDecode(result.block_hash).length !== 32
            || value.block_hash !== result.block_hash || !Array.isArray(value.result) || value.result.length > 16384
            || !value.result.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) fail('upload_not_settled');
        return JSON.parse(new TextDecoder().decode(new Uint8Array(value.result as number[])));
    };
    const job = decode(result);
    if (job === null) return { ...publicStatus(record), upload };
    // The final Market job is the payment authority, even when the relay already removed its temporary receipt.
    // Keys can be replaced after payment; the immutable quote hash still binds the original request.
    const paidFields = ['creator_id', 'job_id', 'title', 'price_usdc', 'expected_source_bytes', 'profile_id', 'profile_config_sha256'];
    if (paidFields.some(field => job[field] !== request[field])
        || job.generation !== 1 || !['Authorized', 'Published'].includes(job.status)
        || job.fee_asset !== 'USDC' || job.fee_amount !== record.amountUsdc || job.fee_usd_micro !== record.amountUsdc
        || job.fee_quote_hash !== quote.quote_id) fail('upload_not_settled');
    return state.storage.transaction(async storage => {
        const current = await storage.get<RecordValue>(`mpc:op:${record.operationId}`);
        if (!current || current.payloadHash !== record.payloadHash || current.accountId !== record.accountId) fail('upload_not_settled');
        if (current!.state !== 'MPC_VERIFIED') return publicStatus(current!);
        const next: RecordValue = { ...current!, state: 'UPLOAD_SETTLED', settledBlockHash: result.block_hash };
        await storage.put(`mpc:op:${record.operationId}`, next);
        return publicStatus(next);
    });
}

// The ticket inner sender accepts a stored operation ID, never client-chosen transaction bytes.
export async function executeTicket(state: DurableObjectState, env: MpcSponsorEnv, accountId: string, id: string): Promise<MpcStatus | null> {
    return executeInner(state, env, accountId, id, 'ticket');
}
export async function executeDevice(state: DurableObjectState, env: MpcSponsorEnv, accountId: string, id: string): Promise<MpcStatus | null> {
    return executeInner(state, env, accountId, id, 'device');
}
async function executeInner(state: DurableObjectState, env: MpcSponsorEnv, accountId: string, id: string, purpose: 'ticket' | 'device'): Promise<MpcStatus | null> {
    if (!hex(accountId) || !hex(id)) fail();
    if (purpose === 'ticket' && env.NEAR_AUTH_TICKET_ENABLED !== 'true') fail('ticket_disabled');
    if (purpose === 'device' && env.NEAR_AUTH_DEVICE_ENABLED !== 'true') fail('device_activation_disabled');
    await mpcConfig(env, true);
    const status = await mpcStatus(state, env, accountId, id);
    if (!status || status.purpose !== purpose) fail(`${purpose}_invalid_operation`);
    if (status!.state !== 'MPC_VERIFIED') return status;
    const record = await state.storage.get<RecordValue>(`mpc:op:${status!.operationId}`);
    if (!record || !record.signatureBase64 || Date.now() - record.createdAtMs > 300_000) fail(`${purpose}_send_expired`);
    const tx = decodeTransaction(unb64(record!.payloadBase64));
    // Recheck nonce before the first send; historical status below never asks for a fresh nonce/token.
    const access = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId,
        public_key: `ed25519:${baseEncode(Uint8Array.from(accountId.match(/../g)!, byte => parseInt(byte, 16)))}` });
    if (access.permission !== 'FullAccess' || !Number.isSafeInteger(access.nonce) || access.nonce < 0 || BigInt(access.nonce) + 1n !== tx.nonce) fail('mpc_account_changed');
    if (purpose === 'device') await checkDeviceSend(tx, record!.market, access.block_hash);
    const innerHash = baseEncode(await digest(unb64(record!.payloadBase64)));
    const signed = encodeTransaction(new SignedTransaction({ transaction: tx,
        signature: new Signature({ keyType: 0, data: unb64(record!.signatureBase64!) }) }));
    const reserved = await state.storage.transaction(async storage => {
        const current = await storage.get<RecordValue>(`mpc:op:${record!.operationId}`);
        if (!current || current.accountId !== accountId) fail(`${purpose}_invalid_operation`);
        if (current!.state !== 'MPC_VERIFIED') return { record: current!, fresh: false };
        if (Date.now() - current!.createdAtMs > 300_000) fail(`${purpose}_send_expired`);
        const next: RecordValue = { ...current!, state: purpose === 'device' ? 'DEVICE_SUBMITTED' : 'TICKET_SUBMITTED', innerHash };
        await storage.put(`mpc:op:${next.operationId}`, next);
        return { record: next, fresh: true };
    });
    // A crash after reservation is ambiguous. Never broadcast a stored operation a second time.
    if (reserved.fresh) {
        try { await rpc('broadcast_tx_async', [b64(signed)]); } catch { /* Reconcile only. */ }
    }
    return purpose === 'device' ? reconcileDevice(state, reserved.record) : reconcileTicket(state, reserved.record);
}

async function reconcileTicket(state: DurableObjectState, record: RecordValue): Promise<MpcStatus> {
    if (record.state !== 'TICKET_SUBMITTED' || !record.innerHash) return publicStatus(record);
    let result;
    try { result = await readFinalTransaction(record.innerHash, record.accountId); }
    catch { return publicStatus(record); }
    if (result.final_execution_status !== 'FINAL') return publicStatus(record);
    const expected = decodeTransaction(unb64(record.payloadBase64)), call = expected.actions[0].functionCall!;
    const tx = result.transaction, actual = tx?.actions?.length === 1 ? tx.actions[0].FunctionCall : null;
    if (typeof result.status?.SuccessValue !== 'string' || tx?.hash !== record.innerHash
        || tx.signer_id !== record.accountId || tx.receiver_id !== USDC
        || tx.public_key !== `ed25519:${baseEncode(Uint8Array.from(record.accountId.match(/../g)!, byte => parseInt(byte, 16)))}`
        || String(tx.nonce) !== expected.nonce.toString() || actual?.method_name !== 'ft_transfer_call'
        || String(actual.gas) !== call.gas.toString() || actual.deposit !== '1' || actual.args !== b64(new Uint8Array(call.args))
        || !Array.isArray(result.receipts_outcome) || json64(result.status.SuccessValue) !== record.amountUsdc) fail('ticket_not_settled');
    let burnt = 0n;
    for (const receipt of [result.transaction_outcome, ...result.receipts_outcome]) {
        const outcome = receipt?.outcome;
        if (!outcome?.status || 'Failure' in outcome.status || typeof outcome.tokens_burnt !== 'string'
            || !/^(0|[1-9][0-9]{0,38})$/.test(outcome.tokens_burnt)) fail('ticket_not_settled');
        burnt += BigInt(outcome.tokens_burnt);
    }
    if (burnt + 1n > 120_000_000_000_000_000_000_000n) fail('ticket_not_settled');
    const event = result.receipts_outcome.some((receipt: { outcome?: { executor_id?: string; logs?: unknown[] } }) =>
        receipt.outcome?.executor_id === record.market && Array.isArray(receipt.outcome.logs)
        && receipt.outcome.logs.some(log => {
            if (typeof log !== 'string' || !log.startsWith('EVENT_JSON:')) return false;
            try {
                const event = JSON.parse(log.slice(11));
                return event.standard === 'youtick_market' && event.version === '1.0.0' && event.event === 'entitlement_purchased'
                    && Array.isArray(event.data) && event.data.some((data: Record<string, unknown>) => data.account_id === record.accountId
                        && data.contract_id === record.market && data.publication_id === record.resourceId && data.asset === 'USDC' && data.amount === record.amountUsdc);
            } catch { return false; }
        }));
    if (!event) fail('ticket_not_settled');
    // Payment history survives key/device expiry. Playback checks current authority separately.
    const entitlement = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: record.market,
        method_name: 'has_entitlement', args_base64: b64(new TextEncoder().encode(JSON.stringify({
            account_id: record.accountId, publication_id: record.resourceId }))) });
    if (typeof entitlement.block_hash !== 'string' || baseDecode(entitlement.block_hash).length !== 32
        || !Array.isArray(entitlement.result) || entitlement.result.length > 4096
        || !entitlement.result.every((v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255)
        || JSON.parse(new TextDecoder().decode(new Uint8Array(entitlement.result))) !== true) fail('ticket_not_settled');
    return state.storage.transaction(async storage => {
        const current = await storage.get<RecordValue>(`mpc:op:${record.operationId}`);
        if (!current || current.innerHash !== record.innerHash) fail('ticket_not_settled');
        const next: RecordValue = { ...current!, state: 'TICKET_SETTLED', innerBurntYocto: burnt.toString() };
        await storage.put(`mpc:op:${record.operationId}`, next);
        // Keep the last-operation pointer for reload recovery; terminal state releases the economic lock.
        return publicStatus(next);
    });
}

async function checkDeviceSend(tx: ReturnType<typeof decodeTransaction>, market: string, block: string) {
    if (typeof block !== 'string' || baseDecode(block).length !== 32) fail('device_activation_unavailable');
    const [account, protocol, price] = await Promise.all([
        rpc('query', { request_type: 'view_account', block_id: block, account_id: tx.signerId }),
        rpc('EXPERIMENTAL_protocol_config', { block_id: block }), rpc('gas_price', [block]),
    ]);
    const unsigned = (value: unknown) => typeof value === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(value) ? BigInt(value) : fail('budget_not_verified');
    if (![85, 87].includes(protocol.protocol_version) || protocol.runtime_config?.min_gas_purchase_price !== '1000000000'
        || amount(price.gas_price) > 1_000_000_000n || !Number.isSafeInteger(account.storage_usage) || account.storage_usage < 0
        || unsigned(account.amount) - unsigned(account.locked) - BigInt(account.storage_usage) * amount(protocol.runtime_config.storage_amount_per_byte) < DEVICE_NEAR_LIMIT) fail('budget_not_verified');
    const args = JSON.parse(new TextDecoder().decode(new Uint8Array(tx.actions[0].functionCall!.args)));
    await readDeviceRecoveryState(rpc, market, tx.signerId, args.publication_id, args.playback_session, block);
}

async function reconcileDevice(state: DurableObjectState, record: RecordValue): Promise<MpcStatus> {
    if (!record.innerHash || record.state !== 'DEVICE_SUBMITTED') return publicStatus(record);
    let result;
    try { result = await readFinalTransaction(record.innerHash, record.accountId); }
    catch { return publicStatus(record); }
    if (result.final_execution_status !== 'FINAL') return publicStatus(record);
    const expected = decodeTransaction(unb64(record.payloadBase64)), call = expected.actions[0].functionCall!;
    const tx = result.transaction, actual = tx?.actions?.length === 1 ? tx.actions[0].FunctionCall : null;
    if (result.status?.SuccessValue !== '' || tx?.hash !== record.innerHash || tx.signer_id !== record.accountId
        || tx.receiver_id !== record.market || tx.public_key !== expected.publicKey.toString()
        || String(tx.nonce) !== expected.nonce.toString() || actual?.method_name !== 'activate_playback_device'
        || String(actual.gas) !== DEVICE_GAS.toString() || actual.deposit !== '1' || actual.args !== b64(new Uint8Array(call.args))
        || !Array.isArray(result.receipts_outcome)) fail('device_not_settled');
    let burnt = 0n;
    for (const receipt of [result.transaction_outcome, ...result.receipts_outcome]) {
        const outcome = receipt?.outcome;
        if (!outcome?.status || 'Failure' in outcome.status || typeof outcome.tokens_burnt !== 'string'
            || !/^(0|[1-9][0-9]{0,38})$/.test(outcome.tokens_burnt)) fail('device_not_settled');
        burnt += BigInt(outcome.tokens_burnt);
    }
    if (burnt + 1n > DEVICE_NEAR_LIMIT) fail('device_not_settled');
    // Pin the device proof to the successful Market execution block, so late status does not depend on today's expiry/eviction.
    const receipt = result.receipts_outcome.find((value: { block_hash?: string; outcome?: { executor_id?: string; status?: { SuccessValue?: string } } }) =>
        value.outcome?.executor_id === record.market && value.outcome.status?.SuccessValue === '');
    if (!receipt || typeof receipt.block_hash !== 'string' || baseDecode(receipt.block_hash).length !== 32) fail('device_not_settled');
    const view = async (method_name: 'has_entitlement' | 'get_playback_device', args: object) => {
        const value = await readHistory('query', { request_type: 'call_function', block_id: receipt.block_hash, account_id: record.market,
            method_name, args_base64: b64(new TextEncoder().encode(JSON.stringify(args))) });
        if (value.block_hash !== receipt.block_hash || !Array.isArray(value.result) || value.result.length > 4096
            || !value.result.every((v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255)) fail('device_not_settled');
        return JSON.parse(new TextDecoder().decode(new Uint8Array(value.result)));
    };
    const deviceExpected = JSON.parse(new TextDecoder().decode(new Uint8Array(call.args))).playback_session;
    const [entitled, device] = await Promise.all([
        view('has_entitlement', { account_id: record.accountId, publication_id: record.resourceId }),
        view('get_playback_device', { account_id: record.accountId, session_public_key: deviceExpected.session_public_key }),
    ]);
    if (entitled !== true || device?.session_public_key !== deviceExpected.session_public_key
        || device.certificate_sha256 !== deviceExpected.certificate_sha256 || device.authorizing_public_key !== tx.public_key
        || typeof device.authorized_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.authorized_at_ms)
        || typeof device.expires_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.expires_at_ms)
        || !Number.isSafeInteger(Number(device.authorized_at_ms)) || !Number.isSafeInteger(Number(device.expires_at_ms))
        || Number(device.expires_at_ms) - Number(device.authorized_at_ms) !== 2592000000) fail('device_not_settled');
    return state.storage.transaction(async storage => {
        const current = await storage.get<RecordValue>(`mpc:op:${record.operationId}`);
        if (!current || current.innerHash !== record.innerHash) fail('device_not_settled');
        const next: RecordValue = { ...current!, state: 'DEVICE_SETTLED', innerBurntYocto: burnt.toString(), settledBlockHash: receipt.block_hash };
        await storage.put(`mpc:op:${record.operationId}`, next);
        return publicStatus(next);
    });
}
