import { currentCatalogEnabled, readCurrentCatalog } from './current-catalog.mjs';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const BLOCK_HASH_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
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
    if (pathname.startsWith('/v2/')) return 'current_catalog';
    if (pathname === '/v1/publications') return 'publications';
    if (/^\/v1\/publications\/[^/]+$/.test(pathname)) return 'publication_detail';
    if (/^\/v1\/creators\/[^/]+\/publications$/.test(pathname)) return 'creator_publications';
    if (/^\/v1\/accounts\/[^/]+\/tickets$/.test(pathname)) return 'account_tickets';
    if (/^\/v1\/creators\/[^/]+\/sales$/.test(pathname)) return 'creator_sales';
    if (/^\/v1\/creators\/[^/]+\/withdrawals$/.test(pathname)) return 'creator_withdrawals';
    return 'unknown';
}

async function routeMarketReadApi(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/__health') {
        return json({
            status: 'ok',
            service: 'market-read-model',
            ...(env.VIDEO_ENVIRONMENT === 'public-testnet' ? {
                versionId: env.CF_VERSION_METADATA?.id, network: env.READ_MODEL_NETWORK,
                contractId: env.READ_MODEL_CONTRACT_ID, startBlockHeight: env.READ_MODEL_START_BLOCK_HEIGHT,
                ingestionEnabled: env.READ_MODEL_INGESTION_ENABLED === 'true',
                backfillEnabled: env.READ_MODEL_BACKFILL_ENABLED === 'true',
            } : {}),
            stage: env.READ_MODEL_ENABLED === 'true' ? 'ENABLED' : 'DISABLED',
        });
    }
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    if (!validEnv(env)) return json({ error: 'read_model_disabled' }, 503);

    try {
        if (url.pathname.startsWith('/v2/')) return await currentCatalogResponse(env, url);
        if (url.pathname === '/v1/publications') {
            return await publicationList(request, env, url, null);
        }
        const creatorRoute = url.pathname.match(/^\/v1\/creators\/([^/]+)\/publications$/);
        if (creatorRoute) {
            const creator = pathPart(creatorRoute[1], ACCOUNT_PATTERN);
            return await publicationList(request, env, url, creator);
        }
        // Account views stay off until the owner opts in; the default keeps sales out of the public API.
        const accountViews = env.READ_MODEL_ACCOUNT_VIEWS_ENABLED === 'true';
        const ticketsRoute = accountViews && url.pathname.match(/^\/v1\/accounts\/([^/]+)\/tickets$/);
        if (ticketsRoute) return await accountTickets(request, env, url, pathPart(ticketsRoute[1], ACCOUNT_PATTERN));
        const salesRoute = accountViews && url.pathname.match(/^\/v1\/creators\/([^/]+)\/sales$/);
        if (salesRoute) return await creatorSales(request, env, url, pathPart(salesRoute[1], ACCOUNT_PATTERN));
        const withdrawalsRoute = accountViews && url.pathname.match(/^\/v1\/creators\/([^/]+)\/withdrawals$/);
        if (withdrawalsRoute) {
            return await creatorWithdrawals(request, env, url, pathPart(withdrawalsRoute[1], ACCOUNT_PATTERN));
        }
        const detailRoute = url.pathname.match(/^\/v1\/publications\/([^/]+)$/);
        if (detailRoute) {
            const publicationId = pathPart(detailRoute[1], ID_PATTERN);
            return await publicationDetail(request, env, publicationId);
        }
        return json({ error: 'not_found' }, 404);
    } catch (error) {
        const code = error instanceof Error ? error.message : 'read_model_unavailable';
        if (code === 'catalog_changed') return json({ error: code }, 409);
        if (code === 'catalog_unavailable') return json({ error: code }, 503);
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
    const cursorFilter = cursor ? 'AND (source_block_height, publication_id) < (?, ?)' : '';
    const values = [
        env.READ_MODEL_NETWORK,
        env.READ_MODEL_CONTRACT_ID,
        ...(creator ? [creator] : []),
        ...(cursor ? [cursor.block_height, cursor.publication_id] : []),
        limit + 1,
    ];
    const [watermarkResult, publicationsResult] = await env.MARKET_READ_MODEL.batch([
        watermarkStatement(env),
        env.MARKET_READ_MODEL.prepare(`
            SELECT publication_id, creator_id, title, generation, price_usdc,
                   playback_id, availability, published_at_ms, source_block_height
            FROM publications
            WHERE network = ? AND contract_id = ? ${creatorFilter} ${cursorFilter}
            ORDER BY source_block_height DESC, publication_id DESC
            LIMIT ?
        `).bind(...values),
    ]);
    const watermark = requiredWatermark(watermarkResult.results?.[0]);
    const rows = publicationsResult.results || [];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return cachedJson(request, {
        ...(env.VIDEO_ENVIRONMENT === 'public-testnet' ? { network: env.READ_MODEL_NETWORK, contract_id: env.READ_MODEL_CONTRACT_ID } : {}),
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
        ...(env.VIDEO_ENVIRONMENT === 'public-testnet' ? { network: env.READ_MODEL_NETWORK, contract_id: env.READ_MODEL_CONTRACT_ID } : {}),
        schema: 'youtick.publication-detail.v1',
        watermark,
        publication,
    }, watermark);
}

// Account views are derived from past events and can lag the current catalogue (plan K2), so they
// also return when the watermark last advanced. Entitlement checks for playback stay on NEAR.
async function accountTickets(request, env, url, accountId) {
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = parseKeyCursor(url.searchParams.get('cursor'));
    const [watermarkResult, rowsResult] = await env.MARKET_READ_MODEL.batch([
        accountWatermarkStatement(env),
        env.MARKET_READ_MODEL.prepare(`
            SELECT e.publication_id AS publication_id, e.source_block_height AS source_block_height,
                   p.creator_id, p.title, p.generation, p.price_usdc, p.playback_id,
                   p.availability, p.published_at_ms, p.source_block_height AS publication_block_height
            FROM viewer_entitlements e
            LEFT JOIN publications p
              ON p.network = e.network AND p.contract_id = e.contract_id AND p.publication_id = e.publication_id
            WHERE e.network = ? AND e.contract_id = ? AND e.account_id = ?
              ${cursor ? 'AND (e.source_block_height, e.publication_id) < (?, ?)' : ''}
            ORDER BY e.source_block_height DESC, e.publication_id DESC
            LIMIT ?
        `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID, accountId,
            ...(cursor ? [cursor.block_height, cursor.id] : []), limit + 1),
    ]);
    const { watermark, indexedAtMs } = accountWatermark(watermarkResult.results?.[0]);
    const rows = rowsResult.results || [];
    const page = rows.slice(0, limit);
    return cachedJson(request, {
        ...scopeFields(env),
        schema: 'youtick.account-tickets.v1',
        watermark,
        indexed_at_ms: indexedAtMs,
        account_id: accountId,
        items: page.map((row) => ({
            publication_id: row.publication_id,
            source_block_height: row.source_block_height,
            publication: row.title === null ? null : {
                publication_id: row.publication_id, creator_id: row.creator_id, title: row.title,
                generation: row.generation, price_usdc: row.price_usdc, playback_id: row.playback_id,
                availability: row.availability, published_at_ms: row.published_at_ms,
                source_block_height: row.publication_block_height,
            },
        })),
        next_cursor: nextKeyCursor(rows, limit, (row) => [row.source_block_height, row.publication_id]),
    }, watermark);
}

async function creatorSales(request, env, url, creatorId) {
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = parseSalesCursor(url.searchParams.get('cursor'));
    const [watermarkResult, rowsResult] = await env.MARKET_READ_MODEL.batch([
        accountWatermarkStatement(env),
        env.MARKET_READ_MODEL.prepare(`
            SELECT publication_id, asset, COUNT(*) AS sale_count,
                   SUM(CAST(amount AS INTEGER)) AS gross_amount,
                   SUM(CAST(creator_amount AS INTEGER)) AS creator_amount,
                   SUM(CAST(platform_amount AS INTEGER)) AS platform_amount,
                   MAX(source_block_height) AS last_sale_block_height
            FROM sale_ledger
            WHERE network = ? AND contract_id = ? AND creator_id = ?
              ${cursor ? 'AND (publication_id, asset) > (?, ?)' : ''}
            GROUP BY publication_id, asset
            ORDER BY publication_id ASC, asset ASC
            LIMIT ?
        `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID, creatorId,
            ...(cursor ? [cursor.publication_id, cursor.asset] : []), limit + 1),
    ]);
    const { watermark, indexedAtMs } = accountWatermark(watermarkResult.results?.[0]);
    const rows = rowsResult.results || [];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return cachedJson(request, {
        ...scopeFields(env),
        schema: 'youtick.creator-sales.v1',
        watermark,
        indexed_at_ms: indexedAtMs,
        creator_id: creatorId,
        items: page.map((row) => ({
            publication_id: row.publication_id,
            asset: row.asset,
            sale_count: row.sale_count,
            gross_amount: amountString(row.gross_amount),
            creator_amount: amountString(row.creator_amount),
            platform_amount: amountString(row.platform_amount),
            last_sale_block_height: row.last_sale_block_height,
        })),
        next_cursor: rows.length > limit && last
            ? base64UrlJson({ publication_id: last.publication_id, asset: last.asset })
            : null,
    }, watermark);
}

const CREATOR_WITHDRAWAL_STATUSES = [
    'creator_balance_withdrawal_started',
    'creator_balance_withdrawal_succeeded',
    'creator_balance_withdrawal_failed',
];

async function creatorWithdrawals(request, env, url, creatorId) {
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = parseKeyCursor(url.searchParams.get('cursor'));
    const [watermarkResult, rowsResult] = await env.MARKET_READ_MODEL.batch([
        accountWatermarkStatement(env),
        env.MARKET_READ_MODEL.prepare(`
            SELECT withdrawal_id, asset, amount, status, reason_code, source_block_height
            FROM withdrawal_history
            WHERE network = ? AND contract_id = ? AND account_id = ?
              AND status IN (?, ?, ?)
              ${cursor ? 'AND (source_block_height, withdrawal_id) < (?, ?)' : ''}
            ORDER BY source_block_height DESC, withdrawal_id DESC
            LIMIT ?
        `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID, creatorId, ...CREATOR_WITHDRAWAL_STATUSES,
            ...(cursor ? [cursor.block_height, cursor.id] : []), limit + 1),
    ]);
    const { watermark, indexedAtMs } = accountWatermark(watermarkResult.results?.[0]);
    const rows = rowsResult.results || [];
    return cachedJson(request, {
        ...scopeFields(env),
        schema: 'youtick.creator-withdrawals.v1',
        watermark,
        indexed_at_ms: indexedAtMs,
        creator_id: creatorId,
        items: rows.slice(0, limit).map((row) => ({
            withdrawal_id: row.withdrawal_id,
            asset: row.asset,
            amount: row.amount,
            status: row.status.replace('creator_balance_withdrawal_', ''),
            reason_code: row.reason_code ?? null,
            source_block_height: row.source_block_height,
        })),
        next_cursor: nextKeyCursor(rows, limit, (row) => [row.source_block_height, row.withdrawal_id]),
    }, watermark);
}

function scopeFields(env) {
    return env.VIDEO_ENVIRONMENT === 'public-testnet'
        ? { network: env.READ_MODEL_NETWORK, contract_id: env.READ_MODEL_CONTRACT_ID }
        : {};
}

function accountWatermarkStatement(env) {
    return env.MARKET_READ_MODEL.prepare(`
        SELECT block_height, block_hash, updated_at_ms FROM finality_watermarks
        WHERE network = ? AND contract_id = ? LIMIT 1
    `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID);
}

function accountWatermark(value) {
    const watermark = requiredWatermark(value);
    if (!Number.isSafeInteger(value.updated_at_ms) || value.updated_at_ms < 1) throw new Error('read_model_not_ready');
    return { watermark: { block_height: watermark.block_height, block_hash: watermark.block_hash }, indexedAtMs: value.updated_at_ms };
}

// SQLite sums whole numbers as 64-bit integers and fails on overflow; D1 returns them as JS numbers.
function amountString(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('read_model_unavailable');
    return String(value);
}

function base64UrlJson(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nextKeyCursor(rows, limit, key) {
    const last = rows.slice(0, limit).at(-1);
    if (rows.length <= limit || !last) return null;
    const [blockHeight, id] = key(last);
    return base64UrlJson({ block_height: blockHeight, id });
}

function decodeCursorJson(value) {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_cursor');
    try {
        return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
    } catch {
        throw new Error('invalid_cursor');
    }
}

function parseKeyCursor(value) {
    if (value === null) return null;
    const decoded = decodeCursorJson(value);
    if (!decoded || !Number.isSafeInteger(decoded.block_height) || decoded.block_height < 1
        || typeof decoded.id !== 'string' || !ID_PATTERN.test(decoded.id)) throw new Error('invalid_cursor');
    return decoded;
}

function parseSalesCursor(value) {
    if (value === null) return null;
    const decoded = decodeCursorJson(value);
    if (!decoded || typeof decoded.publication_id !== 'string' || !ID_PATTERN.test(decoded.publication_id)
        || !['USDC', 'NEAR'].includes(decoded.asset)) throw new Error('invalid_cursor');
    return decoded;
}

function watermarkStatement(env) {
    return env.MARKET_READ_MODEL.prepare(`
        SELECT block_height, block_hash FROM finality_watermarks
        WHERE network = ? AND contract_id = ? LIMIT 1
    `).bind(env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID);
}

function validEnv(env) {
    return env.READ_MODEL_ENABLED === 'true'
        && (env.VIDEO_ENVIRONMENT !== 'public-testnet'
            || (env.READ_MODEL_NETWORK === 'testnet' && env.READ_MODEL_CONTRACT_ID === env.MARKET_CONTRACT_ID
                && env.MARKET_CONTRACT_ID?.endsWith('.testnet')))
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

async function currentCatalogResponse(env, url) {
    if (!currentCatalogEnabled(env)) throw new Error('catalog_unavailable');
    const creatorRoute = url.pathname.match(/^\/v2\/creators\/([^/]+)\/publications$/);
    const detailRoute = url.pathname.match(/^\/v2\/publications\/([^/]+)$/);
    if (url.pathname !== '/v2/publications' && !creatorRoute && !detailRoute) return json({ error: 'not_found' }, 404);
    const creator = creatorRoute ? pathPart(creatorRoute[1], ACCOUNT_PATTERN) : null;
    const id = detailRoute ? pathPart(detailRoute[1], ID_PATTERN) : null;
    const limit = parseLimit(url.searchParams.get('limit'));
    const { state, publications } = await readCurrentCatalog(env.MARKET_READ_MODEL,
        { network: env.READ_MODEL_NETWORK, contractId: env.READ_MODEL_CONTRACT_ID });
    const servedAt = Date.now();
    const age = state ? servedAt - state.source_block_timestamp_ms : Infinity;
    if (!state || age > 180_000 || age < -5000 || !Number.isSafeInteger(state.source_block_timestamp_ms)
        || publications.length !== state.publication_count) throw new Error('catalog_unavailable');
    const metadata = { schema: 'youtick.current-catalog.v1', source: 'current-state',
        network: env.READ_MODEL_NETWORK, contract_id: env.READ_MODEL_CONTRACT_ID,
        catalog: state, served_at_ms: servedAt, freshness: age > 90_000 ? 'stale' : 'fresh' };
    if (id) {
        const publication = publications.find(row => row.publication_id === id);
        return publication ? json({ ...metadata, publication }) : json({ error: 'not_found' }, 404);
    }
    const scope = [2, env.READ_MODEL_NETWORK, env.READ_MODEL_CONTRACT_ID, creator];
    let cursor = null;
    const encoded = url.searchParams.get('cursor');
    if (encoded !== null) {
        try {
            if (encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
            cursor = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
            if (JSON.stringify(cursor.scope) !== JSON.stringify(scope) || !/^[a-f0-9]{64}$/.test(cursor.revision)
                || !Number.isSafeInteger(cursor.time) || cursor.time < 1 || typeof cursor.id !== 'string'
                || !ID_PATTERN.test(cursor.id)) throw new Error();
        } catch { throw new Error('invalid_cursor'); }
        if (cursor.revision !== state.content_revision) throw new Error('catalog_changed');
    }
    const rows = publications.filter(row => creator ? row.creator_id === creator : row.availability === 'ACTIVE')
        .sort((a, b) => b.published_at_ms - a.published_at_ms || (a.publication_id < b.publication_id ? 1 : a.publication_id > b.publication_id ? -1 : 0))
        .filter(row => !cursor || row.published_at_ms < cursor.time || (row.published_at_ms === cursor.time && row.publication_id < cursor.id));
    const items = rows.slice(0, limit), last = items.at(-1);
    const next = rows.length > limit ? { scope, revision: state.content_revision, time: last.published_at_ms, id: last.publication_id } : null;
    return json({ ...metadata, ...(creator ? { creator_id: creator } : {}), items,
        next_cursor: next ? btoa(JSON.stringify(next)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null });
}
