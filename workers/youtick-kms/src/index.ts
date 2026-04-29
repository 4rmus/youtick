/**
 * Youtick KMS — Cloudflare Worker
 *
 * Multi-operator Key Management Service for Youtick.
 * Each operator stores one Shamir share of the AES content key,
 * encrypted at rest with a per-operator secret.
 *
 * Endpoints:
 *   POST /store    — Store an encrypted share (creator, Ed25519 / session-grant signed)
 *   POST /retrieve — Retrieve a share (viewer, ticket-verified via access-control grant)
 *   GET  /health   — Operator health + registry status
 *
 * Security:
 *   - Ed25519 signature verification on every request
 *   - Session-grant verification via access-control contract
 *   - NEAR RPC ticket ownership check + creator self-access
 *   - Timestamp-based replay protection (5-min window)
 *   - Per-IP rate limiting via KV
 *   - CORS allowlist enforcement
 *   - Access cache for repeated ticket checks (1-hour TTL)
 */

import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface Env {
    VIDEO_KEYS: KVNamespace;
    RATE_LIMIT: KVNamespace;
    ACCESS_CACHE: KVNamespace;
    ALLOWED_ORIGINS: string;
    NEAR_NETWORK: string;
    NEAR_CONTRACT_ID: string;
    NEAR_ACCESS_CONTRACT_ID: string;
    NEAR_REGISTRY_CONTRACT_ID: string;
    OPERATOR_SHARE_SECRET?: string;
    OPERATOR_SHARE_SECRET_PREVIOUS?: string;
    REGISTRY_OPERATOR_ACCOUNT_ID?: string;
    CACHE_KEY_PREFIX?: string;
}

function cp(env: Env): string {
    return env.CACHE_KEY_PREFIX || '';
}

interface StoreRequest {
    action: 'store';
    videoId: string;
    aesKeyB64: string;
    accountId?: string;
    timestamp: number;
    signature: string; // hex-encoded Ed25519 signature
    publicKey: string; // base58-encoded Ed25519 public key
    originHash?: string | null;
    deviceHash?: string | null;
    shareB64?: string;
    shareId?: number;
    totalShares?: number;
    requiredShares?: number;
    scheme?: 'shamir-v1';
    nonce?: string;
}

interface RetrieveRequest {
    action: 'retrieve';
    videoId: string;
    accountId?: string;
    timestamp: number;
    signature: string;
    publicKey: string;
    originHash?: string | null;
    deviceHash?: string | null;
    nonce?: string;
}

interface AuthChallengeRequest {
    accountId: string;
    action: 'store' | 'retrieve';
    videoId: string;
}

interface AuthVerifyRequest {
    challengeId: string;
    accountId: string;
    publicKey: string;
    signature: string; // base64-encoded Ed25519 signature from wallet signMessage
}

interface AuthChallengeRecord {
    challengeId: string;
    accountId: string;
    action: 'store' | 'retrieve';
    videoId: string;
    message: string;
    recipient: string;
    nonce: string; // base64
    expiresAt: number;
}

const AuthChallengeRecordSchema = z.object({
    challengeId: z.string().min(1),
    accountId: z.string().min(1),
    action: z.enum(['store', 'retrieve']),
    videoId: z.string().min(1),
    message: z.string().min(1),
    recipient: z.string().min(1),
    nonce: z.string().min(1),
    expiresAt: z.number().int(),
});

interface AuthTokenClaims {
    accountId: string;
    action: 'store' | 'retrieve';
    videoId: string;
    publicKey: string;
    expiresAt: number;
}

const AuthTokenClaimsSchema = z.object({
    accountId: z.string().min(1),
    action: z.enum(['store', 'retrieve']),
    videoId: z.string().min(1),
    publicKey: z.string().min(1),
    expiresAt: z.number().int(),
});

interface SessionGrantVerification {
    valid: boolean;
    owner_id?: string | null;
    reason?: string | null;
}

interface UploadSessionView {
    owner_id: string;
    expires_at_ms: number;
    status?: string | { [key: string]: unknown } | null;
}

export interface ShareMetadataRecord {
    scheme: 'shamir-v1';
    totalShares: number;
    requiredShares: number;
}

const ShareMetadataRecordSchema = z.object({
    scheme: z.literal('shamir-v1'),
    totalShares: z.number().int().min(2).max(255),
    requiredShares: z.number().int().min(2).max(255),
});

export interface StoredShareRecord extends ShareMetadataRecord {
    shareId: number;
    nonceB64: string;
    ciphertextB64: string;
}

const StoredShareRecordSchema = ShareMetadataRecordSchema.extend({
    shareId: z.number().int().min(0).max(255),
    nonceB64: z.string().min(1),
    ciphertextB64: z.string().min(1),
});

interface RegistryOperatorRecord {
    account_id: string;
    endpoint: string;
    transport_public_key: string;
    kind: 'DecryptionOperator' | 'Relayer';
    active: boolean;
}

interface KMSResponse {
    ok: boolean;
    error?: string;
    data?: Record<string, unknown>;
}

export interface WorkerReadiness {
    ready: boolean;
    errors: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Fastnear-first RPC pool for maximum speed */
const RPC_POOL = [
    'https://rpc.mainnet.fastnear.com',
    'https://rpc.mainnet.near.org',
    'https://near.lava.build',
];

const TESTNET_RPC_POOL = [
    'https://rpc.testnet.near.org',
];

/** Request timestamp must be within this window (5 minutes) */
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/** Rate limiting: max requests per IP per minute */
const RATE_LIMIT_WINDOW_S = 60;
const RATE_LIMIT_MAX_STORE = 20;
const RATE_LIMIT_MAX_RETRIEVE = 120;

/** Access cache TTLs: keep auth caches short so revokes and transfers take effect quickly */
const KEY_BINDING_CACHE_TTL_S = 120;
const TICKET_ACCESS_CACHE_TTL_S = 30;
const TICKET_ACCESS_NEGATIVE_CACHE_TTL_S = 15;
const EVENT_CREATOR_CACHE_TTL_S = 1800;
const REGISTRY_CACHE_TTL_S = 120;
const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const AUTH_TOKEN_TTL_MS = 10 * 60 * 1000;
const NEP413_TAG = 2147484061;
const RPC_REQUEST_TIMEOUT_MS = 2_500;
const RPC_HEALTH_TIMEOUT_MS = 1_500;

const preferredRpcUrlByNetwork = new Map<string, string>();

// ============================================================================
// CORS
// ============================================================================

export function getAllowedOrigins(env: Env): Set<string> {
    return new Set(
        (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
    );
}

export function getWorkerReadiness(env: Env): WorkerReadiness {
    const errors: string[] = [];

    if (env.NEAR_NETWORK === 'mainnet') {
        if (!env.NEAR_REGISTRY_CONTRACT_ID) {
            errors.push('NEAR_REGISTRY_CONTRACT_ID is required on mainnet');
        }
        if (!env.REGISTRY_OPERATOR_ACCOUNT_ID) {
            errors.push('REGISTRY_OPERATOR_ACCOUNT_ID is required on mainnet');
        }
        if (!env.OPERATOR_SHARE_SECRET) {
            errors.push('OPERATOR_SHARE_SECRET is required on mainnet');
        } else if (env.OPERATOR_SHARE_SECRET.length < 32) {
            errors.push('OPERATOR_SHARE_SECRET must be at least 32 characters');
        } else if (env.OPERATOR_SHARE_SECRET.startsWith('CHANGE-ME')) {
            errors.push('OPERATOR_SHARE_SECRET must be changed from the default placeholder');
        }

        if (env.OPERATOR_SHARE_SECRET_PREVIOUS) {
            if (env.OPERATOR_SHARE_SECRET_PREVIOUS.length < 32) {
                errors.push('OPERATOR_SHARE_SECRET_PREVIOUS must be at least 32 characters when set');
            } else if (env.OPERATOR_SHARE_SECRET_PREVIOUS.startsWith('CHANGE-ME')) {
                errors.push('OPERATOR_SHARE_SECRET_PREVIOUS must not be a placeholder value');
            } else if (env.OPERATOR_SHARE_SECRET_PREVIOUS === env.OPERATOR_SHARE_SECRET) {
                errors.push('OPERATOR_SHARE_SECRET_PREVIOUS must differ from OPERATOR_SHARE_SECRET');
            }
        }
    }

    return {
        ready: errors.length === 0,
        errors,
    };
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
    const origin = request.headers.get('Origin') || '';
    const allowed = getAllowedOrigins(env);

    // CORS-1 fix: localhost origins are only allowed in non-mainnet environments.
    // On mainnet, only explicitly listed origins in ALLOWED_ORIGINS are accepted.
    const isLocalhost =
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin === 'http://localhost' ||
        origin === 'http://127.0.0.1';

    const localhostAllowed = env.NEAR_NETWORK !== 'mainnet' && isLocalhost;

    if (!localhostAllowed && !allowed.has(origin)) {
        return {};
    }

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

function handleOptions(request: Request, env: Env): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
    });
}

// ============================================================================
// NEAR RPC Helpers (Zero-dependency, raw fetch)
// ============================================================================

function getRpcPool(env: Env): string[] {
    return env.NEAR_NETWORK === 'testnet' ? TESTNET_RPC_POOL : RPC_POOL;
}

function getOrderedRpcPool(env: Env): string[] {
    const rpcPool = getRpcPool(env);
    const preferred = preferredRpcUrlByNetwork.get(env.NEAR_NETWORK);

    if (!preferred || !rpcPool.includes(preferred)) {
        return rpcPool;
    }

    return [preferred, ...rpcPool.filter((rpcUrl) => rpcUrl !== preferred)];
}

async function fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = init.signal;
    const signal = externalSignal
        ? AbortSignal.any([controller.signal, externalSignal])
        : controller.signal;

    try {
        return await fetch(input, {
            ...init,
            signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Call a NEAR view function via RPC with parallel failover.
 * All RPC endpoints are queried concurrently; the first successful
 * response wins and the remaining requests are aborted.
 */
async function nearViewCall<T>(
    env: Env,
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    const rpcPool = getOrderedRpcPool(env);
    const argsBase64 = btoa(JSON.stringify(args));

    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'query',
        params: {
            request_type: 'call_function',
            finality: 'final',
            account_id: contractId,
            method_name: methodName,
            args_base64: argsBase64,
        },
    });

    const errors = new Map<string, Error>();
    const abortControllers = rpcPool.map(() => new AbortController());

    const promises = rpcPool.map(async (rpcUrl, index) => {
        try {
            const controller = abortControllers[index];
            const response = await fetchWithTimeout(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: controller.signal,
            }, RPC_REQUEST_TIMEOUT_MS);

            if (!response.ok) {
                throw new Error(`RPC ${rpcUrl} returned ${response.status}`);
            }

            const json = (await response.json()) as {
                result?: { result: number[] };
                error?: { message: string };
            };

            if (json.error) {
                throw new Error(`RPC error: ${json.error.message}`);
            }

            if (!json.result?.result) {
                throw new Error(`RPC ${rpcUrl}: no result`);
            }

            preferredRpcUrlByNetwork.set(env.NEAR_NETWORK, rpcUrl);

            // Abort remaining requests
            abortControllers.forEach((ac, i) => {
                if (i !== index) ac.abort();
            });

            const resultStr = String.fromCharCode(...json.result.result);
            return JSON.parse(resultStr) as T;
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            errors.set(rpcUrl, error);
            throw error;
        }
    });

    // Race all RPC calls — first success wins. If all fail, throw the last error.
    try {
        return await Promise.any(promises);
    } catch {
        const lastError = Array.from(errors.values()).pop();
        console.error('[KMS] nearViewCall: all RPC endpoints failed:', [...errors.entries()]);
        throw lastError || new Error('All RPC endpoints failed');
    }
}

/**
 * Raw NEAR RPC query (non-contract, e.g. view_access_key).
 * Parallel failover across RPC pool — first success wins.
 */
async function nearRpcQuery<T>(
    env: Env,
    params: Record<string, unknown>,
): Promise<T> {
    const rpcPool = getOrderedRpcPool(env);
    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'query',
        params,
    });

    const errors = new Map<string, Error>();
    const abortControllers = rpcPool.map(() => new AbortController());

    const promises = rpcPool.map(async (rpcUrl, index) => {
        try {
            const controller = abortControllers[index];
            const response = await fetchWithTimeout(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: controller.signal,
            }, RPC_REQUEST_TIMEOUT_MS);

            if (!response.ok) {
                throw new Error(`RPC ${rpcUrl} returned ${response.status}`);
            }

            const json = (await response.json()) as {
                result?: T;
                error?: { message: string; cause?: { name: string } };
            };

            if (json.error) {
                throw new Error(`RPC error: ${json.error.message}`);
            }

            // Abort remaining requests
            abortControllers.forEach((ac, i) => {
                if (i !== index) ac.abort();
            });

            preferredRpcUrlByNetwork.set(env.NEAR_NETWORK, rpcUrl);
            return json.result as T;
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            errors.set(rpcUrl, error);
            throw error;
        }
    });

    try {
        return await Promise.any(promises);
    } catch {
        const lastError = Array.from(errors.values()).pop();
        console.error('[KMS] nearRpcQuery: all RPC endpoints failed:', [...errors.entries()]);
        throw lastError || new Error('All RPC endpoints failed');
    }
}

/**
 * SECURITY: Verify that a public key is actually registered on a NEAR account.
 * Prevents spoofing: attacker can't sign with their own key while claiming another accountId.
 *
 * Uses NEAR RPC view_access_key to check if the public key exists on the account.
 */
async function verifyPublicKeyBinding(
    env: Env,
    accountId: string,
    publicKeyBase58: string,
): Promise<boolean> {
    // Cache the binding check (public keys don't change often)
    const cacheKey = `${env.CACHE_KEY_PREFIX || ''}pkbind:${accountId}:${publicKeyBase58}`;
    const cached = await env.ACCESS_CACHE.get(cacheKey);
    if (cached === 'true') {
        return true;
    }

    try {
        await nearRpcQuery<{ nonce: number; permission: unknown }>(env, {
            request_type: 'view_access_key',
            finality: 'final',
            account_id: accountId,
            public_key: publicKeyBase58,
        });

        // If we get here, the key exists on this account
        await env.ACCESS_CACHE.put(cacheKey, 'true', { expirationTtl: KEY_BINDING_CACHE_TTL_S });
        return true;
    } catch (error) {
        // Key not found on account OR RPC error
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('does not exist') || msg.includes('UnknownAccessKey')) {
            return false; // Key definitely not on this account
        }
        console.error('[KMS] verifyPublicKeyBinding RPC error:', msg);
        return false; // Fail-closed: deny on RPC error
    }
}

async function verifyFullAccessKeyBinding(
    env: Env,
    accountId: string,
    publicKeyBase58: string,
): Promise<boolean> {
    const cacheKey = `${env.CACHE_KEY_PREFIX || ''}pkfull:${accountId}:${publicKeyBase58}`;
    const cached = await env.ACCESS_CACHE.get(cacheKey);
    if (cached === 'true') {
        return true;
    }

    try {
        const accessKey = await nearRpcQuery<{ nonce: number; permission: unknown }>(env, {
            request_type: 'view_access_key',
            finality: 'final',
            account_id: accountId,
            public_key: publicKeyBase58,
        });

        const isFullAccess = accessKey.permission === 'FullAccess';
        if (isFullAccess) {
            await env.ACCESS_CACHE.put(cacheKey, 'true', { expirationTtl: KEY_BINDING_CACHE_TTL_S });
        }
        return isFullAccess;
    } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('does not exist') || msg.includes('UnknownAccessKey')) {
            return false;
        }
        console.error('[KMS] verifyFullAccessKeyBinding RPC error:', msg);
        return false;
    }
}

/**
 * Verify that an account has a valid ticket for a video.
 *
 * Uses `has_ticket(account_id, encrypted_cid)` for NFT-backed access.
 * Free videos also require a real NFT mint via `claim_free_ticket_direct`.
 */
async function verifyTicketAccess(
    env: Env,
    accountId: string,
    videoId: string,
): Promise<boolean> {
    // Check access cache first
    const cacheKey = `${env.CACHE_KEY_PREFIX || ''}access:${accountId}:${videoId}`;
    const cached = await env.ACCESS_CACHE.get(cacheKey);
    if (cached === 'true') {
        return true;
    }
    if (cached === 'false') {
        return false;
    }

    try {
        const hasTicket = await nearViewCall<boolean>(
            env,
            env.NEAR_CONTRACT_ID,
            'has_ticket',
            { account_id: accountId, encrypted_cid: videoId },
        );

        if (hasTicket) {
            await env.ACCESS_CACHE.put(cacheKey, 'true', { expirationTtl: TICKET_ACCESS_CACHE_TTL_S });
            return true;
        }

        // Negative caching: short TTL to reduce RPC load while keeping revocation responsive
        await env.ACCESS_CACHE.put(cacheKey, 'false', { expirationTtl: TICKET_ACCESS_NEGATIVE_CACHE_TTL_S });
        return false;
    } catch (error) {
        console.error('[KMS] verifyTicketAccess failed:', error);
        // On RPC failure, deny access (fail-closed for security)
        return false;
    }
}

/**
 * Fetch event creator by encrypted CID (video UUID).
 * Returns null if event does not exist or RPC fails.
 */
async function getEventCreatorId(
    env: Env,
    encryptedCid: string,
): Promise<string | null> {
    const cacheKey = `${env.CACHE_KEY_PREFIX || ''}eventcreator:${encryptedCid}`;
    const cached = await env.ACCESS_CACHE.get(cacheKey);
    if (cached) {
        return cached === '__null__' ? null : cached;
    }

    try {
        const event = await nearViewCall<{ creator_id: string } | null>(
            env,
            env.NEAR_CONTRACT_ID,
            'get_event',
            { encrypted_cid: encryptedCid },
        );
        const creatorId = event?.creator_id ?? null;
        await env.ACCESS_CACHE.put(
            cacheKey,
            creatorId || '__null__',
            { expirationTtl: EVENT_CREATOR_CACHE_TTL_S },
        );
        return creatorId;
    } catch (error) {
        console.error('[KMS] getEventCreatorId failed:', error);
        return null;
    }
}

async function verifySessionGrantAccess(
    env: Env,
    publicKey: string,
    scope: 'Play' | 'Publish',
    videoId: string,
    originHash?: string | null,
    deviceHash?: string | null,
): Promise<SessionGrantVerification> {
    if (!env.NEAR_ACCESS_CONTRACT_ID) {
        return {
            valid: false,
            reason: 'Access contract is not configured',
        };
    }

    try {
        return await nearViewCall<SessionGrantVerification>(
            env,
            env.NEAR_ACCESS_CONTRACT_ID,
            'verify_session_grant',
            {
                session_pk: publicKey,
                scope,
                resource_id: videoId,
                origin_hash: originHash ?? null,
                device_hash: deviceHash ?? null,
            },
        );
    } catch (error) {
        console.error('[KMS] verifySessionGrantAccess failed:', error);
        return {
            valid: false,
            reason: 'Access contract verification failed',
        };
    }
}

async function verifyUploadSessionAuthority(
    env: Env,
    accountId: string,
    publicKey: string,
): Promise<boolean> {
    try {
        const session = await nearViewCall<UploadSessionView | null>(
            env,
            env.NEAR_CONTRACT_ID,
            'get_upload_session',
            { public_key: publicKey },
        );

        if (!session) {
            return false;
        }

        if (session.owner_id !== accountId) {
            return false;
        }

        if (Date.now() > session.expires_at_ms) {
            return false;
        }

        if (typeof session.status === 'string') {
            return !['Completed', 'Revoked', 'Expired'].includes(session.status);
        }

        return true;
    } catch (error) {
        console.error('[KMS] verifyUploadSessionAuthority failed:', error);
        return false;
    }
}

async function verifyRegistryOperatorAuthority(
    request: Request,
    env: Env,
): Promise<{ ok: boolean; reason?: string }> {
    if (!env.NEAR_REGISTRY_CONTRACT_ID || !env.REGISTRY_OPERATOR_ACCOUNT_ID) {
        if (env.NEAR_NETWORK === 'mainnet') {
            return {
                ok: false,
                reason: 'Registry operator configuration is incomplete for mainnet',
            };
        }
        return { ok: true };
    }

    const requestOrigin = new URL(request.url).origin;
    const cacheKey = `${env.CACHE_KEY_PREFIX || ''}registry:operator:${env.REGISTRY_OPERATOR_ACCOUNT_ID}:${requestOrigin}`;
    const cached = await env.ACCESS_CACHE.get(cacheKey);
    if (cached === 'true') {
        return { ok: true };
    }

    try {
        const record = await nearViewCall<RegistryOperatorRecord | null>(
            env,
            env.NEAR_REGISTRY_CONTRACT_ID,
            'get_decryption_operator',
            { account_id: env.REGISTRY_OPERATOR_ACCOUNT_ID },
        );

        if (!record || !record.active) {
            return {
                ok: false,
                reason: 'Registry operator record is missing or inactive',
            };
        }

        const endpointOrigin = new URL(record.endpoint).origin;
        if (endpointOrigin !== requestOrigin) {
            return {
                ok: false,
                reason: 'Registry operator endpoint does not match this worker',
            };
        }

        await env.ACCESS_CACHE.put(cacheKey, 'true', { expirationTtl: REGISTRY_CACHE_TTL_S });
        return { ok: true };
    } catch (error) {
        console.error('[KMS] verifyRegistryOperatorAuthority failed:', error);
        return {
            ok: false,
            reason: 'Registry operator verification failed',
        };
    }
}

// ============================================================================
// Rate Limiting
// ============================================================================

async function checkRateLimit(
    env: Env,
    ip: string,
    action: string,
): Promise<boolean> {
    const key = `${env.CACHE_KEY_PREFIX || ''}rl:${action}:${ip}`;
    const max = action === 'store' ? RATE_LIMIT_MAX_STORE : RATE_LIMIT_MAX_RETRIEVE;

    const current = parseInt((await env.RATE_LIMIT.get(key)) || '0', 10);
    if (current >= max) {
        return false;
    }

    await env.RATE_LIMIT.put(key, String(current + 1), {
        expirationTtl: RATE_LIMIT_WINDOW_S,
    });
    return true;
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify an Ed25519 signature using the Web Crypto API.
 *
 * The payload is: JSON.stringify({ action, videoId, accountId, timestamp })
 * The signature is hex-encoded, the public key is base58-encoded.
 */
async function verifyEd25519Signature(
    payload: string,
    signatureHex: string,
    publicKeyBase58: string,
): Promise<boolean> {
    try {
        // Decode base58 public key
        const publicKeyBytes = base58Decode(publicKeyBase58);

        // Decode hex signature
        const signatureBytes = hexToBytes(signatureHex);

        // Encode payload as UTF-8
        const payloadBytes = new TextEncoder().encode(payload);

        // Import the Ed25519 public key
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            publicKeyBytes,
            { name: 'Ed25519' },
            false,
            ['verify'],
        );

        // Verify the signature
        return await crypto.subtle.verify('Ed25519', cryptoKey, signatureBytes, payloadBytes);
    } catch (error) {
        console.error('[KMS] Signature verification error:', error);
        return false;
    }
}

// ============================================================================
// Utility: Base58 & Hex
// ============================================================================

import { base58Decode } from '../../shared/src/base58';

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64UrlEncode(bytes: Uint8Array): string {
    return bytesToBase64(bytes)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

export function encodeU32LE(value: number): Uint8Array {
    const out = new Uint8Array(4);
    const view = new DataView(out.buffer);
    view.setUint32(0, value, true);
    return out;
}

export function encodeStringBorsh(value: string): Uint8Array {
    const bytes = new TextEncoder().encode(value);
    const out = new Uint8Array(4 + bytes.length);
    out.set(encodeU32LE(bytes.length), 0);
    out.set(bytes, 4);
    return out;
}

export function encodeOptionStringBorsh(value?: string): Uint8Array {
    if (!value) {
        return new Uint8Array([0]);
    }

    const encoded = encodeStringBorsh(value);
    const out = new Uint8Array(1 + encoded.length);
    out[0] = 1;
    out.set(encoded, 1);
    return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

async function hashBytes(bytes: Uint8Array): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(digest);
}

function shareRecordKey(videoId: string, operatorAccountId: string): string {
    return `share:${videoId}:${operatorAccountId}`;
}

function shareMetaKey(videoId: string): string {
    return `sharemeta:${videoId}`;
}

// K-1 fix: Use HKDF instead of raw SHA-256 for proper key derivation.
// HKDF provides extract-then-expand with a salt, preventing weak-key issues
// from low-entropy input secrets.
export async function importShareCipherKeyFromSecret(secret: string): Promise<CryptoKey> {
    const secretBytes = new TextEncoder().encode(secret);

    // HKDF-Extract phase: use a fixed salt derived from the app context
    const salt = new TextEncoder().encode('youtick-kms-share-cipher-v1');

    // Import the secret as raw key material for HKDF
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        'HKDF',
        false,
        ['deriveKey'],
    );

    // HKDF-Expand: derive a 256-bit AES-GCM key
    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info: new TextEncoder().encode('aes-256-gcm-share-encryption'),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function importShareCipherKey(env: Env): Promise<CryptoKey> {
    if (!env.OPERATOR_SHARE_SECRET) {
        throw new Error('OPERATOR_SHARE_SECRET is not configured');
    }
    return importShareCipherKeyFromSecret(env.OPERATOR_SHARE_SECRET);
}

export async function encryptShareRecord(
    env: Env,
    record: ShareMetadataRecord & { shareId: number; shareB64: string },
): Promise<StoredShareRecord> {
    const cipherKey = await importShareCipherKey(env);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(record.shareB64);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        cipherKey,
        plaintext,
    );

    return {
        shareId: record.shareId,
        totalShares: record.totalShares,
        requiredShares: record.requiredShares,
        scheme: record.scheme,
        nonceB64: bytesToBase64(nonce),
        ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
    };
}

export async function decryptShareRecord(
    env: Env,
    record: StoredShareRecord,
): Promise<string> {
    const nonce = base64ToBytes(record.nonceB64);
    const ciphertext = base64ToBytes(record.ciphertextB64);

    const cipherKey = await importShareCipherKey(env);
    try {
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce },
            cipherKey,
            ciphertext,
        );
        return new TextDecoder().decode(new Uint8Array(plaintext));
    } catch (currentKeyError) {
        if (!env.OPERATOR_SHARE_SECRET_PREVIOUS) {
            throw currentKeyError;
        }

        const previousKey = await importShareCipherKeyFromSecret(env.OPERATOR_SHARE_SECRET_PREVIOUS);
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce },
            previousKey,
            ciphertext,
        );
        // Visible via `wrangler tail` — presence of this log means rotation window is still active.
        // Once this stops appearing for the grace period, OPERATOR_SHARE_SECRET_PREVIOUS can be removed.
        console.warn('[KMS] decryptShareRecord: fell back to OPERATOR_SHARE_SECRET_PREVIOUS', {
            shareId: record.shareId,
        });
        return new TextDecoder().decode(new Uint8Array(plaintext));
    }
}

export async function serializeNep413Hash(payload: {
    message: string;
    nonce: Uint8Array;
    recipient: string;
    callbackUrl?: string;
}): Promise<Uint8Array> {
    if (payload.nonce.length !== 32) {
        throw new Error('Nonce must be exactly 32 bytes long');
    }

    const serialized = concatBytes(
        encodeU32LE(NEP413_TAG),
        encodeStringBorsh(payload.message),
        payload.nonce,
        encodeStringBorsh(payload.recipient),
        encodeOptionStringBorsh(payload.callbackUrl),
    );

    return hashBytes(serialized);
}

export async function verifyNep413Signature(
    payload: {
        message: string;
        nonce: Uint8Array;
        recipient: string;
        callbackUrl?: string;
    },
    signatureBase64: string,
    publicKeyBase58: string,
): Promise<boolean> {
    try {
        const publicKeyBytes = base58Decode(publicKeyBase58);
        const signatureBytes = base64ToBytes(signatureBase64);
        const payloadHash = await serializeNep413Hash(payload);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            publicKeyBytes,
            { name: 'Ed25519' },
            false,
            ['verify'],
        );

        return await crypto.subtle.verify('Ed25519', cryptoKey, signatureBytes, payloadHash);
    } catch (error) {
        console.error('[KMS] NEP-413 verification error:', error);
        return false;
    }
}

function randomToken(byteLength = 32): string {
    const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
    return base64UrlEncode(bytes);
}

// ============================================================================
// Response Helpers
// ============================================================================

function jsonResponse(
    data: KMSResponse,
    status: number,
    request: Request,
    env: Env,
): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(request, env),
        },
    });
}

async function readBearerTokenClaims(
    request: Request,
    env: Env,
): Promise<{ claims: AuthTokenClaims | null; error?: string; status?: number }> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return { claims: null };
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return { claims: null, error: 'Unauthorized', status: 401 };
    }

    const rawClaims = await env.ACCESS_CACHE.get(`${cp(env)}auth:token:${token}`);
    if (!rawClaims) {
        return { claims: null, error: 'Unauthorized', status: 401 };
    }

    const parseResult = AuthTokenClaimsSchema.safeParse(JSON.parse(rawClaims));
    if (!parseResult.success) {
        await env.ACCESS_CACHE.delete(`${cp(env)}auth:token:${token}`);
        return { claims: null, error: 'Unauthorized', status: 401 };
    }
    const claims = parseResult.data;
    if (Date.now() > claims.expiresAt) {
        await env.ACCESS_CACHE.delete(`${cp(env)}auth:token:${token}`);
        return { claims: null, error: 'Unauthorized', status: 401 };
    }

    return { claims };
}

async function handleAuthChallenge(
    request: Request,
    env: Env,
): Promise<Response> {
    const body = (await request.json()) as AuthChallengeRequest;

    if (!body.accountId || !body.videoId || !body.action) {
        return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
    }

    if (body.action !== 'store' && body.action !== 'retrieve') {
        return jsonResponse({ ok: false, error: 'Invalid auth action' }, 400, request, env);
    }

    const challengeId = randomToken(18);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const expiresAt = Date.now() + AUTH_CHALLENGE_TTL_MS;
    const recipient = new URL(request.url).origin;
    const message = `Authorize Youtick KMS ${body.action} access for ${body.videoId} until ${new Date(expiresAt).toISOString()}`;

    const challenge: AuthChallengeRecord = {
        challengeId,
        accountId: body.accountId,
        action: body.action,
        videoId: body.videoId,
        message,
        recipient,
        nonce: bytesToBase64(nonceBytes),
        expiresAt,
    };

    await env.ACCESS_CACHE.put(
        `${cp(env)}auth:challenge:${challengeId}`,
        JSON.stringify(challenge),
        { expirationTtl: Math.ceil(AUTH_CHALLENGE_TTL_MS / 1000) },
    );

    return jsonResponse(
        {
            ok: true,
            data: {
                challengeId,
                message,
                recipient,
                nonce: challenge.nonce,
                expiresAt,
            },
        },
        200,
        request,
        env,
    );
}

async function handleAuthVerify(
    request: Request,
    env: Env,
): Promise<Response> {
    const body = (await request.json()) as AuthVerifyRequest;

    if (!body.challengeId || !body.accountId || !body.publicKey || !body.signature) {
        return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
    }

    const rawChallenge = await env.ACCESS_CACHE.get(`${cp(env)}auth:challenge:${body.challengeId}`);
    if (!rawChallenge) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
    }

    const challengeParse = AuthChallengeRecordSchema.safeParse(JSON.parse(rawChallenge));
    if (!challengeParse.success) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
    }
    const challenge = challengeParse.data;
    if (challenge.accountId !== body.accountId) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
    }

    if (Date.now() > challenge.expiresAt) {
        await env.ACCESS_CACHE.delete(`${cp(env)}auth:challenge:${body.challengeId}`);
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
    }

    const isFullAccess = await verifyFullAccessKeyBinding(env, body.accountId, body.publicKey);
    if (!isFullAccess) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
    }

    const verified = await verifyNep413Signature(
        {
            message: challenge.message,
            nonce: base64ToBytes(challenge.nonce),
            recipient: challenge.recipient,
        },
        body.signature,
        body.publicKey,
    );

    if (!verified) {
        return jsonResponse({ ok: false, error: 'Invalid NEP-413 signature' }, 401, request, env);
    }

    await env.ACCESS_CACHE.delete(`${cp(env)}auth:challenge:${body.challengeId}`);

    const token = randomToken(32);
    const expiresAt = Date.now() + AUTH_TOKEN_TTL_MS;
    const claims: AuthTokenClaims = {
        accountId: challenge.accountId,
        action: challenge.action,
        videoId: challenge.videoId,
        publicKey: body.publicKey,
        expiresAt,
    };

    await env.ACCESS_CACHE.put(
        `${cp(env)}auth:token:${token}`,
        JSON.stringify(claims),
        { expirationTtl: Math.ceil(AUTH_TOKEN_TTL_MS / 1000) },
    );

    return jsonResponse(
        {
            ok: true,
            data: {
                token,
                accountId: claims.accountId,
                action: claims.action,
                videoId: claims.videoId,
                expiresAt,
            },
        },
        200,
        request,
        env,
    );
}

// ============================================================================
// Route Handlers
// ============================================================================

async function handleStore(
    request: Request,
    env: Env,
): Promise<Response> {
    const auth = await readBearerTokenClaims(request, env);
    if (auth.error) {
        return jsonResponse({ ok: false, error: auth.error }, auth.status || 401, request, env);
    }

    const body = (await request.json()) as Partial<StoreRequest> & { videoId?: string };
    const isShareStore = Boolean(body.shareB64 && typeof body.shareId === 'number');
    if (!body.videoId || !isShareStore) {
        return jsonResponse({ ok: false, error: 'Missing required fields. Share-based storage is required.' }, 400, request, env);
    }

    if (
        isShareStore
        && (
            !body.scheme
            || typeof body.totalShares !== 'number'
            || typeof body.requiredShares !== 'number'
        )
    ) {
        return jsonResponse({ ok: false, error: 'Missing share metadata fields' }, 400, request, env);
    }

    // S-3 fix: Validate threshold parameters server-side
    if (isShareStore) {
        const { totalShares, requiredShares } = body;
        if (!Number.isInteger(totalShares!) || !Number.isInteger(requiredShares!)) {
            return jsonResponse({ ok: false, error: 'totalShares and requiredShares must be integers' }, 400, request, env);
        }
        if (requiredShares! < 2) {
            return jsonResponse({ ok: false, error: 'requiredShares must be at least 2 (threshold security)' }, 400, request, env);
        }
        if (totalShares! < requiredShares!) {
            return jsonResponse({ ok: false, error: 'totalShares must be >= requiredShares' }, 400, request, env);
        }
        if (totalShares! > 255) {
            return jsonResponse({ ok: false, error: 'totalShares cannot exceed 255' }, 400, request, env);
        }
    }

    let accountId: string;

    if (auth.claims) {
        if (auth.claims.action !== 'store') {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, request, env);
        }
        if (auth.claims.videoId !== body.videoId) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, request, env);
        }
        accountId = auth.claims.accountId;
    } else {
        if (!body.timestamp || !body.signature || !body.publicKey) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
        }

        // Validate timestamp (replay attack protection)
        const now = Date.now();
        if (Math.abs(now - body.timestamp) > TIMESTAMP_WINDOW_MS) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
        }

        // Nonce-based replay protection
        if (body.nonce) {
            const nonceKey = `${cp(env)}used_nonce:${body.nonce}`;
            const nonceUsed = await env.ACCESS_CACHE.get(nonceKey);
            if (nonceUsed) {
                return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
            }
        }

        // Legacy key-bound requests sign { action, videoId, accountId, timestamp, nonce }.
        // Session-grant requests sign { action, videoId, timestamp, originHash, deviceHash, nonce }.
        const payload = body.accountId
            ? JSON.stringify({
                action: 'store',
                videoId: body.videoId,
                accountId: body.accountId,
                timestamp: body.timestamp,
                nonce: body.nonce ?? null,
            })
            : JSON.stringify({
                action: 'store',
                videoId: body.videoId,
                timestamp: body.timestamp,
                originHash: body.originHash ?? null,
                deviceHash: body.deviceHash ?? null,
                nonce: body.nonce ?? null,
            });

        const isValidSig = await verifyEd25519Signature(payload, body.signature, body.publicKey);
        if (!isValidSig) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
        }

        // Store nonce after successful signature verification
        if (body.nonce) {
            const nonceKey = `${cp(env)}used_nonce:${body.nonce}`;
            await env.ACCESS_CACHE.put(nonceKey, 'true', { expirationTtl: TIMESTAMP_WINDOW_MS * 2 / 1000 });
        }

        if (body.accountId) {
            const isKeyBound = await verifyPublicKeyBinding(env, body.accountId, body.publicKey);
            if (!isKeyBound) {
                return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
            }

            const isUploadSessionKey = await verifyUploadSessionAuthority(
                env,
                body.accountId,
                body.publicKey,
            );
            if (!isUploadSessionKey) {
                const isFullAccess = await verifyFullAccessKeyBinding(env, body.accountId, body.publicKey);
                if (!isFullAccess) {
                    return jsonResponse(
                        { ok: false, error: 'Unauthorized' },
                        403,
                        request,
                        env,
                    );
                }
            }

            accountId = body.accountId;
        } else {
            const grantVerification = await verifySessionGrantAccess(
                env,
                body.publicKey,
                'Publish',
                body.videoId,
                body.originHash,
                body.deviceHash,
            );

            if (!grantVerification.valid || !grantVerification.owner_id) {
                return jsonResponse(
                    { ok: false, error: 'Unauthorized' },
                    401,
                    request,
                    env,
                );
            }

            accountId = grantVerification.owner_id;
        }
    }

    const ownerIdKey = `owner:${body.videoId}`;
    const existingShareKey = isShareStore && env.REGISTRY_OPERATOR_ACCOUNT_ID
        ? shareRecordKey(body.videoId, env.REGISTRY_OPERATOR_ACCOUNT_ID)
        : null;

    const [recordedOwner, eventCreatorId, existingShare] = await Promise.all([
        env.VIDEO_KEYS.get(ownerIdKey),
        getEventCreatorId(env, body.videoId),
        existingShareKey ? env.VIDEO_KEYS.get(existingShareKey) : Promise.resolve(null),
    ]);

    if (eventCreatorId && eventCreatorId !== accountId) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, request, env);
    }

    if (existingShare && recordedOwner && recordedOwner !== accountId) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, request, env);
    }

    if (existingShare && !recordedOwner && !eventCreatorId) {
        return jsonResponse(
            { ok: false, error: 'Unauthorized' },
            403,
            request,
            env,
        );
    }

    if (isShareStore) {
        if (!env.REGISTRY_OPERATOR_ACCOUNT_ID) {
            return jsonResponse({ ok: false, error: 'Internal error' }, 500, request, env);
        }

        const encryptedRecord = await encryptShareRecord(env, {
            shareId: body.shareId as number,
            shareB64: body.shareB64 as string,
            totalShares: body.totalShares as number,
            requiredShares: body.requiredShares as number,
            scheme: body.scheme as 'shamir-v1',
        });

        await env.VIDEO_KEYS.put(
            shareRecordKey(body.videoId, env.REGISTRY_OPERATOR_ACCOUNT_ID),
            JSON.stringify(encryptedRecord),
        );
        await env.VIDEO_KEYS.put(
            shareMetaKey(body.videoId),
            JSON.stringify({
                scheme: body.scheme as 'shamir-v1',
                totalShares: body.totalShares as number,
                requiredShares: body.requiredShares as number,
            } satisfies ShareMetadataRecord),
        );
    }

    if (!recordedOwner) {
        await env.VIDEO_KEYS.put(ownerIdKey, accountId);
    }

    return jsonResponse(
        { ok: true, data: { videoId: body.videoId, stored: true } },
        200,
        request,
        env,
    );
}

async function handleRetrieve(
    request: Request,
    env: Env,
): Promise<Response> {
    const auth = await readBearerTokenClaims(request, env);
    if (auth.error) {
        return jsonResponse({ ok: false, error: auth.error }, auth.status || 401, request, env);
    }

    const body = (await request.json()) as Partial<RetrieveRequest> & { videoId?: string };
    if (!body.videoId) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
    }

    let accountId: string;

    if (auth.claims) {
        if (auth.claims.action !== 'retrieve' || auth.claims.videoId !== body.videoId) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
        }
        accountId = auth.claims.accountId;
    } else {
        if (!body.timestamp || !body.signature || !body.publicKey) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
        }

        // Validate timestamp (replay attack protection)
        const now = Date.now();
        if (Math.abs(now - body.timestamp) > TIMESTAMP_WINDOW_MS) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
        }

        // Nonce-based replay protection
        if (body.nonce) {
            const nonceKey = `${cp(env)}used_nonce:${body.nonce}`;
            const nonceUsed = await env.ACCESS_CACHE.get(nonceKey);
            if (nonceUsed) {
                return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
            }
        }

        // Legacy key-bound requests sign { action, videoId, accountId, timestamp, nonce }.
        // Session-grant requests sign { action, videoId, timestamp, originHash, deviceHash, nonce }.
        const payload = body.accountId
            ? JSON.stringify({
                action: 'retrieve',
                videoId: body.videoId,
                accountId: body.accountId,
                timestamp: body.timestamp,
                nonce: body.nonce ?? null,
            })
            : JSON.stringify({
                action: 'retrieve',
                videoId: body.videoId,
                timestamp: body.timestamp,
                originHash: body.originHash ?? null,
                deviceHash: body.deviceHash ?? null,
                nonce: body.nonce ?? null,
            });

        const isValidSig = await verifyEd25519Signature(payload, body.signature, body.publicKey);
        if (!isValidSig) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
        }

        // Store nonce after successful signature verification
        if (body.nonce) {
            const nonceKey = `${cp(env)}used_nonce:${body.nonce}`;
            await env.ACCESS_CACHE.put(nonceKey, 'true', { expirationTtl: TIMESTAMP_WINDOW_MS * 2 / 1000 });
        }

        if (body.accountId) {
            const isKeyBound = await verifyPublicKeyBinding(env, body.accountId, body.publicKey);
            if (!isKeyBound) {
                return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, request, env);
            }

            accountId = body.accountId;
        } else {
            const grantVerification = await verifySessionGrantAccess(
                env,
                body.publicKey,
                'Play',
                body.videoId,
                body.originHash,
                body.deviceHash,
            );

            if (!grantVerification.valid || !grantVerification.owner_id) {
                return jsonResponse(
                    { ok: false, error: 'Unauthorized' },
                    401,
                    request,
                    env,
                );
            }

            accountId = grantVerification.owner_id;
        }
    }

    let hasAccess = await verifyTicketAccess(env, accountId, body.videoId);

    if (!hasAccess) {
        const eventCreatorId = await getEventCreatorId(env, body.videoId);
        if (eventCreatorId && eventCreatorId === accountId) {
            hasAccess = true;
        }
    }

    if (!hasAccess) {
        return jsonResponse({ ok: false, error: 'Not found or unauthorized' }, 404, request, env);
    }

    const shareMetaRaw = await env.VIDEO_KEYS.get(shareMetaKey(body.videoId));
    if (!shareMetaRaw || !env.REGISTRY_OPERATOR_ACCOUNT_ID) {
        return jsonResponse({ ok: false, error: 'Not found or unauthorized' }, 404, request, env);
    }

    const shareRaw = await env.VIDEO_KEYS.get(
        shareRecordKey(body.videoId, env.REGISTRY_OPERATOR_ACCOUNT_ID),
    );

    if (!shareRaw) {
        return jsonResponse({ ok: false, error: 'Not found or unauthorized' }, 404, request, env);
    }

    try {
        const shareParse = StoredShareRecordSchema.safeParse(JSON.parse(shareRaw));
        if (!shareParse.success) {
            return jsonResponse({ ok: false, error: 'Not found or unauthorized' }, 404, request, env);
        }
        const shareRecord = shareParse.data;
        const shareB64 = await decryptShareRecord(env, shareRecord);

        return jsonResponse(
            {
                ok: true,
                data: {
                    shareB64,
                    shareId: shareRecord.shareId,
                    totalShares: shareRecord.totalShares,
                    requiredShares: shareRecord.requiredShares,
                    scheme: shareRecord.scheme,
                    operatorAccountId: env.REGISTRY_OPERATOR_ACCOUNT_ID,
                },
            },
            200,
            request,
            env,
        );
    } catch {
        return jsonResponse({ ok: false, error: 'Not found or unauthorized' }, 404, request, env);
    }
}

async function handleHealth(
    request: Request,
    env: Env,
): Promise<Response> {
    const readiness = getWorkerReadiness(env);
    const rpcPool = getOrderedRpcPool(env);
    const rpcChecks = await Promise.all(
        rpcPool.map(async (rpcUrl) => {
            try {
                const response = await fetchWithTimeout(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'health',
                        method: 'status',
                        params: [],
                    }),
                }, RPC_HEALTH_TIMEOUT_MS);

                return response.ok;
            } catch {
                return false;
            }
        }),
    );
    const rpcHealthyEndpoints = rpcChecks.filter(Boolean).length;

    let kvOk = true;
    try {
        await Promise.all([
            env.VIDEO_KEYS.get('__health__'),
            env.RATE_LIMIT.get('__health__'),
            env.ACCESS_CACHE.get('__health__'),
        ]);
    } catch {
        kvOk = false;
    }

    const registryOperator = await verifyRegistryOperatorAuthority(request, env);
    const ready =
        readiness.ready
        && rpcHealthyEndpoints > 0
        && kvOk
        && registryOperator.ok;

    return jsonResponse(
        {
            ok: ready,
            data: {
                service: 'youtick-kms',
                version: '1.0.0',
                ready,
                readinessErrors: readiness.errors,
                nearRpc: rpcHealthyEndpoints > 0 ? 'ok' : 'degraded',
                nearRpcHealthyEndpoints: rpcHealthyEndpoints,
                nearRpcTotalEndpoints: rpcPool.length,
                kv: kvOk ? 'ok' : 'degraded',
                network: env.NEAR_NETWORK,
                // HE-1 fix: Removed contract IDs, operator account, and share mode
                // from unauthenticated health endpoint to prevent information leakage.
            },
        },
        ready ? 200 : 503,
        request,
        env,
    );
}

// ============================================================================
// Main Router
// ============================================================================

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        // Parse URL
        const url = new URL(request.url);
        const path = url.pathname;

        // Health check
        if (path === '/health' && request.method === 'GET') {
            return handleHealth(request, env);
        }

        // EH-1 fix: Global try-catch ensures unhandled exceptions return proper CORS headers
        try {
            const readiness = getWorkerReadiness(env);
            if (!readiness.ready) {
                return jsonResponse(
                    { ok: false, error: readiness.errors.join('; ') },
                    503,
                    request,
                    env,
                );
            }

            // Only POST for auth/store/retrieve
            if (request.method !== 'POST') {
                return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, request, env);
            }

            // Rate limiting
            const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
            const action = path === '/store'
                ? 'store'
                : path === '/retrieve'
                    ? 'retrieve'
                    : 'auth';
            const withinLimit = await checkRateLimit(env, ip, action);
            if (!withinLimit) {
                return jsonResponse({ ok: false, error: 'Rate limit exceeded' }, 429, request, env);
            }

            const registryOperator = await verifyRegistryOperatorAuthority(request, env);
            if (!registryOperator.ok) {
                return jsonResponse(
                    { ok: false, error: registryOperator.reason || 'Registry operator verification failed' },
                    503,
                    request,
                    env,
                );
            }

            // Route
            switch (path) {
                case '/auth/challenge':
                    return handleAuthChallenge(request, env);
                case '/auth/verify':
                    return handleAuthVerify(request, env);
                case '/store':
                    return handleStore(request, env);
                case '/retrieve':
                    return handleRetrieve(request, env);
                default:
                    return jsonResponse({ ok: false, error: 'Not found' }, 404, request, env);
            }
        } catch (error) {
            // Global error handler — ensures CORS headers on all error responses
            console.error('[KMS] Unhandled error:', error);
            return jsonResponse(
                { ok: false, error: 'Internal server error' },
                500,
                request,
                env,
            );
        }
    },
};
