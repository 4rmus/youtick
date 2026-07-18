/**
 * YouTick Web4 Proxy Worker
 *
 * Reverse proxy that serves youtick.net by forwarding requests to the
 * Web4 gateway at youtick.near.page. This allows using a custom domain
 * while keeping the application fully deployed on NEAR Web4.
 *
 * Flow: youtick.net → Cloudflare Workers → youtick.near.page → web4_get() → IPFS
 */
import {
    Account,
    KeyPair,
    KeyPairSigner,
    actions,
    type KeyPairString,
} from 'near-api-js';
import {
    claimOnce,
    incrementWithinLimit,
    releaseClaim,
} from '../../shared/src/atomic-state';
export { AtomicState } from '../../shared/src/atomic-state';

export interface Env {
    WEB4_ORIGIN: string;
    WEB4_FALLBACK_ORIGIN?: string;
    ALLOWED_DOMAINS: string;
    CACHE_TTL: string;
    CACHE_VERSION?: string;
    ONBOARDING_KEYS?: string;
    TURNSTILE_SECRET_KEY?: string;
    NEAR_RPC_ALLOWED_CONTRACTS?: string;
    NEAR_CONTRACT_ID?: string;
    NEAR_RPC_URL?: string;
    ATOMIC_STATE?: DurableObjectNamespace;
}

/** Content types that should be cached aggressively */
const STATIC_EXTENSIONS = new Set([
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.webp', '.wasm', '.map',
]);

const NEAR_RPC_UPSTREAMS = [
    'https://free.rpc.fastnear.com/',
    'https://rpc.mainnet.near.org/',
    'https://near.drpc.org/',
];
const NEAR_RPC_CACHE_TTL_SECONDS = 5;
const MAX_RELAY_BODY_BYTES = 64 * 1024;
const DEFAULT_NEAR_RPC_ALLOWED_CONTRACTS = 'youtick.near,access.youtick.near,registry.youtick.near,pyth-oracle.near';
const NEAR_RPC_CACHEABLE_VIEW_METHODS = new Set([
    'get_event',
    'get_events',
    'get_events_count',
    'get_event_slots_count',
    'get_all_events',
    'get_trial_pool_balance',
    'get_daily_trial_count',
    'get_onboarding_config',
    'get_gift_info_full',
    'get_trial_invite_info',
    'is_onboarding_key',
    'has_ticket',
    'get_playback_access_decision',
    'verify_session_grant',
    'get_tokens_with_video',
    'get_creator_stats',
    'get_creator_profile',
    'get_purchase_logs_by_creator',
    'get_price',
    'list_decryption_operators',
    'get_threshold_config',
]);
const pendingNearRpcRequests = new Map<string, Promise<Response>>();
const STRIPPED_UPSTREAM_BODY_HEADERS = [
    'content-encoding',
    'content-length',
    'transfer-encoding',
] as const;

function web4CspValue(nonce?: string): string {
    return [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''} https://www.googletagmanager.com https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://rsms.me https://fonts.cdnfonts.com",
    "img-src 'self' data: blob: https://ipfs.io https://cloudflare-ipfs.com https://*.ipfs.dweb.link https://*.lighthouse.storage https://*.crustipfs.xyz",
    "font-src 'self' data: https://fonts.gstatic.com https://rsms.me https://fonts.cdnfonts.com",
    "connect-src 'self' https://*.near.org https://*.fastnear.com https://near.lava.build https://near.drpc.org https://*.workers.dev https://*.sentry.io https://*.lighthouse.storage https://*.crustipfs.xyz https://ipfs.io https://cloudflare-ipfs.com https://*.ipfs.dweb.link https://challenges.cloudflare.com https://*.walletconnect.com wss://*.walletconnect.com https://*.reown.com",
    "media-src 'self' blob: https://ipfs.io https://cloudflare-ipfs.com https://*.ipfs.dweb.link https://*.lighthouse.storage https://*.crustipfs.xyz https://*.workers.dev",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ].join('; ');
}

const WEB4_CSP_VALUE = web4CspValue();

function secureHtmlResponse(response: Response): Response {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) return response;

    const nonce = crypto.randomUUID().replaceAll('-', '');
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', web4CspValue(nonce));
    if (typeof HTMLRewriter === 'undefined') {
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
    return new HTMLRewriter()
        .on('script', { element(element) { element.setAttribute('nonce', nonce); } })
        .transform(new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        }));
}

/** Check if a path points to a static asset */
function isStaticAsset(pathname: string): boolean {
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot === -1) return false;
    return STATIC_EXTENSIONS.has(pathname.slice(lastDot).toLowerCase());
}

function getAllowedDomains(env: Env): Set<string> {
    return new Set(
        env.ALLOWED_DOMAINS
            .split(',')
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean),
    );
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const hostname = url.hostname.toLowerCase();
        const allowedDomains = getAllowedDomains(env);

        if (!allowedDomains.has(hostname)) {
            return new Response('Host is not allowed for this proxy.', { status: 421 });
        }

        if (hostname === 'www.youtick.net') {
            const redirectUrl = new URL(request.url);
            redirectUrl.hostname = 'youtick.net';
            return Response.redirect(redirectUrl.toString(), 308);
        }

        // --- Health check endpoint ---
        if (url.pathname === '/__health') {
            return new Response(JSON.stringify({
                status: 'ok',
                proxy: 'web4-proxy',
                origin: env.WEB4_ORIGIN,
                canonicalHost: 'youtick.net',
                timestamp: new Date().toISOString(),
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- Server-side onboarding transaction relay ---
        if (url.pathname === '/api/onboarding-key') {
            if (request.method === 'GET') {
                return jsonResponse({ error: 'Private onboarding keys are not distributed. Use POST relay.' }, 410);
            }
            if (request.method === 'POST') {
                return handleOnboardingRelay(request, env);
            }
        }

        // --- NEAR RPC proxy (same-origin CORS workaround for wallet/RPC calls) ---
        if (url.pathname === '/api/near-rpc' || url.pathname === '/api/near-rpc/') {
            return handleNearRpc(request, env, ctx);
        }

        // --- Retired storage proxy surface ---
        if (url.pathname.startsWith('/api/crust/')) {
            return jsonResponse(
                {
                    error: 'storage_proxy_removed',
                    message: 'This storage proxy surface has been retired. Use the Storage API and IPFS gateway read paths.',
                },
                410,
                {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Cache-Control': 'no-store',
                },
            );
        }

        // --- Build origin chain for failover ---
        const origins = [env.WEB4_ORIGIN];
        if (env.WEB4_FALLBACK_ORIGIN) {
            origins.push(env.WEB4_FALLBACK_ORIGIN);
        }

        const canUseCache = request.method === 'GET' && url.pathname !== '/__health';
        const cacheUrl = new URL(request.url);
        if (env.CACHE_VERSION) {
            cacheUrl.searchParams.set('__cv', env.CACHE_VERSION);
        }
        const cacheKey = canUseCache ? new Request(cacheUrl.toString(), { method: 'GET' }) : null;
        const cache = canUseCache ? caches.default : null;

        if (cache && cacheKey) {
            const cached = await cache.match(cacheKey);
            if (cached) {
                const cachedHeaders = applyProxyHeaders(
                    cached.headers,
                    url.pathname,
                    env.WEB4_ORIGIN,
                    'HIT',
                    parseInt(env.CACHE_TTL || '300', 10),
                );
                return secureHtmlResponse(new Response(cached.body, {
                    status: cached.status,
                    statusText: cached.statusText,
                    headers: cachedHeaders,
                }));
            }
        }

        let lastError: unknown;
        for (const origin of origins) {
            try {
                const targetUrl = `${origin}${url.pathname}${url.search}`;
                const originResponse = await fetch(targetUrl, {
                    method: request.method,
                    headers: buildOriginHeaders(request, env, origin),
                    redirect: 'follow',
                });

                if (!originResponse.ok && origin !== origins[origins.length - 1]) {
                    lastError = new Error(`Origin ${origin} returned ${originResponse.status}`);
                    continue;
                }

                const cacheTtl = parseInt(env.CACHE_TTL || '300', 10);
                const responseHeaders = applyProxyHeaders(
                    originResponse.headers,
                    url.pathname,
                    origin,
                    'MISS',
                    cacheTtl,
                );

                const proxiedResponse = new Response(originResponse.body, {
                    status: originResponse.status,
                    statusText: originResponse.statusText,
                    headers: responseHeaders,
                });

                if (cache && cacheKey && originResponse.ok) {
                    ctx.waitUntil(cache.put(cacheKey, proxiedResponse.clone()));
                }

                return secureHtmlResponse(proxiedResponse);
            } catch (error) {
                lastError = error;
                console.warn(`Web4 proxy: origin ${origin} failed, trying next...`, error);
            }
        }

        console.error('Web4 proxy: all origins failed', lastError);
        return new Response(
            `<!DOCTYPE html>
<html>
<head><title>YouTick — Temporarily Unavailable</title></head>
<body style="font-family:system-ui;text-align:center;padding:4rem">
  <h1>YouTick</h1>
  <p>The Web4 gateway is temporarily unavailable. Please try again shortly.</p>
  <p style="color:#888">You can also visit <a href="${env.WEB4_ORIGIN}">${env.WEB4_ORIGIN}</a> directly.</p>
</body>
</html>`,
            {
                status: 502,
                headers: {
                    'Content-Security-Policy': WEB4_CSP_VALUE,
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                },
            },
        );
    },
} satisfies ExportedHandler<Env>;

function jsonResponse(body: Record<string, unknown>, status: number, headers?: HeadersInit): Response {
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(body), {
        status,
        headers: responseHeaders,
    });
}

function nearRpcCorsHeaders(): HeadersInit {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Cache-Control': 'no-store',
    };
}

type NearRpcPayload = {
    method?: string;
    params?: Record<string, unknown>;
};

type AllowedNearRpcRequest = { scope: string; cacheable: boolean };

function withNearRpcHeaders(response: Response, cacheState: 'BYPASS' | 'HIT' | 'MISS', upstream?: string): Response {
    const headers = new Headers(response.headers);
    for (const header of STRIPPED_UPSTREAM_BODY_HEADERS) {
        headers.delete(header);
    }
    for (const [key, value] of Object.entries(nearRpcCorsHeaders())) {
        headers.set(key, value);
    }
    headers.set('X-Near-Rpc-Cache', cacheState);
    if (upstream) {
        headers.set('X-Near-Rpc-Upstream', new URL(upstream).hostname);
    }
    headers.delete('set-cookie');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function getAllowedNearRpcContracts(env: Env): Set<string> {
    return new Set((env.NEAR_RPC_ALLOWED_CONTRACTS || DEFAULT_NEAR_RPC_ALLOWED_CONTRACTS)
        .split(',')
        .map((accountId) => accountId.trim())
        .filter(Boolean));
}

function getAllowedNearRpcRequest(
    payload: unknown,
    allowedContracts: Set<string>,
): AllowedNearRpcRequest | null {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        return null;
    }

    const rpcPayload = payload as NearRpcPayload;
    if (rpcPayload.method === 'status') {
        return { scope: 'status', cacheable: true };
    }

    const params = rpcPayload.params;
    if (!params) {
        return null;
    }

    if (rpcPayload.method === 'send_tx') {
        const signedTransaction = params.signed_tx_base64;
        const waitUntil = params.wait_until;
        if (typeof signedTransaction !== 'string' || signedTransaction.length > 48 * 1024
            || !['NONE', 'INCLUDED', 'EXECUTED_OPTIMISTIC', 'INCLUDED_FINAL', 'EXECUTED', 'FINAL'].includes(String(waitUntil))) {
            return null;
        }
        return { scope: 'send_tx', cacheable: false };
    }

    if (rpcPayload.method === 'tx' || rpcPayload.method === 'EXPERIMENTAL_tx_status') {
        if (typeof params.tx_hash !== 'string' || params.tx_hash.length > 64
            || typeof params.sender_account_id !== 'string' || params.sender_account_id.length > 64) {
            return null;
        }
        return { scope: 'tx', cacheable: false };
    }

    if (rpcPayload.method !== 'query') {
        return null;
    }

    const requestType = params.request_type;
    const finality = params.finality;
    if (finality && finality !== 'final' && finality !== 'optimistic') return null;

    if (requestType === 'view_account' || requestType === 'view_access_key') {
        if (typeof params.account_id !== 'string' || params.account_id.length > 64) return null;
        if (requestType === 'view_access_key'
            && (typeof params.public_key !== 'string' || params.public_key.length > 100)) return null;
        return { scope: requestType, cacheable: false };
    }

    if (requestType !== 'call_function' || (finality && finality !== 'final')) return null;
    const accountId = params.account_id;
    const methodName = params.method_name;
    if (typeof accountId !== 'string' || !allowedContracts.has(accountId)
        || typeof methodName !== 'string' || !NEAR_RPC_CACHEABLE_VIEW_METHODS.has(methodName)) {
        return null;
    }
    return { scope: methodName, cacheable: true };
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function buildNearRpcCacheKey(request: Request, body: string, scope: string): Promise<Request> {
    const url = new URL(request.url);
    url.pathname = `/__near-rpc-cache/${scope}/${await sha256Hex(body)}`;
    url.search = '';
    return new Request(url.toString(), { method: 'GET' });
}

async function fetchNearRpcFromUpstream(body: string, contentType: string): Promise<Response> {
    let lastResponse: Response | null = null;
    let lastError: unknown;

    for (const upstreamUrl of NEAR_RPC_UPSTREAMS) {
        try {
            const response = await fetch(upstreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body,
            });

            if ((response.status === 429 || response.status >= 500) && upstreamUrl !== NEAR_RPC_UPSTREAMS[NEAR_RPC_UPSTREAMS.length - 1]) {
                lastResponse = response;
                continue;
            }

            return withNearRpcHeaders(response, 'BYPASS', upstreamUrl);
        } catch (error) {
            lastError = error;
        }
    }

    if (lastResponse) {
        return withNearRpcHeaders(lastResponse, 'BYPASS');
    }

    console.warn('NEAR RPC proxy: all upstreams failed', lastError);
    return jsonResponse({ error: 'NEAR RPC unavailable' }, 502, nearRpcCorsHeaders());
}

async function handleNearRpc(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = nearRpcCorsHeaders();

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const declaredLength = Number(request.headers.get('content-length') || '0');
    if (declaredLength > MAX_RELAY_BODY_BYTES) {
        return jsonResponse({ error: 'Request body too large' }, 413, corsHeaders);
    }

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_RELAY_BODY_BYTES) {
        return jsonResponse({ error: 'Request body too large' }, 413, corsHeaders);
    }
    let payload: unknown;
    try {
        payload = JSON.parse(body);
    } catch {
        return jsonResponse({ error: 'Invalid JSON-RPC payload' }, 400, corsHeaders);
    }

    const allowedRequest = getAllowedNearRpcRequest(payload, getAllowedNearRpcContracts(env));
    if (!allowedRequest) {
        return jsonResponse({ error: 'JSON-RPC method not allowed' }, 403, corsHeaders);
    }
    const contentType = request.headers.get('content-type') || 'application/json';
    const cacheKey = allowedRequest.cacheable
        ? await buildNearRpcCacheKey(request, body, allowedRequest.scope)
        : null;

    if (cacheKey) {
        const cached = await caches.default.match(cacheKey);
        if (cached) {
            return withNearRpcHeaders(cached, 'HIT');
        }

        const pending = pendingNearRpcRequests.get(cacheKey.url);
        if (pending) {
            return (await pending).clone();
        }

        const fetchPromise = fetchNearRpcFromUpstream(body, contentType)
            .then((response) => {
                const responseWithCacheHeader = withNearRpcHeaders(response, 'MISS');
                if (responseWithCacheHeader.status === 200) {
                    const cachedHeaders = new Headers(responseWithCacheHeader.headers);
                    cachedHeaders.set('Cache-Control', `public, max-age=${NEAR_RPC_CACHE_TTL_SECONDS}`);
                    ctx.waitUntil(caches.default.put(
                        cacheKey,
                        new Response(responseWithCacheHeader.clone().body, {
                            status: responseWithCacheHeader.status,
                            statusText: responseWithCacheHeader.statusText,
                            headers: cachedHeaders,
                        }),
                    ));
                }
                return responseWithCacheHeader;
            })
            .finally(() => {
                pendingNearRpcRequests.delete(cacheKey.url);
            });

        pendingNearRpcRequests.set(cacheKey.url, fetchPromise);
        return (await fetchPromise).clone();
    }

    return fetchNearRpcFromUpstream(body, contentType);
}

/**
 * Build headers to send to the Web4 origin.
 * Preserves important client headers while setting the correct Host.
 */
function buildOriginHeaders(request: Request, env: Env, origin?: string): Headers {
    const headers = new Headers();

    const originUrl = new URL(origin || env.WEB4_ORIGIN);
    headers.set('Host', originUrl.hostname);

    // Forward client IP for logging
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) {
        headers.set('X-Forwarded-For', clientIp);
    }

    // Forward relevant headers
    const forwardHeaders = [
        'Accept', 'Accept-Language', 'Accept-Encoding',
        'User-Agent', 'If-None-Match', 'If-Modified-Since',
    ];
    for (const name of forwardHeaders) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }

    return headers;
}

function applyProxyHeaders(
    headers: Headers,
    pathname: string,
    web4Origin: string,
    cacheState: 'HIT' | 'MISS',
    cacheTtl: number,
): Headers {
    const responseHeaders = new Headers(headers);

    responseHeaders.delete('server');
    responseHeaders.delete('x-powered-by');

    responseHeaders.set('X-Proxy', 'youtick-web4');
    responseHeaders.set('X-Web4-Origin', web4Origin);
    responseHeaders.set('X-Proxy-Cache', cacheState);
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Frame-Options', 'DENY');
    responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (isStaticAsset(pathname)) {
        const isHashed = pathname.includes('/_next/static/');
        const maxAge = isHashed ? 31536000 : cacheTtl;
        responseHeaders.set('Cache-Control', `public, max-age=${maxAge}, immutable`);
    } else {
        // Keep browser HTML cache near-zero so old pages do not point at missing chunk hashes.
        responseHeaders.set('Cache-Control', `public, max-age=0, must-revalidate, s-maxage=${cacheTtl}, stale-while-revalidate=30`);
        responseHeaders.set('Content-Security-Policy', WEB4_CSP_VALUE);
    }

    return responseHeaders;
}

// ============================================================================
// Onboarding Transaction Relay
// ============================================================================

type OnboardingRelayAction =
    | 'create_sponsored_trial_direct'
    | 'sponsor_implicit_guest_direct'
    | 'claim_free_ticket_direct';

type OnboardingRelayBody = {
    action?: OnboardingRelayAction;
    args?: Record<string, unknown>;
    turnstileToken?: string;
};

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
    try {
        const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, response: token }),
        });
        const data = await resp.json<{ success: boolean }>();
        return data.success === true;
    } catch {
        return false;
    }
}

function getClientIp(request: Request): string {
    return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function validateOnboardingRelayBody(
    body: OnboardingRelayBody,
): body is OnboardingRelayBody & { action: OnboardingRelayAction; args: Record<string, unknown> } {
    if (!body.action || !body.args || typeof body.args !== 'object') return false;
    const publicKey = body.args.new_public_key;
    const receiverId = body.args.receiver_id;
    const cid = body.args.encrypted_cid;
    const username = body.args.username;
    if (body.action === 'sponsor_implicit_guest_direct') {
        return typeof publicKey === 'string' && /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(publicKey);
    }
    if (body.action === 'create_sponsored_trial_direct') {
        return typeof username === 'string'
            && /^[a-z0-9_-]{2,32}$/.test(username)
            && typeof publicKey === 'string'
            && /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(publicKey);
    }
    return body.action === 'claim_free_ticket_direct'
        && typeof receiverId === 'string'
        && /^[a-z0-9._-]{2,64}$/.test(receiverId)
        && typeof cid === 'string'
        && cid.length > 0
        && cid.length <= 256;
}

async function handleOnboardingRelay(request: Request, env: Env): Promise<Response> {
    const keysEnv = env.ONBOARDING_KEYS;
    if (!keysEnv || keysEnv.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'Onboarding key not configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }
    if (!env.TURNSTILE_SECRET_KEY) {
        return new Response(JSON.stringify({ error: 'Challenge verification is not configured.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }
    if (!env.ATOMIC_STATE) {
        return jsonResponse({ error: 'Atomic relay state is not configured.' }, 503);
    }

    const declaredLength = Number(request.headers.get('content-length') || '0');
    if (declaredLength > 8 * 1024) {
        return jsonResponse({ error: 'Request body too large.' }, 413);
    }
    const body = await request.json().catch(() => null) as OnboardingRelayBody | null;
    if (!body || !validateOnboardingRelayBody(body)) {
        return jsonResponse({ error: 'Invalid onboarding action.' }, 400);
    }

    const ip = getClientIp(request);
    const rate = await incrementWithinLimit(
        env.ATOMIC_STATE,
        `onboarding-rate:${ip}`,
        10,
        60 * 60 * 1000,
    );
    if (!rate.ok) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const turnstileToken = body.turnstileToken;
    if (!turnstileToken) {
        return new Response(JSON.stringify({ error: 'Challenge token required.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }
    if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY))) {
        return new Response(JSON.stringify({ error: 'Challenge verification failed.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const keys = keysEnv
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.startsWith('ed25519:'));

    if (keys.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid onboarding key format' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const signerLockKey = 'onboarding-signer-lock';
    const lock = await claimOnce(env.ATOMIC_STATE, signerLockKey, 30_000);
    if (!lock.ok) {
        return jsonResponse({ error: 'Onboarding signer is busy. Retry shortly.' }, 409);
    }

    try {
        const keyPair = KeyPair.fromString(
            keys[Math.floor(Math.random() * keys.length)] as KeyPairString,
        );
        const contractId = env.NEAR_CONTRACT_ID || 'youtick.near';
        const rpcUrl = env.NEAR_RPC_URL || NEAR_RPC_UPSTREAMS[0];
        const account = new Account(contractId, rpcUrl, new KeyPairSigner(keyPair));
        const outcome = await account.signAndSendTransaction({
            receiverId: contractId,
            actions: [
                actions.functionCall(
                    body.action,
                    body.args,
                    BigInt('100000000000000'),
                    0n,
                ),
            ],
        });
        return new Response(JSON.stringify({
            ok: true,
            transactionHash: outcome.transaction.hash,
        }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('[ONBOARDING_RELAY] transaction failed', error);
        return jsonResponse({ error: 'Onboarding transaction failed.' }, 502);
    } finally {
        await releaseClaim(env.ATOMIC_STATE, signerLockKey);
    }
}
