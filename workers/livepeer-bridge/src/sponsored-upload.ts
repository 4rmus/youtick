import {
    COMPACT_UPLOAD_PREFIX,
    unpackCompactUpload,
} from '../../../protocol/paid-media-livepeer-v1/compact-upload';
import { hasTitleContent } from '../../../protocol/paid-media-livepeer-v1/title';
import profiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';
import {
    KeyPairSigner,
    SCHEMA,
    actions,
    baseDecode,
    baseEncode,
    createTransaction,
    encodeDelegateAction,
    encodeSignedDelegate,
    type SignedDelegate,
} from 'near-api-js';
import { deserialize } from 'borsh';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import type { Env } from './env';
import type { JsonObject, MediaProfileId, OnChainJob } from './types';
import {
    MAX_CONTROL_BODY_BYTES,
    MAX_SOURCE_BYTES,
    PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES,
    MIN_CREATOR_UPLOAD_FEE_USD_MICROS,
    CREATOR_FEE_QUOTE_LIFETIME_MS,
    SPONSORED_RELAY_REJECTION_CODES,
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
    SHA256_PATTERN,
    SESSION_KEY_PATTERN,
} from './constants';
import {
    formatLog,
    constantTimeEqual,
    readJsonObject,
    requireObject,
    requireExactKeys,
    sha256Hex,
    sha256BytesHex,
    allowedOrigins,
    base64Decode,
    bytesToBase64,
    errorStatus,
    safeErrorCode,
    json,
    withCors,
} from './helpers';
import {
    isPublicTestnetEnvironment,
    isPublicBetaPacket,
    usdcContractId,
    validSponsoredUploadQuoteConfig,
    validSponsoredUploadRelayConfig,
} from './config';
import { admissionObjectName } from './object-names';
import {
    readFinalBlock,
    readFinalMediaJob,
    readFinalPublicTestnetBetaState,
    hasFinalPublicTestnetBetaJobToday,
    sendTransaction,
    queryTransactionForAccount,
    nearRpcRaw,
} from './near-rpc';
import { requirePublicUploadPolicy, enforcePublicBetaAccountRateLimit } from './public-testnet-beta';
import { supportedMediaProfile } from './provider-registry';
import { rememberCreatorPaidJob } from './creator-pending-upload';
import { enforceCreatorFeeQuoteRateLimit, importCreatorFeeQuotePrivateKey } from './creator-fee-quotes';
import { parsePlaybackSessionAuthorization } from './playback-v2';

type SponsoredPaidJobRequest = {
    creator_id: string;
    job_id: string;
    title: string;
    price_usdc: string;
    expected_source_bytes: string;
    profile_id: MediaProfileId;
    profile_config_sha256: string;
    upload_public_key: string;
    upload_key_expires_at_ms: string;
};
type SponsoredUploadQuote = {
    domain: 'youtick.sponsored-upload-quote';
    version: '1';
    network: 'testnet' | 'mainnet';
    contract_id: string;
    creator_id: string;
    job_id: string;
    request_sha256: string;
    expected_source_bytes: string;
    upload_fee_usdc: string;
    sponsor_fee_usdc: string;
    total_fee_usdc: string;
    delegate_receiver_id: string;
    delegate_method: 'ft_transfer_call';
    delegate_gas: string;
    delegate_deposit_yocto: '1';
    issued_at_ms: string;
    quote_block_height: string;
    max_delegate_block_height: string;
    expires_at_ms: string;
    quote_key_version: number;
    quote_id: string;
};
type ParsedSponsoredDelegate = {
    signedDelegate: SignedDelegate;
    signedDelegateBase64: string;
    signedDelegateSha256: string;
    publicKey: string;
    nonce: bigint;
    maxBlockHeight: bigint;
    request: SponsoredPaidJobRequest;
    quote: SponsoredUploadQuote;
    hasPlaybackSession?: boolean;
};
type SponsorRelayRecord = {
    schema: 'youtick.sponsor-relay.v1';
    state: 'PENDING' | 'RESERVED' | 'SIGNED' | 'BROADCAST';
    jobId: string;
    creator: string;
    payloadSha256: string;
    signedDelegateBase64: string;
    createdAtMs: number;
    nonce?: string;
    blockHash?: string;
    signedTxBase64?: string;
    txHash?: string;
};
const SPONSORED_UPLOAD_DELEGATE_GAS = 100_000_000_000_000n;
const SPONSORED_UPLOAD_FEE_USDC = 100_000n;
const SPONSORED_UPLOAD_MAX_BLOCK_WINDOW = 200n;
const SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS = 200n;
const SPONSOR_RELAY_KEY_PREFIX = 'sponsor-relay:';
const SPONSOR_RELAYER_LAST_NONCE_KEY = 'sponsor-relayer:last-nonce';

export async function forwardSponsoredUploadQuote(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        if (!env.LIVEPEER_CONTROL || !validSponsoredUploadQuoteConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        // creator_id is unsigned here, so only the route's IP limit applies; an account bucket would let anyone lock it.
        const input = parseSponsoredUploadQuoteRequest(await readJsonObject(request.clone()));
        if (isPublicBetaPacket(env)) {
            const [state, alreadyAdmittedToday] = await Promise.all([
                readFinalPublicTestnetBetaState(env),
                hasFinalPublicTestnetBetaJobToday(env, input.request.creator_id),
            ]);
            const now = Date.now();
            if (!state
                || state.version !== 1
                || state.closed_at_ms !== null
                || Number(state.upload_closes_at_ms) <= now
                || Number(state.ends_at_ms) <= now
                || state.total_job_count >= 10
                || alreadyAdmittedToday
                || BigInt(input.request.upload_key_expires_at_ms) > BigInt(state.ends_at_ms)
                || BigInt(input.request.expected_source_bytes)
                    > PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES) {
                throw new Error('admission_closed');
            }
        }
        if (isPublicTestnetEnvironment(env)) {
            const currentProfile = await requirePublicUploadPolicy(env, { fresh: true });
            if (input.request.profile_config_sha256 !== currentProfile) throw new Error('admission_denied');
            if (BigInt(input.request.expected_source_bytes) > 5_000_000_000n) {
                throw new Error('admission_denied');
            }
        }
        await preflightSponsoredUpload(env, input.request);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
            `creator-fee-quote:${env.NEAR_NETWORK}:${env.MARKET_CONTRACT_ID}:${input.request.creator_id}`,
        ));
        return withCors(await object.fetch(new Request('https://object/internal/sponsored-upload-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('sponsored_upload_quote_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

export async function issueSponsoredUploadQuote(
    state: DurableObjectState,
    env: Env,
    request: Request,
): Promise<Response> {
    try {
        const input = parseSponsoredUploadQuoteRequest(await readJsonObject(request));
        const expectedProfile = isPublicTestnetEnvironment(env)
            ? await requirePublicUploadPolicy(env, { fresh: true }) : profiles.legacy.hash;
        if (input.request.profile_config_sha256 !== expectedProfile) throw new Error('admission_denied');
        await enforceCreatorFeeQuoteRateLimit(state);
        const block = await readFinalBlock(env);
        const now = block.timestampMs;
        const sourceBytes = BigInt(input.request.expected_source_bytes);
        const byteFeeUsdMicro = (sourceBytes * 3n + 9_999n) / 10_000n;
        const uploadFeeUsdc = byteFeeUsdMicro < MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            ? MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            : byteFeeUsdMicro;
        const totalFeeUsdc = uploadFeeUsdc + SPONSORED_UPLOAD_FEE_USDC;
        const quoteKeyVersion = Number(env.CREATOR_FEE_QUOTE_KEY_VERSION);
        const quoteWithoutId = {
            domain: 'youtick.sponsored-upload-quote' as const,
            version: '1' as const,
            network: env.NEAR_NETWORK as 'testnet' | 'mainnet',
            contract_id: env.MARKET_CONTRACT_ID!,
            creator_id: input.request.creator_id,
            job_id: input.request.job_id,
            request_sha256: await sha256Hex(paidJobRequestJson(input.request)),
            expected_source_bytes: input.request.expected_source_bytes,
            upload_fee_usdc: uploadFeeUsdc.toString(),
            sponsor_fee_usdc: SPONSORED_UPLOAD_FEE_USDC.toString(),
            total_fee_usdc: totalFeeUsdc.toString(),
            delegate_receiver_id: usdcContractId(env),
            delegate_method: 'ft_transfer_call' as const,
            delegate_gas: SPONSORED_UPLOAD_DELEGATE_GAS.toString(),
            delegate_deposit_yocto: '1' as const,
            issued_at_ms: String(now),
            quote_block_height: String(block.height),
            max_delegate_block_height: String(BigInt(block.height) + SPONSORED_UPLOAD_MAX_BLOCK_WINDOW),
            expires_at_ms: String(now + CREATOR_FEE_QUOTE_LIFETIME_MS),
            quote_key_version: quoteKeyVersion,
        };
        const canonicalMessage = canonicalSponsoredUploadQuoteMessage(quoteWithoutId);
        const quoteId = await sha256Hex(canonicalMessage);
        const privateKey = await importCreatorFeeQuotePrivateKey(env);
        const signature = new Uint8Array(await crypto.subtle.sign(
            'Ed25519',
            privateKey,
            new TextEncoder().encode(canonicalMessage),
        ));
        return json({
            request: input.request,
            quote: { ...quoteWithoutId, quote_id: quoteId },
            signature: bytesToBase64(signature),
            public_key_version: quoteKeyVersion,
        });
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('sponsored_upload_quote_issue_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

function parseSponsoredUploadQuoteRequest(value: JsonObject): { request: SponsoredPaidJobRequest } {
    requireExactKeys(value, ['request'], 'invalid_sponsored_upload_quote_request');
    return { request: parseSponsoredPaidJobRequest(requireObject(
        value.request,
        'invalid_sponsored_upload_quote_request',
    )) };
}

function parseSponsoredPaidJobRequest(
    value: JsonObject,
    requireFutureExpiry = true,
): SponsoredPaidJobRequest {
    requireExactKeys(value, [
        'creator_id',
        'job_id',
        'title',
        'price_usdc',
        'expected_source_bytes',
        'profile_id',
        'profile_config_sha256',
        'upload_public_key',
        'upload_key_expires_at_ms',
    ], 'invalid_sponsored_upload_quote_request');
    if (typeof value.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.creator_id)
        || typeof value.job_id !== 'string'
        || !JOB_ID_PATTERN.test(value.job_id)
        || typeof value.title !== 'string'
        || !hasTitleContent(value.title)
        || new TextEncoder().encode(value.title).length > 200
        || typeof value.price_usdc !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.price_usdc)
        || BigInt(value.price_usdc) < 2_000_000n
        || typeof value.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.expected_source_bytes)
        || BigInt(value.expected_source_bytes) > MAX_SOURCE_BYTES
        || value.profile_id !== 'paid-media-livepeer-v1'
        || typeof value.profile_config_sha256 !== 'string'
        || !supportedMediaProfile(value.profile_config_sha256)
        || typeof value.upload_public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(value.upload_public_key)
        || typeof value.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(value.upload_key_expires_at_ms)
        || (requireFutureExpiry && BigInt(value.upload_key_expires_at_ms) <= BigInt(Date.now()))) {
        throw new Error('invalid_sponsored_upload_quote_request');
    }
    return {
        creator_id: value.creator_id,
        job_id: value.job_id,
        title: value.title,
        price_usdc: value.price_usdc,
        expected_source_bytes: value.expected_source_bytes,
        profile_id: value.profile_id,
        profile_config_sha256: value.profile_config_sha256,
        upload_public_key: value.upload_public_key,
        upload_key_expires_at_ms: value.upload_key_expires_at_ms,
    };
}

async function preflightSponsoredUpload(env: Env, request: SponsoredPaidJobRequest): Promise<void> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
        env.NEAR_NETWORK!,
        env.MARKET_CONTRACT_ID!,
    )));
    const response = await object.fetch(new Request('https://object/internal/admission/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: request.job_id,
            generation: 1,
            creator: request.creator_id,
            expectedSourceBytes: request.expected_source_bytes,
        }),
    }));
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(body.error === 'admission_denied' ? 'admission_denied' : 'admission_closed');
    }
}

export async function forwardSponsoredUploadRelay(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        const object = await sponsorRelayerControlObject(env);
        return withCors(await object.fetch(new Request('https://object/internal/sponsored-upload-relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: await request.text(),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('sponsored_upload_relay_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

async function sponsorRelayerControlObject(env: Env): Promise<DurableObjectStub> {
    if (!env.LIVEPEER_CONTROL || !validSponsoredUploadRelayConfig(env)) {
        throw new Error('runtime_not_configured');
    }
    const signer = KeyPairSigner.fromSecretKey(
        env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`,
    );
    const publicKey = (await signer.getPublicKey()).toString();
    return env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName([
        'sponsor-relayer',
        env.NEAR_NETWORK,
        publicKey,
        env.NEAR_SPONSOR_RELAYER_KEY_EPOCH,
    ].join(':')));
}

export async function parseSponsoredUploadRelayRequest(
    request: Request,
    env: Env,
): Promise<ParsedSponsoredDelegate> {
    const value = await readJsonObject(request);
    requireExactKeys(
        value,
        ['signed_delegate_base64'],
        SPONSORED_RELAY_REJECTION_CODES.delegate_decode,
    );
    if (typeof value.signed_delegate_base64 !== 'string'
        || value.signed_delegate_base64.length < 64
        || value.signed_delegate_base64.length > MAX_CONTROL_BODY_BYTES
        || value.signed_delegate_base64.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.signed_delegate_base64)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.delegate_decode);
    }
    let encoded: Uint8Array;
    let signedDelegate: SignedDelegate;
    try {
        encoded = base64Decode(value.signed_delegate_base64);
        signedDelegate = deserialize(SCHEMA.SignedDelegate, encoded) as unknown as SignedDelegate;
        if (!constantTimeEqual(encodeSignedDelegate(signedDelegate), encoded)) {
            throw new Error('non_canonical');
        }
    } catch {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.delegate_decode);
    }
    const shapeCode = SPONSORED_RELAY_REJECTION_CODES.delegate_shape;
    const signed = requireObject(signedDelegate, shapeCode);
    requireExactKeys(signed, ['delegateAction', 'signature'], shapeCode);
    const delegate = requireObject(signed.delegateAction, shapeCode);
    requireExactKeys(delegate, [
        'senderId', 'receiverId', 'actions', 'nonce', 'maxBlockHeight', 'publicKey',
    ], shapeCode);
    if (typeof delegate.senderId !== 'string'
        || !ACCOUNT_ID_PATTERN.test(delegate.senderId)
        || delegate.receiverId !== usdcContractId(env)
        || !Array.isArray(delegate.actions)
        || delegate.actions.length !== 1
        || typeof delegate.nonce !== 'bigint'
        || delegate.nonce < 1n
        || typeof delegate.maxBlockHeight !== 'bigint'
        || delegate.maxBlockHeight < 1n) {
        throw new Error(shapeCode);
    }
    const publicKey = requireObject(delegate.publicKey, shapeCode);
    requireExactKeys(publicKey, ['ed25519Key'], shapeCode);
    const publicKeyValue = requireObject(publicKey.ed25519Key, shapeCode);
    requireExactKeys(publicKeyValue, ['data'], shapeCode);
    const publicKeyBytes = parseBorshBytes(publicKeyValue.data, 32);
    const signature = requireObject(signed.signature, shapeCode);
    requireExactKeys(signature, ['ed25519Signature'], shapeCode);
    const signatureValue = requireObject(signature.ed25519Signature, shapeCode);
    requireExactKeys(signatureValue, ['data'], shapeCode);
    const signatureBytes = parseBorshBytes(signatureValue.data, 64);
    const action = requireObject(delegate.actions[0], shapeCode);
    requireExactKeys(action, ['functionCall'], shapeCode);
    const functionCall = requireObject(action.functionCall, shapeCode);
    requireExactKeys(functionCall, [
        'methodName', 'args', 'gas', 'deposit',
    ], shapeCode);
    if (functionCall.methodName !== 'ft_transfer_call'
        || functionCall.gas !== SPONSORED_UPLOAD_DELEGATE_GAS
        || functionCall.deposit !== 1n) {
        throw new Error(shapeCode);
    }
    let ftArgs: JsonObject;
    try {
        ftArgs = requireObject(JSON.parse(new TextDecoder().decode(
            parseBorshBytes(functionCall.args),
        )), shapeCode);
    } catch {
        throw new Error(shapeCode);
    }
    const compact = typeof ftArgs.msg === 'string' && ftArgs.msg.startsWith(COMPACT_UPLOAD_PREFIX);
    requireExactKeys(ftArgs, compact ? ['receiver_id', 'amount', 'msg'] : ['receiver_id', 'amount', 'memo', 'msg'], shapeCode);
    if (ftArgs.receiver_id !== env.MARKET_CONTRACT_ID
        || typeof ftArgs.amount !== 'string'
        || (!compact && ftArgs.memo !== 'YouTick creator upload fee')
        || typeof ftArgs.msg !== 'string') {
        throw new Error(shapeCode);
    }
    let message: JsonObject;
    try {
        message = requireObject(compact ? await unpackCompactUpload(ftArgs.msg, { network: env.NEAR_NETWORK!, market: env.MARKET_CONTRACT_ID!,
            creator: delegate.senderId, usdc: usdcContractId(env), keyString: bytes => `ed25519:${baseEncode(bytes)}` }) : JSON.parse(ftArgs.msg), shapeCode);
    } catch {
        throw new Error(shapeCode);
    }
    requireExactKeys(message, [
        'action',
        'creator_id',
        'job_id',
        'title',
        'price_usdc',
        'expected_source_bytes',
        'profile_id',
        'profile_config_sha256',
        'upload_public_key',
        'upload_key_expires_at_ms',
        'sponsor_quote',
        'sponsor_quote_signature',
        ...(Object.hasOwn(message, 'playback_session') ? ['playback_session'] : []),
    ], shapeCode);
    if (Object.hasOwn(message, 'playback_session')) {
        try { parsePlaybackSessionAuthorization(message.playback_session); } catch { throw new Error(shapeCode); }
    }
    if (message.action !== 'create_paid_job'
        || message.creator_id !== delegate.senderId
        || typeof message.sponsor_quote_signature !== 'string') {
        throw new Error(shapeCode);
    }
    const requestValue: JsonObject = {
        creator_id: message.creator_id,
        job_id: message.job_id,
        title: message.title,
        price_usdc: message.price_usdc,
        expected_source_bytes: message.expected_source_bytes,
        profile_id: message.profile_id,
        profile_config_sha256: message.profile_config_sha256,
        upload_public_key: message.upload_public_key,
        upload_key_expires_at_ms: message.upload_key_expires_at_ms,
    };
    let paidJobRequest: SponsoredPaidJobRequest;
    try {
        paidJobRequest = parseSponsoredPaidJobRequest(requestValue, false);
    } catch {
        throw new Error(shapeCode);
    }
    const quoteCode = SPONSORED_RELAY_REJECTION_CODES.quote_validation;
    const quote = parseSponsoredUploadQuote(requireObject(
        message.sponsor_quote,
        quoteCode,
    ));
    await verifySponsoredUploadQuote(
        env,
        paidJobRequest,
        quote,
        message.sponsor_quote_signature,
    );
    if (ftArgs.amount !== quote.total_fee_usdc
        || delegate.maxBlockHeight > BigInt(quote.max_delegate_block_height)
            + SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS) {
        throw new Error(quoteCode);
    }
    const delegateHash = new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        encodeDelegateAction(delegate as never),
    ));
    const verificationKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        'Ed25519',
        false,
        ['verify'],
    );
    if (!await crypto.subtle.verify('Ed25519', verificationKey, signatureBytes, delegateHash)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.signature_validation);
    }
    return {
        signedDelegate,
        signedDelegateBase64: value.signed_delegate_base64,
        hasPlaybackSession: Object.hasOwn(message, 'playback_session'),
        signedDelegateSha256: await sha256BytesHex(encoded),
        publicKey: `ed25519:${baseEncode(publicKeyBytes)}`,
        nonce: delegate.nonce,
        maxBlockHeight: delegate.maxBlockHeight,
        request: paidJobRequest,
        quote,
    };
}

function parseBorshBytes(value: unknown, exactLength?: number): Uint8Array {
    if (!Array.isArray(value)
        || value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
        || (exactLength !== undefined && value.length !== exactLength)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.delegate_shape);
    }
    return Uint8Array.from(value as number[]);
}

function parseSponsoredUploadQuote(value: JsonObject): SponsoredUploadQuote {
    const fields = [
        'domain', 'version', 'network', 'contract_id', 'creator_id', 'job_id',
        'request_sha256', 'expected_source_bytes', 'upload_fee_usdc', 'sponsor_fee_usdc',
        'total_fee_usdc', 'delegate_receiver_id', 'delegate_method', 'delegate_gas',
        'delegate_deposit_yocto', 'issued_at_ms', 'quote_block_height', 'max_delegate_block_height',
        'expires_at_ms', 'quote_key_version', 'quote_id',
    ];
    requireExactKeys(value, fields, SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    const decimalFields = [
        'expected_source_bytes', 'upload_fee_usdc', 'sponsor_fee_usdc', 'total_fee_usdc',
        'delegate_gas', 'delegate_deposit_yocto', 'issued_at_ms', 'quote_block_height',
        'max_delegate_block_height', 'expires_at_ms',
    ];
    if (value.domain !== 'youtick.sponsored-upload-quote'
        || value.version !== '1'
        || !['testnet', 'mainnet'].includes(String(value.network))
        || typeof value.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.contract_id)
        || typeof value.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.creator_id)
        || typeof value.job_id !== 'string'
        || !JOB_ID_PATTERN.test(value.job_id)
        || typeof value.request_sha256 !== 'string'
        || !SHA256_PATTERN.test(value.request_sha256)
        || typeof value.delegate_receiver_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.delegate_receiver_id)
        || value.delegate_method !== 'ft_transfer_call'
        || !Number.isSafeInteger(value.quote_key_version)
        || Number(value.quote_key_version) < 1
        || typeof value.quote_id !== 'string'
        || !SHA256_PATTERN.test(value.quote_id)
        || decimalFields.some((field) => (
            typeof value[field] !== 'string' || !/^[1-9][0-9]{0,38}$/.test(value[field] as string)
        ))) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    return value as unknown as SponsoredUploadQuote;
}

async function verifySponsoredUploadQuote(
    env: Env,
    request: SponsoredPaidJobRequest,
    quote: SponsoredUploadQuote,
    signatureBase64: string,
): Promise<void> {
    const sourceBytes = BigInt(request.expected_source_bytes);
    const byteFee = (sourceBytes * 3n + 9_999n) / 10_000n;
    const uploadFee = byteFee < MIN_CREATOR_UPLOAD_FEE_USD_MICROS
        ? MIN_CREATOR_UPLOAD_FEE_USD_MICROS
        : byteFee;
    const issuedAt = BigInt(quote.issued_at_ms);
    const expiresAt = BigInt(quote.expires_at_ms);
    if (quote.network !== env.NEAR_NETWORK
        || quote.contract_id !== env.MARKET_CONTRACT_ID
        || quote.creator_id !== request.creator_id
        || quote.job_id !== request.job_id
        || quote.request_sha256 !== await sha256Hex(paidJobRequestJson(request))
        || quote.expected_source_bytes !== request.expected_source_bytes
        || BigInt(quote.upload_fee_usdc) !== uploadFee
        || BigInt(quote.sponsor_fee_usdc) !== SPONSORED_UPLOAD_FEE_USDC
        || BigInt(quote.total_fee_usdc) !== uploadFee + SPONSORED_UPLOAD_FEE_USDC
        || quote.delegate_receiver_id !== usdcContractId(env)
        || quote.delegate_gas !== SPONSORED_UPLOAD_DELEGATE_GAS.toString()
        || quote.delegate_deposit_yocto !== '1'
        || quote.quote_key_version !== Number(env.CREATOR_FEE_QUOTE_KEY_VERSION)
        || expiresAt <= issuedAt
        || expiresAt - issuedAt > BigInt(CREATOR_FEE_QUOTE_LIFETIME_MS)
        || BigInt(quote.quote_block_height) >= BigInt(quote.max_delegate_block_height)
        || BigInt(quote.max_delegate_block_height) - BigInt(quote.quote_block_height)
            > SPONSORED_UPLOAD_MAX_BLOCK_WINDOW) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    const canonicalMessage = canonicalSponsoredUploadQuoteMessage(quote);
    if (quote.quote_id !== await sha256Hex(canonicalMessage)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    let providedSignature: Uint8Array;
    try {
        providedSignature = base64Decode(signatureBase64);
    } catch {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    const privateKey = await importCreatorFeeQuotePrivateKey(env);
    const expectedSignature = new Uint8Array(await crypto.subtle.sign(
        'Ed25519',
        privateKey,
        new TextEncoder().encode(canonicalMessage),
    ));
    if (!constantTimeEqual(providedSignature, expectedSignature)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
}

function sponsoredQuoteIsFresh(input: ParsedSponsoredDelegate): boolean {
    const now = BigInt(Date.now());
    const issuedAt = BigInt(input.quote.issued_at_ms);
    const expiresAt = BigInt(input.quote.expires_at_ms);
    return BigInt(input.request.upload_key_expires_at_ms) > now
        && issuedAt <= now
        && now - issuedAt <= BigInt(CREATOR_FEE_QUOTE_LIFETIME_MS)
        && expiresAt > now
        && expiresAt > issuedAt
        && expiresAt - issuedAt <= BigInt(CREATOR_FEE_QUOTE_LIFETIME_MS);
}

function requireSponsoredQuoteFresh(input: ParsedSponsoredDelegate, height: number): void {
    if (!sponsoredQuoteIsFresh(input)
        || BigInt(height) < BigInt(input.quote.quote_block_height)
        || BigInt(height) > BigInt(input.quote.max_delegate_block_height)
        || BigInt(height) >= input.maxBlockHeight) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.freshness);
    }
}

export async function relaySponsoredUpload(
    state: DurableObjectState,
    env: Env,
    request: Request,
): Promise<Response> {
    const input = await parseSponsoredUploadRelayRequest(request, env);
    const existingJob = await readSponsoredMediaJob(env, input.request.job_id);
    if (existingJob) {
        requireExactSponsoredJob(existingJob, input);
        await state.storage.delete(`${SPONSOR_RELAY_KEY_PREFIX}${input.request.job_id}`);
        await rememberCreatorPaidJob(env, input.request.creator_id, input.request.job_id);
        return json({
            accepted: true,
            relayed: true,
            job_id: input.request.job_id,
            tx_hash: null,
        });
    }

    const key = `${SPONSOR_RELAY_KEY_PREFIX}${input.request.job_id}`;
    let storedRecord = await state.storage.get<SponsorRelayRecord>(key);
    if (storedRecord
        && (storedRecord.payloadSha256 !== input.signedDelegateSha256
            || storedRecord.creator !== input.request.creator_id)) {
        throw new Error('sponsor_relay_conflict');
    }
    if (storedRecord?.state === 'BROADCAST' && storedRecord.txHash) {
        const observed = await queryTransactionForAccount(
            env,
            storedRecord.txHash,
            env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID!,
        );
        const job = await readSponsoredMediaJob(env, input.request.job_id);
        if (job) {
            requireExactSponsoredJob(job, input);
            await state.storage.delete(key);
            await rememberCreatorPaidJob(env, input.request.creator_id, input.request.job_id);
            return json({
                accepted: true,
                relayed: true,
                job_id: input.request.job_id,
                tx_hash: storedRecord.txHash,
            });
        }
        if (observed === 'failed' || observed === 'sent') {
            await releaseSponsoredAdmission(env, input.request);
            await state.storage.delete(key);
            throw new Error('sponsor_relay_failed');
        }
        if (observed === 'unknown') {
            await state.storage.setAlarm(Date.now() + 30_000);
            return json({
                accepted: true,
                relayed: false,
                job_id: input.request.job_id,
                tx_hash: storedRecord.txHash,
            }, 202);
        }
        storedRecord = clearSponsorRelayTransaction(storedRecord);
        await state.storage.put(key, storedRecord);
    }
    if (!sponsoredQuoteIsFresh(input)) {
        if (storedRecord) {
            await releaseSponsoredAdmission(env, input.request);
            await state.storage.delete(key);
        }
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.freshness);
    }

    const [block, creatorAccessKey, relayerAccessKey, balance] = await Promise.all([
        readFinalBlock(env),
        readCreatorAccessKey(env, input.request.creator_id, input.publicKey),
        readSponsorRelayerAccessKey(env),
        readUsdcBalance(env, input.request.creator_id),
    ]);
    requireSponsoredQuoteFresh(input, block.height);
    if (input.nonce !== creatorAccessKey.nonce + 1n
        || input.maxBlockHeight <= BigInt(block.height)
        || input.maxBlockHeight > BigInt(input.quote.max_delegate_block_height)
            + SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.access_key);
    }
    requireCreatorDelegatePermission(creatorAccessKey.permission, env);
    if (input.hasPlaybackSession && creatorAccessKey.permission !== 'FullAccess') {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.access_key);
    }
    // The delegate signature alone proves only its own key; the creator's access key proves the account.
    await enforcePublicBetaAccountRateLimit(env, '/v1/sponsored-upload-relays', input.request.creator_id);
    if (balance < BigInt(input.quote.total_fee_usdc)) {
        throw new Error('sponsor_balance_insufficient');
    }
    await reserveSponsoredAdmission(env, input.request);
    let record = await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<SponsorRelayRecord>(key);
        if (existing) {
            if (existing.payloadSha256 !== input.signedDelegateSha256
                || existing.creator !== input.request.creator_id) {
                throw new Error('sponsor_relay_conflict');
            }
            return existing;
        }
        await assertDurableObjectRecordCapacity(transaction, [
            key,
            SPONSOR_RELAYER_LAST_NONCE_KEY,
        ], 'operator');
        const created: SponsorRelayRecord = {
            schema: 'youtick.sponsor-relay.v1',
            state: 'PENDING',
            jobId: input.request.job_id,
            creator: input.request.creator_id,
            payloadSha256: input.signedDelegateSha256,
            signedDelegateBase64: input.signedDelegateBase64,
            createdAtMs: Date.now(),
        };
        await transaction.put(key, created);
        return created;
    });

    const signer = KeyPairSigner.fromSecretKey(
        env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`,
    );
    const relayerPublicKey = await signer.getPublicKey();
    if (!record.signedTxBase64) {
        if (!record.nonce || !record.blockHash) {
            record = await state.storage.transaction(async (transaction) => {
                const current = await transaction.get<SponsorRelayRecord>(key);
                if (!current) throw new Error('sponsor_relay_pending');
                if (current.nonce && current.blockHash) return current;
                const lastNonce = BigInt(
                    await transaction.get<string>(SPONSOR_RELAYER_LAST_NONCE_KEY) || '0',
                );
                const nonce = (lastNonce > relayerAccessKey.nonce
                    ? lastNonce
                    : relayerAccessKey.nonce) + 1n;
                const reserved = {
                    ...current,
                    state: 'RESERVED' as const,
                    nonce: String(nonce),
                    blockHash: relayerAccessKey.blockHash,
                };
                await transaction.put(SPONSOR_RELAYER_LAST_NONCE_KEY, String(nonce));
                await transaction.put(key, reserved);
                return reserved;
            });
        }
        const transaction = createTransaction(
            env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID!,
            relayerPublicKey,
            input.request.creator_id,
            BigInt(record.nonce!),
            [actions.signedDelegate(input.signedDelegate)],
            baseDecode(record.blockHash!),
        );
        const signed = await signer.signTransaction(transaction);
        record = {
            ...record,
            state: 'SIGNED',
            signedTxBase64: bytesToBase64(signed.signedTransaction.encode()),
            txHash: baseEncode(signed.txHash),
        };
        await state.storage.put(key, record);
    }

    // Reconcile existing broadcasts above; only a new send requires a fresh quote.
    const latestBlock = await readFinalBlock(env);
    requireSponsoredQuoteFresh(input, latestBlock.height);
    let broadcast: 'sent' | 'invalid_nonce' | 'failed' | 'unknown';
    try {
        broadcast = await sendTransaction(env, record.signedTxBase64!);
    } catch {
        broadcast = 'unknown';
    }
    record = { ...record, state: 'BROADCAST' };
    await state.storage.put(key, record);
    const job = await readSponsoredMediaJob(env, input.request.job_id);
    if (job) {
        requireExactSponsoredJob(job, input);
        await state.storage.delete(key);
        await rememberCreatorPaidJob(env, input.request.creator_id, input.request.job_id);
        return json({ accepted: true, relayed: true, job_id: input.request.job_id, tx_hash: record.txHash || null });
    }
    if (broadcast === 'failed' || broadcast === 'sent') {
        await releaseSponsoredAdmission(env, input.request);
        await state.storage.delete(key);
        throw new Error('sponsor_relay_failed');
    }
    if (broadcast === 'invalid_nonce') {
        await state.storage.put(key, clearSponsorRelayTransaction(record));
    }
    await state.storage.setAlarm(Date.now() + 30_000);
    return json({ accepted: true, relayed: false, job_id: input.request.job_id, tx_hash: record.txHash || null }, 202);
}

export async function advanceSponsorRelayAlarm(state: DurableObjectState, env: Env): Promise<boolean> {
    const records = await state.storage.list<SponsorRelayRecord>({
        prefix: SPONSOR_RELAY_KEY_PREFIX,
        limit: 1,
    });
    const record = records.values().next().value as SponsorRelayRecord | undefined;
    if (!record) return false;
    if (env.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED !== 'true') return true;
    try {
        const response = await relaySponsoredUpload(state, env, new Request(
            'https://object/internal/sponsored-upload-relay',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signed_delegate_base64: record.signedDelegateBase64 }),
            },
        ));
        if (response.status === 202) await state.storage.setAlarm(Date.now() + 30_000);
    } catch (error) {
        console.error(formatLog('sponsor_relay_alarm_failed', { code: safeErrorCode(error) }));
        await state.storage.setAlarm(Date.now() + 60_000);
    }
    return true;
}

function clearSponsorRelayTransaction(record: SponsorRelayRecord): SponsorRelayRecord {
    const next = { ...record, state: 'PENDING' as const };
    delete next.nonce;
    delete next.blockHash;
    delete next.signedTxBase64;
    delete next.txHash;
    return next;
}

async function readSponsoredMediaJob(env: Env, jobId: string): Promise<OnChainJob | null> {
    try {
        return (await readFinalMediaJob(env, jobId)).job;
    } catch (error) {
        if (error instanceof Error && error.message === 'near_job_not_found') return null;
        throw error;
    }
}

function requireExactSponsoredJob(job: OnChainJob, input: ParsedSponsoredDelegate): void {
    if (job.job_id !== input.request.job_id
        || job.creator_id !== input.request.creator_id
        || job.title !== input.request.title
        || job.price_usdc !== input.request.price_usdc
        || job.expected_source_bytes !== input.request.expected_source_bytes
        || job.profile_id !== input.request.profile_id
        || job.profile_config_sha256 !== input.request.profile_config_sha256
        || job.upload_public_key !== input.request.upload_public_key
        || job.upload_key_expires_at_ms !== input.request.upload_key_expires_at_ms
        || job.status !== 'Authorized'
        || job.fee_asset !== 'USDC'
        || job.fee_amount !== input.quote.total_fee_usdc
        || job.fee_usd_micro !== input.quote.total_fee_usdc
        || job.fee_quote_hash !== input.quote.quote_id) {
        throw new Error('sponsor_job_conflict');
    }
}

async function readCreatorAccessKey(
    env: Env,
    accountId: string,
    publicKey: string,
): Promise<{ nonce: bigint; permission: unknown }> {
    const payload = await nearRpcRaw(env, 'query', {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: accountId,
        public_key: publicKey,
    });
    const accessCode = SPONSORED_RELAY_REJECTION_CODES.access_key;
    const result = requireObject(payload.result, accessCode);
    if (typeof result.nonce !== 'number'
        || !Number.isSafeInteger(result.nonce)
        || result.nonce < 0
        || result.permission === undefined) {
        throw new Error(accessCode);
    }
    return { nonce: BigInt(result.nonce), permission: result.permission };
}

function requireCreatorDelegatePermission(permission: unknown, env: Env): void {
    if (permission === 'FullAccess') return;
    const accessCode = SPONSORED_RELAY_REJECTION_CODES.access_key;
    const root = requireObject(permission, accessCode);
    requireExactKeys(root, ['FunctionCall'], accessCode);
    const functionCall = requireObject(root.FunctionCall, accessCode);
    const methods = functionCall.method_names;
    if (functionCall.receiver_id !== usdcContractId(env)
        || !Array.isArray(methods)
        || !methods.includes('ft_transfer_call')
        || methods.some((method) => typeof method !== 'string')) {
        throw new Error(accessCode);
    }
}

async function readSponsorRelayerAccessKey(
    env: Env,
): Promise<{ nonce: bigint; blockHash: string }> {
    const signer = KeyPairSigner.fromSecretKey(
        env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`,
    );
    const publicKey = (await signer.getPublicKey()).toString();
    const payload = await nearRpcRaw(env, 'query', {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID,
        public_key: publicKey,
    });
    const result = requireObject(payload.result, 'runtime_not_configured');
    if (result.permission !== 'FullAccess'
        || typeof result.nonce !== 'number'
        || !Number.isSafeInteger(result.nonce)
        || result.nonce < 0
        || typeof result.block_hash !== 'string') {
        throw new Error('runtime_not_configured');
    }
    return { nonce: BigInt(result.nonce), blockHash: result.block_hash };
}

async function readUsdcBalance(env: Env, accountId: string): Promise<bigint> {
    const payload = await nearRpcRaw(env, 'query', {
        request_type: 'call_function',
        finality: 'final',
        account_id: usdcContractId(env),
        method_name: 'ft_balance_of',
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ account_id: accountId }))),
    });
    const result = requireObject(payload.result, 'near_finalize_pending');
    if (!Array.isArray(result.result)) throw new Error('near_finalize_pending');
    let balance: unknown;
    try {
        balance = JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result as number[])));
    } catch {
        throw new Error('near_finalize_pending');
    }
    if (typeof balance !== 'string' || !/^[0-9]+$/.test(balance)) {
        throw new Error('near_finalize_pending');
    }
    return BigInt(balance);
}

async function reserveSponsoredAdmission(env: Env, request: SponsoredPaidJobRequest): Promise<void> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
        env.NEAR_NETWORK!,
        env.MARKET_CONTRACT_ID!,
    )));
    const response = await object.fetch(new Request('https://object/internal/admission/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: request.job_id,
            generation: 1,
            creator: request.creator_id,
            expectedSourceBytes: request.expected_source_bytes,
        }),
    }));
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(body.error === 'admission_denied' ? 'admission_denied' : 'admission_closed');
    }
}

async function releaseSponsoredAdmission(env: Env, request: SponsoredPaidJobRequest): Promise<void> {
    if (!env.LIVEPEER_CONTROL) return;
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
        env.NEAR_NETWORK!,
        env.MARKET_CONTRACT_ID!,
    )));
    const response = await object.fetch(new Request('https://object/internal/admission/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: request.job_id, generation: 1, state: 'CANCELLED' }),
    }));
    if (!response.ok) throw new Error('admission_closed');
}

function canonicalSponsoredUploadQuoteMessage(quote: Omit<SponsoredUploadQuote, 'quote_id'>): string {
    return [
        quote.domain,
        quote.version,
        quote.network,
        quote.contract_id,
        quote.creator_id,
        quote.job_id,
        quote.request_sha256,
        quote.expected_source_bytes,
        quote.upload_fee_usdc,
        quote.sponsor_fee_usdc,
        quote.total_fee_usdc,
        quote.delegate_receiver_id,
        quote.delegate_method,
        quote.delegate_gas,
        quote.delegate_deposit_yocto,
        quote.issued_at_ms,
        quote.quote_block_height,
        quote.max_delegate_block_height,
        quote.expires_at_ms,
        quote.quote_key_version,
    ].join('\n');
}

function paidJobRequestJson(request: SponsoredPaidJobRequest): string {
    return JSON.stringify({
        creator_id: request.creator_id,
        job_id: request.job_id,
        title: request.title,
        price_usdc: request.price_usdc,
        expected_source_bytes: request.expected_source_bytes,
        profile_id: request.profile_id,
        profile_config_sha256: request.profile_config_sha256,
        upload_public_key: request.upload_public_key,
        upload_key_expires_at_ms: request.upload_key_expires_at_ms,
    });
}
