import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ account: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/near-auth-account-preflight', () => ({ nearAuthAccountPreflight: mocks.account }));
vi.mock('@/lib/near-auth-lab-session', () => ({ readNearAuthLabSession: mocks.session }));
import { POST } from '@/app/api/auth-lab/account/route';

const ORIGIN = 'http://localhost:3000';
const ACCOUNT = 'ab'.repeat(32);
const KEY = 'ed25519:11111111111111111111111111111111';
const BLOCK = '2'.repeat(44);
const network = vi.fn();
let values: Record<string, unknown>;
let permission: unknown;
let codeHash: string;
let badBlock: boolean;

beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet'); vi.stubEnv('NEXT_PUBLIC_MARKET_CONTRACT_ID', 'media.testnet');
    mocks.session.mockReset().mockResolvedValue('google-oauth2|synthetic-media');
    mocks.account.mockReset().mockResolvedValue({ implicitAccount: ACCOUNT, accounts: [ACCOUNT], publicKey: KEY });
    values = { get_governance_state: { bridge_frozen: false }, has_entitlement: true,
        get_publication: { publication_id: 'video-1', generation: 1, playback_id: 'playback-1', availability: 'ACTIVE' } };
    permission = 'FullAccess'; codeHash = '3'.repeat(44); badBlock = false;
    network.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        expect(url).toBe('https://test.rpc.fastnear.com/');
        expect(init.signal).toBeInstanceOf(AbortSignal); expect(init.cache).toBe('no-store');
        const { method, params } = JSON.parse(init.body as string);
        expect(method).toBe('query'); // No signing, broadcast or provider mutation is allowed in this test.
        const block = { block_hash: badBlock && params.block_id ? 'other-block' : BLOCK, block_height: 123 };
        if (params.request_type === 'view_access_key') {
            expect(params).toEqual({ request_type: 'view_access_key', account_id: ACCOUNT, public_key: KEY, finality: 'final' });
            return Response.json({ result: { ...block, permission } });
        }
        expect(params.block_id).toBe(BLOCK); expect(params.account_id).toBe('media.testnet');
        if (params.request_type === 'view_account') return Response.json({ result: { ...block, code_hash: codeHash } });
        expect(params.request_type).toBe('call_function');
        const args = JSON.parse(Buffer.from(params.args_base64, 'base64').toString());
        expect(args).toEqual(params.method_name === 'has_entitlement' ? { account_id: ACCOUNT, publication_id: 'video-1' }
            : params.method_name === 'get_publication' ? { publication_id: 'video-1' } : {});
        return Response.json({ result: { ...block, result: [...Buffer.from(JSON.stringify(values[params.method_name]))] } });
    });
    vi.stubGlobal('fetch', network);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = (query = 'publication=video-1', origin = ORIGIN, body?: string) => new Request(`${ORIGIN}/api/auth-lab/account?${query}`, {
    method: 'POST', headers: { Origin: origin }, ...(body === undefined ? {} : { body }),
});

it('checks the session account against NEAR at one final block without claiming playback success', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toEqual({ accountId: ACCOUNT, marketContractId: 'media.testnet', publicationId: 'video-1',
        blockHeight: 123, availability: 'ACTIVE', entitled: true, reason: 'entitled', playbackVerified: false });
    expect(mocks.account).toHaveBeenCalledWith('google-oauth2|synthetic-media', false);
    expect(network).toHaveBeenCalledTimes(5);
    expect(new Set(network.mock.calls.map(([, init]) => init.signal)).size).toBe(1);
});

it.each(['entitlement_required', 'publication_missing', 'takedown', 'bridge_frozen', 'sales_suspended'])('distinguishes %s', async (reason) => {
    if (reason === 'entitlement_required') values.has_entitlement = false;
    if (reason === 'publication_missing') { values.get_publication = null; values.has_entitlement = false; }
    if (reason === 'bridge_frozen') values.get_governance_state = { bridge_frozen: true };
    if (reason === 'takedown' || reason === 'sales_suspended') Object.assign(values.get_publication as object,
        { availability: reason === 'takedown' ? 'TAKEDOWN' : 'SALES_SUSPENDED' });
    const response = await POST(request()); expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.reason).toBe(reason === 'sales_suspended' ? 'entitled' : reason);
    expect(result.playbackVerified).toBe(false);
});

it.each(['no-account', 'limited-key', 'empty-contract', 'wrong-block', 'wrong-publication', 'bad-entitlement', 'bad-governance', 'bad-generation', 'bad-playback', 'rpc-error'])('fails closed for %s', async (failure) => {
    if (failure === 'no-account') mocks.account.mockResolvedValue({ accounts: [], implicitAccount: ACCOUNT, publicKey: KEY });
    if (failure === 'limited-key') permission = { FunctionCall: {} };
    if (failure === 'empty-contract') codeHash = '11111111111111111111111111111111';
    if (failure === 'wrong-block') badBlock = true;
    if (failure === 'wrong-publication') Object.assign(values.get_publication as object, { publication_id: 'other-video' });
    if (failure === 'bad-generation') Object.assign(values.get_publication as object, { generation: 2 });
    if (failure === 'bad-playback') Object.assign(values.get_publication as object, { playback_id: '' });
    if (failure === 'bad-entitlement') values.has_entitlement = 'true';
    if (failure === 'bad-governance') values.get_governance_state = {};
    if (failure === 'rpc-error') network.mockRejectedValue(new Error('private provider detail'));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'account_check_unavailable' });
});

it.each(['production', 'flag-off', 'mainnet', 'anonymous', 'cross-origin', 'invalid-id', 'duplicate-id', 'extra-account', 'body', 'remote-host'])('rejects %s before chain reads', async (failure) => {
    if (failure === 'production') vi.stubEnv('NODE_ENV', 'production');
    if (failure === 'flag-off') vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'false');
    if (failure === 'mainnet') vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'mainnet');
    if (failure === 'anonymous') mocks.session.mockResolvedValue(null);
    const query = failure === 'invalid-id' ? 'publication=../bad' : failure === 'duplicate-id' ? 'publication=video-1&publication=video-2'
        : failure === 'extra-account' ? 'publication=video-1&account=other.testnet' : 'publication=video-1';
    const req = failure === 'remote-host' ? new Request(`https://example.org/api/auth-lab/account?${query}`, { method: 'POST', headers: { Origin: 'https://example.org' } })
        : request(query, failure === 'cross-origin' ? 'https://other.example' : ORIGIN, failure === 'body' ? '{"account":"other.testnet"}' : undefined);
    const response = await POST(req);
    expect(response.status).toBe(failure === 'anonymous' ? 401 : failure === 'cross-origin' ? 403
        : ['production', 'flag-off', 'mainnet', 'remote-host'].includes(failure) ? 404 : 400);
    expect(mocks.account).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});
