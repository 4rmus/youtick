import { fetchFinalMarketPublications, PUBLICATION_PAGE_SIZE } from '../scripts/bootstrap-market-read-model-d1.mjs';

const FIELDS = ['publication_id', 'creator_id', 'title', 'generation', 'price_usdc', 'playback_id', 'availability', 'published_at_ms'];
const STATES = ['ACTIVE', 'SALES_SUSPENDED', 'TAKEDOWN'];
export const CURRENT_CATALOG_QUERY_BUDGET = 100;
// Fixed D1 cost: two reads, the compare-guarded state row and a two-read reconcile after an ambiguous commit.
const FIXED_CATALOG_QUERIES = 5;
// A first snapshot writes every publication, so the whole catalogue must fit the reserved share of the 995 budget.
export const MAX_CURRENT_CATALOG_PUBLICATIONS = CURRENT_CATALOG_QUERY_BUDGET - FIXED_CATALOG_QUERIES;
export const CATALOG_CAPACITY_WARNING_COUNT = Math.ceil(MAX_CURRENT_CATALOG_PUBLICATIONS * 0.8);
const MAX_CATALOG_RPC_REQUESTS = 2 + Math.ceil(MAX_CURRENT_CATALOG_PUBLICATIONS / PUBLICATION_PAGE_SIZE);

export function currentCatalogEnabled(env) {
    return env.READ_MODEL_CURRENT_CATALOG_ENABLED === 'true' && env.READ_MODEL_ENABLED === 'true'
        && env.VIDEO_ENVIRONMENT === 'public-testnet' && env.READ_MODEL_NETWORK === 'testnet'
        && env.READ_MODEL_CONTRACT_ID === env.MARKET_CONTRACT_ID
        && /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(env.MARKET_CONTRACT_ID || '')
        && env.MARKET_CONTRACT_ID.endsWith('.testnet') && Boolean(env.MARKET_READ_MODEL);
}

export async function fetchCurrentCatalog(input, fetchImpl = fetch, now = Date.now, signal = AbortSignal.timeout(15_000)) {
    let header;
    let requestCount = 0;
    const { block, snapshot } = await fetchFinalMarketPublications(input, async (url, init) => {
        signal.throwIfAborted();
        if (++requestCount > MAX_CATALOG_RPC_REQUESTS) throw new Error('catalog_request_limit');
        const response = await fetchImpl(url, { ...init, signal: AbortSignal.any([signal, init.signal]) });
        if (!response.ok || Number(response.headers.get('Content-Length')) > 512 * 1024) throw new Error('catalog_rpc_unavailable');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('catalog_rpc_unavailable');
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > 512 * 1024) throw new Error('catalog_response_limit');
                signal.throwIfAborted();
                chunks.push(value);
            }
        } finally { await reader.cancel(); }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const value = JSON.parse(new TextDecoder().decode(bytes));
        const request = JSON.parse(init.body);
        if (value.jsonrpc !== '2.0' || value.id !== request.id || value.error) throw new Error('catalog_rpc_invalid');
        if (request.method === 'block') header = value.result?.header;
        else if (!header || value.result?.block_height !== header.height || value.result?.block_hash !== header.hash) {
            throw new Error('catalog_block_mismatch');
        }
        return Response.json(value);
    }, { maxPublications: MAX_CURRENT_CATALOG_PUBLICATIONS }).catch(error => {
        // Over capacity: reject the whole candidate so the last verified catalogue stays in place.
        throw error?.message === 'd1_bootstrap_publication_limit_exceeded' ? new Error('catalog_capacity_exceeded') : error;
    });
    signal.throwIfAborted();
    if (typeof block.timestamp_nanosec !== 'string' || !/^[1-9][0-9]{0,29}$/.test(block.timestamp_nanosec)) throw new Error('catalog_timestamp_invalid');
    const timestamp = Number(BigInt(block.timestamp_nanosec) / 1_000_000n);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > now() + 5000) throw new Error('catalog_timestamp_invalid');
    if (snapshot.publications.some(row => row.published_at_ms > timestamp)) throw new Error('catalog_timestamp_invalid');
    const publications = snapshot.publications.sort((a, b) => a.publication_id < b.publication_id ? -1 : a.publication_id > b.publication_id ? 1 : 0);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(publications)));
    return { ...snapshot, publications, source_block_timestamp_ms: timestamp, rpc_request_count: requestCount,
        content_revision: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}

export async function readCurrentCatalog(db, scope) {
    const values = [scope.network, scope.contractId ?? scope.contract_id];
    const [head, rows] = await db.batch([
        db.prepare('SELECT * FROM current_catalog_state WHERE network=? AND contract_id=?').bind(...values),
        db.prepare(`SELECT ${FIELDS.join(', ')} FROM current_publications WHERE network=? AND contract_id=? ORDER BY publication_id`).bind(...values),
    ]);
    return { state: head.results?.[0] ?? null, publications: rows.results ?? [] };
}

export async function applyCurrentCatalog(db, snapshot, checkedAt = Date.now(), signal) {
    const previous = await readCurrentCatalog(db, snapshot);
    signal?.throwIfAborted();
    const head = previous.state;
    if (head && (snapshot.block_height < head.verified_block_height
        || snapshot.source_block_timestamp_ms < head.source_block_timestamp_ms
        || (snapshot.block_height === head.verified_block_height
            && (snapshot.block_hash !== head.verified_block_hash || snapshot.content_revision !== head.content_revision
                || snapshot.source_block_timestamp_ms !== head.source_block_timestamp_ms)))) throw new Error('catalog_snapshot_conflict');
    if (snapshot.publications.length > MAX_CURRENT_CATALOG_PUBLICATIONS) throw new Error('catalog_capacity_exceeded');
    const candidate = new Map(snapshot.publications.map(row => [row.publication_id, row]));
    for (const old of previous.publications) {
        const row = candidate.get(old.publication_id);
        if (!row || row.generation < old.generation || STATES.indexOf(row.availability) < STATES.indexOf(old.availability)
            || FIELDS.filter(key => !['generation', 'availability'].includes(key)).some(key => row[key] !== old[key])) {
            throw new Error('catalog_publication_conflict');
        }
    }
    const scope = [snapshot.network, snapshot.contract_id];
    // A failed compare produces NOT NULL failure, aborting the entire batch (never a silent no-op).
    const statements = [db.prepare(`INSERT INTO current_catalog_state VALUES (?, ?,
        CASE WHEN COALESCE((SELECT verified_block_height FROM current_catalog_state WHERE network=? AND contract_id=?), 0)=?
            AND COALESCE((SELECT content_revision FROM current_catalog_state WHERE network=? AND contract_id=?), '')=?
            AND COALESCE((SELECT verified_block_hash FROM current_catalog_state WHERE network=? AND contract_id=?), '')=?
        THEN ? ELSE NULL END, ?, ?, ?, ?, ?)
        ON CONFLICT (network, contract_id) DO UPDATE SET
        verified_block_height=excluded.verified_block_height, verified_block_hash=excluded.verified_block_hash,
        source_block_timestamp_ms=excluded.source_block_timestamp_ms, checked_at_ms=excluded.checked_at_ms,
        publication_count=excluded.publication_count, content_revision=excluded.content_revision`).bind(
        ...scope, ...scope, head?.verified_block_height ?? 0, ...scope, head?.content_revision ?? '',
        ...scope, head?.verified_block_hash ?? '', snapshot.block_height, snapshot.block_hash,
        snapshot.source_block_timestamp_ms, checkedAt, snapshot.publications.length, snapshot.content_revision)];
    const oldRows = new Map(previous.publications.map(row => [row.publication_id, row]));
    for (const row of snapshot.publications) {
        const old = oldRows.get(row.publication_id);
        if (old && FIELDS.every(key => row[key] === old[key])) continue;
        statements.push(db.prepare(`INSERT INTO current_publications VALUES (?, ?, ${FIELDS.map(() => '?').join(', ')})
            ON CONFLICT (network, contract_id, publication_id) DO UPDATE SET
            ${FIELDS.slice(1).map(key => `${key}=excluded.${key}`).join(', ')}`).bind(...scope, ...FIELDS.map(key => row[key])));
    }
    if (statements.length + 4 > CURRENT_CATALOG_QUERY_BUDGET) throw new Error('catalog_query_limit');
    let queryCount = 2 + statements.length;
    signal?.throwIfAborted();
    try { await db.batch(statements); }
    catch (error) {
        // Reconcile a lost commit response once, without resending any write.
        queryCount += 2;
        const result = await readCurrentCatalog(db, snapshot);
        if (result.state?.verified_block_height !== snapshot.block_height || result.state?.verified_block_hash !== snapshot.block_hash
            || result.state?.content_revision !== snapshot.content_revision) throw error;
    }
    return { d1_query_count: queryCount, publication_count: snapshot.publications.length, verified_block_height: snapshot.block_height,
        source_block_timestamp_ms: snapshot.source_block_timestamp_ms };
}

export async function refreshCurrentCatalog(env, dependencies = {}) {
    if (!currentCatalogEnabled(env)) return { status: 'disabled' };
    const now = dependencies.now ?? Date.now;
    const timeout = AbortSignal.timeout(15_000);
    const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, timeout]) : timeout;
    const snapshot = await fetchCurrentCatalog({ network: env.READ_MODEL_NETWORK, contractId: env.READ_MODEL_CONTRACT_ID,
        rpcUrl: env.READ_MODEL_NEAR_RPC_URL }, dependencies.fetchImpl ?? fetch, now, signal);
    signal.throwIfAborted();
    const applied = await applyCurrentCatalog(env.MARKET_READ_MODEL, snapshot, now(), signal);
    return { status: 'updated', rpc_request_count: snapshot.rpc_request_count, ...applied,
        publication_capacity: MAX_CURRENT_CATALOG_PUBLICATIONS,
        ...(applied.publication_count >= CATALOG_CAPACITY_WARNING_COUNT ? { warning_code: 'catalog_capacity_warning' } : {}) };
}
