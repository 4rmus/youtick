import { NEAR_AUTH_TESTNET_RPC } from './near-auth-lab';
import { actions, PublicKey, type Transaction } from 'near-api-js';
import { createHash } from 'node:crypto';
import type { PlaybackSessionAuthorization } from './device-session';

export const TICKET_GAS = 100_000_000_000_000n;
export const TICKET_NEAR_LIMIT = 120_000_000_000_000_000_000_000n;
const TEST_USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export function ticketConfig() {
    const market = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID || '';
    if (process.env.NEXT_PUBLIC_NEAR_NETWORK !== 'testnet'
        || process.env.NEXT_PUBLIC_VIDEO_ENVIRONMENT !== 'public-testnet'
        || process.env.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2 !== 'true'
        || market.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(market)
        || (process.env.NEXT_PUBLIC_USDC_CONTRACT_ID && process.env.NEXT_PUBLIC_USDC_CONTRACT_ID !== TEST_USDC)) throw new Error('ticket_disabled');
    return { market, usdc: TEST_USDC };
}

export function ticketRequest(publicationId: unknown, device: unknown, accountId: string, origin: string) {
    const { market } = ticketConfig();
    if (typeof publicationId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(publicationId)
        || !device || typeof device !== 'object' || Array.isArray(device)
        || Object.keys(device).sort().join(',') !== 'authorization_duration_ms,certificate_sha256,session_public_key'
        || !('session_public_key' in device) || typeof device.session_public_key !== 'string'
        || !device.session_public_key.startsWith('ed25519:')
        || !('certificate_sha256' in device) || typeof device.certificate_sha256 !== 'string'
        || !('authorization_duration_ms' in device) || device.authorization_duration_ms !== '2592000000') throw new Error('invalid_ticket_device');
    const key = PublicKey.fromString(device.session_public_key);
    if (key.data.length !== 32 || key.toString() !== device.session_public_key) throw new Error('invalid_ticket_device');
    const certificate = { account_id: accountId, authorization_duration_ms: '2592000000', contract_id: market,
        domain: 'youtick.device-session', network: 'testnet', origin_hash: sha256(origin), scopes: ['play'],
        session_public_key: device.session_public_key, version: '3' };
    // Fields above are in the same sorted order as canonicalDeviceCertificate.
    if (sha256(JSON.stringify(certificate)) !== device.certificate_sha256) throw new Error('invalid_ticket_device');
    return { publicationId, playbackSession: device as PlaybackSessionAuthorization };
}

export type TicketRequest = ReturnType<typeof ticketRequest>;

export async function canUsePlaybackDevice(records: unknown, expected: PlaybackSessionAuthorization, read: () => Promise<unknown>) {
    if (!Array.isArray(records)) return false;
    if (records.length === 0) return true;
    const device = await read();
    if (!device || typeof device !== 'object' || !('session_public_key' in device) || !('certificate_sha256' in device)
        || device.session_public_key !== expected.session_public_key || device.certificate_sha256 !== expected.certificate_sha256
        || !('authorized_at_ms' in device) || typeof device.authorized_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.authorized_at_ms)
        || !('expires_at_ms' in device) || typeof device.expires_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.expires_at_ms)) return false;
    const start = Number(device.authorized_at_ms), end = Number(device.expires_at_ms), now = Date.now();
    return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= now && end > now
        && end - start === Number(expected.authorization_duration_ms);
}

export function ticketAction(request: TicketRequest, price: string) {
    return actions.functionCall('ft_transfer_call', { receiver_id: ticketConfig().market, amount: price,
        memo: 'YouTick Livepeer ticket purchase', msg: JSON.stringify({ action: 'buy_ticket',
            publication_id: request.publicationId, playback_session: request.playbackSession }) }, TICKET_GAS, 1n);
}

export function parseTicketTransaction(tx: Transaction, origin: string) {
    const call = tx.actions.length === 1 ? tx.actions[0].functionCall : undefined;
    if (tx.receiverId !== ticketConfig().usdc || !call || Object.keys(tx.actions[0]).length !== 1
        || call.methodName !== 'ft_transfer_call' || call.gas !== TICKET_GAS || call.deposit !== 1n || call.args.length > 2048) throw new Error('invalid_ticket_transaction');
    const args = JSON.parse(Buffer.from(call.args).toString('utf8'));
    if (typeof args.amount !== 'string' || !/^[1-9][0-9]{0,19}$/.test(args.amount) || BigInt(args.amount) < 2_000_000n
        || typeof args.msg !== 'string') throw new Error('invalid_ticket_transaction');
    const message = JSON.parse(args.msg);
    const request = ticketRequest(message.publication_id, message.playback_session, tx.signerId, origin);
    const expected = ticketAction(request, args.amount).functionCall!;
    if (!Buffer.from(expected.args).equals(Buffer.from(call.args))) throw new Error('invalid_ticket_transaction');
    return { ...request, priceUsdc: args.amount as string };
}

// Only view queries, pinned to the caller's final block. Never registers or funds an account.
export async function readTicketState(accountId: string, request: TicketRequest, block: string, expectedPrice?: string) {
    const { market, usdc } = ticketConfig();
    const signal = AbortSignal.timeout(12_000);
    async function query(params: object) {
        const response = await fetch(NEAR_AUTH_TESTNET_RPC, { method: 'POST', cache: 'no-store', signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-lab-ticket',
                method: 'query', params: { ...params, block_id: block } }) });
        if (!response.ok) throw new Error('ticket_unavailable');
        const body = await response.json();
        if (body.error || !body.result || body.result.error !== undefined || body.result.block_hash !== block) throw new Error('ticket_unavailable');
        return body.result;
    }
    async function view(account: string, method: string, args: object) {
        const result = await query({ request_type: 'call_function', account_id: account, method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
        if (!Array.isArray(result.result) || result.result.length > 16_384
            || !result.result.every((v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('ticket_unavailable');
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(result.result)));
    }
    const publicationArgs = { publication_id: request.publicationId };
    const [publication, governance, entitled, token, metadata, buyerStorage, marketStorage, balance, devices] = await Promise.all([
        view(market, 'get_publication', publicationArgs), view(market, 'get_governance_state', {}),
        view(market, 'has_entitlement', { account_id: accountId, ...publicationArgs }), view(market, 'get_usdc_contract_id', {}),
        view(usdc, 'ft_metadata', {}), view(usdc, 'storage_balance_of', { account_id: accountId }),
        view(usdc, 'storage_balance_of', { account_id: market }), view(usdc, 'ft_balance_of', { account_id: accountId }),
        query({ request_type: 'view_state', account_id: market,
            prefix_base64: Buffer.from(`youtick:market:playback-devices:v1:${accountId}`).toString('base64') }),
    ]);
    if (!publication || publication.publication_id !== request.publicationId || publication.generation !== 1
        || publication.availability !== 'ACTIVE' || typeof publication.title !== 'string' || !publication.title.trim()
        || Buffer.byteLength(publication.title) > 200 || typeof publication.price_usdc !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(publication.price_usdc) || BigInt(publication.price_usdc) < 2_000_000n
        || (expectedPrice !== undefined && publication.price_usdc !== expectedPrice)
        || governance?.bridge_frozen !== false || governance?.new_purchases_paused !== false || entitled !== false
        || token !== usdc || metadata?.decimals !== 6) throw new Error('ticket_not_available');
    if (!buyerStorage || !marketStorage || typeof buyerStorage.total !== 'string' || typeof marketStorage.total !== 'string'
        || !/^[1-9][0-9]{0,38}$/.test(buyerStorage.total) || !/^[1-9][0-9]{0,38}$/.test(marketStorage.total)
        || typeof balance !== 'string' || !/^[0-9]{1,39}$/.test(balance) || BigInt(balance) < BigInt(publication.price_usdc)) throw new Error('ticket_balance_required');
    if (!await canUsePlaybackDevice(devices.values, request.playbackSession, () => view(market, 'get_playback_device', {
        account_id: accountId, session_public_key: request.playbackSession.session_public_key,
    }))) throw new Error('ticket_first_device_only');
    return { priceUsdc: publication.price_usdc as string, title: publication.title as string, marketContractId: market,
        usdcContractId: usdc, publicationId: request.publicationId, playbackSession: request.playbackSession };
}
