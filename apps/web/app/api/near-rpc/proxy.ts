const PUBLIC_UPSTREAMS = {
    mainnet: [
        'https://free.rpc.fastnear.com/',
        'https://rpc.mainnet.near.org/',
        'https://near.drpc.org/',
    ],
    testnet: [
        'https://test.rpc.fastnear.com/',
        'https://rpc.testnet.near.org/',
        'https://near-testnet.drpc.org/',
    ],
} as const;

const READ_METHODS = new Set([
    'block',
    'chunk',
    'gas_price',
    'network_info',
    'next_light_client_block',
    'query',
    'status',
    'tx',
    'validators',
]);

const BROADCAST_METHODS = new Set([
    'broadcast_tx_async',
    'broadcast_tx_commit',
    'send_tx',
]);

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 2_500;
const TOTAL_READ_DEADLINE_MS = 6_000;
const RATE_WINDOW_MS = 60_000;
const READ_RATE_LIMIT = 60;
const BROADCAST_RATE_LIMIT = 10;
const MAX_RATE_KEYS = 2_048;
const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_OPEN_MS = 30_000;

const STRIPPED_UPSTREAM_HEADERS = [
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'content-encoding',
    'content-length',
    'transfer-encoding',
] as const;

type RpcMode = 'read' | 'broadcast';

interface JsonRpcPayload {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}

interface Upstream {
    label: string;
    url: string;
    authorization?: string;
}

interface RateEntry {
    count: number;
    startedAt: number;
}

interface CircuitState {
    failures: number;
    openUntil: number;
}

const rateEntries = new Map<string, RateEntry>();
const circuitStates = new Map<string, CircuitState>();

function errorResponse(status: number, error: string, headers?: HeadersInit): Response {
    return Response.json({ error }, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            ...headers,
        },
    });
}

function getUpstreams(): Upstream[] {
    const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
    const upstreams: Upstream[] = [];
    const dedicatedUrl = process.env.NEAR_RPC_PRIMARY_URL;
    const authorization = process.env.NEAR_RPC_PRIMARY_AUTHORIZATION;

    if (dedicatedUrl && authorization && /^https:\/\//.test(dedicatedUrl)) {
        upstreams.push({ label: 'dedicated', url: dedicatedUrl, authorization });
    }
    for (const [index, url] of PUBLIC_UPSTREAMS[network].entries()) {
        if (!upstreams.some((upstream) => upstream.url === url)) {
            upstreams.push({ label: `public-${index + 1}`, url });
        }
    }
    return upstreams;
}

async function readLimitedBody(
    body: ReadableStream<Uint8Array> | null,
    declaredLength: string | null,
    limit: number,
): Promise<Uint8Array | null> {
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)) {
        return null;
    }
    if (!body) return new Uint8Array();

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }

    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return combined;
}

function parsePayload(body: Uint8Array, mode: RpcMode): JsonRpcPayload | null {
    let payload: unknown;
    try {
        payload = JSON.parse(new TextDecoder().decode(body));
    } catch {
        return null;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

    const candidate = payload as Partial<JsonRpcPayload>;
    const methods = mode === 'read' ? READ_METHODS : BROADCAST_METHODS;
    if (candidate.jsonrpc !== '2.0' || typeof candidate.method !== 'string' || !methods.has(candidate.method)) {
        return null;
    }
    return candidate as JsonRpcPayload;
}

function clientIp(request: Request): string {
    return request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
}

function payloadAccount(payload: JsonRpcPayload): string | null {
    if (!payload.params || typeof payload.params !== 'object' || Array.isArray(payload.params)) return null;
    const accountId = (payload.params as { account_id?: unknown }).account_id;
    return typeof accountId === 'string' && accountId.length <= 64 ? accountId : null;
}

function consumeRate(key: string, limit: number, now: number): boolean {
    const current = rateEntries.get(key);
    if (current && now - current.startedAt < RATE_WINDOW_MS) {
        if (current.count >= limit) return false;
        current.count += 1;
        return true;
    }

    if (!current && rateEntries.size >= MAX_RATE_KEYS) {
        for (const [entryKey, entry] of rateEntries) {
            if (now - entry.startedAt >= RATE_WINDOW_MS) rateEntries.delete(entryKey);
        }
        if (rateEntries.size >= MAX_RATE_KEYS) return false;
    }
    rateEntries.set(key, { count: 1, startedAt: now });
    return true;
}

function checkRateLimit(request: Request, payload: JsonRpcPayload, mode: RpcMode): boolean {
    const now = Date.now();
    const limit = mode === 'read' ? READ_RATE_LIMIT : BROADCAST_RATE_LIMIT;
    if (!consumeRate(`${mode}:ip:${clientIp(request)}`, limit, now)) return false;

    const accountId = payloadAccount(payload);
    return !accountId || consumeRate(`${mode}:account:${accountId}`, limit, now);
}

function isCircuitOpen(label: string, now: number): boolean {
    return (circuitStates.get(label)?.openUntil || 0) > now;
}

function recordCircuit(label: string, transientFailure: boolean, now: number): void {
    if (!transientFailure) {
        circuitStates.delete(label);
        return;
    }
    const previous = circuitStates.get(label);
    const failures = (previous?.failures || 0) + 1;
    circuitStates.set(label, {
        failures,
        openUntil: failures >= CIRCUIT_FAILURE_LIMIT ? now + CIRCUIT_OPEN_MS : 0,
    });
}

function logUpstream(
    upstream: Upstream,
    mode: RpcMode,
    method: string,
    status: number,
    startedAt: number,
    outcome: string,
): void {
    if (process.env.NODE_ENV === 'test') return;
    console.info(JSON.stringify({
        event: 'near_rpc_upstream_completed',
        upstream: upstream.label,
        mode,
        method,
        status,
        latency_ms: Date.now() - startedAt,
        outcome,
    }));
}

async function fetchWithTimeout(
    upstream: Upstream,
    body: string,
    requestSignal: AbortSignal,
    timeoutMs: number,
): Promise<Response | null> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (requestSignal.aborted) controller.abort();
    else requestSignal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);

    try {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (upstream.authorization) headers.set('Authorization', upstream.authorization);
        return await fetch(upstream.url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
        });
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
        requestSignal.removeEventListener('abort', abort);
    }
}

async function boundedUpstreamResponse(upstream: Response): Promise<Response> {
    let body: Uint8Array | null;
    try {
        body = await readLimitedBody(
            upstream.body,
            upstream.headers.get('content-length'),
            MAX_RESPONSE_BYTES,
        );
    } catch {
        return errorResponse(502, 'NEAR RPC unavailable');
    }
    if (!body) return errorResponse(502, 'NEAR RPC response too large');

    const headers = new Headers(upstream.headers);
    for (const header of STRIPPED_UPSTREAM_HEADERS) headers.delete(header);
    headers.set('Cache-Control', 'no-store');
    const responseBody = new ArrayBuffer(body.byteLength);
    new Uint8Array(responseBody).set(body);
    return new Response(responseBody, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

export async function handleNearRpcRequest(request: Request, mode: RpcMode): Promise<Response> {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
        return errorResponse(415, 'application/json required');
    }

    const bodyBytes = await readLimitedBody(
        request.body,
        request.headers.get('content-length'),
        MAX_REQUEST_BYTES,
    );
    if (!bodyBytes) return errorResponse(413, 'NEAR RPC body too large');

    const payload = parsePayload(bodyBytes, mode);
    if (!payload) return errorResponse(400, 'Unsupported JSON-RPC request');
    if (!checkRateLimit(request, payload, mode)) {
        return errorResponse(429, 'NEAR RPC rate limit exceeded', { 'Retry-After': '60' });
    }

    const body = JSON.stringify(payload);
    const upstreams = getUpstreams();
    const deadline = Date.now() + (mode === 'read' ? TOTAL_READ_DEADLINE_MS : UPSTREAM_TIMEOUT_MS);
    const candidates = mode === 'broadcast' ? upstreams.slice(0, 1) : upstreams;

    for (const upstream of candidates) {
        const now = Date.now();
        if (isCircuitOpen(upstream.label, now)) continue;
        const remainingMs = deadline - now;
        if (remainingMs <= 0) break;

        const startedAt = Date.now();
        const response = await fetchWithTimeout(
            upstream,
            body,
            request.signal,
            Math.min(UPSTREAM_TIMEOUT_MS, remainingMs),
        );
        if (!response) {
            recordCircuit(upstream.label, true, Date.now());
            logUpstream(upstream, mode, payload.method, 0, startedAt, 'network_error');
            continue;
        }

        const transientFailure = response.status === 429 || response.status >= 500;
        recordCircuit(upstream.label, transientFailure, Date.now());
        logUpstream(upstream, mode, payload.method, response.status, startedAt, transientFailure ? 'transient' : 'ok');
        if (mode === 'broadcast' || !transientFailure) {
            return boundedUpstreamResponse(response);
        }
        await response.body?.cancel();
    }

    return errorResponse(Date.now() >= deadline ? 504 : 502, 'NEAR RPC unavailable');
}
