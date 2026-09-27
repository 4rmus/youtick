import type { AuthSurface } from './near-auth-session-settings';
import { authSessionSettings } from './near-auth-session-settings';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createRemoteJWKSet, EncryptJWT, jwtDecrypt, jwtVerify } from 'jose';
import { actions, baseDecode, baseEncode, createTransaction, decodeTransaction, encodeTransaction, PublicKey, Signature, SignedTransaction } from 'near-api-js';
import { NEAR_AUTH_LAB_DOMAIN, NEAR_AUTH_TESTNET_RPC } from './near-auth-lab';
import { nearAuthAccountPreflight } from './near-auth-account-preflight';
import { parseTicketTransaction, readTicketState, ticketAction, ticketConfig, ticketRequest, TICKET_NEAR_LIMIT } from './near-auth-ticket-purchase';

const ISSUER = `https://${NEAR_AUTH_LAB_DOMAIN}/`;
const AUDIENCE = 'auth0.jwt.fast-auth.testnet';
const KEYS = createRemoteJWKSet(new URL('.well-known/jwks.json', ISSUER), { timeoutDuration: 5000 });
const OUTER_GAS = 300000000000000n;
const OUTER_LIMIT = 350000000000000000000000n;
const INNER_LIMIT = 2000000000000000000000n;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest();
const accountId = (value: unknown): value is string => typeof value === 'string' && value.length >= 2 && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
const integer = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{1,39}$/.test(value)) throw new Error('invalid_amount');
    return BigInt(value);
};
export function sessionKey(surface: AuthSurface = 'lab') {
    const secret = authSessionSettings(surface).secret;
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('not_configured');
    return Buffer.from(secret, 'hex');
}
export async function rpc(method: string, params: unknown) {
    const response = await fetch(NEAR_AUTH_TESTNET_RPC, { method: 'POST', cache: 'no-store',
        signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-lab-signing', method, params }),
    });
    if (!response.ok) throw new Error('rpc_unavailable');
    const body = await response.json();
    if (body.error || !body.result || body.result.error) throw new Error('rpc_unavailable');
    return body.result;
}

export async function checkSigningAccount(tx: Pick<ReturnType<typeof decodeTransaction>, 'signerId' | 'publicKey' | 'nonce'>, sponsor: string, requireSponsorBudget: boolean, innerLimit: bigint, purpose: 'demo' | 'ticket' | 'upload' | 'device' = 'demo') {
    const query = (request_type: string, account: string, public_key?: string) => rpc('query', {
        request_type, finality: 'final', account_id: account, ...(public_key ? { public_key } : {}),
    });
    const key = await query('view_access_key', tx.signerId, tx.publicKey.toString());
    if (key.permission !== 'FullAccess' || !Number.isSafeInteger(key.nonce) || key.nonce < 0
        || BigInt(key.nonce) + 1n !== tx.nonce || !hash(key.block_hash)) throw new Error('account_changed');
    const [account, payer, config, price] = await Promise.all([
        query('view_account', tx.signerId), query('view_account', sponsor),
        rpc('EXPERIMENTAL_protocol_config', { block_id: key.block_hash }), rpc('gas_price', [key.block_hash]),
    ]);
    const reserve = (purpose === 'ticket' || purpose === 'device') ? integer(config.runtime_config.storage_amount_per_byte) * integer(String(account.storage_usage)) : 0n;
    // PV87: ordinary ticket/device and legacy Ed25519 FullAccess upload only; demo and unknown versions stay closed.
    if ((config.protocol_version !== 85 && !(purpose !== 'demo' && config.protocol_version === 87)) || integer(price.gas_price) > 1000000000n
        || integer(price.gas_price) <= 0n
        || integer(config.runtime_config.min_gas_purchase_price) !== 1000000000n
        || integer(account.amount) - integer(account.locked) - reserve < innerLimit
        || (requireSponsorBudget && integer(payer.amount) - integer(payer.locked) < OUTER_LIMIT)) throw new Error('budget_not_verified');
    const expected = { paused: false, mpc_address: 'v1.signer-prod.testnet', mpc_domain_id: 1 };
    await Promise.all(Object.entries(expected).map(async ([method_name, value]) => {
        const result = await rpc('query', { request_type: 'call_function', block_id: key.block_hash,
            account_id: 'fast-auth.testnet', method_name, args_base64: 'e30=' });
        if (!Array.isArray(result.result) || result.result.length > 256
            || JSON.parse(Buffer.from(result.result).toString('utf8')) !== value) throw new Error('provider_changed');
    }));
    return key;
}

async function checkCurrent(tx: ReturnType<typeof decodeTransaction>, sponsor: string, requireSponsorBudget: boolean, origin: string) {
    const purchase = tx.actions[0].functionCall ? parseTicketTransaction(tx, origin) : null;
    const key = await checkSigningAccount(tx, sponsor, requireSponsorBudget, purchase ? TICKET_NEAR_LIMIT : INNER_LIMIT, purchase ? 'ticket' : 'demo');
    if (purchase) await readTicketState(tx.signerId, purchase, key.block_hash, purchase.priceUsdc);
    return key;
}

export async function readIntent(ticket: unknown, subject: string, origin: string, surface: AuthSurface = 'lab') {
    if (typeof ticket !== 'string' || ticket.length > 8192) throw new Error('invalid_intent');
    const { payload } = await jwtDecrypt(ticket, sessionKey(surface), { issuer: surface === 'lab' ? 'youtick-auth-lab-signing' : 'youtick-auth-v1-signing', audience: origin,
        keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
        requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: 300,
    });
    if (payload.sub !== subject || !accountId(payload.sponsor) || typeof payload.transaction !== 'string'
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.transaction) || payload.transaction.length > 4096) throw new Error('invalid_intent');
    const bytes = Buffer.from(payload.transaction, 'base64');
    const tx = decodeTransaction(bytes);
    if (!Buffer.from(encodeTransaction(tx)).equals(bytes)
        || !/^[a-f0-9]{64}$/.test(tx.signerId) || !tx.publicKey.toString().startsWith('ed25519:')
        || Buffer.from(tx.publicKey.data).toString('hex') !== tx.signerId
        || tx.actions.length !== 1 || Object.keys(tx.actions[0]).length !== 1
        || payload.sponsor === tx.signerId) throw new Error('invalid_intent');
    const purchase = payload.kind === 'ticket' ? parseTicketTransaction(tx, origin) : null;
    if (!purchase && (payload.kind !== undefined || tx.signerId !== tx.receiverId || tx.actions[0].transfer?.deposit !== 1n)) throw new Error('invalid_intent');
    return { tx, bytes, sponsor: payload.sponsor, purchase, expiresAtMs: payload.exp! * 1000 };
}

export async function verifyApproval(token: unknown, subject: string, bytes: Uint8Array, clientId = process.env.NEAR_AUTH_LAB_CLIENT_ID) {
    if (!clientId) throw new Error('not_configured');
    if (typeof token !== 'string' || new TextEncoder().encode(token).length > 7168) throw new Error('invalid_approval');
    const { payload } = await jwtVerify(token, KEYS, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['RS256'],
        requiredClaims: ['sub', 'iat', 'exp', 'azp', 'scope', 'fatxn'], maxTokenAge: 300,
    });
    const allowed = new Set(['iss', 'sub', 'aud', 'iat', 'exp', 'nbf', 'azp', 'scope', 'fatxn', 'jti', 'gty']);
    if (Object.keys(payload).some((field) => !allowed.has(field))) throw new Error('unapproved_claims');
    if (payload.sub !== subject || payload.azp !== clientId
        || typeof payload.scope !== 'string' || !payload.scope.split(' ').includes('transaction:sign')
        || !Array.isArray(payload.fatxn) || payload.fatxn.length !== bytes.length
        || !payload.fatxn.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
        || !Buffer.from(payload.fatxn).equals(bytes)) throw new Error('invalid_approval');
    if (typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp * 1000)) throw new Error('invalid_approval');
    return { token, expiresAtMs: payload.exp * 1000 };
}

export async function prepareGoogleSigning(subject: string, origin: string, sponsor: unknown, purchase?: { publicationId: unknown; playbackSession: unknown }, surface: AuthSurface = 'lab') {
    if (!accountId(sponsor)) throw new Error('invalid_sponsor');
    const account = await nearAuthAccountPreflight(subject);
    if (!account.accounts.includes(account.implicitAccount) || sponsor === account.implicitAccount) throw new Error('account_required');
    const access = await rpc('query', { request_type: 'view_access_key', finality: 'final',
        account_id: account.implicitAccount, public_key: account.publicKey });
    if (access.permission !== 'FullAccess' || !Number.isSafeInteger(access.nonce) || access.nonce < 0 || !hash(access.block_hash)) throw new Error('account_changed');
    const ticketReview = purchase ? await readTicketState(account.implicitAccount,
        ticketRequest(purchase.publicationId, purchase.playbackSession, account.implicitAccount, origin), access.block_hash) : undefined;
    const tx = createTransaction(account.implicitAccount, PublicKey.fromString(account.publicKey), ticketReview ? ticketConfig().usdc : account.implicitAccount,
        BigInt(access.nonce) + 1n, [ticketReview ? ticketAction(ticketReview, ticketReview.priceUsdc) : actions.transfer(1n)], baseDecode(access.block_hash));
    const bytes = encodeTransaction(tx);
    // Validate the wire representation; v7 constructors add an enum field absent after decoding.
    await checkCurrent(decodeTransaction(bytes), sponsor, true, origin);
    const now = Math.floor(Date.now() / 1000);
    const ticket = await new EncryptJWT({ sponsor, transaction: Buffer.from(bytes).toString('base64'), ...(ticketReview ? { kind: 'ticket' } : {}) })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer(surface === 'lab' ? 'youtick-auth-lab-signing' : 'youtick-auth-v1-signing').setAudience(origin)
        .setSubject(subject).setIssuedAt(now).setExpirationTime(now + 300).encrypt(sessionKey(surface));
    return { ticket, accountId: account.implicitAccount, publicKey: account.publicKey, sponsor,
        transaction: Array.from(bytes), transactionHash: baseEncode(digest(bytes)), expiresAt: (now + 300) * 1000,
        ...(ticketReview ? { purchase: ticketReview } : {}) };
}

export async function authorizeGoogleSigning(subject: string, origin: string, ticket: unknown, token: unknown, surface: AuthSurface = 'lab') {
    const intent = await readIntent(ticket, subject, origin, surface);
    const approved = await verifyApproval(token, subject, intent.bytes, authSessionSettings(surface).clientId);
    await checkCurrent(intent.tx, intent.sponsor, true, origin);
    const approvalExpiresAtMs = Math.min(approved.expiresAtMs, intent.expiresAtMs);
    if (approvalExpiresAtMs <= Date.now()) throw new Error('authorization_expired');
    return { approvalExpiresAtMs, receiverId: 'fast-auth.testnet', actions: [{ type: 'FunctionCall' as const, params: {
        methodName: 'sign', args: { guard_id: `jwt#${ISSUER}`, verify_payload: approved.token,
            sign_payload: Array.from(intent.bytes), algorithm: 'eddsa' }, gas: OUTER_GAS.toString(), deposit: '1',
    } }] };
}

export async function verifyMpcResponse(subject: string, bytes: Uint8Array, publicKeyBytes: Uint8Array, sponsor: string, outerHash: unknown) {
    if (!hash(outerHash)) throw new Error('invalid_hash');
    const outcome = await rpc('tx', { tx_hash: outerHash, sender_account_id: sponsor, wait_until: 'FINAL' });
    const tx = outcome.transaction;
    const call = tx?.actions?.length === 1 ? tx.actions[0].FunctionCall : null;
    if (outcome.final_execution_status !== 'FINAL' || typeof outcome.status?.SuccessValue !== 'string'
        || tx?.hash !== outerHash || tx.signer_id !== sponsor || tx.receiver_id !== 'fast-auth.testnet'
        || call?.method_name !== 'sign' || String(call?.gas) !== OUTER_GAS.toString() || call.deposit !== '1'
        || typeof call.args !== 'string' || call.args.length > 32768) throw new Error('outer_not_verified');
    const args = JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
    if (args.guard_id !== `jwt#${ISSUER}` || args.algorithm !== 'eddsa'
        || !Array.isArray(args.sign_payload) || !Buffer.from(args.sign_payload).equals(bytes)) throw new Error('outer_not_verified');
    await verifyApproval(args.verify_payload, subject, bytes);
    if (!Array.isArray(outcome.receipts_outcome)) throw new Error('outer_not_verified');
    const outcomes = [outcome.transaction_outcome, ...outcome.receipts_outcome];
    const burnt = outcomes.reduce((sum, receipt) => {
        if (!receipt?.outcome?.status || 'Failure' in receipt.outcome.status) throw new Error('outer_not_verified');
        return sum + integer(receipt.outcome.tokens_burnt);
    }, 0n);
    if (burnt + 1n > OUTER_LIMIT) throw new Error('budget_not_verified');
    if (outcome.status.SuccessValue.length > 4096) throw new Error('invalid_signature');
    const response = JSON.parse(Buffer.from(outcome.status.SuccessValue, 'base64').toString('utf8'));
    if (!Array.isArray(response?.signature) || response.signature.length !== 64
        || !response.signature.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('invalid_signature');
    const signature = Buffer.from(response.signature);
    const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicKeyBytes]), format: 'der', type: 'spki' });
    if (!verify(null, digest(bytes), publicKey, signature)) throw new Error('invalid_signature');
    return signature;
}

export async function completeGoogleSigning(subject: string, origin: string, ticket: unknown, outerHash: unknown) {
    const intent = await readIntent(ticket, subject, origin);
    const signature = await verifyMpcResponse(subject, intent.bytes, intent.tx.publicKey.data, intent.sponsor, outerHash);
    await checkCurrent(intent.tx, intent.sponsor, false, origin);
    const signed = new SignedTransaction({ transaction: intent.tx, signature: new Signature({ keyType: 0, data: signature }) });
    return { signedTransaction: Buffer.from(encodeTransaction(signed)).toString('base64'),
        transactionHash: baseEncode(digest(intent.bytes)), accountId: intent.tx.signerId };
}

export async function verifyGoogleTransaction(subject: string, origin: string, ticket: unknown) {
    const { tx, bytes, purchase } = await readIntent(ticket, subject, origin);
    const transactionHash = baseEncode(digest(bytes));
    const outcome = await rpc('tx', { tx_hash: transactionHash, sender_account_id: tx.signerId, wait_until: 'FINAL' });
    const actual = outcome.transaction;
    if (outcome.final_execution_status !== 'FINAL' || typeof outcome.status?.SuccessValue !== 'string'
        || actual?.hash !== transactionHash || actual.signer_id !== tx.signerId || actual.receiver_id !== tx.receiverId
        || actual.public_key !== tx.publicKey.toString() || actual.actions?.length !== 1
        || !Array.isArray(outcome.receipts_outcome)) throw new Error('inner_not_verified');
    if (purchase) {
        const expected = tx.actions[0].functionCall!;
        const call = actual.actions[0].FunctionCall;
        if (!Number.isSafeInteger(actual.nonce) || BigInt(actual.nonce) !== tx.nonce
            || call?.method_name !== expected.methodName || String(call?.gas) !== expected.gas.toString() || call?.deposit !== '1'
            || call?.args !== Buffer.from(expected.args).toString('base64')
            || JSON.parse(Buffer.from(outcome.status.SuccessValue, 'base64').toString()) !== purchase.priceUsdc) throw new Error('ticket_not_settled');
        const { market } = ticketConfig();
        const purchased = outcome.receipts_outcome.some((receipt: { outcome?: { executor_id?: unknown; logs?: unknown } }) => receipt.outcome?.executor_id === market
            && Array.isArray(receipt.outcome.logs) && receipt.outcome.logs.some((log: unknown) => {
                if (typeof log !== 'string' || !log.startsWith('EVENT_JSON:')) return false;
                try {
                    const event = JSON.parse(log.slice(11));
                    return event.standard === 'youtick_market' && event.version === '1.0.0' && event.event === 'entitlement_purchased'
                        && Array.isArray(event.data) && event.data.some((data: Record<string, unknown>) => data.account_id === tx.signerId
                            && data.contract_id === market && data.publication_id === purchase.publicationId
                            && data.asset === 'USDC' && data.amount === purchase.priceUsdc);
                } catch { return false; }
            }));
        if (!purchased) throw new Error('ticket_not_settled');
        const access = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: tx.signerId, public_key: tx.publicKey.toString() });
        if (access.permission !== 'FullAccess' || !hash(access.block_hash)) throw new Error('ticket_not_settled');
        const view = async (method_name: string, args: object) => {
            const result = await rpc('query', { request_type: 'call_function', block_id: access.block_hash, account_id: market,
                method_name, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
            if (result.block_hash !== access.block_hash || !Array.isArray(result.result) || result.result.length > 4096
                || !result.result.every((v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('ticket_not_settled');
            return JSON.parse(Buffer.from(result.result).toString());
        };
        const [entitled, device] = await Promise.all([
            view('has_entitlement', { account_id: tx.signerId, publication_id: purchase.publicationId }),
            view('get_playback_device', { account_id: tx.signerId, session_public_key: purchase.playbackSession.session_public_key }),
        ]);
        if (entitled !== true || device?.session_public_key !== purchase.playbackSession.session_public_key
            || device.certificate_sha256 !== purchase.playbackSession.certificate_sha256 || device.authorizing_public_key !== tx.publicKey.toString()
            || typeof device.authorized_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.authorized_at_ms)
            || typeof device.expires_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.expires_at_ms)
            || !Number.isSafeInteger(Number(device.authorized_at_ms)) || !Number.isSafeInteger(Number(device.expires_at_ms))
            || Number(device.expires_at_ms) - Number(device.authorized_at_ms) !== 2592000000
            || Number(device.authorized_at_ms) > Date.now() || Number(device.expires_at_ms) <= Date.now()) throw new Error('ticket_not_settled');
    } else if (actual.actions[0].Transfer?.deposit !== '1') throw new Error('inner_not_verified');
    const burnt = [outcome.transaction_outcome, ...outcome.receipts_outcome].reduce((sum, receipt) => {
        if (!receipt?.outcome?.status || 'Failure' in receipt.outcome.status) throw new Error('inner_not_verified');
        return sum + integer(receipt.outcome.tokens_burnt);
    }, 0n);
    if (burnt + 1n > (purchase ? TICKET_NEAR_LIMIT : INNER_LIMIT)) throw new Error('budget_not_verified');
    return { verified: true, transactionHash, feeYocto: burnt.toString() };
}
