import {
    COMPACT_UPLOAD_PREFIX,
    unpackCompactUpload,
} from '../../../protocol/paid-media-livepeer-v1/compact-upload';
import { base58Decode } from './base58';
import {
    SCHEMA,
    baseEncode,
    encodeDelegateAction,
    encodeSignedDelegate,
    type SignedDelegate,
} from 'near-api-js';
import { deserialize } from 'borsh';
import { verifyMessage as verifyNep413Message } from 'near-api-js/nep413';
import type { ProviderPlayback } from './media-provider';
import { mediaProfileFamily } from './media-provider';
import { MAX_PROVIDER_PLAYBACK_OUTPUTS, playbackUrlAllowed } from './provider-verification';
import type { Env } from './env';
import type { JsonObject } from './types';
import {
    MAX_CONTROL_BODY_BYTES,
    CONTROL_MAX_FUTURE_MS,
    PLAYBACK_V2_TTL_SECONDS,
    PROVIDER_POLICY_CACHE_MS,
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
    SHA256_PATTERN,
    SESSION_KEY_PATTERN,
    NONCE_PATTERN,
    PLAYBACK_ID_PATTERN,
} from './constants';
import {
    formatLog,
    constantTimeEqual,
    readJsonObject,
    requireObject,
    requireExactKeys,
    canonicalJson,
    sha256Hex,
    allowedOrigins,
    isAllowedControlOrigin,
    base64Decode,
    base64UrlDecode,
    errorStatus,
    safeErrorCode,
    json,
} from './helpers';
import {
    playbackProfileIdAccepted,
    isPublicTestnetEnvironment,
    isPublicBetaPacket,
    usdcContractId,
} from './config';
import { readFinalAccessKey, nearPlaybackView } from './near-rpc';
import {
    enforcePublicBetaAccountRateLimit,
    requireActivePublicTestnetBetaForPlayback,
} from './public-testnet-beta';
import { mediaProvider, supportedMediaProfile } from './provider-registry';

type PlaybackV2Body = {
    publication_id: string;
    generation: number;
    playback_id: string;
};
type LegacyDeviceCertificate = {
    domain: 'youtick.device-session';
    version: '1' | '2';
    network: 'testnet' | 'mainnet';
    account_id?: string;
    contract_id?: string;
    session_public_key: string;
    origin_hash: string;
    scopes: ['play'];
    issued_at_ms: string;
    expires_at_ms: string;
};
type MarketDeviceCertificate = Omit<LegacyDeviceCertificate, 'version' | 'issued_at_ms' | 'expires_at_ms'> & {
    version: '3';
    account_id: string;
    contract_id: string;
    authorization_duration_ms: string;
};
type DeviceSessionCertificate = LegacyDeviceCertificate | MarketDeviceCertificate;
type MarketCertificateProof = { kind: 'market'; account_id: string; signed_delegate_base64?: string };
type WalletCertificateProof = {
    account_id?: string;
    public_key: string;
    signature: string;
    nonce: string;
};
type DeviceCertificateProof = WalletCertificateProof | MarketCertificateProof;
type PlaybackV2Envelope = {
    domain: 'youtick.playback-request';
    version: '1';
    network: 'testnet' | 'mainnet';
    contract_id: string;
    account_id: string;
    origin: string;
    request_nonce: string;
    request_expires_at_ms: string;
    body_sha256: string;
    certificate_sha256: string;
};
type PlaybackV2Request = {
    body: PlaybackV2Body;
    certificate: DeviceSessionCertificate;
    certificateProof: DeviceCertificateProof;
    request: PlaybackV2Envelope;
    requestSignature: string;
    deviceExpiresAtMs?: number;
};
const DEVICE_CERTIFICATE_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MARKET_DEVICE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PLAYBACK_CACHE_MAX_RECORDS = 1024;
const DEVICE_CERTIFICATE_CACHE_MS = 60 * 1000;
const PUBLICATION_CACHE_MS = 30 * 1000;
const POSITIVE_ENTITLEMENT_CACHE_MS = 5 * 60 * 1000;
const NEGATIVE_ENTITLEMENT_CACHE_MS = 3 * 1000;
const playbackAuthorizationCache = new Map<string, { value: unknown; expiresAtMs: number }>();

export function playbackAuthorizationCacheRecordCount(): number {
    return playbackAuthorizationCache.size;
}

export async function parsePlaybackV2Request(request: Request, env: Env): Promise<PlaybackV2Request> {
    const value = await readJsonObject(request);
    requireExactKeys(value, [
        'body',
        'certificate',
        'certificate_proof',
        'request',
        'request_signature',
    ], 'invalid_playback_v2_request');
    const body = parsePlaybackV2Body(value.body);
    const certificate = parseDeviceSessionCertificate(value.certificate);
    const certificateProof = parseDeviceCertificateProof(value.certificate_proof, certificate.version);
    const playbackRequest = parsePlaybackV2Envelope(value.request);
    if (typeof value.request_signature !== 'string'
        || value.request_signature.length > 128
        || /[\r\n]/.test(value.request_signature)) {
        throw new Error('invalid_playback_v2_request');
    }

    const origin = request.headers.get('Origin') || '';
    if (origin !== playbackRequest.origin
        || !allowedOrigins(env).has(origin)
        || certificate.origin_hash !== await sha256Hex(origin)
        || playbackRequest.network !== env.NEAR_NETWORK
        || certificate.network !== env.NEAR_NETWORK
        || playbackRequest.contract_id !== env.MARKET_CONTRACT_ID
        || (certificate.version === '1'
            ? playbackRequest.account_id !== certificate.account_id
            : certificate.contract_id !== env.MARKET_CONTRACT_ID || playbackRequest.account_id !== certificateProof.account_id)
        || playbackRequest.body_sha256 !== await sha256Hex(canonicalJson(body))
        || playbackRequest.certificate_sha256 !== await sha256Hex(canonicalJson(certificate))) {
        throw new Error('protocol_binding_mismatch');
    }

    const now = BigInt(Date.now());
    const requestExpiresAt = BigInt(playbackRequest.request_expires_at_ms);
    if (certificate.version === '3') {
        if (certificate.account_id !== playbackRequest.account_id
            || requestExpiresAt <= now || requestExpiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
            throw new Error('playback_denied');
        }
        return { body, certificate, certificateProof, request: playbackRequest, requestSignature: value.request_signature };
    }
    const issuedAt = BigInt(certificate.issued_at_ms);
    const certificateExpiresAt = BigInt(certificate.expires_at_ms);
    if (requestExpiresAt <= now || requestExpiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)
        || issuedAt > now
        || certificateExpiresAt <= now
        || certificateExpiresAt > now + BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS)
        || certificateExpiresAt - issuedAt > BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS)
        || (certificate.version === '2' && certificateExpiresAt - issuedAt !== BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS))) {
        throw new Error('playback_denied');
    }

    return {
        body,
        certificate,
        certificateProof,
        request: playbackRequest,
        requestSignature: value.request_signature,
    };
}

function parsePlaybackV2Body(value: unknown): PlaybackV2Body {
    const body = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(body, ['publication_id', 'generation', 'playback_id'], 'invalid_playback_v2_request');
    if (typeof body.publication_id !== 'string'
        || !JOB_ID_PATTERN.test(body.publication_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.playback_id !== 'string'
        || !PLAYBACK_ID_PATTERN.test(body.playback_id)) {
        throw new Error('invalid_playback_v2_request');
    }
    return body as PlaybackV2Body;
}

function parseDeviceSessionCertificate(value: unknown): DeviceSessionCertificate {
    const certificate = requireObject(value, 'invalid_playback_v2_request');
    if (certificate.version === '3') {
        requireExactKeys(certificate, ['domain', 'version', 'network', 'account_id', 'contract_id',
            'session_public_key', 'origin_hash', 'scopes', 'authorization_duration_ms'], 'invalid_playback_v2_request');
        if (certificate.domain !== 'youtick.device-session'
            || !['testnet', 'mainnet'].includes(String(certificate.network))
            || typeof certificate.account_id !== 'string' || !ACCOUNT_ID_PATTERN.test(certificate.account_id)
            || typeof certificate.contract_id !== 'string' || !ACCOUNT_ID_PATTERN.test(certificate.contract_id)
            || typeof certificate.session_public_key !== 'string' || !SESSION_KEY_PATTERN.test(certificate.session_public_key)
            || typeof certificate.origin_hash !== 'string' || !SHA256_PATTERN.test(certificate.origin_hash)
            || !Array.isArray(certificate.scopes) || certificate.scopes.length !== 1 || certificate.scopes[0] !== 'play'
            || certificate.authorization_duration_ms !== String(MARKET_DEVICE_LIFETIME_MS)) throw new Error('invalid_playback_v2_request');
        return certificate as MarketDeviceCertificate;
    }
    requireExactKeys(certificate, [
        'domain',
        'version',
        'network',
        certificate.version === '2' ? 'contract_id' : 'account_id',
        'session_public_key',
        'origin_hash',
        'scopes',
        'issued_at_ms',
        'expires_at_ms',
    ], 'invalid_playback_v2_request');
    if (certificate.domain !== 'youtick.device-session'
        || !['1', '2'].includes(String(certificate.version))
        || !['testnet', 'mainnet'].includes(String(certificate.network))
        || typeof certificate[certificate.version === '2' ? 'contract_id' : 'account_id'] !== 'string'
        || !ACCOUNT_ID_PATTERN.test(String(certificate[certificate.version === '2' ? 'contract_id' : 'account_id']))
        || typeof certificate.session_public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(certificate.session_public_key)
        || typeof certificate.origin_hash !== 'string'
        || !SHA256_PATTERN.test(certificate.origin_hash)
        || !Array.isArray(certificate.scopes)
        || certificate.scopes.length !== 1
        || certificate.scopes[0] !== 'play'
        || typeof certificate.issued_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(certificate.issued_at_ms)
        || typeof certificate.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(certificate.expires_at_ms)) {
        throw new Error('invalid_playback_v2_request');
    }
    return certificate as DeviceSessionCertificate;
}

function parseDeviceCertificateProof(value: unknown, version: '1' | '2' | '3'): DeviceCertificateProof {
    const proof = requireObject(value, 'invalid_playback_v2_request');
    if (version === '3') {
        requireExactKeys(proof, ['account_id', 'kind', ...(Object.hasOwn(proof, 'signed_delegate_base64') ? ['signed_delegate_base64'] : [])], 'invalid_playback_v2_request');
        if (proof.kind !== 'market' || typeof proof.account_id !== 'string' || !ACCOUNT_ID_PATTERN.test(proof.account_id)
            || (Object.hasOwn(proof, 'signed_delegate_base64') && (typeof proof.signed_delegate_base64 !== 'string'
                || proof.signed_delegate_base64.length > MAX_CONTROL_BODY_BYTES
                || !/^[A-Za-z0-9+/]+={0,2}$/.test(proof.signed_delegate_base64)))) throw new Error('invalid_playback_v2_request');
        return proof as MarketCertificateProof;
    }
    requireExactKeys(proof, [...(version === '2' ? ['account_id'] : []), 'public_key', 'signature', 'nonce'], 'invalid_playback_v2_request');
    if ((version === '2' && (typeof proof.account_id !== 'string' || !ACCOUNT_ID_PATTERN.test(proof.account_id)))
        || typeof proof.public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(proof.public_key)
        || typeof proof.signature !== 'string'
        || proof.signature.length > 128
        || /[\r\n]/.test(proof.signature)
        || typeof proof.nonce !== 'string'
        || !NONCE_PATTERN.test(proof.nonce)) {
        throw new Error('invalid_playback_v2_request');
    }
    return proof as DeviceCertificateProof;
}

function parsePlaybackV2Envelope(value: unknown): PlaybackV2Envelope {
    const request = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(request, [
        'domain',
        'version',
        'network',
        'contract_id',
        'account_id',
        'origin',
        'request_nonce',
        'request_expires_at_ms',
        'body_sha256',
        'certificate_sha256',
    ], 'invalid_playback_v2_request');
    if (request.domain !== 'youtick.playback-request'
        || request.version !== '1'
        || !['testnet', 'mainnet'].includes(String(request.network))
        || typeof request.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(request.contract_id)
        || typeof request.account_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(request.account_id)
        || typeof request.origin !== 'string'
        || !isAllowedControlOrigin(request.origin)
        || typeof request.request_nonce !== 'string'
        || !NONCE_PATTERN.test(request.request_nonce)
        || typeof request.request_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(request.request_expires_at_ms)
        || typeof request.body_sha256 !== 'string'
        || !SHA256_PATTERN.test(request.body_sha256)
        || typeof request.certificate_sha256 !== 'string'
        || !SHA256_PATTERN.test(request.certificate_sha256)) {
        throw new Error('invalid_playback_v2_request');
    }
    return request as PlaybackV2Envelope;
}

export async function issueStatelessPlaybackToken(request: Request, env: Env): Promise<Response> {
    const startedAtMs = performance.now();
    try {
        const input = await parsePlaybackV2Request(request, env);
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v2/playback-tokens',
            input.request.account_id,
        );
        await requireActivePublicTestnetBetaForPlayback(env);
        const certificateCacheHit = await verifyPlaybackV2Proofs(env, input);
        const authorization = await readStatelessPlaybackAuthorization(env, input);
        // The /v2 device-certificate path is Studio-only: a Stream publication plays through /v3.
        if (mediaProfileFamily(authorization.profileConfigSha256) === 'stream') throw new Error('playback_denied');
        const nowMs = Date.now();
        const certificateRemainingSeconds = Math.floor(
            ((input.certificate.version === '3' ? input.deviceExpiresAtMs! : Number(input.certificate.expires_at_ms)) - nowMs) / 1000,
        );
        if (certificateRemainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(PLAYBACK_V2_TTL_SECONDS, certificateRemainingSeconds);
        const issuedAtSeconds = Math.floor(nowMs / 1000);
        const signed = await mediaProvider(env, authorization.profileConfigSha256).signPlayback(
            input.body.playback_id,
            ttlSeconds,
            issuedAtSeconds,
        );
        const cacheHits = [
            certificateCacheHit,
            authorization.publicationCacheHit,
            authorization.entitlementCacheHit,
            authorization.providerCacheHit,
        ];
        console.info(formatLog('stateless_playback_authorization_completed', {
            cacheResult: cacheHits.every(Boolean) ? 'HIT' : 'MISS',
            rpcCalls: Number(!certificateCacheHit)
                + Number(!authorization.publicationCacheHit)
                + Number(!authorization.entitlementCacheHit)
                + Number(isPublicBetaPacket(env) || isPublicTestnetEnvironment(env)),
            policyRpcCalls: Number(isPublicBetaPacket(env) || isPublicTestnetEnvironment(env)),
            providerCalls: Number(!authorization.providerCacheHit),
            latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        return json({
            schema: 'youtick.livepeer-playback-token.v2',
            playback_id: input.body.playback_id,
            token: signed.token,
            expires_at_ms: String(signed.expiresAtSeconds * 1000),
            hls_url: signed.hlsUrl,
            ...(authorization.previewVttUrl ? { preview_vtt_url: authorization.previewVttUrl } : {}),
        });
    } catch (error) {
        const code = safeErrorCode(error);
        const httpCode = errorStatus(code);
        console.error(formatLog('stateless_playback_request_failed', {
            code, httpCode, latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        return json({ error: code }, httpCode);
    }
}

export async function verifyPlaybackV2Proofs(env: Env, input: PlaybackV2Request): Promise<boolean> {
    await verifyEd25519Signature(
        input.certificate.session_public_key,
        input.requestSignature,
        canonicalPlaybackV2Message(input.request),
    );

    if (input.certificate.version === '3') return verifyMarketDeviceProof(env, input);
    if ('kind' in input.certificateProof) throw new Error('playback_denied');
    const cacheKey = await playbackCacheKey(env, 'certificate', canonicalJson({
        certificate: input.certificate,
        proof: input.certificateProof,
        account_id: input.request.account_id,
    }));
    if (playbackCacheGet<boolean>(cacheKey) === true) return true;

    const certificateProof = input.certificateProof;
    let signature: Uint8Array;
    let nonce: Uint8Array;
    try {
        signature = base64Decode(certificateProof.signature);
        nonce = base64UrlDecode(certificateProof.nonce);
    } catch {
        throw new Error('playback_denied');
    }
    if (signature.length !== 64 || nonce.length !== 32) throw new Error('playback_denied');

    try {
        await verifyNep413Message({
            signerAccountId: input.request.account_id,
            signerPublicKey: certificateProof.public_key,
            payload: {
                message: canonicalJson(input.certificate),
                recipient: env.MARKET_CONTRACT_ID!,
                nonce,
            },
            signature,
            provider: {
                viewAccessKey: async ({ accountId, publicKey }: { accountId: string; publicKey: unknown }) => (
                    readFinalAccessKey(env, accountId, String(publicKey))
                ),
            } as never,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'playback_authorization_unavailable') throw error;
        throw new Error('playback_denied');
    }
    playbackCachePut(
        cacheKey,
        true,
        Math.min(
            Date.now() + DEVICE_CERTIFICATE_CACHE_MS,
            Number(input.certificate.expires_at_ms),
        ),
    );
    return false;
}

export async function verifyEd25519Signature(
    publicKey: string,
    encodedSignature: string,
    message: string,
): Promise<void> {
    let signature: Uint8Array;
    let publicKeyBytes: Uint8Array;
    try {
        signature = base64Decode(encodedSignature);
        publicKeyBytes = base58Decode(publicKey);
    } catch {
        throw new Error('playback_denied');
    }
    if (signature.length !== 64 || publicKeyBytes.length !== 32) throw new Error('playback_denied');
    const key = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', false, ['verify']);
    if (!await crypto.subtle.verify(
        'Ed25519',
        key,
        signature,
        new TextEncoder().encode(message),
    )) {
        throw new Error('playback_denied');
    }
}

export function parsePlaybackSessionAuthorization(value: unknown): JsonObject {
    const session = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(session, ['session_public_key', 'certificate_sha256', 'authorization_duration_ms'], 'invalid_playback_v2_request');
    if (typeof session.session_public_key !== 'string' || !SESSION_KEY_PATTERN.test(session.session_public_key)
        || typeof session.certificate_sha256 !== 'string' || !SHA256_PATTERN.test(session.certificate_sha256)
        || session.authorization_duration_ms !== String(MARKET_DEVICE_LIFETIME_MS)) throw new Error('invalid_playback_v2_request');
    return session;
}

async function verifyMarketDeviceProof(env: Env, input: PlaybackV2Request): Promise<boolean> {
    if (!('kind' in input.certificateProof)) throw new Error('playback_denied');
    const cacheKey = await playbackCacheKey(env, 'market-device', canonicalJson({
        account_id: input.request.account_id, certificate: input.certificate, proof: input.certificateProof,
    }));
    const cachedExpiry = playbackCacheGet<number>(cacheKey);
    if (cachedExpiry !== undefined) {
        input.deviceExpiresAtMs = cachedExpiry;
        return true;
    }
    const read = await nearPlaybackView(env, env.MARKET_CONTRACT_ID!, 'get_playback_device', {
        account_id: input.request.account_id, session_public_key: input.certificate.session_public_key,
    });
    const device = requireObject(read.value, 'playback_denied');
    if (device.session_public_key !== input.certificate.session_public_key
        || device.certificate_sha256 !== input.request.certificate_sha256
        || typeof device.authorized_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.authorized_at_ms)
        || typeof device.expires_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.expires_at_ms)
        || Number(device.expires_at_ms) - Number(device.authorized_at_ms) !== MARKET_DEVICE_LIFETIME_MS
        || Number(device.authorized_at_ms) > Date.now() || Number(device.expires_at_ms) <= Date.now()) throw new Error('playback_denied');
    let publicKey = device.authorizing_public_key;
    if (publicKey === null) {
        publicKey = await verifyPlaybackDelegate(env, input);
    }
    if (typeof publicKey !== 'string' || !SESSION_KEY_PATTERN.test(publicKey)) throw new Error('playback_denied');
    await readFinalAccessKey(env, input.request.account_id, publicKey);
    input.deviceExpiresAtMs = Number(device.expires_at_ms);
    playbackCachePut(cacheKey, input.deviceExpiresAtMs, Math.min(Date.now() + DEVICE_CERTIFICATE_CACHE_MS, input.deviceExpiresAtMs));
    return false;
}

async function verifyPlaybackDelegate(env: Env, input: PlaybackV2Request): Promise<string> {
    if (!('kind' in input.certificateProof) || !input.certificateProof.signed_delegate_base64) throw new Error('playback_denied');
    try {
        const bytes = base64Decode(input.certificateProof.signed_delegate_base64);
        const signed = deserialize(SCHEMA.SignedDelegate, bytes) as unknown as SignedDelegate;
        if (!constantTimeEqual(encodeSignedDelegate(signed), bytes)) throw new Error('playback_denied');
        const delegate = signed.delegateAction;
        if (delegate.senderId !== input.request.account_id || delegate.receiverId !== usdcContractId(env)
            || delegate.actions.length !== 1) throw new Error('playback_denied');
        const call = delegate.actions[0].functionCall;
        if (!call || call.methodName !== 'ft_transfer_call' || call.deposit !== 1n) throw new Error('playback_denied');
        const args = JSON.parse(new TextDecoder().decode(Uint8Array.from(call.args))) as JsonObject;
        if (args.receiver_id !== env.MARKET_CONTRACT_ID || typeof args.msg !== 'string') throw new Error('playback_denied');
        const message = args.msg.startsWith(COMPACT_UPLOAD_PREFIX)
            ? await unpackCompactUpload(args.msg, { network: env.NEAR_NETWORK!, market: env.MARKET_CONTRACT_ID!, creator: input.request.account_id,
                usdc: usdcContractId(env), keyString: bytes => `ed25519:${baseEncode(bytes)}` }) : JSON.parse(args.msg) as JsonObject;
        const authorization = parsePlaybackSessionAuthorization(message.playback_session);
        if (message.action !== 'create_paid_job' || message.creator_id !== input.request.account_id
            || authorization.session_public_key !== input.certificate.session_public_key
            || authorization.certificate_sha256 !== input.request.certificate_sha256) throw new Error('playback_denied');
        const publicKey = (delegate.publicKey as unknown as { ed25519Key: { data: number[] } }).ed25519Key.data;
        const signature = (signed.signature as unknown as { ed25519Signature: { data: number[] } }).ed25519Signature.data;
        const digest = await crypto.subtle.digest('SHA-256', encodeDelegateAction(delegate));
        const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey), 'Ed25519', false, ['verify']);
        if (!await crypto.subtle.verify('Ed25519', key, Uint8Array.from(signature), digest)) throw new Error('playback_denied');
        // The accepted Market record supplies the 30-day lifetime. The delegate's
        // block window only limits submitting the payment, not using its proof.
        return `ed25519:${baseEncode(Uint8Array.from(publicKey))}`;
    } catch { throw new Error('playback_denied'); }
}

function canonicalPlaybackV2Message(request: PlaybackV2Envelope): string {
    return [
        request.domain,
        request.version,
        request.network,
        request.contract_id,
        request.account_id,
        request.origin,
        request.request_nonce,
        request.request_expires_at_ms,
        request.body_sha256,
        request.certificate_sha256,
    ].join('\n');
}

export async function readStatelessPlaybackAuthorization(
    env: Env,
    input: PlaybackV2Request,
): Promise<{
    publicationCacheHit: boolean;
    entitlementCacheHit: boolean;
    providerCacheHit: boolean;
    profileConfigSha256: string;
    previewVttUrl?: string;
}> {
    const publicationCacheKey = await playbackCacheKey(
        env,
        'publication',
        input.body.publication_id,
    );
    let publication = playbackCacheGet<JsonObject>(publicationCacheKey);
    const publicationCacheHit = publication !== undefined;
    let publicationBlockHash: string | undefined;
    if (!publication) {
        const publicationRead = await nearPlaybackView(
            env,
            env.MARKET_CONTRACT_ID!,
            'get_publication',
            { publication_id: input.body.publication_id },
        );
        publication = requireObject(publicationRead.value, 'playback_denied');
        publicationBlockHash = publicationRead.blockHash;
    }
    logTakedownPlaybackAttempt(publication, 'DEVICE_SESSION_CERTIFICATE');
    if (publication.publication_id !== input.body.publication_id
        || publication.generation !== input.body.generation
        || publication.playback_id !== input.body.playback_id
        || !playbackProfileIdAccepted(env, publication.profile_id)
        || !supportedMediaProfile(publication.profile_config_sha256)
        || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))) {
        throw new Error('playback_denied');
    }
    if (publicationBlockHash) {
        playbackCachePut(
            publicationCacheKey,
            publication,
            Date.now() + PUBLICATION_CACHE_MS,
        );
    }

    const tupleHash = await sha256Hex(canonicalJson(publication));
    const entitlementCacheKey = await playbackCacheKey(
        env,
        'entitlement',
        `${input.request.account_id}:${input.body.publication_id}:${tupleHash}`,
    );
    let entitled = playbackCacheGet<boolean>(entitlementCacheKey);
    const entitlementCacheHit = entitled !== undefined;
    if (entitled === undefined) {
        const entitlementRead = await nearPlaybackView(
            env,
            env.MARKET_CONTRACT_ID!,
            'has_entitlement',
            {
                account_id: input.request.account_id,
                publication_id: input.body.publication_id,
            },
            publicationBlockHash,
        );
        entitled = entitlementRead.value === true;
        playbackCachePut(
            entitlementCacheKey,
            entitled,
            Date.now() + (entitled
                ? POSITIVE_ENTITLEMENT_CACHE_MS
                : NEGATIVE_ENTITLEMENT_CACHE_MS),
        );
    }
    if (!entitled) throw new Error('playback_denied');

    const providerCacheKey = await playbackCacheKey(
        env,
        'provider-policy',
        input.body.playback_id,
    );
    let providerPolicy = playbackCacheGet<{ previewVttUrl?: string }>(providerCacheKey);
    const providerCacheHit = providerPolicy !== undefined;
    const profileConfigSha256 = publication.profile_config_sha256 as string;
    if (mediaProfileFamily(profileConfigSha256) === 'stream') throw new Error('playback_denied');
    if (!providerPolicy) {
        providerPolicy = await verifyStatelessProviderPolicy(env, input.body.playback_id, profileConfigSha256);
        playbackCachePut(providerCacheKey, providerPolicy, Date.now() + PROVIDER_POLICY_CACHE_MS);
    }
    return { publicationCacheHit, entitlementCacheHit, providerCacheHit, profileConfigSha256, ...providerPolicy };
}

export async function verifyStatelessProviderPolicy(
    env: Env,
    playbackId: string,
    profileConfigSha256: string | undefined,
): Promise<{ previewVttUrl?: string }> {
    const provider = mediaProvider(env, profileConfigSha256);
    let playback: ProviderPlayback | undefined;
    // One more read after an outage answer: a cold isolate has no policy cache, and a single slow
    // provider read (M4, 2026-10-28: Stream API timed out at 5 s) would otherwise stop a renewal.
    for (let attempt = 0; !playback; attempt += 1) {
        try {
            playback = await provider.readPlayback(playbackId);
        } catch (error) {
            if (safeErrorCode(error) !== 'provider_unavailable') throw new Error('playback_denied');
            if (attempt >= 1) throw error;
        }
    }
    if (playback.kind !== 'vod' || playback.policy !== 'jwt') throw new Error('playback_denied');
    // Optional metadata from the same authorized playback lookup; never fetch it during token issuance.
    const preview = playback.sources.length <= MAX_PROVIDER_PLAYBACK_OUTPUTS
        ? playback.sources.find(source => source.kind === 'vtt' && source.url.length <= 2048
            && playbackUrlAllowed(source.url, provider.hostAllowlist())
            && !new URL(source.url).search && !new URL(source.url).hash)
        : undefined;
    return preview ? { previewVttUrl: preview.url } : {};
}

export async function playbackCacheKey(env: Env, kind: string, value: string): Promise<string> {
    return `${env.CF_VERSION_METADATA.id}:${kind}:${await sha256Hex(value)}`;
}

export function playbackCacheGet<T>(key: string): T | undefined {
    const entry = playbackAuthorizationCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= Date.now()) {
        playbackAuthorizationCache.delete(key);
        return undefined;
    }
    playbackAuthorizationCache.delete(key);
    playbackAuthorizationCache.set(key, entry);
    return entry.value as T;
}

export function playbackCachePut(key: string, value: unknown, expiresAtMs: number): void {
    if (expiresAtMs <= Date.now()) return;
    playbackAuthorizationCache.delete(key);
    while (playbackAuthorizationCache.size >= PLAYBACK_CACHE_MAX_RECORDS) {
        const oldest = playbackAuthorizationCache.keys().next().value as string | undefined;
        if (!oldest) break;
        playbackAuthorizationCache.delete(oldest);
    }
    playbackAuthorizationCache.set(key, { value, expiresAtMs });
}

export function logTakedownPlaybackAttempt(
    publication: JsonObject,
    protocol: 'DEVICE_SESSION_CERTIFICATE' | 'LEGACY_SESSION_GRANT',
): void {
    if (publication.availability !== 'TAKEDOWN') return;
    console.warn(formatLog('takedown_playback_token_attempted', { protocol }));
}
