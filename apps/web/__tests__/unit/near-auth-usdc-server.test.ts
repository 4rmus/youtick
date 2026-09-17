import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EncryptJWT } from 'jose';

vi.unmock('near-api-js');
const preflight = vi.hoisted(() => vi.fn());
vi.mock('@/lib/near-auth-account-preflight', () => ({ nearAuthAccountPreflight: preflight }));
import { prepareGoogleUsdc, authorizeGoogleUsdc, verifyGoogleUsdc } from '@/lib/near-auth-usdc-server';
import { POST } from '@/app/api/auth-lab/signing/route';

const ACCOUNT = '00'.repeat(32); const KEY = 'ed25519:11111111111111111111111111111111';
const ORIGIN = 'http://localhost:3000'; const SUBJECT = 'google-oauth2|synthetic-usdc'; const SECRET = '11'.repeat(32);
const TOKEN = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const BLOCK = '2'.repeat(44); const HASH = '3'.repeat(44);
const network = vi.fn();
let hasStorage: boolean; let recipientBalance: string; let senderBalance: string; let senderNear: string;
let minimum: string; let protocol: number; let permission: unknown; let decimals: number; let senderRegistered: boolean;
let outcome: Record<string, unknown>;
beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true'); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet'); vi.stubEnv('NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2', 'true');
    vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', SECRET); vi.stubEnv('NEAR_AUTH_LAB_CLIENT_ID', 'synthetic-client');
    hasStorage = false; recipientBalance = '0'; senderBalance = '3800000'; senderNear = '2000000000000000000000000';
    minimum = '1250000000000000000000'; protocol = 85; permission = 'FullAccess'; decimals = 6; senderRegistered = true; outcome = {};
    preflight.mockReset().mockResolvedValue({ implicitAccount: ACCOUNT, publicKey: KEY, accounts: [ACCOUNT] });
    network.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        expect(url).toBe('https://test.rpc.fastnear.com/');
        const { method, params } = JSON.parse(init.body as string);
        let result: unknown; const block = { block_hash: BLOCK, block_height: 123 };
        if (method === 'tx') result = outcome;
        else if (method === 'gas_price') result = { gas_price: '100000000' };
        else if (method === 'EXPERIMENTAL_protocol_config') result = { protocol_version: protocol,
            runtime_config: { min_gas_purchase_price: '1000000000', storage_amount_per_byte: '10000000000000000000' } };
        else {
            expect(method).toBe('query');
            if (params.request_type === 'view_access_key') {
                expect(params.account_id).toBe(ACCOUNT); expect(params.public_key).toBe(KEY);
                result = { ...block, permission };
            } else {
                expect(params.block_id).toBe(BLOCK);
                if (params.request_type === 'view_account') result = { ...block, amount: senderNear, locked: '0', storage_usage: 200 };
                else {
                    expect(params.account_id).toBe(TOKEN);
                    const args = JSON.parse(Buffer.from(params.args_base64, 'base64').toString());
                    const value = params.method_name === 'ft_metadata' ? { decimals }
                        : params.method_name === 'storage_balance_bounds' ? { min: minimum, max: minimum }
                            : params.method_name === 'ft_balance_of' ? (args.account_id === ACCOUNT ? recipientBalance : senderBalance)
                                : (args.account_id === ACCOUNT ? hasStorage : senderRegistered) ? { total: minimum } : null;
                    result = { ...block, result: [...Buffer.from(JSON.stringify(value))] };
                }
            }
        }
        return Response.json({ result });
    });
    vi.stubGlobal('fetch', network);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const prepare = () => prepareGoogleUsdc(SUBJECT, ORIGIN, 'sender.testnet');

it('prepares one exact registration + transfer to the session account, then verifies final token movement and usable balance', async () => {
    const review = await prepare();
    expect(review.allowed).toBe(true); expect(review.nearLimitYocto).toBe('80000000000000000000000');
    expect(review.actions.map((a) => a.params.methodName)).toEqual(['storage_deposit', 'ft_transfer']);
    expect(review.actions[0].params).toEqual({ methodName: 'storage_deposit', args: { account_id: ACCOUNT, registration_only: true }, gas: '30000000000000', deposit: minimum });
    expect(review.actions[1].params.args).toEqual({ receiver_id: ACCOUNT, amount: '600000', memo: 'YouTick auth lab test balance' });
    const call = await authorizeGoogleUsdc(SUBJECT, ORIGIN, review.ticket);
    expect(call.receiverId).toBe(TOKEN); expect(call.actions).toEqual(review.actions);
    setFinal(review); hasStorage = true; recipientBalance = '600000'; senderBalance = '0';
    expect(await verifyGoogleUsdc(SUBJECT, ORIGIN, review.ticket, HASH)).toEqual({ verified: true, transactionHash: HASH, accountId: ACCOUNT, balanceMicro: '600000', feeYocto: '2000' });
    expect(network.mock.calls.every(([, init]) => ['query', 'gas_price', 'EXPERIMENTAL_protocol_config', 'tx'].includes(JSON.parse(init.body).method))).toBe(true);
});

function setFinal(review: Awaited<ReturnType<typeof prepare>>) {
    const receipt = { outcome: { status: { SuccessValue: '' }, tokens_burnt: '1000' } };
    outcome = { final_execution_status: 'FINAL', status: { SuccessValue: '' }, transaction: { hash: HASH, signer_id: review.sender, receiver_id: TOKEN,
        actions: review.actions.map(({ params }) => ({ FunctionCall: { method_name: params.methodName, args: Buffer.from(JSON.stringify(params.args)).toString('base64'), gas: Number(params.gas), deposit: params.deposit } })) },
    transaction_outcome: receipt, receipts_outcome: [{ outcome: { ...receipt.outcome, executor_id: TOKEN, logs: [`EVENT_JSON:${JSON.stringify({
        standard: 'nep141', version: '1.0.0', event: 'ft_transfer', data: [{ old_owner_id: review.sender, new_owner_id: ACCOUNT, amount: '600000' }],
    })}`] } }] };
}

it('skips registration when present and never prepares a transfer when funding is already sufficient', async () => {
    hasStorage = true;
    expect((await prepare()).actions.map((a) => a.params.methodName)).toEqual(['ft_transfer']);
    recipientBalance = '600000'; const ready = await prepare();
    expect(ready).toMatchObject({ ready: true, allowed: false, reason: 'ready', actions: [], ticket: null });
});

it.each(['sender-usdc', 'sender-near', 'sender-storage'])('does not permit funding with insufficient %s', async (failure) => {
    if (failure === 'sender-usdc') senderBalance = '599999';
    if (failure === 'sender-near') senderNear = '80000000000000000000000'; // Storage reserve must also remain available.
    if (failure === 'sender-storage') senderRegistered = false;
    const review = await prepare(); expect(review.allowed).toBe(false); expect(review.ticket).toBeNull();
});

it.each(['key', 'storage-cap', 'protocol', 'decimals', 'mainnet', 'flags', 'account-missing'])('fails closed for %s', async (failure) => {
    if (failure === 'key') permission = { FunctionCall: {} };
    if (failure === 'storage-cap') minimum = '2000000000000000000001';
    if (failure === 'protocol') protocol = 86;
    if (failure === 'decimals') decimals = 18;
    if (failure === 'mainnet') vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'mainnet');
    if (failure === 'flags') vi.stubEnv('NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2', 'false');
    if (failure === 'account-missing') preflight.mockResolvedValue({ implicitAccount: ACCOUNT, publicKey: KEY, accounts: [] });
    await expect(prepare()).rejects.toThrow();
});

it.each(['subject', 'origin', 'ticket', 'registered', 'balance', 'fee', 'sender-balance'])('rechecks %s before wallet approval', async (failure) => {
    const review = await prepare();
    if (failure === 'registered') hasStorage = true;
    if (failure === 'balance') { hasStorage = true; recipientBalance = '600000'; }
    if (failure === 'fee') minimum = '1300000000000000000000';
    if (failure === 'sender-balance') senderBalance = '0';
    await expect(authorizeGoogleUsdc(failure === 'subject' ? 'other-user' : SUBJECT, failure === 'origin' ? 'http://127.0.0.1:3000' : ORIGIN,
        failure === 'ticket' ? 'tampered' : review.ticket)).rejects.toThrow();
});

it.each(['pending', 'wrong-sender', 'wrong-action', 'missing-event', 'failed-receipt', 'fee-exceeded', 'missing-storage', 'balance-low'])('does not claim funding success for %s', async (failure) => {
    const review = await prepare(); setFinal(review); hasStorage = true; recipientBalance = '600000';
    if (failure === 'pending') outcome.final_execution_status = 'EXECUTED_OPTIMISTIC';
    if (failure === 'wrong-sender') Object.assign(outcome.transaction as object, { signer_id: 'other.testnet' });
    if (failure === 'wrong-action') Object.assign(outcome.transaction as object, { actions: [] });
    if (failure === 'missing-event') outcome.receipts_outcome = [];
    if (failure === 'failed-receipt') outcome.transaction_outcome = { outcome: { status: { Failure: {} }, tokens_burnt: '1' } };
    if (failure === 'fee-exceeded') outcome.transaction_outcome = { outcome: { status: { SuccessValue: '' }, tokens_burnt: '80000000000000000000000' } };
    if (failure === 'missing-storage') { hasStorage = false; recipientBalance = '0'; }
    if (failure === 'balance-low') recipientBalance = '599999';
    await expect(verifyGoogleUsdc(SUBJECT, ORIGIN, review.ticket, HASH)).rejects.toThrow();
});

it('keeps the route closed and rejects client-supplied targets or amounts', async () => {
    const now = Math.floor(Date.now() / 1000);
    const cookie = await new EncryptJWT({ identity_issuer: 'https://login.testnet.fast-auth.com/', client_id: 'synthetic-client' })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setSubject(SUBJECT).setIssuer('youtick-auth-lab').setAudience(ORIGIN)
        .setIssuedAt(now).setExpirationTime(now + 300).encrypt(Buffer.from(SECRET, 'hex'));
    const req = (body: object, session = true, origin = ORIGIN) => new Request(`${ORIGIN}/api/auth-lab/signing`, { method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(session ? { Cookie: `youtick_auth_lab=${cookie}` } : {}) }, body: JSON.stringify(body) });
    const body = { action: 'prepare-usdc', sender: 'sender.testnet' };
    expect((await POST(req(body, false))).status).toBe(401);
    expect((await POST(req(body, true, 'https://other.invalid'))).status).toBe(403);
    expect((await POST(req({ ...body, amount: '900000', target: 'other.testnet' }))).status).toBe(400);
    expect(network).not.toHaveBeenCalled();
    expect((await POST(req(body))).status).toBe(200);
    network.mockClear(); vi.stubEnv('NODE_ENV', 'production');
    for (const action of ['prepare-usdc', 'authorize-usdc', 'verify-usdc']) expect((await POST(req({ action }))).status).toBe(404);
    expect(network).not.toHaveBeenCalled();
});
