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
    NEAR_NETWORK: string;
}

interface StoreRequest {
    action: 'store';
    videoId: string;
    aesKeyB64: string;
    accountId: string;
    timestamp: number;
    signature: string; // hex-encoded Ed25519 signature
    publicKey: string; // base58-encoded Ed25519 public key
}

interface RetrieveRequest {
    action: 'retrieve';
    videoId: string;
    accountId: string;
    timestamp: number;
    signature: string;
    publicKey: string;
}

interface KMSResponse {
    ok: boolean;
    error?: string;
    data?: Record<string, unknown>;
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

/** Access cache TTL: 1 hour */
const ACCESS_CACHE_TTL_S = 3600;

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
    const rpcPool = getRpcPool(env);
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
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });

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
    const rpcPool = getRpcPool(env);
    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'query',
        params,
    });

    let lastError: Error | null = null;

    for (const rpcUrl of rpcPool) {
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });

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
        await env.ACCESS_CACHE.put(cacheKey, 'true', { expirationTtl: ACCESS_CACHE_TTL_S });
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
            await env.ACCESS_CACHE.put(cacheKey, 'true', { expirationTtl: ACCESS_CACHE_TTL_S });
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
    try {
        const event = await nearViewCall<{ creator_id: string } | null>(
            env,
            env.NEAR_CONTRACT_ID,
            'get_event',
            { encrypted_cid: encryptedCid },
        );
        return event?.creator_id ?? null;
    } catch (error) {
        console.error('[KMS] getEventCreatorId failed:', error);
        return null;
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

// ============================================================================
// Route Handlers
// ============================================================================

async function handleStore(
    request: Request,
    env: Env,
): Promise<Response> {
    const body = (await request.json()) as StoreRequest;

    // Validate required fields
    if (!body.videoId || !body.aesKeyB64 || !body.accountId || !body.timestamp || !body.signature || !body.publicKey) {
        return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
    }

    // Validate timestamp (replay attack protection)
    const now = Date.now();
    if (Math.abs(now - body.timestamp) > TIMESTAMP_WINDOW_MS) {
        return jsonResponse({ ok: false, error: 'Request timestamp expired' }, 401, request, env);
    }

    // Verify Ed25519 signature
    const payload = JSON.stringify({
        action: 'store',
        videoId: body.videoId,
        accountId: body.accountId,
        timestamp: body.timestamp,
    });

    const isValidSig = await verifyEd25519Signature(payload, body.signature, body.publicKey);
    if (!isValidSig) {
        return jsonResponse({ ok: false, error: 'Invalid signature' }, 401, request, env);
    }

    // SECURITY: Verify the public key is actually registered on this NEAR account
    const isKeyBound = await verifyPublicKeyBinding(env, body.accountId, body.publicKey);
    if (!isKeyBound) {
        return jsonResponse({ ok: false, error: 'Public key not registered on account' }, 401, request, env);
    }

    const keyId = `key:${body.videoId}`;
    const ownerIdKey = `owner:${body.videoId}`;
    const existingKey = await env.VIDEO_KEYS.get(keyId);
    const recordedOwner = await env.VIDEO_KEYS.get(ownerIdKey);
    const eventCreatorId = await getEventCreatorId(env, body.videoId);

    // Event exists: only event creator can store/update key.
    if (eventCreatorId && eventCreatorId !== body.accountId) {
        return jsonResponse({ ok: false, error: 'Only the content creator can store keys' }, 403, request, env);
    }

    // Existing key overwrite protection.
    // If a key already exists and ownership cannot be proven, deny overwrite (fail-closed).
    if (existingKey) {
        if (recordedOwner && recordedOwner !== body.accountId) {
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

    // Store AES key in KV and persist owner marker for overwrite protection.
    await env.VIDEO_KEYS.put(keyId, body.aesKeyB64);
    if (!recordedOwner) {
        await env.VIDEO_KEYS.put(ownerIdKey, body.accountId);
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
    const body = (await request.json()) as RetrieveRequest;

    // Validate required fields
    if (!body.videoId || !body.accountId || !body.timestamp || !body.signature || !body.publicKey) {
        return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, request, env);
    }

    // Validate timestamp (replay attack protection)
    const now = Date.now();
    if (Math.abs(now - body.timestamp) > TIMESTAMP_WINDOW_MS) {
        return jsonResponse({ ok: false, error: 'Request timestamp expired' }, 401, request, env);
    }

    // Verify Ed25519 signature
    const payload = JSON.stringify({
        action: 'retrieve',
        videoId: body.videoId,
        accountId: body.accountId,
        timestamp: body.timestamp,
    });

    const isValidSig = await verifyEd25519Signature(payload, body.signature, body.publicKey);
    if (!isValidSig) {
        return jsonResponse({ ok: false, error: 'Invalid signature' }, 401, request, env);
    }

    // SECURITY: Verify the public key is actually registered on this NEAR account
    const isKeyBound = await verifyPublicKeyBinding(env, body.accountId, body.publicKey);
    if (!isKeyBound) {
        return jsonResponse({ ok: false, error: 'Public key not registered on account' }, 401, request, env);
    }

    // Verify access: Either the user has a ticket, OR they are the original owner (creator)
    console.log(`[KMS] Verify access for ${body.accountId} on video ${body.videoId}`);
    let hasAccess = await verifyTicketAccess(env, body.accountId, body.videoId);
    console.log(`[KMS] verifyTicketAccess: ${hasAccess}`);

    if (!hasAccess) {
        // Fallback: Check if they are the original owner (creator) of the video
        // body.videoId is the encrypted_cid (UUID), not the NFT token_id
        console.log(`[KMS] Checking ownership fallback for ${body.videoId}`);
        const eventCreatorId = await getEventCreatorId(env, body.videoId);
        console.log(`[KMS] get_event creator:`, eventCreatorId);
        if (eventCreatorId && eventCreatorId === body.accountId) {
            console.log(`[KMS] Ownership verified: ${eventCreatorId} matches ${body.accountId}`);
            hasAccess = true;
        } else {
            console.log(`[KMS] Ownership check failed. Creator: ${eventCreatorId}, Signer: ${body.accountId}`);
        }
    }

    if (!hasAccess) {
        return jsonResponse({ ok: false, error: 'Access denied: no valid ticket or ownership' }, 403, request, env);
    }

    // Retrieve AES key from KV
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
    // Quick RPC health check
    let rpcOk = false;
    try {
        const rpcPool = getRpcPool(env);
        const response = await fetch(rpcPool[0], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'health',
                method: 'status',
                params: [],
            }),
        });
        rpcOk = response.ok;
    } catch {
        rpcOk = false;
    }

    return jsonResponse(
        {
            ok: true,
            data: {
                service: 'youtick-kms',
                version: '1.0.0',
                nearRpc: rpcOk ? 'ok' : 'degraded',
                network: env.NEAR_NETWORK,
                contract: env.NEAR_CONTRACT_ID,
            },
        },
        200,
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

        // Only POST for store/retrieve
        if (request.method !== 'POST') {
            return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, request, env);
        }

        // Rate limiting
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const action = path === '/store' ? 'store' : 'retrieve';
        const withinLimit = await checkRateLimit(env, ip, action);
        if (!withinLimit) {
            return jsonResponse({ ok: false, error: 'Rate limit exceeded' }, 429, request, env);
        }

        // Route
        switch (path) {
            case '/store':
                return handleStore(request, env);
            case '/retrieve':
                return handleRetrieve(request, env);
            default:
                return jsonResponse({ ok: false, error: 'Not found' }, 404, request, env);
        }
    },
};
