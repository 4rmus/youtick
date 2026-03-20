/**
 * Youtick KMS — Cloudflare Worker
 *
 * A lightweight, zero-dependency Key Management Service (KMS) for Youtick.
 * Uses Cloudflare Edge + KV for AES key storage/retrieval.
 *
 * Endpoints:
 *   POST /store   — Store an AES key (content creator, Ed25519 signed)
 *   POST /retrieve — Retrieve an AES key (viewer, Ed25519 signed, ticket verified)
 *   GET  /health  — Health check
 *
 * Security:
 *   - Ed25519 signature verification on every request
 *   - NEAR RPC view_call to verify ticket ownership
 *   - Timestamp-based replay attack protection (5-min window)
 *   - Per-IP rate limiting via KV
 *   - CORS allowlist enforcement
 *   - Access cache for repeated ticket checks (1-hour TTL)
 */

// ============================================================================
// Types
// ============================================================================

export interface Env {
    VIDEO_KEYS: KVNamespace;
    RATE_LIMIT: KVNamespace;
    ACCESS_CACHE: KVNamespace;
    ALLOWED_ORIGINS: string;
    NEAR_CONTRACT_ID: string;
    NEAR_ACCESS_CONTRACT_ID?: string;
    NEAR_REGISTRY_CONTRACT_ID?: string;
    REGISTRY_OPERATOR_ACCOUNT_ID?: string;
    OPERATOR_SHARE_SECRET?: string;
    NEAR_NETWORK: string;
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

interface AuthTokenClaims {
    accountId: string;
    action: 'store' | 'retrieve';
    videoId: string;
    publicKey: string;
    expiresAt: number;
}

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

interface ShareMetadataRecord {
    scheme: 'shamir-v1';
    totalShares: number;
    requiredShares: number;
}

interface StoredShareRecord extends ShareMetadataRecord {
    shareId: number;
    nonceB64: string;
    ciphertextB64: string;
}

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

interface WorkerReadiness {
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
const KEY_BINDING_CACHE_TTL_S = 300;
const TICKET_ACCESS_CACHE_TTL_S = 60;
const EVENT_CREATOR_CACHE_TTL_S = 3600;
const REGISTRY_CACHE_TTL_S = 300;
const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const AUTH_TOKEN_TTL_MS = 10 * 60 * 1000;
const NEP413_TAG = 2147484061;
const RPC_REQUEST_TIMEOUT_MS = 2_500;
const RPC_HEALTH_TIMEOUT_MS = 1_500;

const preferredRpcUrlByNetwork = new Map<string, string>();

// ============================================================================
// CORS
// ============================================================================

function getAllowedOrigins(env: Env): Set<string> {
    return new Set(
        (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
    );
}

function getWorkerReadiness(env: Env): WorkerReadiness {
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

    // Development support: explicitly allow localhost and 127.0.0.1 variants
    const isLocalhost =
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin === 'http://localhost' ||
        origin === 'http://127.0.0.1';

    if (!isLocalhost && !allowed.has(origin)) {
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

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Call a NEAR view function via RPC with automatic failover.
 * Uses raw fetch — no near-api-js dependency needed in Worker.
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

    let lastError: Error | null = null;

    for (const rpcUrl of rpcPool) {
        try {
            const response = await fetchWithTimeout(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            }, RPC_REQUEST_TIMEOUT_MS);

            if (!response.ok) {
                lastError = new Error(`RPC ${rpcUrl} returned ${response.status}`);
                continue;
            }

            const json = (await response.json()) as {
                result?: { result: number[] };
                error?: { message: string };
            };

            if (json.error) {
                lastError = new Error(`RPC error: ${json.error.message}`);
                continue;
            }

            if (!json.result?.result) {
                lastError = new Error(`RPC ${rpcUrl}: no result`);
                continue;
            }

            preferredRpcUrlByNetwork.set(env.NEAR_NETWORK, rpcUrl);
            const resultStr = String.fromCharCode(...json.result.result);
            return JSON.parse(resultStr) as T;
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            continue;
        }
    }

    throw lastError || new Error('All RPC endpoints failed');
}

/**
 * Raw NEAR RPC query (non-contract, e.g. view_access_key).
 * Attempts failover across RPC pool.
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

    let lastError: Error | null = null;

    for (const rpcUrl of rpcPool) {
        try {
            const response = await fetchWithTimeout(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            }, RPC_REQUEST_TIMEOUT_MS);

            if (!response.ok) {
                lastError = new Error(`RPC ${rpcUrl} returned ${response.status}`);
                continue;
            }

            const json = (await response.json()) as {
                result?: T;
                error?: { message: string; cause?: { name: string } };
            };

            if (json.error) {
                // "does not exist" means the key is NOT on the account
                lastError = new Error(`RPC error: ${json.error.message}`);
                continue;
            }

            preferredRpcUrlByNetwork.set(env.NEAR_NETWORK, rpcUrl);
            return json.result as T;
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            continue;
        }
    }

    throw lastError || new Error('All RPC endpoints failed');
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
    const cacheKey = `pkbind:${accountId}:${publicKeyBase58}`;
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
    const cacheKey = `pkfull:${accountId}:${publicKeyBase58}`;
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
 * Uses the Youtick smart contract's `has_ticket(account_id, encrypted_cid)` method.
 * This checks if the user owns ANY token whose video metadata matches the given
 * encrypted_cid (the UUID used as the video's access control key).
 */
async function verifyTicketAccess(
    env: Env,
    accountId: string,
    videoId: string,
): Promise<boolean> {
    // Check access cache first
    const cacheKey = `access:${accountId}:${videoId}`;
    const cached = await env.ACCESS_CACHE.get(cacheKey);
    if (cached === 'true') {
        return true;
    }

    try {
        // Use the contract's has_ticket view method
        // This checks if the account holds any NFT ticket for this video
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
    const cacheKey = `eventcreator:${encryptedCid}`;
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
    const cacheKey = `registry:operator:${env.REGISTRY_OPERATOR_ACCOUNT_ID}:${requestOrigin}`;
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
    const key = `rl:${action}:${ip}`;
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

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str: string): Uint8Array {
    // Handle ed25519: prefix from NEAR keys
    const cleanStr = str.replace(/^ed25519:/, '');

    const bytes: number[] = [0];
    for (const char of cleanStr) {
        const idx = BASE58_ALPHABET.indexOf(char);
        if (idx < 0) throw new Error(`Invalid base58 char: ${char}`);

        let carry = idx;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    // Handle leading zeros
    for (const char of cleanStr) {
        if (char !== '1') break;
        bytes.push(0);
    }

    return new Uint8Array(bytes.reverse());
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
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

function encodeU32LE(value: number): Uint8Array {
    const out = new Uint8Array(4);
    const view = new DataView(out.buffer);
    view.setUint32(0, value, true);
    return out;
}

function encodeStringBorsh(value: string): Uint8Array {
    const bytes = new TextEncoder().encode(value);
    const out = new Uint8Array(4 + bytes.length);
    out.set(encodeU32LE(bytes.length), 0);
    out.set(bytes, 4);
    return out;
}

function encodeOptionStringBorsh(value?: string): Uint8Array {
    if (!value) {
        return new Uint8Array([0]);
    }

    const encoded = encodeStringBorsh(value);
    const out = new Uint8Array(1 + encoded.length);
    out[0] = 1;
    out.set(encoded, 1);
    return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
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

async function importShareCipherKey(env: Env): Promise<CryptoKey> {
    if (!env.OPERATOR_SHARE_SECRET) {
        throw new Error('OPERATOR_SHARE_SECRET is not configured');
    }

    const rawKey = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(env.OPERATOR_SHARE_SECRET),
    );

    return crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function encryptShareRecord(
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

async function decryptShareRecord(
    env: Env,
    record: StoredShareRecord,
): Promise<string> {
    const cipherKey = await importShareCipherKey(env);
    const nonce = base64ToBytes(record.nonceB64);
    const ciphertext = base64ToBytes(record.ciphertextB64);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        cipherKey,
        ciphertext,
    );

    return new TextDecoder().decode(new Uint8Array(plaintext));
}

async function serializeNep413Hash(payload: {
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

async function verifyNep413Signature(
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
        return { claims: null, error: 'Invalid Authorization header', status: 401 };
    }

    const rawClaims = await env.ACCESS_CACHE.get(`auth:token:${token}`);
    if (!rawClaims) {
        return { claims: null, error: 'Auth token expired or invalid', status: 401 };
    }

    const claims = JSON.parse(rawClaims) as AuthTokenClaims;
    if (Date.now() > claims.expiresAt) {
        await env.ACCESS_CACHE.delete(`auth:token:${token}`);
        return { claims: null, error: 'Auth token expired or invalid', status: 401 };
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
        `auth:challenge:${challengeId}`,
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

    const rawChallenge = await env.ACCESS_CACHE.get(`auth:challenge:${body.challengeId}`);
    if (!rawChallenge) {
        return jsonResponse({ ok: false, error: 'Challenge expired or invalid' }, 401, request, env);
    }

    const challenge = JSON.parse(rawChallenge) as AuthChallengeRecord;
    if (challenge.accountId !== body.accountId) {
        return jsonResponse({ ok: false, error: 'Challenge/account mismatch' }, 401, request, env);
    }

    if (Date.now() > challenge.expiresAt) {
        await env.ACCESS_CACHE.delete(`auth:challenge:${body.challengeId}`);
        return jsonResponse({ ok: false, error: 'Challenge expired or invalid' }, 401, request, env);
    }

    const isFullAccess = await verifyFullAccessKeyBinding(env, body.accountId, body.publicKey);
    if (!isFullAccess) {
        return jsonResponse({ ok: false, error: 'Public key must be a FullAccess key on this account' }, 401, request, env);
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

    await env.ACCESS_CACHE.delete(`auth:challenge:${body.challengeId}`);

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
        `auth:token:${token}`,
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

    const body = (await request.json()) as Partial<StoreRequest> & { videoId?: string; aesKeyB64?: string };
    const isShareStore = Boolean(body.shareB64 && typeof body.shareId === 'number');
    if (!body.videoId || (!body.aesKeyB64 && !isShareStore)) {
        return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
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

    let accountId: string;

    if (auth.claims) {
        if (auth.claims.action !== 'store') {
            return jsonResponse({ ok: false, error: 'Auth token does not allow store access' }, 403, request, env);
        }
        if (auth.claims.videoId !== body.videoId) {
            return jsonResponse({ ok: false, error: 'Auth token video scope mismatch' }, 403, request, env);
        }
        accountId = auth.claims.accountId;
    } else {
        if (!body.timestamp || !body.signature || !body.publicKey) {
            return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
        }

        // Validate timestamp (replay attack protection)
        const now = Date.now();
        if (Math.abs(now - body.timestamp) > TIMESTAMP_WINDOW_MS) {
            return jsonResponse({ ok: false, error: 'Request timestamp expired' }, 401, request, env);
        }

        // Legacy key-bound requests sign { action, videoId, accountId, timestamp }.
        // Session-grant requests sign { action, videoId, timestamp, originHash, deviceHash }.
        const payload = body.accountId
            ? JSON.stringify({
                action: 'store',
                videoId: body.videoId,
                accountId: body.accountId,
                timestamp: body.timestamp,
            })
            : JSON.stringify({
                action: 'store',
                videoId: body.videoId,
                timestamp: body.timestamp,
                originHash: body.originHash ?? null,
                deviceHash: body.deviceHash ?? null,
            });

        const isValidSig = await verifyEd25519Signature(payload, body.signature, body.publicKey);
        if (!isValidSig) {
            return jsonResponse({ ok: false, error: 'Invalid signature' }, 401, request, env);
        }

        if (body.accountId) {
            const isKeyBound = await verifyPublicKeyBinding(env, body.accountId, body.publicKey);
            if (!isKeyBound) {
                return jsonResponse({ ok: false, error: 'Public key not registered on account' }, 401, request, env);
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
                        { ok: false, error: 'Public key is not authorized for publish' },
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
                    { ok: false, error: grantVerification.reason || 'Invalid session grant' },
                    401,
                    request,
                    env,
                );
            }

            accountId = grantVerification.owner_id;
        }
    }

    const keyId = `key:${body.videoId}`;
    const ownerIdKey = `owner:${body.videoId}`;
    const [existingKey, recordedOwner, eventCreatorId] = await Promise.all([
        env.VIDEO_KEYS.get(keyId),
        env.VIDEO_KEYS.get(ownerIdKey),
        getEventCreatorId(env, body.videoId),
    ]);

    // Event exists: only event creator can store/update key.
    if (eventCreatorId && eventCreatorId !== accountId) {
        return jsonResponse({ ok: false, error: 'Only the content creator can store keys' }, 403, request, env);
    }

    // Existing key overwrite protection.
    // If a key already exists and ownership cannot be proven, deny overwrite (fail-closed).
    if (existingKey) {
        if (recordedOwner && recordedOwner !== accountId) {
            return jsonResponse({ ok: false, error: 'Only the original uploader can overwrite keys' }, 403, request, env);
        }

        if (!recordedOwner && !eventCreatorId) {
            return jsonResponse(
                { ok: false, error: 'Cannot verify ownership for existing key; overwrite denied' },
                403,
                request,
                env,
            );
        }
    }

    if (isShareStore) {
        if (!env.REGISTRY_OPERATOR_ACCOUNT_ID) {
            return jsonResponse({ ok: false, error: 'Registry operator account is not configured' }, 500, request, env);
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
    } else {
        // Store legacy AES key in KV and persist owner marker for overwrite protection.
        await env.VIDEO_KEYS.put(keyId, body.aesKeyB64 as string);
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
        return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
    }

    let accountId: string;

    if (auth.claims) {
        if (auth.claims.action !== 'retrieve') {
            return jsonResponse({ ok: false, error: 'Auth token does not allow retrieve access' }, 403, request, env);
        }
        if (auth.claims.videoId !== body.videoId) {
            return jsonResponse({ ok: false, error: 'Auth token video scope mismatch' }, 403, request, env);
        }
        accountId = auth.claims.accountId;
    } else {
        if (!body.timestamp || !body.signature || !body.publicKey) {
            return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
        }

        // Validate timestamp (replay attack protection)
        const now = Date.now();
        if (Math.abs(now - body.timestamp) > TIMESTAMP_WINDOW_MS) {
            return jsonResponse({ ok: false, error: 'Request timestamp expired' }, 401, request, env);
        }

        // Legacy key-bound requests sign { action, videoId, accountId, timestamp }.
        // Session-grant requests sign { action, videoId, timestamp, originHash, deviceHash }.
        const payload = body.accountId
            ? JSON.stringify({
                action: 'retrieve',
                videoId: body.videoId,
                accountId: body.accountId,
                timestamp: body.timestamp,
            })
            : JSON.stringify({
                action: 'retrieve',
                videoId: body.videoId,
                timestamp: body.timestamp,
                originHash: body.originHash ?? null,
                deviceHash: body.deviceHash ?? null,
            });

        const isValidSig = await verifyEd25519Signature(payload, body.signature, body.publicKey);
        if (!isValidSig) {
            return jsonResponse({ ok: false, error: 'Invalid signature' }, 401, request, env);
        }

        if (body.accountId) {
            const isKeyBound = await verifyPublicKeyBinding(env, body.accountId, body.publicKey);
            if (!isKeyBound) {
                return jsonResponse({ ok: false, error: 'Public key not registered on account' }, 401, request, env);
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
                    { ok: false, error: grantVerification.reason || 'Invalid session grant' },
                    401,
                    request,
                    env,
                );
            }

            accountId = grantVerification.owner_id;
        }
    }

    // Verify access: Either the user has a ticket, OR they are the original owner (creator)
    console.log(`[KMS] Verify access for ${accountId} on video ${body.videoId}`);
    let hasAccess = await verifyTicketAccess(env, accountId, body.videoId);
    console.log(`[KMS] verifyTicketAccess: ${hasAccess}`);

    if (!hasAccess) {
        // Fallback: Check if they are the original owner (creator) of the video
        // body.videoId is the encrypted_cid (UUID), not the NFT token_id
        console.log(`[KMS] Checking ownership fallback for ${body.videoId}`);
        const eventCreatorId = await getEventCreatorId(env, body.videoId);
        console.log(`[KMS] get_event creator:`, eventCreatorId);
        if (eventCreatorId && eventCreatorId === accountId) {
            console.log(`[KMS] Ownership verified: ${eventCreatorId} matches ${accountId}`);
            hasAccess = true;
        } else {
            console.log(`[KMS] Ownership check failed. Creator: ${eventCreatorId}, Signer: ${accountId}`);
        }
    }

    if (!hasAccess) {
        return jsonResponse({ ok: false, error: 'Access denied: no valid ticket or ownership' }, 403, request, env);
    }

    const shareMetaRaw = await env.VIDEO_KEYS.get(shareMetaKey(body.videoId));
    if (shareMetaRaw && env.REGISTRY_OPERATOR_ACCOUNT_ID) {
        const shareRaw = await env.VIDEO_KEYS.get(
            shareRecordKey(body.videoId, env.REGISTRY_OPERATOR_ACCOUNT_ID),
        );

        if (!shareRaw) {
            return jsonResponse({ ok: false, error: 'Share not found for this operator' }, 404, request, env);
        }

        const shareRecord = JSON.parse(shareRaw) as StoredShareRecord;
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
    }

    // Retrieve legacy AES key from KV
    const aesKeyB64 = await env.VIDEO_KEYS.get(`key:${body.videoId}`);
    if (!aesKeyB64) {
        return jsonResponse({ ok: false, error: 'Key not found for this video' }, 404, request, env);
    }

    return jsonResponse(
        { ok: true, data: { aesKeyB64 } },
        200,
        request,
        env,
    );
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
                contract: env.NEAR_CONTRACT_ID,
                accessContract: env.NEAR_ACCESS_CONTRACT_ID || null,
                registryContract: env.NEAR_REGISTRY_CONTRACT_ID || null,
                registryOperatorAccount: env.REGISTRY_OPERATOR_ACCOUNT_ID || null,
                registryOperatorActive: registryOperator.ok,
                registryOperatorReason: registryOperator.reason || null,
                shareMode: env.OPERATOR_SHARE_SECRET ? 'operator-encrypted-share' : 'legacy-single-key',
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
    },
};
