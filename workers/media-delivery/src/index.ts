export interface Env {
    ALLOWED_ORIGINS?: string;
    IPFS_GATEWAY_BASES?: string;
    CACHE_TTL_SECONDS?: string;
    CACHE_VERSION?: string;
    UPSTREAM_TIMEOUT_MS?: string;
    VERIFY_CID_INTEGRITY?: string;
}

type JsonBody = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const DEFAULT_IPFS_GATEWAY_BASES = [
    'https://gateway.lighthouse.storage/ipfs',
    'https://ipfs.io/ipfs',
    'https://4everland.io/ipfs',
    'https://w3s.link/ipfs',
    'https://dweb.link/ipfs',
].join(',');
const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 4_000;
const MAX_INTEGRITY_BODY_BYTES = 8 * 1024 * 1024;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[a-z2-7]{57,})$/;

// Content integrity: media is encrypted with AES-CTR (unauthenticated), so a
// malicious gateway could serve tampered ciphertext. For CIDv1 raw-codec
// blocks (sha2-256), the CID *is* the digest of the raw bytes, so we can
// re-verify the gateway response against the content address. This only
// applies to single-block raw CIDs ("bafkrei...") fetched as a full GET;
// dag-pb/UnixFS roots, sub-paths and Range responses are passed through
// unchanged because their bytes are not a flat hash of the request CID.
const RAW_CODEC = 0x55;
const SHA2_256_CODE = 0x12;
const SHA2_256_LENGTH = 32;
const BASE32_LOWER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/__health') {
            return jsonResponse(request, env, {
                status: 'ok',
                service: 'media-delivery',
                gateways: getGatewayBases(env).length,
                timestamp: new Date().toISOString(),
            });
        }

        if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/ipfs/')) {
            return handleIpfsRequest(request, env, ctx);
        }

        return jsonResponse(
            request,
            env,
            {
                error: 'not_found',
                endpoints: ['/__health', '/ipfs/:cid/:path*'],
            },
            404,
        );
    },
};

async function handleIpfsRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const parsedPath = parseIpfsPath(url.pathname);
    if (!parsedPath.ok) {
        return jsonResponse(request, env, { error: parsedPath.error }, 400);
    }

    const rangeHeader = request.headers.get('Range');
    const canUseCache = request.method === 'GET' && !rangeHeader;
    const cacheKey = canUseCache ? buildCacheKey(request, env) : null;

    if (cacheKey) {
        const cached = await caches.default.match(cacheKey);
        if (cached) {
            return withDeliveryHeaders(request, env, cached, {
                cacheState: 'HIT',
            });
        }
    }

    const verifyCid = isCidIntegrityEnabled(env)
        && request.method === 'GET'
        && !rangeHeader
        && parsedPath.singleSegment
        && parseRawSha256CidDigest(parsedPath.cid) !== null
        ? parsedPath.cid
        : null;
    const upstream = await fetchFromGateways(parsedPath.path, request, env, verifyCid);
    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: upstream.integrityMismatch ? 'cid_integrity_mismatch' : 'gateway_fetch_failed',
            cid: upstream.integrityMismatch ? parsedPath.cid : undefined,
            status: upstream.status,
            upstream: upstream.upstreamBase,
        }, upstream.status === 404 ? 404 : 502);
    }

    const response = withDeliveryHeaders(request, env, upstream.response, {
        cacheState: cacheKey ? 'MISS' : 'BYPASS',
        upstreamBase: upstream.upstreamBase,
        cacheTtlSeconds: getCacheTtlSeconds(env),
    });

    if (cacheKey && response.ok && response.status === 200) {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    }

    return response;
}

async function fetchFromGateways(
    assetPath: string,
    request: Request,
    env: Env,
    verifyCid: string | null,
): Promise<{ ok: true; response: Response; upstreamBase: string } | { ok: false; status: number; upstreamBase?: string; integrityMismatch?: boolean }> {
    let lastStatus = 502;
    let integrityMismatch = false;

    for (const gatewayBase of getGatewayBases(env)) {
        const upstreamUrl = `${gatewayBase}/${assetPath}`;
        const headers = new Headers();
        const rangeHeader = request.headers.get('Range');
        const acceptHeader = request.headers.get('Accept');
        const abortable = createAbortableController(getUpstreamTimeoutMs(env));

        if (rangeHeader) {
            headers.set('Range', rangeHeader);
        }
        if (acceptHeader) {
            headers.set('Accept', acceptHeader);
        }

        try {
            const response = await fetch(upstreamUrl, {
                method: request.method,
                headers,
                signal: abortable.controller.signal,
            });

            if (response.ok || response.status === 206) {
                const verified = await verifyGatewayResponse(response, verifyCid);
                if (verified) {
                    return { ok: true, response: verified, upstreamBase: gatewayBase };
                }
                integrityMismatch = true;
                lastStatus = 502;
                continue;
            }

            lastStatus = response.status;
        } catch {
            lastStatus = 502;
        } finally {
            abortable.cleanup();
        }
    }

    return { ok: false, status: lastStatus, integrityMismatch };
}

async function verifyGatewayResponse(response: Response, cid: string | null): Promise<Response | null> {
    if (!cid || response.status !== 200) return response;
    const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_INTEGRITY_BODY_BYTES) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_INTEGRITY_BODY_BYTES
        || !await matchesRawCidDigest(cid, new Uint8Array(bytes))) {
        return null;
    }
    return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

function parseIpfsPath(pathname: string): { ok: true; path: string; cid: string; singleSegment: boolean } | { ok: false; error: string } {
    const rawPath = pathname.slice('/ipfs/'.length);
    if (!rawPath) {
        return { ok: false, error: 'missing_cid' };
    }

    const decodedSegments: string[] = [];
    for (const segment of rawPath.split('/')) {
        if (!segment) {
            return { ok: false, error: 'invalid_ipfs_path' };
        }

        let decoded: string;
        try {
            decoded = decodeURIComponent(segment);
        } catch {
            return { ok: false, error: 'invalid_ipfs_path' };
        }

        if (decoded === '.' || decoded === '..' || decoded.includes('\\')) {
            return { ok: false, error: 'invalid_ipfs_path' };
        }

        decodedSegments.push(decoded);
    }

    const cid = decodedSegments[0];
    if (!CID_PATTERN.test(cid)) {
        return { ok: false, error: 'invalid_cid' };
    }

    return {
        ok: true,
        path: decodedSegments.map((segment) => encodeURIComponent(segment)).join('/'),
        cid,
        singleSegment: decodedSegments.length === 1,
    };
}

function isCidIntegrityEnabled(env: Env): boolean {
    return (env.VERIFY_CID_INTEGRITY ?? 'true').trim().toLowerCase() !== 'false';
}

function decodeBase32Lower(input: string): Uint8Array | null {
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const char of input) {
        const index = BASE32_LOWER_ALPHABET.indexOf(char);
        if (index === -1) {
            return null;
        }
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            output.push((value >> bits) & 0xff);
        }
    }
    return Uint8Array.from(output);
}

function readUvarint(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
    let result = 0;
    let shift = 0;
    let pos = offset;
    while (pos < bytes.length) {
        const byte = bytes[pos];
        pos += 1;
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) {
            return { value: result >>> 0, next: pos };
        }
        shift += 7;
        if (shift > 35) {
            return null;
        }
    }
    return null;
}

/**
 * Return the 32-byte sha2-256 digest embedded in a CIDv1 raw-codec CID,
 * or null when the CID is any other shape (CIDv0, dag-pb, other hashes).
 */
function parseRawSha256CidDigest(cid: string): Uint8Array | null {
    if (!cid.startsWith('b')) {
        return null;
    }
    const bytes = decodeBase32Lower(cid.slice(1));
    if (!bytes) {
        return null;
    }
    const version = readUvarint(bytes, 0);
    if (!version || version.value !== 1) {
        return null;
    }
    const codec = readUvarint(bytes, version.next);
    if (!codec || codec.value !== RAW_CODEC) {
        return null;
    }
    const hashCode = readUvarint(bytes, codec.next);
    if (!hashCode || hashCode.value !== SHA2_256_CODE) {
        return null;
    }
    const hashLength = readUvarint(bytes, hashCode.next);
    if (!hashLength || hashLength.value !== SHA2_256_LENGTH) {
        return null;
    }
    const digest = bytes.slice(hashLength.next, hashLength.next + SHA2_256_LENGTH);
    return digest.length === SHA2_256_LENGTH ? digest : null;
}

async function matchesRawCidDigest(cid: string, bytes: Uint8Array): Promise<boolean> {
    const expected = parseRawSha256CidDigest(cid);
    if (!expected) {
        // Not a verifiable shape — never block content we cannot address-check.
        return true;
    }
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (actual.length !== expected.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) {
        diff |= actual[i] ^ expected[i];
    }
    return diff === 0;
}

function buildCacheKey(request: Request, env: Env): Request {
    const cacheUrl = new URL(request.url);
    cacheUrl.search = '';
    if (env.CACHE_VERSION?.trim()) {
        cacheUrl.searchParams.set('__cv', env.CACHE_VERSION.trim());
    }

    return new Request(cacheUrl.toString(), { method: 'GET' });
}

function withDeliveryHeaders(
    request: Request,
    env: Env,
    response: Response,
    options: {
        cacheState: 'HIT' | 'MISS' | 'BYPASS';
        upstreamBase?: string;
        cacheTtlSeconds?: number;
    },
): Response {
    const headers = new Headers(response.headers);
    headers.set('X-Media-Delivery', 'youtick-media-delivery');
    headers.set('X-Media-Delivery-Cache', options.cacheState);
    headers.set('Access-Control-Expose-Headers', [
        'Accept-Ranges',
        'Content-Length',
        'Content-Range',
        'X-Media-Delivery',
        'X-Media-Delivery-Cache',
        'X-Media-Delivery-Upstream',
    ].join(', '));

    if (options.upstreamBase) {
        headers.set('X-Media-Delivery-Upstream', options.upstreamBase);
    }

    if (options.cacheState === 'MISS' && options.cacheTtlSeconds) {
        headers.set('Cache-Control', `public, max-age=0, s-maxage=${options.cacheTtlSeconds}`);
    } else if (options.cacheState === 'BYPASS') {
        headers.set('Cache-Control', 'no-store');
    }

    for (const [name, value] of Object.entries(corsHeaders(request, env))) {
        headers.set(name, value);
    }

    return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function handleOptions(request: Request, env: Env): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
    });
}

function jsonResponse(
    request: Request,
    env: Env,
    body: JsonBody,
    status = 200,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...corsHeaders(request, env),
        },
    });
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
    const requestOrigin = request.headers.get('Origin');
    const allowedOrigins = getAllowedOrigins(env);
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Vary': 'Origin',
    };

    if (requestOrigin && allowedOrigins.has(requestOrigin)) {
        headers['Access-Control-Allow-Origin'] = requestOrigin;
    }

    return headers;
}

function getAllowedOrigins(env: Env): Set<string> {
    return new Set(
        (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    );
}

function getGatewayBases(env: Env): string[] {
    return (env.IPFS_GATEWAY_BASES || DEFAULT_IPFS_GATEWAY_BASES)
        .split(',')
        .map((value) => value.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

function getCacheTtlSeconds(env: Env): number {
    const parsed = Number.parseInt(env.CACHE_TTL_SECONDS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_TTL_SECONDS;
}

function getUpstreamTimeoutMs(env: Env): number {
    const parsed = Number.parseInt(env.UPSTREAM_TIMEOUT_MS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_UPSTREAM_TIMEOUT_MS;
}

function createAbortableController(timeoutMs: number): {
    controller: AbortController;
    cleanup: () => void;
} {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return {
        controller,
        cleanup: () => clearTimeout(timer),
    };
}
