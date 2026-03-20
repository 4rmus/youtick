import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions, type KeyPairString } from 'near-api-js';

export interface Env {
    ALLOWED_ORIGINS: string;
    GUEST_LIMITER: DurableObjectNamespace;
    NEAR_CONTRACT_ID: string;
    NEAR_NETWORK: 'mainnet' | 'testnet';
    RELAYER_ACCOUNT_ID: string;
    RELAYER_PRIVATE_KEY: string;
    TURNSTILE_SECRET_KEY?: string;
}

interface GuestLimiterCheckResult {
    allowed: boolean;
    retryAfter?: number;
    reason?: string;
}

type GuestAction = 'bootstrap' | 'claim';

const MAINNET_RPC_POOL = [
    'https://free.rpc.fastnear.com',
    'https://near.lava.build',
    'https://rpc.mainnet.near.org',
];

const TESTNET_RPC_POOL = [
    'https://test.rpc.fastnear.com',
    'https://rpc.testnet.near.org',
];

const BOOTSTRAP_PER_IP_PER_DAY = 3;
const BOOTSTRAP_PER_INSTALL_PER_DAY = 2;
const CLAIM_PER_INSTALL_PER_DAY = 25;
const CHANGE_METHOD_GAS = BigInt('200000000000000');

function toBase64Json(input: Record<string, unknown>): string {
    return btoa(JSON.stringify(input));
}

function allowedOrigins(env: Env): Set<string> {
    return new Set(
        (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    );
}

function corsHeaders(request: Request, env: Env): HeadersInit {
    const origin = request.headers.get('Origin') || '';
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    if (!isLocalhost && origin && !allowedOrigins(env).has(origin)) {
        return {};
    }

    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

function jsonResponse(request: Request, env: Env, body: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(request, env),
        },
    });
}

function handleOptions(request: Request, env: Env): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
    });
}

function getRpcPool(env: Env): string[] {
    return env.NEAR_NETWORK === 'testnet' ? TESTNET_RPC_POOL : MAINNET_RPC_POOL;
}

async function nearRpcQuery<T>(
    env: Env,
    body: Record<string, unknown>,
): Promise<T> {
    let lastError: Error | null = null;

    for (const rpcUrl of getRpcPool(env)) {
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                lastError = new Error(`${rpcUrl} returned ${response.status}`);
                continue;
            }

            const json = await response.json() as {
                error?: { message?: string };
                result?: { result?: number[] };
            };

            if (json.error) {
                lastError = new Error(json.error.message || 'RPC query failed');
                continue;
            }

            if (!json.result?.result) {
                return null as T;
            }

            const decoded = new TextDecoder().decode(new Uint8Array(json.result.result));
            return JSON.parse(decoded) as T;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('RPC query failed');
}

async function viewAccountExists(env: Env, accountId: string): Promise<boolean> {
    let lastError: Error | null = null;

    for (const rpcUrl of getRpcPool(env)) {
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'guest-account-exists',
                    method: 'query',
                    params: {
                        request_type: 'view_account',
                        finality: 'final',
                        account_id: accountId,
                    },
                }),
            });

            const json = await response.json() as { error?: { cause?: { name?: string } } };
            if (!json.error) {
                return true;
            }

            const causeName = json.error?.cause?.name || '';
            if (causeName.includes('UNKNOWN_ACCOUNT')) {
                return false;
            }

            lastError = new Error('view_account failed');
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    if (lastError) {
        throw lastError;
    }

    return false;
}

async function hasTicket(env: Env, accountId: string, encryptedCid: string): Promise<boolean> {
    return nearRpcQuery<boolean>(env, {
        jsonrpc: '2.0',
        id: 'guest-has-ticket',
        method: 'query',
        params: {
            request_type: 'call_function',
            finality: 'final',
            account_id: env.NEAR_CONTRACT_ID,
            method_name: 'has_ticket',
            args_base64: toBase64Json({
                account_id: accountId,
                encrypted_cid: encryptedCid,
            }),
        },
    });
}

function base58Decode(value: string): Uint8Array {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const clean = value.replace(/^ed25519:/, '');
    const bytes: number[] = [0];

    for (const char of clean) {
        const index = alphabet.indexOf(char);
        if (index < 0) {
            throw new Error(`Invalid base58 character: ${char}`);
        }

        let carry = index;
        for (let i = 0; i < bytes.length; i += 1) {
            carry += bytes[i] * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
        }

        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    for (const char of clean) {
        if (char !== '1') break;
        bytes.push(0);
    }

    return new Uint8Array(bytes.reverse());
}

function publicKeyToImplicitAccountId(publicKey: string): string {
    const decoded = base58Decode(publicKey);
    if (decoded.length !== 32) {
        throw new Error('Only ed25519 public keys are supported');
    }

    return Array.from(decoded)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function requireRelayerCredentials(env: Env): { accountId: string; privateKey: string } {
    if (!env.RELAYER_ACCOUNT_ID || !env.RELAYER_PRIVATE_KEY) {
        throw new Error('Guest relayer credentials are not configured');
    }

    return {
        accountId: env.RELAYER_ACCOUNT_ID,
        privateKey: env.RELAYER_PRIVATE_KEY,
    };
}

function getProvider(env: Env): JsonRpcProvider {
    return new JsonRpcProvider({ url: getRpcPool(env)[0] });
}

function getRelayerAccount(env: Env): Account {
    const { accountId, privateKey } = requireRelayerCredentials(env);
    const keyPair = KeyPair.fromString(privateKey as KeyPairString);
    const signer = new KeyPairSigner(keyPair);
    return new Account(accountId, getRpcPool(env)[0], signer);
}

async function ensureTurnstile(request: Request, env: Env, token?: string | null): Promise<void> {
    if (!env.TURNSTILE_SECRET_KEY) {
        return;
    }

    const origin = request.headers.get('Origin') || '';
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return;
    }

    if (!token) {
        throw new Error('Turnstile verification is required');
    }

    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', token);
    form.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
    });

    const result = await response.json() as { success?: boolean };
    if (!result.success) {
        throw new Error('Turnstile verification failed');
    }
}

async function checkLimits(
    env: Env,
    request: Request,
    action: GuestAction,
    installId: string,
): Promise<GuestLimiterCheckResult> {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const id = env.GUEST_LIMITER.idFromName(`guest-limiter:${action}`);
    const stub = env.GUEST_LIMITER.get(id);
    const response = await stub.fetch('https://guest-limiter/check', {
        method: 'POST',
        body: JSON.stringify({ action, ip, installId }),
    });

    return response.json() as Promise<GuestLimiterCheckResult>;
}

async function sponsorImplicitGuest(env: Env, publicKey: string): Promise<void> {
    const relayer = getRelayerAccount(env);
    await relayer.signAndSendTransaction({
        receiverId: env.NEAR_CONTRACT_ID,
        actions: [
            actions.functionCall(
                'sponsor_implicit_guest',
                { new_public_key: publicKey },
                CHANGE_METHOD_GAS,
                BigInt(0),
            ),
        ],
    });
}

async function claimFreeTicket(env: Env, receiverId: string, encryptedCid: string): Promise<void> {
    const relayer = getRelayerAccount(env);
    await relayer.signAndSendTransaction({
        receiverId: env.NEAR_CONTRACT_ID,
        actions: [
            actions.functionCall(
                'claim_free_ticket_sponsored',
                { receiver_id: receiverId, encrypted_cid: encryptedCid },
                CHANGE_METHOD_GAS,
                BigInt(0),
            ),
        ],
    });
}

export class GuestLimiter {
    constructor(private readonly state: DurableObjectState) {}

    async fetch(request: Request): Promise<Response> {
        const payload = await request.json() as {
            action: GuestAction;
            ip: string;
            installId: string;
        };

        const now = Date.now();
        const dayBucket = new Date(now).toISOString().slice(0, 10);
        const ipKey = `${dayBucket}:${payload.action}:ip:${payload.ip}`;
        const installKey = `${dayBucket}:${payload.action}:install:${payload.installId}`;

        const ipCount = (await this.state.storage.get<number>(ipKey)) || 0;
        const installCount = (await this.state.storage.get<number>(installKey)) || 0;

        const ipLimit = payload.action === 'bootstrap' ? BOOTSTRAP_PER_IP_PER_DAY : BOOTSTRAP_PER_IP_PER_DAY * 10;
        const installLimit = payload.action === 'bootstrap' ? BOOTSTRAP_PER_INSTALL_PER_DAY : CLAIM_PER_INSTALL_PER_DAY;

        if (ipCount >= ipLimit || installCount >= installLimit) {
            return new Response(JSON.stringify({
                allowed: false,
                retryAfter: 60 * 60,
                reason: 'rate_limited',
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        await this.state.storage.put(ipKey, ipCount + 1);
        await this.state.storage.put(installKey, installCount + 1);

        return new Response(JSON.stringify({ allowed: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

async function handleBootstrap(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as {
        publicKey?: string;
        installId?: string;
        turnstileToken?: string | null;
    };

    if (!body.publicKey || !body.installId) {
        return jsonResponse(request, env, { ok: false, error: 'Missing publicKey or installId' }, 400);
    }

    await ensureTurnstile(request, env, body.turnstileToken);

    const limitResult = await checkLimits(env, request, 'bootstrap', body.installId);
    if (!limitResult.allowed) {
        return jsonResponse(request, env, { ok: false, error: 'Rate limited', retryAfter: limitResult.retryAfter }, 429);
    }

    const accountId = publicKeyToImplicitAccountId(body.publicKey);
    const exists = await viewAccountExists(env, accountId);

    if (!exists) {
        await sponsorImplicitGuest(env, body.publicKey);
    }

    return jsonResponse(request, env, {
        ok: true,
        accountId,
        bootstrapped: !exists,
    });
}

async function handleFreeClaim(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as {
        publicKey?: string;
        encryptedCid?: string;
        installId?: string;
        turnstileToken?: string | null;
    };

    if (!body.publicKey || !body.encryptedCid || !body.installId) {
        return jsonResponse(request, env, { ok: false, error: 'Missing publicKey, encryptedCid or installId' }, 400);
    }

    await ensureTurnstile(request, env, body.turnstileToken);

    const claimLimit = await checkLimits(env, request, 'claim', body.installId);
    if (!claimLimit.allowed) {
        return jsonResponse(request, env, { ok: false, error: 'Rate limited', retryAfter: claimLimit.retryAfter }, 429);
    }

    const accountId = publicKeyToImplicitAccountId(body.publicKey);
    const exists = await viewAccountExists(env, accountId);

    if (!exists) {
        const bootstrapLimit = await checkLimits(env, request, 'bootstrap', body.installId);
        if (!bootstrapLimit.allowed) {
            return jsonResponse(request, env, { ok: false, error: 'Rate limited', retryAfter: bootstrapLimit.retryAfter }, 429);
        }
        await sponsorImplicitGuest(env, body.publicKey);
    }

    const alreadyOwned = await hasTicket(env, accountId, body.encryptedCid);
    if (!alreadyOwned) {
        await claimFreeTicket(env, accountId, body.encryptedCid);
    }

    return jsonResponse(request, env, {
        ok: true,
        accountId,
        claimed: !alreadyOwned,
        alreadyOwned,
    });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        try {
            const url = new URL(request.url);
            if (url.pathname === '/health' && request.method === 'GET') {
                return jsonResponse(request, env, {
                    ok: true,
                    data: {
                        contract: env.NEAR_CONTRACT_ID,
                        network: env.NEAR_NETWORK,
                    },
                });
            }

            if (url.pathname === '/guest/bootstrap' && request.method === 'POST') {
                return await handleBootstrap(request, env);
            }

            if (url.pathname === '/free/claim' && request.method === 'POST') {
                return await handleFreeClaim(request, env);
            }

            return jsonResponse(request, env, { ok: false, error: 'Not found' }, 404);
        } catch (error) {
            console.error('[guest-relayer] request failed', error);
            return jsonResponse(request, env, {
                ok: false,
                error: error instanceof Error ? error.message : 'Guest relayer request failed',
            }, 500);
        }
    },
};
