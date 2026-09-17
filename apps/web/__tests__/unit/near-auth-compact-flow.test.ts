import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { actions, baseEncode } from 'near-api-js';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { createNearAuthLab } from '@/lib/near-auth-lab';
import { createGoogleUploadWallet } from '@/lib/near-auth-upload-wallet';
import { prepareGoogleUpload, authorizeGoogleUpload, completeGoogleUpload } from '@/lib/near-auth-upload-server';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';
import vectors from '../../../../protocol/paid-media-livepeer-v1/compact-upload-vectors.json';

vi.unmock('near-api-js');
const state = vi.hoisted(() => ({ publicKey: null as CryptoKey | null, account: vi.fn(), device: vi.fn(), suspend: vi.fn() }));
vi.mock('jose', async load => ({ ...await load<typeof import('jose')>(), createRemoteJWKSet: () => async () => state.publicKey }));
vi.mock('@/lib/near-auth-account-preflight', () => ({ nearAuthAccountPreflight: state.account }));
vi.mock('@/lib/device-session', () => ({ preparePlaybackDevice: state.device, suspendDeviceSession: state.suspend,
    onDeviceSessionCleared: () => () => {} }));
vi.mock('@/lib/wallet-account', () => ({ selectedWalletAccount: () => ({ accountId: 'sponsor.testnet' }) }));

const fixture = vectors[0];
const ACCOUNT = fixture.request.creator_id;
const SUBJECT = 'google-oauth2|synthetic-compact';
const ORIGIN = 'http://localhost:3000';
const BLOCK = baseEncode(new Uint8Array(32).fill(7));
const OUTER = baseEncode(new Uint8Array(32).fill(8));
const privateOwner = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 1)]), format: 'der', type: 'pkcs8' });
const confirm = vi.fn(); const google = vi.fn(); const send = vi.fn(); const network = vi.fn();
const previousConfirm = window.confirm;
let rsa: CryptoKey;
let healthy: boolean;
let outer: Record<string, unknown>;
let review: Awaited<ReturnType<typeof prepareGoogleUpload>> | undefined;

beforeAll(async () => { const keys = await generateKeyPair('RS256'); rsa = keys.privateKey; state.publicKey = keys.publicKey; });
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(1785589300000);
    vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet'); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1', 'true'); vi.stubEnv('NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2', 'true');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS', 'true'); vi.stubEnv('NEXT_PUBLIC_MARKET_CONTRACT_ID', 'market.testnet');
    vi.stubEnv('NEXT_PUBLIC_LIVEPEER_BRIDGE_URL', 'https://bridge.invalid');
    vi.stubEnv('NEAR_AUTH_LAB_CLIENT_ID', 'synthetic-client'); vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', '11'.repeat(32));
    state.account.mockResolvedValue({ implicitAccount: ACCOUNT, accounts: [ACCOUNT], publicKey: fixture.account_public_key });
    state.device.mockResolvedValue(fixture.normal_message.playback_session);
    healthy = true; outer = {}; review = undefined;
    window.confirm = confirm.mockReset().mockReturnValue(true);
    vi.stubGlobal('navigator', { locks: { request: async (_: string, __: unknown, run: (lock: object) => unknown) => run({}) } });
    google.mockReset().mockImplementation(async (bytes: number[], kind: string) => {
        expect(confirm).toHaveBeenCalledOnce(); expect(kind).toBe('delegateAction');
        return new SignJWT({ iss: 'https://login.testnet.fast-auth.com/', sub: SUBJECT, aud: 'auth0.jwt.fast-auth.testnet',
            azp: 'synthetic-client', scope: 'openid transaction:sign', fatxn: bytes, iat: 1785589300, exp: 1785589360 })
            .setProtectedHeader({ alg: 'RS256' }).sign(rsa);
    });
    send.mockReset().mockImplementation(async call => {
        const args = call.actions[0].params.args;
        expect(args.sign_payload).toEqual(review!.delegate);
        const signature = sign(null, createHash('sha256').update(Buffer.from(args.sign_payload)).digest(), privateOwner);
        const receipt = { outcome: { tokens_burnt: '1000', status: { SuccessValue: '' } } };
        outer = { final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from(JSON.stringify({ signature: [...signature] })).toString('base64') },
            transaction: { hash: OUTER, signer_id: 'sponsor.testnet', receiver_id: 'fast-auth.testnet', actions: [{ FunctionCall: {
                method_name: 'sign', gas: 300000000000000, deposit: '1', args: Buffer.from(JSON.stringify(args)).toString('base64'),
            } }] }, transaction_outcome: receipt, receipts_outcome: [receipt] };
        return { transaction: { hash: OUTER } };
    });
    network.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        if (url === '/api/auth-lab/account') return Response.json({ implicitAccount: ACCOUNT, accounts: [ACCOUNT] });
        if (url === 'https://bridge.invalid/__health') return Response.json({ status: 'ok', service: 'livepeer-bridge',
            compactUpload: healthy ? { version: 1, network: 'testnet', market: 'market.testnet' } : undefined,
            sponsoredUploadRelayReady: true, newUploadReady: true });
        const body = JSON.parse(String(init.body));
        if (url === '/api/auth-lab/signing') {
            if (body.action === 'prepare-upload') {
                review = await prepareGoogleUpload(SUBJECT, ORIGIN, body.sponsor, body.encodedArgs);
                return Response.json(review);
            }
            if (body.action === 'authorize-upload') return Response.json(await authorizeGoogleUpload(SUBJECT, ORIGIN, body.ticket, body.token));
            if (body.action === 'complete-upload') return Response.json(await completeGoogleUpload(SUBJECT, ORIGIN, body.ticket, body.outerHash));
            throw new Error('unexpected_api');
        }
        expect(url).toBe('https://test.rpc.fastnear.com/');
        const p = body.params;
        if (body.method === 'block') return Response.json({ result: { header: { height: 1000 } } });
        if (body.method === 'tx') return Response.json({ result: outer });
        if (body.method === 'gas_price') return Response.json({ result: { gas_price: '100000000' } });
        if (body.method === 'EXPERIMENTAL_protocol_config') return Response.json({ result: { protocol_version: 85, runtime_config: { min_gas_purchase_price: '1000000000' } } });
        expect(body.method).toBe('query');
        if (p.request_type === 'view_access_key') return Response.json({ result: { block_hash: BLOCK, block_height: 1000, permission: 'FullAccess', nonce: 10 } });
        if (p.request_type === 'view_account') return Response.json({ result: { amount: '1000000000000000000000000', locked: '0' } });
        if (p.request_type === 'view_state') return Response.json({ result: { block_hash: BLOCK, values: [] } });
        const views: Record<string, unknown> = { paused: false, mpc_address: 'v1.signer-prod.testnet', mpc_domain_id: 1,
            get_media_job: null, get_governance_state: { bridge_frozen: false, new_purchases_paused: false },
            get_usdc_contract_id: fixture.quote.delegate_receiver_id, ft_balance_of: '3000000', storage_balance_of: { total: '1' },
            get_quote_key_version: 1, get_compact_upload_version: 1 };
        expect(Object.hasOwn(views, p.method_name)).toBe(true);
        return Response.json({ result: { block_hash: BLOCK, result: [...Buffer.from(JSON.stringify(views[p.method_name]))] } });
    });
    vi.stubGlobal('fetch', network);
});
afterEach(() => { window.confirm = previousConfirm; vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function input() {
    return { blockHeightTtl: 200, delegateActions: [{ receiverId: fixture.quote.delegate_receiver_id,
        actions: [actions.functionCall('ft_transfer_call', { receiver_id: 'market.testnet', amount: fixture.quote.total_fee_usdc,
            memo: 'YouTick creator upload fee', msg: JSON.stringify(fixture.normal_message) }, 100000000000000n, 1n)] }] };
}
function wallet() {
    const sponsor = { accountId: 'sponsor.testnet', wallet: { manifest: PINNED_WALLET_MANIFEST.wallets[0], getAccounts: async () => [], signAndSendTransaction: send } as unknown as NearWalletBase };
    return createGoogleUploadWallet(ACCOUNT, sponsor, { requestSigningAuthorization: google } as unknown as ReturnType<typeof createNearAuthLab>, new AbortController().signal);
}

it('binds the readable review and original compact proof through the real adapter and signing server', async () => {
    const client = wallet();
    await expect(client.signDelegateActions!(input())).resolves.toEqual({ signedDelegateActions: [fixture.signed_delegate_base64] });
    const displayed = confirm.mock.calls[0][0];
    expect(displayed).toContain(fixture.request.title); expect(displayed).toContain('1.600000 test USDC');
    expect(displayed).toContain('99999999999999.999999 test USDC');
    expect(displayed).not.toContain('yt:u1:');
    expect(google).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledOnce();
    await expect(client.signDelegateActions!(input())).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledOnce();
});

it('stops before Google approval and sponsor payment when the deployed service lacks compact support', async () => {
    healthy = false;
    await expect(wallet().signDelegateActions!(input())).rejects.toThrow('compact_upload_unavailable');
    expect(confirm).not.toHaveBeenCalled(); expect(google).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    expect(localStorage.getItem(`youtick:auth-lab:upload:testnet:market.testnet:${ACCOUNT}:${fixture.request.job_id}`)).toBeNull();
});

it('rechecks deployment support after Google approval and still refuses sponsor payment', async () => {
    const approve = google.getMockImplementation()!;
    google.mockImplementation(async (...args) => { const token = await approve(...args); healthy = false; return token; });
    await expect(wallet().signDelegateActions!(input())).rejects.toThrow('compact_upload_unavailable');
    expect(google).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled();
    expect(localStorage.getItem(`youtick:auth-lab:upload:testnet:market.testnet:${ACCOUNT}:${fixture.request.job_id}`)).toBeNull();
});
