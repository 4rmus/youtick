import { base58Decode } from '../../shared/src/base58';
import {
    getR2IngestReadiness,
    matchR2IngestRoute,
    type R2IngestEnv,
} from './r2-ingest';
export { R2IngestSession } from './r2-ingest';

export interface Env extends R2IngestEnv {
    ALLOWED_ORIGINS?: string;
    STORAGE_PROVIDER?: string;
    LIGHTHOUSE_API_BASE?: string;
    LIGHTHOUSE_UPLOAD_BASE?: string;
    LIGHTHOUSE_API_KEY?: string;
    ENABLE_LIGHTHOUSE_UPLOADS?: string;
    MAX_UPLOAD_BYTES?: string;
    UPLOAD_INTENT_SECRET?: string;
    UPLOAD_INTENT_TTL_SECONDS?: string;
    UPLOAD_RATE_LIMIT_MAX?: string;
    UPLOAD_RATE_LIMIT_WINDOW_SECONDS?: string;
    NEAR_NETWORK?: string;
    UPLOAD_SESSION_CONTRACT_ID?: string;
    UPLOAD_GUARD?: KVNamespace;
}

type JsonBody = Record<string, unknown>;
type UploadKind = 'file' | 'directory' | 'pin';
type UploadEntry = {
    cid?: string;
    Name?: string;
    Hash?: string;
    Size?: string | number;
};
type UploadIntentRequest = {
    accountId?: string;
    fileName?: string;
    sizeBytes?: number;
    contentType?: string;
    uploadKind?: UploadKind;
    cid?: string;
};
type SignedUploadIntent = {
    v: 1;
    accountId: string;
    fileName: string;
    sizeBytes: number;
    contentType: string;
    uploadKind: UploadKind;
    exp: number;
    idempotencyKey: string;
    cid?: string;
};
type UploadableFile = Blob & { name: string; size: number };
type LighthouseUploadData = {
    cid?: string;
    Hash?: string;
    fileSizeInBytes?: string | number;
    Size?: string | number;
    fileName?: string;
    Name?: string;
    mimeType?: string;
    encryption?: boolean;
    txHash?: string;
};
type UploadAuthChallengeRecord = {
    challengeId: string;
    accountId: string;
    message: string;
    recipient: string;
    nonce: string;
    expiresAt: number;
};
type UploadAuthTokenClaims = {
    accountId: string;
    publicKey: string;
    expiresAt: number;
};

const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const DEFAULT_STORAGE_PROVIDER = 'lighthouse';
const DEFAULT_LIGHTHOUSE_API_BASE = 'https://api.lighthouse.storage';
const DEFAULT_LIGHTHOUSE_UPLOAD_BASE = 'https://upload.lighthouse.storage';
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const DEFAULT_UPLOAD_INTENT_TTL_SECONDS = 15 * 60;
const DEFAULT_UPLOAD_RATE_LIMIT_MAX = 1000;
const DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RECOMMENDED_PROXY_PART_BYTES = 4 * 1024 * 1024;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[a-z2-7]{57,})/;
const UPLOAD_AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const UPLOAD_AUTH_TOKEN_TTL_MS = 10 * 60 * 1000;
const NEP413_TAG = 2147484061;
const RPC_REQUEST_TIMEOUT_MS = 2_500;
const MAINNET_RPC_POOL = [
    'https://free.rpc.fastnear.com',
    'https://rpc.mainnet.fastnear.com',
    'https://rpc.mainnet.near.org',
    'https://near.lava.build',
];
const TESTNET_RPC_POOL = [
    'https://rpc.testnet.near.org',
];
const DEFAULT_UPLOAD_SESSION_CONTRACT_ID = 'youtick.near';
const TRUSTED_UPLOAD_SESSION_METHODS = new Set(['nft_mint_prepaid', 'create_event_prepaid']);

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        if (request.method === 'GET' && url.pathname === '/__health') {
            return jsonResponse(request, env, {
                status: 'ok',
                service: 'storage-api',
                provider: getStorageProvider(env),
                timestamp: new Date().toISOString(),
            });
        }

        if (request.method === 'GET' && url.pathname === '/provider-health') {
            return jsonResponse(request, env, getProviderHealth(env));
        }

        if (request.method === 'GET' && url.pathname === '/media-jobs/ingest/probe') {
            return jsonResponse(request, env, getR2IngestReadiness(env));
        }

        const r2IngestRoute = matchR2IngestRoute(url.pathname);
        if (r2IngestRoute) {
            return forwardR2IngestRequest(request, env, r2IngestRoute);
        }

        if (request.method === 'POST' && url.pathname === '/pins') {
            return handlePinRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/auth/challenge') {
            return handleUploadAuthChallengeRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/auth/verify') {
            return handleUploadAuthVerifyRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/intent') {
            return handleUploadIntentRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/directory') {
            return handleDirectoryUploadRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/file') {
            return handleFileUploadRequest(request, env);
        }

        const pinStatusMatch = url.pathname.match(/^\/pins\/([^/]+)\/status$/);
        if (request.method === 'GET' && pinStatusMatch) {
            return handlePinStatusRequest(request, env, pinStatusMatch[1]);
        }

        return jsonResponse(
            request,
            env,
            {
                error: 'not_found',
                endpoints: ['/__health', '/provider-health', '/media-jobs/ingest/probe', '/media-jobs/:job/generations/:generation/uploads', '/pins', '/pins/:cid/status', '/uploads/auth/challenge', '/uploads/auth/verify', '/uploads/intent', '/uploads/file', '/uploads/directory'],
            },
            404,
        );
    },
};

function getStorageProvider(env: Env): string {
    return env.STORAGE_PROVIDER?.trim() || DEFAULT_STORAGE_PROVIDER;
}

function getLighthouseApiBase(env: Env): string {
    return env.LIGHTHOUSE_API_BASE?.trim() || DEFAULT_LIGHTHOUSE_API_BASE;
}

function getLighthouseUploadBase(env: Env): string {
    return env.LIGHTHOUSE_UPLOAD_BASE?.trim() || DEFAULT_LIGHTHOUSE_UPLOAD_BASE;
}

function getProviderHealth(env: Env): JsonBody {
    const provider = getStorageProvider(env);

    if (provider !== 'lighthouse') {
        return {
            provider,
            ready: false,
            reason: 'unsupported_provider',
        };
    }

    if (!env.LIGHTHOUSE_API_KEY?.trim()) {
        return {
            provider,
            ready: false,
            reason: 'lighthouse_api_key_missing',
            apiBase: getLighthouseApiBase(env),
        };
    }

    return {
        provider,
        ready: true,
        apiBase: getLighthouseApiBase(env),
        uploadsEnabled: areLighthouseUploadsEnabled(env),
        uploadGuardReady: isUploadGuardReady(env),
        uploadBase: getLighthouseUploadBase(env),
        maxUploadBytes: getMaxUploadBytes(env),
    };
}

async function handlePinRequest(request: Request, env: Env): Promise<Response> {
    const apiKey = getLighthouseApiKey(env);
    if (!apiKey) {
        return jsonResponse(request, env, {
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        }, 503);
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
        return jsonResponse(request, env, { error: 'invalid_json' }, 400);
    }

    const cid = typeof body.value.cid === 'string' ? body.value.cid.trim() : '';
    const fileName = typeof body.value.fileName === 'string' ? body.value.fileName.trim() : undefined;
    if (!isValidIpfsCid(cid)) {
        return jsonResponse(request, env, { error: 'invalid_cid' }, 400);
    }

    const intent = await requireUploadIntent(request, env, 'pin');
    if (!intent.ok) {
        return jsonResponse(request, env, intent.body, intent.status);
    }

    if (intent.value.cid !== cid) {
        return jsonResponse(request, env, { error: 'upload_intent_mismatch' }, 403);
    }

    const cached = await readCachedUploadResult(env, intent.value);
    if (cached) {
        return jsonResponse(request, env, cached);
    }

    const upstream = await fetch(`${getLighthouseApiBase(env)}/api/lighthouse/pin`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            cid,
            ...(fileName ? { fileName } : {}),
        }),
    });

    const upstreamBody = await readUpstreamJson(upstream);
    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_pin_failed',
            provider: 'lighthouse',
            status: upstream.status,
            details: upstreamBody,
        }, 502);
    }

    const responseBody = {
        provider: 'lighthouse',
        cid,
        pinned: true,
        upstream: upstreamBody,
    };
    await cacheUploadResult(env, intent.value, responseBody);

    return jsonResponse(request, env, responseBody);
}

async function handleUploadIntentRequest(request: Request, env: Env): Promise<Response> {
    const auth = await readUploadAuthTokenClaims(request, env);
    if (!auth.ok) {
        return jsonResponse(request, env, { error: auth.error }, 401);
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
        return jsonResponse(request, env, { error: 'invalid_json' }, 400);
    }

    const parsed = parseUploadIntentRequest(body.value, auth.value.accountId);
    if (!parsed.ok) {
        return jsonResponse(request, env, { error: parsed.error }, 400);
    }

    const maxUploadBytes = getMaxUploadBytes(env);
    const recommendedPartBytes = Math.min(maxUploadBytes, RECOMMENDED_PROXY_PART_BYTES);
    const uploadsEnabled = areLighthouseUploadsEnabled(env);
    const providerReady = getStorageProvider(env) === 'lighthouse' && Boolean(getLighthouseApiKey(env));
    const guardReady = isUploadGuardReady(env);

    if (uploadsEnabled && providerReady && !guardReady) {
        return jsonResponse(request, env, {
            error: 'upload_guard_not_configured',
            reason: getUploadGuardMissingReason(env),
        }, 503);
    }

    const rateLimit = uploadsEnabled && providerReady
        ? await checkUploadIntentRateLimit(request, env, parsed.value.accountId)
        : { ok: true as const };
    if (!rateLimit.ok) {
        return jsonResponse(request, env, {
            error: 'rate_limited',
            retryAfterSeconds: rateLimit.retryAfterSeconds,
        }, 429);
    }

    const intent = uploadsEnabled && providerReady
        ? await createUploadIntent(parsed.value, env)
        : null;
    const uploadUrl = parsed.value.uploadKind === 'pin'
        ? '/pins'
        : parsed.value.uploadKind === 'directory'
            ? '/uploads/directory'
            : '/uploads/file';

    return jsonResponse(request, env, {
        provider: 'lighthouse',
        accountId: parsed.value.accountId,
        fileName: parsed.value.fileName,
        sizeBytes: parsed.value.sizeBytes,
        contentType: parsed.value.contentType,
        uploadKind: parsed.value.uploadKind,
        uploadsEnabled,
        providerReady,
        directUpload: {
            available: false,
            reason: 'scoped_direct_upload_token_unavailable',
        },
        workerProxy: {
            available: uploadsEnabled && providerReady && guardReady,
            uploadUrl,
            maxPartBytes: maxUploadBytes,
            recommendedPartBytes,
            requiresChunking: parsed.value.sizeBytes > maxUploadBytes,
            ...(intent ? {
                intentToken: intent.token,
                idempotencyKey: intent.value.idempotencyKey,
                expiresAt: new Date(intent.value.exp * 1000).toISOString(),
            } : {}),
        },
    });
}

async function handleUploadAuthChallengeRequest(request: Request, env: Env): Promise<Response> {
    if (!env.UPLOAD_GUARD) {
        return jsonResponse(request, env, {
            error: 'upload_guard_not_configured',
            reason: 'upload_guard_kv_missing',
        }, 503);
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
        return jsonResponse(request, env, { error: 'invalid_json' }, 400);
    }

    const accountId = typeof body.value.accountId === 'string' ? body.value.accountId.trim() : '';
    if (!isValidAccountId(accountId)) {
        return jsonResponse(request, env, { error: 'invalid_account_id' }, 400);
    }

    const challengeId = randomToken(18);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const expiresAt = Date.now() + UPLOAD_AUTH_CHALLENGE_TTL_MS;
    const recipient = new URL(request.url).origin;
    const message = `Authorize Youtick upload access for ${accountId} until ${new Date(expiresAt).toISOString()}`;
    const challenge: UploadAuthChallengeRecord = {
        challengeId,
        accountId,
        message,
        recipient,
        nonce: bytesToBase64(nonceBytes),
        expiresAt,
    };

    await env.UPLOAD_GUARD.put(
        getUploadAuthChallengeKey(challengeId),
        JSON.stringify(challenge),
        { expirationTtl: Math.ceil(UPLOAD_AUTH_CHALLENGE_TTL_MS / 1000) },
    );

    return jsonResponse(request, env, {
        challengeId,
        message,
        recipient,
        nonce: challenge.nonce,
        expiresAt,
    });
}

async function handleUploadAuthVerifyRequest(request: Request, env: Env): Promise<Response> {
    if (!env.UPLOAD_GUARD) {
        return jsonResponse(request, env, {
            error: 'upload_guard_not_configured',
            reason: 'upload_guard_kv_missing',
        }, 503);
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
        return jsonResponse(request, env, { error: 'invalid_json' }, 400);
    }

    const body = parsed.value;
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
    const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
    if (!challengeId || !isValidAccountId(accountId) || !publicKey || !signature) {
        return jsonResponse(request, env, { error: 'invalid_auth_request' }, 400);
    }

    const challengeKey = getUploadAuthChallengeKey(challengeId);
    const rawChallenge = await env.UPLOAD_GUARD.get(challengeKey);
    const challenge = rawChallenge ? parseUploadAuthChallenge(rawChallenge) : null;
    if (!challenge || challenge.accountId !== accountId || Date.now() > challenge.expiresAt) {
        if (rawChallenge) {
            await env.UPLOAD_GUARD.delete(challengeKey);
        }
        return jsonResponse(request, env, { error: 'Unauthorized' }, 401);
    }

    const isTrustedKey = await verifyUploadAuthKeyBinding(env, accountId, publicKey);
    if (!isTrustedKey) {
        return jsonResponse(request, env, { error: 'Unauthorized' }, 401);
    }

    const signatureValid = await verifyNep413Signature(
        {
            message: challenge.message,
            nonce: base64ToBytes(challenge.nonce),
            recipient: challenge.recipient,
        },
        signature,
        publicKey,
    );
    if (!signatureValid) {
        return jsonResponse(request, env, { error: 'Invalid NEP-413 signature' }, 401);
    }

    await env.UPLOAD_GUARD.delete(challengeKey);

    const token = randomToken(32);
    const expiresAt = Date.now() + UPLOAD_AUTH_TOKEN_TTL_MS;
    const claims: UploadAuthTokenClaims = {
        accountId: challenge.accountId,
        publicKey,
        expiresAt,
    };
    await env.UPLOAD_GUARD.put(
        getUploadAuthTokenKey(token),
        JSON.stringify(claims),
        { expirationTtl: Math.ceil(UPLOAD_AUTH_TOKEN_TTL_MS / 1000) },
    );

    return jsonResponse(request, env, {
        token,
        accountId: claims.accountId,
        expiresAt,
    });
}

async function handleFileUploadRequest(request: Request, env: Env): Promise<Response> {
    if (!areLighthouseUploadsEnabled(env)) {
        return jsonResponse(request, env, {
            error: 'uploads_disabled',
            reason: 'enable_lighthouse_uploads_required',
        }, 403);
    }

    const apiKey = getLighthouseApiKey(env);
    if (!apiKey) {
        return jsonResponse(request, env, {
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        }, 503);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return jsonResponse(request, env, { error: 'invalid_content_type' }, 400);
    }

    const intent = await requireUploadIntent(request, env, 'file');
    if (!intent.ok) {
        return jsonResponse(request, env, intent.body, intent.status);
    }

    const incoming = await request.formData();
    const value = incoming.get('file');
    if (!isUploadableFile(value)) {
        return jsonResponse(request, env, { error: 'missing_file' }, 400);
    }

    if (value.size > getMaxUploadBytes(env)) {
        return jsonResponse(request, env, {
            error: 'upload_too_large',
            maxUploadBytes: getMaxUploadBytes(env),
        }, 413);
    }

    const path = sanitizeUploadPath(value.name);
    if (!path) {
        return jsonResponse(request, env, { error: 'invalid_upload_path' }, 400);
    }

    if (intent.value.fileName !== path || intent.value.sizeBytes !== value.size) {
        return jsonResponse(request, env, { error: 'upload_intent_mismatch' }, 403);
    }

    const cached = await readCachedUploadResult(env, intent.value);
    if (cached) {
        return jsonResponse(request, env, cached);
    }

    const upstreamForm = new FormData();
    upstreamForm.append('file', value, getUploadFileName(path));

    const upstream = await fetch(`${getLighthouseUploadBase(env)}/api/v0/add?cid-version=1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
        body: upstreamForm,
    });
    const upstreamBody = await readUpstreamJson(upstream);

    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_upload_failed',
            provider: 'lighthouse',
            status: upstream.status,
            details: upstreamBody,
        }, 502);
    }

    const uploadEntry = parseUploadEntries(upstreamBody)[0] || getUploadData(upstreamBody);
    const cid = uploadEntry?.Hash || uploadEntry?.cid;
    if (!cid || !isValidIpfsCid(cid)) {
        return jsonResponse(request, env, {
            error: 'provider_upload_missing_cid',
            provider: 'lighthouse',
            details: upstreamBody,
        }, 502);
    }

    const responseBody = {
        provider: 'lighthouse',
        cid,
        path,
        size: value.size,
        upstream: upstreamBody,
    };
    await cacheUploadResult(env, intent.value, responseBody);

    return jsonResponse(request, env, responseBody);
}

async function handleDirectoryUploadRequest(request: Request, env: Env): Promise<Response> {
    if (!areLighthouseUploadsEnabled(env)) {
        return jsonResponse(request, env, {
            error: 'uploads_disabled',
            reason: 'enable_lighthouse_uploads_required',
        }, 403);
    }

    const apiKey = getLighthouseApiKey(env);
    if (!apiKey) {
        return jsonResponse(request, env, {
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        }, 503);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return jsonResponse(request, env, { error: 'invalid_content_type' }, 400);
    }

    const intent = await requireUploadIntent(request, env, 'directory');
    if (!intent.ok) {
        return jsonResponse(request, env, intent.body, intent.status);
    }

    const incoming = await request.formData();
    const upstreamForm = new FormData();
    const entries: Array<{ path: string; size: number }> = [];
    let totalSize = 0;

    for (const [fieldName, value] of incoming.entries()) {
        if (fieldName !== 'file' || !isUploadableFile(value)) {
            continue;
        }

        const path = sanitizeUploadPath(value.name);
        if (!path) {
            return jsonResponse(request, env, { error: 'invalid_upload_path' }, 400);
        }

        totalSize += value.size;
        if (totalSize > getMaxUploadBytes(env)) {
            return jsonResponse(request, env, {
                error: 'upload_too_large',
                maxUploadBytes: getMaxUploadBytes(env),
            }, 413);
        }

        entries.push({ path, size: value.size });
        upstreamForm.append('file', value, path);
    }

    if (entries.length === 0) {
        return jsonResponse(request, env, { error: 'missing_files' }, 400);
    }

    if (intent.value.sizeBytes !== totalSize) {
        return jsonResponse(request, env, { error: 'upload_intent_mismatch' }, 403);
    }

    const cached = await readCachedUploadResult(env, intent.value);
    if (cached) {
        return jsonResponse(request, env, cached);
    }

    const upstream = await fetch(`${getLighthouseUploadBase(env)}/api/v0/add?wrap-with-directory=true&cid-version=1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
        body: upstreamForm,
    });
    const upstreamBody = await readUpstreamJson(upstream);

    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_upload_failed',
            provider: 'lighthouse',
            status: upstream.status,
            details: upstreamBody,
        }, 502);
    }

    const uploadEntries = parseUploadEntries(upstreamBody);
    const rootEntry = findRootEntry(uploadEntries);
    const uploadData = getUploadData(upstreamBody);
    const rootCid = rootEntry?.Hash || uploadData?.Hash || uploadData?.cid;

    if (!rootCid || !isValidIpfsCid(rootCid)) {
        return jsonResponse(request, env, {
            error: 'provider_upload_missing_root_cid',
            provider: 'lighthouse',
            details: upstreamBody,
        }, 502);
    }

    const responseBody = {
        provider: 'lighthouse',
        cid: rootCid,
        size: totalSize,
        entries: uploadEntries.map((entry) => ({
            path: entry.Name || '',
            cid: entry.Hash,
            size: Number(entry.Size) || 0,
        })),
        upstream: upstreamBody,
    };
    await cacheUploadResult(env, intent.value, responseBody);

    return jsonResponse(request, env, responseBody);
}

async function handlePinStatusRequest(request: Request, env: Env, rawCid: string): Promise<Response> {
    const cid = decodeURIComponent(rawCid).trim();
    if (!isValidIpfsCid(cid)) {
        return jsonResponse(request, env, { error: 'invalid_cid' }, 400);
    }

    const headers = new Headers({ 'Accept': 'application/json' });
    const apiKey = getLighthouseApiKey(env);
    if (apiKey) {
        headers.set('Authorization', `Bearer ${apiKey}`);
    }

    const upstream = await fetch(`${getLighthouseApiBase(env)}/api/lighthouse/file_info?cid=${encodeURIComponent(cid)}`, {
        method: 'GET',
        headers,
    });
    const upstreamBody = await readUpstreamJson(upstream);
    const checkedAt = new Date().toISOString();

    if (upstream.status === 404) {
        return jsonResponse(request, env, {
            provider: 'lighthouse',
            cid,
            found: false,
            upstreamStatus: 404,
            checkedAt,
        });
    }

    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_status_failed',
            provider: 'lighthouse',
            cid,
            status: upstream.status,
            details: upstreamBody,
            checkedAt,
        }, 502);
    }

    const data = getLighthouseData(upstreamBody);
    const upstreamCid = data ? getLighthouseCid(data) : undefined;
    return jsonResponse(request, env, {
        provider: 'lighthouse',
        cid,
        found: upstreamCid === cid,
        upstreamCid,
        fileName: data ? getLighthouseFileName(data) : undefined,
        fileSizeInBytes: data ? getLighthouseFileSize(data) : undefined,
        mimeType: data?.mimeType,
        encryption: data?.encryption,
        txHash: data?.txHash,
        upstreamStatus: upstream.status,
        checkedAt,
    });
}

function handleOptions(request: Request, env: Env): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
    });
}

async function forwardR2IngestRequest(
    request: Request,
    env: Env,
    route: { jobId: string; generation: number },
): Promise<Response> {
    if (!env.R2_INGEST_SESSIONS) {
        return jsonResponse(request, env, { error: 'r2_ingest_disabled' }, 503);
    }
    const id = env.R2_INGEST_SESSIONS.idFromName(`${route.jobId}:${route.generation}`);
    const response = await env.R2_INGEST_SESSIONS.get(id).fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(corsHeaders(request, env))) {
        headers.set(name, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
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
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': [
            'Content-Type',
            'Authorization',
            'X-Youtick-Public-Key',
            'X-Youtick-Timestamp',
            'X-Youtick-Nonce',
            'X-Youtick-Signature',
        ].join(', '),
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

function getLighthouseApiKey(env: Env): string | null {
    const raw = env.LIGHTHOUSE_API_KEY?.trim();
    if (!raw) {
        return null;
    }

    return raw.replace(/^(['"])(.*)\1$/, '$2');
}

function areLighthouseUploadsEnabled(env: Env): boolean {
    return env.ENABLE_LIGHTHOUSE_UPLOADS === 'true';
}

function isUploadGuardReady(env: Env): boolean {
    return Boolean(getUploadIntentSecret(env) && env.UPLOAD_GUARD);
}

function getUploadGuardMissingReason(env: Env): string {
    if (!getUploadIntentSecret(env)) {
        return 'upload_intent_secret_missing';
    }

    if (!env.UPLOAD_GUARD) {
        return 'upload_guard_kv_missing';
    }

    return 'upload_guard_ready';
}

function getUploadIntentSecret(env: Env): string | null {
    const raw = env.UPLOAD_INTENT_SECRET?.trim();
    if (!raw) {
        return null;
    }

    return raw.replace(/^(['"])(.*)\1$/, '$2');
}

function getMaxUploadBytes(env: Env): number {
    const parsed = Number.parseInt(env.MAX_UPLOAD_BYTES || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

function getUploadIntentTtlSeconds(env: Env): number {
    const parsed = Number.parseInt(env.UPLOAD_INTENT_TTL_SECONDS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_UPLOAD_INTENT_TTL_SECONDS;
}

function getUploadRateLimitMax(env: Env): number {
    const parsed = Number.parseInt(env.UPLOAD_RATE_LIMIT_MAX || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_UPLOAD_RATE_LIMIT_MAX;
}

function getUploadRateLimitWindowSeconds(env: Env): number {
    const parsed = Number.parseInt(env.UPLOAD_RATE_LIMIT_WINDOW_SECONDS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_SECONDS;
}

function isValidIpfsCid(value: string): boolean {
    return CID_PATTERN.test(value);
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: JsonBody } | { ok: false }> {
    try {
        const value = await request.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { ok: false };
        }
        return { ok: true, value: value as JsonBody };
    } catch {
        return { ok: false };
    }
}

function parseUploadIntentRequest(value: JsonBody, accountId: string): { ok: true; value: Required<UploadIntentRequest> } | { ok: false; error: string } {
    if (!isValidAccountId(accountId)) {
        return { ok: false, error: 'invalid_account_id' };
    }

    const uploadKind = parseUploadKind(value.uploadKind);
    if (!uploadKind) {
        return { ok: false, error: 'invalid_upload_kind' };
    }

    const fileName = typeof value.fileName === 'string' ? sanitizeUploadPath(value.fileName) : '';
    if (!fileName) {
        return { ok: false, error: 'invalid_file_name' };
    }

    const sizeBytes = typeof value.sizeBytes === 'number' ? value.sizeBytes : Number.NaN;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return { ok: false, error: 'invalid_size_bytes' };
    }

    const contentType = typeof value.contentType === 'string' && value.contentType.trim()
        ? value.contentType.trim()
        : 'application/octet-stream';
    const cid = typeof value.cid === 'string' ? value.cid.trim() : '';
    if (uploadKind === 'pin' && !isValidIpfsCid(cid)) {
        return { ok: false, error: 'invalid_cid' };
    }

    return {
        ok: true,
        value: {
            accountId,
            fileName,
            sizeBytes,
            contentType,
            uploadKind,
            cid,
        },
    };
}

function isValidAccountId(value: string): boolean {
    return value.length >= 2
        && value.length <= 64
        && /^[a-z0-9._-]+$/i.test(value);
}

function parseUploadKind(value: unknown): UploadKind | null {
    if (value === 'file' || value === 'directory' || value === 'pin') {
        return value;
    }

    return null;
}

async function createUploadIntent(
    request: Required<UploadIntentRequest>,
    env: Env,
): Promise<{ token: string; value: SignedUploadIntent }> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const value: SignedUploadIntent = {
        v: 1,
        accountId: request.accountId,
        fileName: request.fileName,
        sizeBytes: request.sizeBytes,
        contentType: request.contentType,
        uploadKind: request.uploadKind,
        exp: nowSeconds + getUploadIntentTtlSeconds(env),
        idempotencyKey: await sha256Hex([
            request.accountId,
            request.uploadKind,
            request.fileName,
            String(request.sizeBytes),
            request.contentType,
            request.cid,
            String(nowSeconds),
            crypto.randomUUID(),
        ].join('|')),
        ...(request.cid ? { cid: request.cid } : {}),
    };

    return {
        token: await signUploadIntent(value, env),
        value,
    };
}

async function requireUploadIntent(
    request: Request,
    env: Env,
    uploadKind: UploadKind,
): Promise<
    | { ok: true; value: SignedUploadIntent }
    | { ok: false; status: number; body: JsonBody }
> {
    const secret = getUploadIntentSecret(env);
    if (!secret || !env.UPLOAD_GUARD) {
        return {
            ok: false,
            status: 503,
            body: {
                error: 'upload_guard_not_configured',
                reason: getUploadGuardMissingReason(env),
            },
        };
    }

    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token) {
        return { ok: false, status: 401, body: { error: 'upload_intent_required' } };
    }

    const verified = await verifyUploadIntent(token, env);
    if (!verified.ok) {
        return { ok: false, status: 401, body: { error: verified.error } };
    }

    if (verified.value.uploadKind !== uploadKind) {
        return { ok: false, status: 403, body: { error: 'upload_intent_mismatch' } };
    }

    if (verified.value.exp < Math.floor(Date.now() / 1000)) {
        return { ok: false, status: 401, body: { error: 'upload_intent_expired' } };
    }

    return { ok: true, value: verified.value };
}

async function signUploadIntent(value: SignedUploadIntent, env: Env): Promise<string> {
    const payload = base64UrlEncodeText(JSON.stringify(value));
    const signature = await signText(payload, getUploadIntentSecret(env) || '');
    return `${payload}.${signature}`;
}

async function verifyUploadIntent(token: string, env: Env): Promise<
    | { ok: true; value: SignedUploadIntent }
    | { ok: false; error: string }
> {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) {
        return { ok: false, error: 'invalid_upload_intent' };
    }

    const expectedSignature = await signText(payload, getUploadIntentSecret(env) || '');
    if (!constantTimeEqual(signature, expectedSignature)) {
        return { ok: false, error: 'invalid_upload_intent_signature' };
    }

    try {
        const parsed = JSON.parse(base64UrlDecodeText(payload)) as SignedUploadIntent;
        if (!isSignedUploadIntent(parsed)) {
            return { ok: false, error: 'invalid_upload_intent_payload' };
        }

        return { ok: true, value: parsed };
    } catch {
        return { ok: false, error: 'invalid_upload_intent_payload' };
    }
}

function isSignedUploadIntent(value: unknown): value is SignedUploadIntent {
    const intent = value as Partial<SignedUploadIntent>;
    return Boolean(value)
        && typeof value === 'object'
        && intent.v === 1
        && isValidAccountId(intent.accountId || '')
        && typeof intent.fileName === 'string'
        && typeof intent.sizeBytes === 'number'
        && Number.isFinite(intent.sizeBytes)
        && intent.sizeBytes > 0
        && typeof intent.contentType === 'string'
        && parseUploadKind(intent.uploadKind) !== null
        && typeof intent.exp === 'number'
        && typeof intent.idempotencyKey === 'string'
        && (intent.cid === undefined || isValidIpfsCid(intent.cid));
}

async function checkUploadIntentRateLimit(
    request: Request,
    env: Env,
    accountId: string,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
    const kv = env.UPLOAD_GUARD;
    if (!kv) {
        return { ok: false, retryAfterSeconds: getUploadRateLimitWindowSeconds(env) };
    }

    const windowSeconds = getUploadRateLimitWindowSeconds(env);
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `rate:${accountId}:${ip}:${bucket}`;
    const current = Number.parseInt(await kv.get(key) || '0', 10) || 0;
    const max = getUploadRateLimitMax(env);
    if (current >= max) {
        return { ok: false, retryAfterSeconds: windowSeconds };
    }

    await kv.put(key, String(current + 1), { expirationTtl: windowSeconds * 2 });
    return { ok: true };
}

async function readUploadAuthTokenClaims(
    request: Request,
    env: Env,
): Promise<{ ok: true; value: UploadAuthTokenClaims } | { ok: false; error: string }> {
    if (!env.UPLOAD_GUARD) {
        return { ok: false, error: 'Unauthorized' };
    }

    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token) {
        return { ok: false, error: 'Unauthorized' };
    }

    const key = getUploadAuthTokenKey(token);
    const rawClaims = await env.UPLOAD_GUARD.get(key);
    const claims = rawClaims ? parseUploadAuthTokenClaims(rawClaims) : null;
    if (!claims) {
        return { ok: false, error: 'Unauthorized' };
    }

    if (Date.now() > claims.expiresAt) {
        await env.UPLOAD_GUARD.delete(key);
        return { ok: false, error: 'Unauthorized' };
    }

    return { ok: true, value: claims };
}

function parseUploadAuthChallenge(raw: string): UploadAuthChallengeRecord | null {
    try {
        const value = JSON.parse(raw) as Partial<UploadAuthChallengeRecord>;
        if (!value
            || typeof value.challengeId !== 'string'
            || !isValidAccountId(value.accountId || '')
            || typeof value.message !== 'string'
            || typeof value.recipient !== 'string'
            || typeof value.nonce !== 'string'
            || typeof value.expiresAt !== 'number') {
            return null;
        }

        return value as UploadAuthChallengeRecord;
    } catch {
        return null;
    }
}

function parseUploadAuthTokenClaims(raw: string): UploadAuthTokenClaims | null {
    try {
        const value = JSON.parse(raw) as Partial<UploadAuthTokenClaims>;
        if (!value
            || !isValidAccountId(value.accountId || '')
            || typeof value.publicKey !== 'string'
            || typeof value.expiresAt !== 'number') {
            return null;
        }

        return value as UploadAuthTokenClaims;
    } catch {
        return null;
    }
}

async function verifyUploadAuthKeyBinding(
    env: Env,
    accountId: string,
    publicKey: string,
): Promise<boolean> {
    try {
        const accessKey = await nearRpcQuery<{ permission: unknown }>(env, {
            request_type: 'view_access_key',
            finality: 'final',
            account_id: accountId,
            public_key: publicKey,
        });

        if (accessKey.permission === 'FullAccess') {
            return true;
        }

        if (!isTrustedUploadSessionAccessKey(env, accessKey.permission)) {
            return false;
        }

        return await verifyActiveUploadSession(env, accountId, publicKey);
    } catch {
        return false;
    }
}

function isTrustedUploadSessionAccessKey(env: Env, permission: unknown): boolean {
    if (!permission || typeof permission !== 'object' || Array.isArray(permission)) {
        return false;
    }

    const functionCall = (permission as { FunctionCall?: unknown }).FunctionCall;
    if (!functionCall || typeof functionCall !== 'object' || Array.isArray(functionCall)) {
        return false;
    }

    const value = functionCall as { receiver_id?: unknown; method_names?: unknown };
    const methodNames = value.method_names;
    if (
        value.receiver_id !== getUploadSessionContractId(env)
        || !Array.isArray(methodNames)
        || !methodNames.every((method): method is string => typeof method === 'string')
    ) {
        return false;
    }

    return Array.from(TRUSTED_UPLOAD_SESSION_METHODS).every((method) => methodNames.includes(method));
}

async function verifyActiveUploadSession(env: Env, accountId: string, publicKey: string): Promise<boolean> {
    const response = await nearRpcQuery<{ result: number[] }>(env, {
        request_type: 'call_function',
        finality: 'final',
        account_id: getUploadSessionContractId(env),
        method_name: 'get_upload_session',
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ public_key: publicKey }))),
    });
    const raw = new TextDecoder().decode(new Uint8Array(response.result));
    const session = raw ? JSON.parse(raw) as {
        owner_id?: unknown;
        status?: unknown;
    } | null : null;

    return Boolean(
        session
            && session.owner_id === accountId
            && typeof session.status === 'string'
            && !['Completed', 'Revoked', 'Expired'].includes(session.status),
    );
}

function getUploadSessionContractId(env: Env): string {
    return env.UPLOAD_SESSION_CONTRACT_ID?.trim() || DEFAULT_UPLOAD_SESSION_CONTRACT_ID;
}

async function nearRpcQuery<T>(env: Env, params: JsonBody): Promise<T> {
    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 'storage-api-auth',
        method: 'query',
        params,
    });
    const errors: Error[] = [];

    for (const rpcUrl of getRpcPool(env)) {
        try {
            const response = await fetchWithTimeout(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            }, RPC_REQUEST_TIMEOUT_MS);
            if (!response.ok) {
                throw new Error(`RPC returned ${response.status}`);
            }

            const json = await response.json() as { result?: T; error?: { message?: string } };
            if (json.error || !json.result) {
                throw new Error(json.error?.message || 'RPC query failed');
            }

            return json.result;
        } catch (error) {
            errors.push(error instanceof Error ? error : new Error(String(error)));
        }
    }

    throw errors[errors.length - 1] || new Error('RPC query failed');
}

function getRpcPool(env: Env): string[] {
    return env.NEAR_NETWORK === 'testnet' ? TESTNET_RPC_POOL : MAINNET_RPC_POOL;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function verifyNep413Signature(
    payload: {
        message: string;
        nonce: Uint8Array;
        recipient: string;
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
    } catch {
        return false;
    }
}

async function serializeNep413Hash(payload: {
    message: string;
    nonce: Uint8Array;
    recipient: string;
}): Promise<Uint8Array> {
    if (payload.nonce.length !== 32) {
        throw new Error('Nonce must be exactly 32 bytes long');
    }

    const serialized = concatBytes(
        encodeU32LE(NEP413_TAG),
        encodeStringBorsh(payload.message),
        payload.nonce,
        encodeStringBorsh(payload.recipient),
        new Uint8Array([0]),
    );
    const digest = await crypto.subtle.digest('SHA-256', serialized);
    return new Uint8Array(digest);
}

function randomToken(byteLength = 32): string {
    const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
    return base64UrlEncode(bytes);
}

function encodeU32LE(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value, true);
    return out;
}

function encodeStringBorsh(value: string): Uint8Array {
    const bytes = new TextEncoder().encode(value);
    const out = new Uint8Array(4 + bytes.length);
    out.set(encodeU32LE(bytes.length), 0);
    out.set(bytes, 4);
    return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
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

function getUploadAuthChallengeKey(challengeId: string): string {
    return `auth:challenge:${challengeId}`;
}

function getUploadAuthTokenKey(token: string): string {
    return `auth:token:${token}`;
}

async function readCachedUploadResult(env: Env, intent: SignedUploadIntent): Promise<JsonBody | null> {
    const raw = await env.UPLOAD_GUARD?.get(getUploadResultCacheKey(intent));
    if (!raw) {
        return null;
    }

    try {
        const value = JSON.parse(raw);
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as JsonBody
            : null;
    } catch {
        return null;
    }
}

async function cacheUploadResult(env: Env, intent: SignedUploadIntent, body: JsonBody): Promise<void> {
    await env.UPLOAD_GUARD?.put(
        getUploadResultCacheKey(intent),
        JSON.stringify(body),
        { expirationTtl: 24 * 60 * 60 },
    );
}

function getUploadResultCacheKey(intent: SignedUploadIntent): string {
    return `upload-result:${intent.idempotencyKey}`;
}

async function signText(value: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return base64UrlEncode(new Uint8Array(signature));
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncodeText(value: string): string {
    return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecodeText(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new TextDecoder().decode(bytes);
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let diff = 0;
    for (let index = 0; index < a.length; index += 1) {
        diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
    }

    return diff === 0;
}

async function readUpstreamJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        const entries = text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((entry): entry is unknown => entry !== null);
        if (entries.length > 0) {
            return entries;
        }

        return { text };
    }
}

function getLighthouseData(value: unknown): LighthouseUploadData | null {
    const data = getUploadData(value);
    if (!data) {
        return null;
    }

    return data as LighthouseUploadData;
}

function getUploadData(value: unknown): UploadEntry | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const data = (value as { data?: unknown }).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data as UploadEntry;
    }

    const entry = value as UploadEntry;
    if (typeof entry.cid === 'string' || typeof entry.Hash === 'string') {
        return entry;
    }

    return null;
}

function getLighthouseCid(data: LighthouseUploadData): string | undefined {
    return typeof data.cid === 'string' ? data.cid : data.Hash;
}

function getLighthouseFileName(data: LighthouseUploadData): string | undefined {
    return typeof data.fileName === 'string' ? data.fileName : data.Name;
}

function getLighthouseFileSize(data: LighthouseUploadData): string | number | undefined {
    if (typeof data.fileSizeInBytes === 'string' || typeof data.fileSizeInBytes === 'number') {
        return data.fileSizeInBytes;
    }

    return data.Size;
}

function parseUploadEntries(value: unknown): UploadEntry[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) => parseUploadEntry(entry))
            .filter((entry): entry is UploadEntry => entry !== null);
    }

    const data = value && typeof value === 'object' ? (value as { data?: unknown }).data : undefined;
    if (Array.isArray(data)) {
        return data
            .map((entry) => parseUploadEntry(entry))
            .filter((entry): entry is UploadEntry => entry !== null);
    }

    const entry = parseUploadEntry(data || value);
    return entry ? [entry] : [];
}

function parseUploadEntry(value: unknown): UploadEntry | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const entry = value as UploadEntry;
    if (typeof entry.Hash !== 'string') {
        return null;
    }

    return entry;
}

function findRootEntry(entries: UploadEntry[]): UploadEntry | undefined {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        if ((entries[index].Name || '') === '') {
            return entries[index];
        }
    }

    return undefined;
}

function isUploadableFile(value: unknown): value is UploadableFile {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { name?: unknown }).name === 'string'
        && typeof (value as { size?: unknown }).size === 'number'
        && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function';
}

function sanitizeUploadPath(value: string): string | null {
    const path = value.trim().replace(/^\/+/, '');
    if (!path) {
        return null;
    }

    const segments = path.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
        return null;
    }

    return segments.join('/');
}

function getUploadFileName(path: string): string {
    return path.split('/').pop() || path;
}
