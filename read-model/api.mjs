const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const BLOCK_HASH_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]{0,39})$/;
const CACHE_CONTROL = 'public, max-age=15, stale-while-revalidate=15';

export default {
    fetch: marketReadApi,
};

export async function marketReadApi(request, env) {
    const startedAtMs = Date.now();
    const response = cors(await routeMarketReadApi(request, env), env);
    console.info(JSON.stringify({
        schema: 'youtick.market-read-api.v1',
        event: 'read_model_request_completed',
        route: readModelRoute(new URL(request.url).pathname),
        http_code: response.status,
        latency_ms: Math.max(0, Date.now() - startedAtMs),
    }));
    return response;
}

function readModelRoute(pathname) {
    if (pathname === '/__health') return 'health';
    if (pathname === '/v1/publications') return 'publications';
    if (/^\/v1\/publications\/[^/]+$/.test(pathname)) return 'publication_detail';
    if (/^\/v1\/creators\/[^/]+\/publications$/.test(pathname)) return 'creator_publications';
    if (/^\/v1\/creators\/[^/]+\/sales-summary$/.test(pathname)) return 'creator_sales_summary';
    return 'unknown';
}

async function routeMarketReadApi(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/__health') {
        return json({
            status: 'ok',
            service: 'market-read-model',
            stage: env.READ_MODEL_ENABLED === 'true' ? 'ENABLED' : 'DISABLED',
        });
    }
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    if (!validEnv(env)) return json({ error: 'read_model_disabled' }, 503);

    try {
        if (url.pathname === '/v1/publications') {
            return await publicationList(request, env, url, null);
        }
        const creatorRoute = url.pathname.match(/^\/v1\/creators\/([^/]+)\/publications$/);
        if (creatorRoute) {
            const creator = pathPart(creatorRoute[1], ACCOUNT_PATTERN);
            return await publicationList(request, env, url, creator);
        }
        const summaryRoute = url.pathname.match(/^\/v1\/creators\/([^/]+)\/sales-summary$/);
        if (summaryRoute) {
            const creator = pathPart(summaryRoute[1], ACCOUNT_PATTERN);
            return await salesSummary(request, env, creator);
        }
        const detailRoute = url.pathname.match(/^\/v1\/publications\/([^/]+)$/);
        if (detailRoute) {
            const publicationId = pathPart(detailRoute[1], ID_PATTERN);
            return await publicationDetail(request, env, publicationId);
        }
        return json({ error: 'not_found' }, 404);
    } catch (error) {
        const code = error instanceof Error ? error.message : 'read_model_unavailable';
        if (code === 'invalid_read_model_request' || code === 'invalid_cursor') {
            return json({ error: code }, 400);
        }
        return json({ error: 'read_model_unavailable' }, 503);
    }
}

async function publicationList(request, env, url, creator) {
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = parseCursor(url.searchParams.get('cursor'));
    const creatorFilter = creator ? 'AND creator_id = ?' : "AND availability = 'ACTIVE'";
    const cursorHeight = cursor?.block_height ?? null;
    const values = [
        env.READ_MODEL_NETWORK,
        env.READ_MODEL_CONTRACT_ID,
        ...(creator ? [creator] : []),
        cursorHeight,
        cursorHeight,
        cursorHeight,
        cursor?.publication_id ?? null,
        limit + 1,
    ];
    const [watermarkResult, publicationsResult] = await env.MARKET_READ_MODEL.batch([
        watermarkStatement(env),
        env.MARKET_READ_MODEL.prepare(`
            SELECT publication_id, creator_id, title, generation, price_usdc,
                   playback_id, availability, published_at_ms, source_block_height
            FROM publications
            WHERE network = ? AND contract_id = ? ${creatorFilter}
              AND (? IS NULL OR source_block_height < ?
                   OR (source_block_height = ? AND publication_id < ?))
            ORDER BY source_block_height DESC, publication_id DESC
            LIMIT ?
        `).bind(...values),
    ]);
    const watermark = requiredWatermark(watermarkResult.results?.[0]);
    const rows = publicationsResult.results || [];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return cachedJson(request, {
        schema: creator ? 'youtick.creator-publications.v1' : 'youtick.publications.v1',
        watermark,
        ...(creator ? { creator_id: creator } : {}),
        items: page,
        next_cursor: rows.length > limit && last
            ? encodeCursor(last.source_block_height, last.publication_id)
            : null,
    }, watermark);
}

async function publicationDetail(request, env, publicationId) {
    const [watermarkResult, detailResult] = await env.MARKET_READ_MODEL.batch([
        watermarkStatement(env),
        env.MARKET_READ_MODEL.prepare(`
            SELECT publication_id, creator_id, title, generation, price_usdc,
                   playback_id, availability, published_at_ms, source_block_height
            FROM publications
            WHERE network = ? AND contract_id = ? AND publication_id = ?
            LIMIT 1
        `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID, publicationId),
    ]);
    const watermark = requiredWatermark(watermarkResult.results?.[0]);
    const publication = detailResult.results?.[0];
    if (!publication) return json({ error: 'not_found' }, 404);
    return cachedJson(request, {
        schema: 'youtick.publication-detail.v1',
        watermark,
        publication,
    }, watermark);
}

async function salesSummary(request, env, creator) {
    const [watermarkResult, salesResult] = await env.MARKET_READ_MODEL.batch([
        watermarkStatement(env),
        env.MARKET_READ_MODEL.prepare(`
            SELECT amount, creator_amount
            FROM sale_ledger
            WHERE network = ? AND contract_id = ? AND creator_id = ?
        `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID, creator),
    ]);
    const watermark = requiredWatermark(watermarkResult.results?.[0]);
    const sales = salesResult.results || [];
    // ponytail: exact pilot fold; materialize totals only when measured row volume requires it.
    return cachedJson(request, {
        schema: 'youtick.creator-sales-summary.v1',
        watermark,
        creator_id: creator,
        sale_count: sales.length,
        gross_usdc: sumExactDecimals(sales, 'amount'),
        creator_usdc: sumExactDecimals(sales, 'creator_amount'),
    }, watermark);
}

function sumExactDecimals(rows, field) {
    let total = 0n;
    for (const row of rows) {
        const value = row[field];
        if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
            throw new Error('read_model_corrupt');
        }
        total += BigInt(value);
    }
    return total.toString();
}

function watermarkStatement(env) {
    return env.MARKET_READ_MODEL.prepare(`
        SELECT block_height, block_hash FROM finality_watermarks
        WHERE network = ? AND contract_id = ? LIMIT 1
    `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID);
}

function validEnv(env) {
    return env.READ_MODEL_ENABLED === 'true'
        && env.MARKET_READ_MODEL
        && ['testnet', 'mainnet'].includes(env.READ_MODEL_NETWORK)
        && ACCOUNT_PATTERN.test(env.READ_MODEL_CONTRACT_ID || '')
        && validWebOrigin(env.READ_MODEL_WEB_ORIGIN);
}

function validWebOrigin(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password
            && url.pathname === '/' && !url.search && !url.hash
            && url.origin === value;
    } catch {
        return false;
    }
}

function cors(response, env) {
    if (!validWebOrigin(env.READ_MODEL_WEB_ORIGIN)) return response;
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', env.READ_MODEL_WEB_ORIGIN);
    headers.append('Vary', 'Origin');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function parseLimit(value) {
    if (value === null) return 20;
    if (!/^[1-9][0-9]?$/.test(value) || Number(value) > 50) {
        throw new Error('invalid_read_model_request');
    }
    return Number(value);
}

function pathPart(value, pattern) {
    try {
        const decoded = decodeURIComponent(value);
        if (!pattern.test(decoded)) throw new Error('invalid_read_model_request');
        return decoded;
    } catch {
        throw new Error('invalid_read_model_request');
    }
}

function parseCursor(value) {
    if (value === null) return null;
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_cursor');
    try {
        const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
        if (!Number.isSafeInteger(decoded.block_height) || decoded.block_height < 1
            || typeof decoded.publication_id !== 'string'
            || !ID_PATTERN.test(decoded.publication_id)) throw new Error('invalid_cursor');
        return decoded;
    } catch {
        throw new Error('invalid_cursor');
    }
}

function encodeCursor(blockHeight, publicationId) {
    const bytes = new TextEncoder().encode(JSON.stringify({
        block_height: blockHeight,
        publication_id: publicationId,
    }));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')),
        (character) => character.charCodeAt(0));
}

function requiredWatermark(value) {
    if (!value || !Number.isSafeInteger(value.block_height) || value.block_height < 1
        || typeof value.block_hash !== 'string'
        || !BLOCK_HASH_PATTERN.test(value.block_hash)) throw new Error('read_model_not_ready');
    return value;
}

async function cachedJson(request, value, watermark) {
    const variant = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.url));
    const variantHex = [...new Uint8Array(variant).slice(0, 8)]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const etag = `"${watermark.block_height}:${watermark.block_hash}:${variantHex}"`;
    if (request.headers.get('If-None-Match') === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': CACHE_CONTROL } });
    }
    return json(value, 200, { ETag: etag, 'Cache-Control': CACHE_CONTROL });
}

function json(value, status = 200, headers = {}) {
    return Response.json(value, {
        status,
        headers: { 'Cache-Control': 'no-store', ...headers },
    });
}
