import { authSessionSettings, type AuthSurface } from './near-auth-session-settings';
import { COMPACT_UPLOAD_PREFIX, packCompactUpload, unpackCompactUpload } from '../../../protocol/paid-media-livepeer-v1/compact-upload';
import { hasTitleContent } from '../../../protocol/paid-media-livepeer-v1/title';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { actions, baseEncode, buildDelegateAction, encodeDelegateAction, encodeSignedDelegate, PublicKey, Signature } from 'near-api-js';
import { nearAuthAccountPreflight } from './near-auth-account-preflight';
import { checkSigningAccount, rpc, sessionKey, verifyApproval, verifyMpcResponse } from './near-auth-signing-server';
import { parseSponsoredUploadQuote } from './livepeer-upload';
import { canUsePlaybackDevice, ticketConfig, ticketRequest } from './near-auth-ticket-purchase';
import { NEAR_CONFIG } from './constants';

function uploadConfig() {
    const config = ticketConfig();
    if (process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 !== 'true'
        || process.env.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS !== 'true'
        || config.market !== NEAR_CONFIG.marketContractId || config.usdc !== NEAR_CONFIG.usdcContractId) throw new Error('upload_disabled');
    return config;
}

async function checkCompactBridge(market: string) {
    try {
        const url = new URL('/__health', process.env.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_bridge');
        const response = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        const health = await response.json();
        if (!response.ok || health.status !== 'ok' || health.service !== 'livepeer-bridge'
            || health.compactUpload?.version !== 1 || health.compactUpload.network !== 'testnet'
            || health.compactUpload.market !== market || health.sponsoredUploadRelayReady !== true
            || health.newUploadReady !== true) throw new Error('unsupported_bridge');
    } catch { throw new Error('compact_upload_unavailable'); }
}

async function uploadArgs(encoded: unknown, accountId: string, origin: string) {
    const { market } = uploadConfig();
    if (typeof encoded !== 'string' || encoded.length > 5500 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('invalid_upload');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new Error('invalid_upload');
    const args = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const compact = typeof args.msg === 'string' && args.msg.startsWith(COMPACT_UPLOAD_PREFIX);
    if (args.receiver_id !== market || (compact ? 'memo' in args : args.memo !== 'YouTick creator upload fee') || typeof args.msg !== 'string') throw new Error('invalid_upload');
    const msg = compact ? await unpackCompactUpload(args.msg, { network: 'testnet', market, creator: accountId, usdc: uploadConfig().usdc,
        keyString: bytes => PublicKey.fromString(`ed25519:${baseEncode(bytes)}`).toString() }) : JSON.parse(args.msg);
    const request: Record<string, string> = {};
    for (const field of ['creator_id', 'job_id', 'title', 'price_usdc', 'expected_source_bytes', 'profile_id',
        'profile_config_sha256', 'upload_public_key', 'upload_key_expires_at_ms']) {
        if (typeof msg[field] !== 'string') throw new Error('invalid_upload');
        request[field] = msg[field];
    }
    if (request.creator_id !== accountId || !/^[A-Za-z0-9._:-]{1,128}$/.test(request.job_id)
        || !hasTitleContent(request.title) || Buffer.byteLength(request.title) > 200
        || !/^[1-9][0-9]{0,19}$/.test(request.price_usdc) || BigInt(request.price_usdc) < 2_000_000n
        || !/^[1-9][0-9]{0,9}$/.test(request.expected_source_bytes) || BigInt(request.expected_source_bytes) > 5_000_000_000n
        || request.profile_id !== 'paid-media-livepeer-v1' || !/^[a-f0-9]{64}$/.test(request.profile_config_sha256)
        || !request.upload_public_key.startsWith('ed25519:')
        || PublicKey.fromString(request.upload_public_key).toString() !== request.upload_public_key
        || !/^[1-9][0-9]{12,15}$/.test(request.upload_key_expires_at_ms)
        || BigInt(request.upload_key_expires_at_ms) <= BigInt(Date.now())
        || BigInt(request.upload_key_expires_at_ms) > BigInt(Date.now()) + 86_400_000n) throw new Error('invalid_upload');
    const playbackSession = ticketRequest(request.job_id, msg.playback_session, accountId, origin).playbackSession;
    const quote = await parseSponsoredUploadQuote({ request, quote: msg.sponsor_quote, signature: msg.sponsor_quote_signature,
        public_key_version: msg.sponsor_quote?.quote_key_version }, request);
    const expected = { receiver_id: market, amount: quote.quote.total_fee_usdc, ...(compact ? {} : { memo: 'YouTick creator upload fee' }),
        msg: compact ? args.msg : JSON.stringify({ action: 'create_paid_job', ...request, playback_session: playbackSession,
            sponsor_quote: quote.quote, sponsor_quote_signature: quote.signature }) };
    if (!bytes.equals(Buffer.from(JSON.stringify(expected)))) throw new Error('invalid_upload');
    return { args: expected, request, quote: quote.quote, playbackSession };
}

async function checkUpload(delegate: ReturnType<typeof buildDelegateAction>, sponsor: string, parsed: Awaited<ReturnType<typeof uploadArgs>>, sponsorBudget: boolean) {
    const config = uploadConfig();
    const key = await checkSigningAccount({ signerId: delegate.senderId, publicKey: delegate.publicKey, nonce: delegate.nonce }, sponsor, sponsorBudget, 0n, 'upload');
    const checkHeight = (height: unknown) => {
        if (typeof height !== 'number' || !Number.isSafeInteger(height) || height <= 0
            || BigInt(height) < BigInt(parsed.quote.quote_block_height)
            || BigInt(height) > BigInt(parsed.quote.max_delegate_block_height)
            || BigInt(height) >= delegate.maxBlockHeight
            || delegate.maxBlockHeight > BigInt(parsed.quote.max_delegate_block_height) + 200n) throw new Error('upload_expired');
    };
    checkHeight(key.block_height);
    const view = async (account_id: string, method_name: string, args: object) => {
        const result = await rpc('query', { request_type: 'call_function', block_id: key.block_hash, account_id, method_name,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
        if (result.block_hash !== key.block_hash || !Array.isArray(result.result) || result.result.length > 16384
            || !result.result.every((v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('upload_unavailable');
        return JSON.parse(Buffer.from(result.result).toString());
    };
    if (parsed.args.msg.startsWith(COMPACT_UPLOAD_PREFIX)) {
        try {
            const [, version] = await Promise.all([checkCompactBridge(config.market), view(config.market, 'get_compact_upload_version', {})]);
            if (version !== 1) throw new Error('unsupported_market');
        } catch { throw new Error('compact_upload_unavailable'); }
    }
    const [job, governance, token, balance, buyerStorage, marketStorage, version, devices] = await Promise.all([
        view(config.market, 'get_media_job', { job_id: parsed.request.job_id }), view(config.market, 'get_governance_state', {}),
        view(config.market, 'get_usdc_contract_id', {}), view(config.usdc, 'ft_balance_of', { account_id: delegate.senderId }),
        view(config.usdc, 'storage_balance_of', { account_id: delegate.senderId }), view(config.usdc, 'storage_balance_of', { account_id: config.market }),
        view(config.market, 'get_quote_key_version', {}), rpc('query', { request_type: 'view_state', account_id: config.market, block_id: key.block_hash,
            prefix_base64: Buffer.from(`youtick:market:playback-devices:v1:${delegate.senderId}`).toString('base64') }),
    ]);
    if (job !== null || governance?.bridge_frozen !== false || governance?.new_purchases_paused !== false
        || token !== config.usdc || version !== parsed.quote.quote_key_version
        || typeof balance !== 'string' || !/^[0-9]{1,39}$/.test(balance) || BigInt(balance) < BigInt(parsed.quote.total_fee_usdc)
        || !buyerStorage || !marketStorage || typeof buyerStorage.total !== 'string' || typeof marketStorage.total !== 'string'
        || !/^[1-9][0-9]{0,38}$/.test(buyerStorage.total) || !/^[1-9][0-9]{0,38}$/.test(marketStorage.total)) throw new Error('upload_not_ready');
    if (devices.block_hash !== key.block_hash || !await canUsePlaybackDevice(devices.values, parsed.playbackSession,
        () => view(config.market, 'get_playback_device', {
            account_id: delegate.senderId, session_public_key: parsed.playbackSession.session_public_key,
        }))) throw new Error('upload_first_device_only');
    const latest = await rpc('block', { finality: 'final' });
    checkHeight(latest.header?.height);
    if (BigInt(parsed.quote.expires_at_ms) <= BigInt(Date.now())) throw new Error('authorization_expired');
}

function delegateFor(accountId: string, publicKey: string, nonce: string, maxBlockHeight: string, args: object) {
    if (!/^[1-9][0-9]{0,19}$/.test(nonce) || !/^[1-9][0-9]{0,19}$/.test(maxBlockHeight)) throw new Error('invalid_upload');
    return buildDelegateAction({ senderId: accountId, receiverId: uploadConfig().usdc, publicKey: PublicKey.fromString(publicKey),
        nonce: BigInt(nonce), maxBlockHeight: BigInt(maxBlockHeight), actions: [actions.functionCall('ft_transfer_call', args, 100_000_000_000_000n, 1n)] });
}

export async function prepareGoogleUpload(subject: string, origin: string, sponsor: unknown, encodedArgs: unknown, surface: AuthSurface = 'lab') {
    uploadConfig();
    if (typeof sponsor !== 'string' || sponsor.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(sponsor) || sponsor.length < 2) throw new Error('invalid_sponsor');
    const account = await nearAuthAccountPreflight(subject);
    if (!account.accounts.includes(account.implicitAccount) || sponsor === account.implicitAccount) throw new Error('account_required');
    let parsed = await uploadArgs(encodedArgs, account.implicitAccount, origin);
    if (!parsed.args.msg.startsWith(COMPACT_UPLOAD_PREFIX)) {
        const msg = await packCompactUpload(JSON.parse(parsed.args.msg), key => PublicKey.fromString(key).data, {
            network: 'testnet', market: uploadConfig().market, creator: account.implicitAccount, usdc: uploadConfig().usdc,
            keyString: bytes => `ed25519:${baseEncode(bytes)}`,
        });
        encodedArgs = Buffer.from(JSON.stringify({ receiver_id: parsed.args.receiver_id, amount: parsed.args.amount, msg })).toString('base64');
        // Review, ticket and signed delegate all use the same decoded compact bytes.
        parsed = await uploadArgs(encodedArgs, account.implicitAccount, origin);
    }
    const key = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: account.implicitAccount, public_key: account.publicKey });
    if (!Number.isSafeInteger(key.nonce) || key.nonce < 0 || !Number.isSafeInteger(key.block_height) || key.block_height <= 0) throw new Error('account_changed');
    const nonce = (BigInt(key.nonce) + 1n).toString();
    const maxBlockHeight = (BigInt(key.block_height) + 200n).toString();
    const delegate = delegateFor(account.implicitAccount, account.publicKey, nonce, maxBlockHeight, parsed.args);
    await checkUpload(delegate, sponsor, parsed, true);
    const bytes = encodeDelegateAction(delegate);
    if (bytes.length > 4096) throw new Error('invalid_upload');
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Math.min(now + 120, Math.floor(Number(parsed.quote.expires_at_ms) / 1000));
    if (expiresAt <= now) throw new Error('authorization_expired');
    const ticket = await new EncryptJWT({ sponsor, accountId: account.implicitAccount, publicKey: account.publicKey, nonce, maxBlockHeight, encodedArgs })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer(surface === 'lab' ? 'youtick-auth-lab-upload' : 'youtick-auth-v1-upload').setAudience(origin)
        .setSubject(subject).setIssuedAt(now).setExpirationTime(expiresAt).encrypt(sessionKey(surface));
    return { ticket, accountId: account.implicitAccount, sponsor, jobId: parsed.request.job_id, title: parsed.request.title, priceUsdc: parsed.request.price_usdc,
        sourceBytes: parsed.request.expected_source_bytes, totalFeeUsdc: parsed.quote.total_fee_usdc,
        playbackSession: parsed.playbackSession, delegate: Array.from(bytes), expiresAt: expiresAt * 1000 };
}

export async function readUpload(ticket: unknown, subject: string, origin: string, surface: AuthSurface = 'lab') {
    if (typeof ticket !== 'string' || ticket.length > 16384) throw new Error('invalid_upload');
    const { payload } = await jwtDecrypt(ticket, sessionKey(surface), { issuer: surface === 'lab' ? 'youtick-auth-lab-upload' : 'youtick-auth-v1-upload', audience: origin,
        keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'], requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: 120 });
    if (payload.sub !== subject || typeof payload.accountId !== 'string' || !/^[a-f0-9]{64}$/.test(payload.accountId)
        || typeof payload.publicKey !== 'string' || !payload.publicKey.startsWith('ed25519:')
        || Buffer.from(PublicKey.fromString(payload.publicKey).data).toString('hex') !== payload.accountId
        || typeof payload.sponsor !== 'string' || typeof payload.nonce !== 'string' || typeof payload.maxBlockHeight !== 'string') throw new Error('invalid_upload');
    const parsed = await uploadArgs(payload.encodedArgs, payload.accountId, origin);
    const delegate = delegateFor(payload.accountId, payload.publicKey, payload.nonce, payload.maxBlockHeight, parsed.args);
    return { delegate, parsed, sponsor: payload.sponsor, bytes: encodeDelegateAction(delegate), expiresAtMs: payload.exp! * 1000 };
}

export async function authorizeGoogleUpload(subject: string, origin: string, ticket: unknown, token: unknown,
    onCheck?: (stage: 'upload_review' | 'google_approval' | 'upload_preflight') => void, surface: AuthSurface = 'lab') {
    onCheck?.('upload_review');
    const intent = await readUpload(ticket, subject, origin, surface);
    onCheck?.('google_approval');
    const approved = await verifyApproval(token, subject, intent.bytes, authSessionSettings(surface).clientId);
    onCheck?.('upload_preflight');
    await checkUpload(intent.delegate, intent.sponsor, intent.parsed, true);
    if (Math.min(approved.expiresAtMs, intent.expiresAtMs) <= Date.now()) throw new Error('authorization_expired');
    return { approvalExpiresAtMs: approved.expiresAtMs, receiverId: 'fast-auth.testnet', actions: [{ type: 'FunctionCall' as const, params: { methodName: 'sign',
        args: { guard_id: 'jwt#https://login.testnet.fast-auth.com/', verify_payload: approved.token, sign_payload: Array.from(intent.bytes), algorithm: 'eddsa' },
        gas: '300000000000000', deposit: '1' } }] };
}

export async function completeGoogleUpload(subject: string, origin: string, ticket: unknown, outerHash: unknown) {
    const intent = await readUpload(ticket, subject, origin);
    const signature = await verifyMpcResponse(subject, intent.bytes, intent.delegate.publicKey.data, intent.sponsor, outerHash);
    await checkUpload(intent.delegate, intent.sponsor, intent.parsed, false);
    return { accountId: intent.delegate.senderId, jobId: intent.parsed.request.job_id,
        signedDelegate: Buffer.from(encodeSignedDelegate({ delegateAction: intent.delegate,
            signature: new Signature({ keyType: 0, data: signature }) })).toString('base64') };
}
