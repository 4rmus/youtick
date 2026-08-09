import { KeyPair } from 'near-api-js';
import { getCachedSessionGrant, isSessionGrantVisible } from '@/lib/access-grants';
import { APP_CONFIG, FEATURE_FLAGS, NEAR_CONFIG, NEAR_NETWORK } from '@/lib/constants';
import { base64Encode } from '@/lib/crypto/codec';
import { canonicalDeviceCertificate, ensureDeviceSession } from '@/lib/device-session';
import type { WalletInstance } from '@/lib/types';

const PLAYBACK_ROUTE = '/v1/playback-tokens';
const PLAYBACK_V2_ROUTE = '/v2/playback-tokens';
const TOKEN_REFRESH_SKEW_MS = 30_000;

export type LivepeerPlaybackInput = {
    accountId: string;
    jobId: string;
    generation: number;
    playbackId: string;
};

type LivepeerPlaybackToken = {
    schema: 'youtick.livepeer-playback-token.v1' | 'youtick.livepeer-playback-token.v2';
    playback_id: string;
    token: string;
    expires_at_ms: string;
    hls_url: string;
};

export type LivepeerPlaybackAccess = {
    token: string;
    hlsUrl: string;
    playbackId: string;
    expiresAtMs: number;
};

type LivepeerPlaybackSessionCallbacks = {
    onAccess: (access: LivepeerPlaybackAccess) => void;
    onError?: (error: Error) => void;
    renewGrant?: () => Promise<void>;
};

export async function requestLivepeerPlaybackToken(
    input: LivepeerPlaybackInput,
    signal?: AbortSignal,
    wallet?: Pick<WalletInstance, 'signMessage'>,
): Promise<LivepeerPlaybackToken> {
    requireFeature();
    if (FEATURE_FLAGS.enablePlaybackAuthorizerV2) {
        return requestStatelessPlaybackToken(input, signal, wallet);
    }
    const grant = getCachedSessionGrant(input.accountId, 'Play', input.jobId);
    if (!grant
        || grant.accountId !== input.accountId
        || grant.resourceId !== input.jobId
        || !grant.originHash
        || !grant.deviceHash) {
        throw new Error('livepeer_play_grant_missing');
    }
    const origin = browserOrigin();
    if (grant.originHash !== await sha256Hex(origin)) throw new Error('livepeer_play_grant_mismatch');

    const body = {
        job_id: input.jobId,
        generation: input.generation,
        playback_id: input.playbackId,
        grant_id: `play:${input.jobId}:${input.accountId}`,
        origin_hash: grant.originHash,
        device_hash: grant.deviceHash,
        requested_ttl_seconds: 180,
    };
    const envelope = {
        domain: 'youtick.paid-media-livepeer-v1.control',
        version: '2',
        method: 'POST',
        route: PLAYBACK_ROUTE,
        network: NEAR_NETWORK,
        contract_id: NEAR_CONFIG.marketContractId,
        account_id: input.accountId,
        resource: `playback:${input.jobId}:${input.generation}:${input.playbackId}`,
        session_public_key: grant.sessionPublicKey,
        origin,
        device_nonce: randomNonce(),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: await sha256Hex(canonicalJson(body)),
    };
    const keyPair = KeyPair.fromString(grant.secretKey);
    const signature = base64Encode(
        keyPair.sign(new TextEncoder().encode(canonicalControlMessage(envelope))).signature,
    );
    let shadowV2: Awaited<ReturnType<typeof createStatelessPlaybackRequest>> | undefined;
    if (FEATURE_FLAGS.enablePlaybackShadowV2 && wallet) {
        try {
            shadowV2 = await createStatelessPlaybackRequest(input, wallet);
        } catch {
            // Shadow evidence must never change the legacy playback result.
        }
    }
    const response = await fetch(bridgeRoute(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Youtick-Signature': signature,
        },
        body: JSON.stringify({
            body,
            envelope,
            ...(shadowV2 ? { shadow_v2: shadowV2 } : {}),
        }),
        cache: 'no-store',
        signal,
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string' ? value.error : `livepeer_control_http_${response.status}`);
    }
    return parsePlaybackToken(value, input.playbackId, 'youtick.livepeer-playback-token.v1');
}

async function requestStatelessPlaybackToken(
    input: LivepeerPlaybackInput,
    signal?: AbortSignal,
    wallet?: Pick<WalletInstance, 'signMessage'>,
): Promise<LivepeerPlaybackToken> {
    if (!wallet) throw new Error('livepeer_device_wallet_missing');
    const payload = await createStatelessPlaybackRequest(input, wallet);
    const response = await fetch(bridgeRoute(PLAYBACK_V2_ROUTE), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal,
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string' ? value.error : `livepeer_control_http_${response.status}`);
    }
    return parsePlaybackToken(value, input.playbackId, 'youtick.livepeer-playback-token.v2');
}

async function createStatelessPlaybackRequest(
    input: LivepeerPlaybackInput,
    wallet: Pick<WalletInstance, 'signMessage'>,
) {
    const session = await ensureDeviceSession(wallet, input.accountId);
    const origin = browserOrigin();
    if (session.certificate.account_id !== input.accountId
        || session.certificate.origin_hash !== await sha256Hex(origin)) {
        throw new Error('livepeer_device_session_mismatch');
    }
    const body = {
        publication_id: input.jobId,
        generation: input.generation,
        playback_id: input.playbackId,
    };
    const request = {
        domain: 'youtick.playback-request',
        version: '1',
        network: NEAR_NETWORK,
        contract_id: NEAR_CONFIG.marketContractId,
        account_id: input.accountId,
        origin,
        request_nonce: randomNonce(),
        request_expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: await sha256Hex(canonicalJson(body)),
        certificate_sha256: await sha256Hex(canonicalDeviceCertificate(session.certificate)),
    };
    const keyPair = KeyPair.fromString(session.secret_key as `ed25519:${string}`);
    if (keyPair.getPublicKey().toString() !== session.certificate.session_public_key) {
        throw new Error('livepeer_device_session_mismatch');
    }
    const requestSignature = base64Encode(
        keyPair.sign(new TextEncoder().encode(canonicalPlaybackV2Message(request))).signature,
    );
    return {
        body,
        certificate: session.certificate,
        certificate_proof: session.certificate_proof,
        request,
        request_signature: requestSignature,
    };
}

export async function startLivepeerPlaybackSession(
    input: LivepeerPlaybackInput,
    callbacks: LivepeerPlaybackSessionCallbacks,
    wallet?: Pick<WalletInstance, 'signMessage'>,
): Promise<{ destroy: () => void }> {
    const controller = new AbortController();
    if (!FEATURE_FLAGS.enablePlaybackAuthorizerV2) await waitForPlayGrantVisibility(input);
    let access = await requestPlaybackTokenWithRetry(input, controller.signal, wallet);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    callbacks.onAccess(toPlaybackAccess(access));

    const scheduleRefresh = () => {
        const delay = Math.max(1_000, Number(access.expires_at_ms) - Date.now() - TOKEN_REFRESH_SKEW_MS);
        refreshTimer = setTimeout(async () => {
            try {
                access = await refreshPlaybackAccess(input, controller.signal, callbacks.renewGrant, wallet);
                if (controller.signal.aborted) return;
                callbacks.onAccess(toPlaybackAccess(access));
                scheduleRefresh();
            } catch (error) {
                if (controller.signal.aborted) return;
                callbacks.onError?.(error instanceof Error ? error : new Error('livepeer_playback_failed'));
            }
        }, delay);
    };
    scheduleRefresh();

    return {
        destroy: () => {
            controller.abort();
            if (refreshTimer) clearTimeout(refreshTimer);
        },
    };
}

export function createLivepeerHlsConfig(readToken: () => string | null) {
    return {
        capLevelToPlayerSize: true,
        xhrSetup(xhr: XMLHttpRequest, url: string) {
            if (!isLivepeerPlaybackUrl(url)) throw new Error('livepeer_playback_url_invalid');
            const token = readToken();
            if (!token) throw new Error('livepeer_playback_token_missing');
            xhr.setRequestHeader('Livepeer-Jwt', token);
        },
    };
}

async function refreshPlaybackAccess(
    input: LivepeerPlaybackInput,
    signal: AbortSignal,
    renewGrant?: () => Promise<void>,
    wallet?: Pick<WalletInstance, 'signMessage'>,
): Promise<LivepeerPlaybackToken> {
    try {
        return await requestLivepeerPlaybackToken(input, signal, wallet);
    } catch (error) {
        const playbackError = error instanceof Error ? error : new Error('livepeer_playback_failed');
        if (FEATURE_FLAGS.enablePlaybackAuthorizerV2
            || playbackError.message !== 'livepeer_play_grant_missing'
            || !renewGrant) {
            throw playbackError;
        }
        await renewGrant();
        if (signal.aborted) throw new Error('livepeer_playback_cancelled');
        await waitForPlayGrantVisibility(input);
        return requestPlaybackTokenWithRetry(input, signal, wallet);
    }
}

function toPlaybackAccess(access: LivepeerPlaybackToken): LivepeerPlaybackAccess {
    return {
        token: access.token,
        hlsUrl: access.hls_url,
        playbackId: access.playback_id,
        expiresAtMs: Number(access.expires_at_ms),
    };
}

async function waitForPlayGrantVisibility(input: LivepeerPlaybackInput): Promise<void> {
    const grant = getCachedSessionGrant(input.accountId, 'Play', input.jobId);
    if (!grant) throw new Error('livepeer_play_grant_missing');
    for (const delay of [0, 1_000, 2_000, 4_000]) {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
            if (await isSessionGrantVisible(grant)) return;
        } catch {
            // Retry while finality or the selected RPC endpoint catches up.
        }
    }
    throw new Error('livepeer_play_grant_pending');
}

async function requestPlaybackTokenWithRetry(
    input: LivepeerPlaybackInput,
    signal: AbortSignal,
    wallet?: Pick<WalletInstance, 'signMessage'>,
): Promise<LivepeerPlaybackToken> {
    let lastError: Error | undefined;
    for (const delay of [0, 1_000, 2_000, 4_000]) {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
            return await requestLivepeerPlaybackToken(input, signal, wallet);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('livepeer_playback_failed');
            if (!['playback_denied', 'playback_authorization_unavailable'].includes(lastError.message)) {
                throw lastError;
            }
        }
    }
    throw lastError || new Error('livepeer_playback_failed');
}

function parsePlaybackToken(
    value: Record<string, unknown>,
    playbackId: string,
    expectedSchema: LivepeerPlaybackToken['schema'],
): LivepeerPlaybackToken {
    const expiresAtMs = Number(value.expires_at_ms);
    if (value.schema !== expectedSchema
        || value.playback_id !== playbackId
        || typeof value.token !== 'string'
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.token)
        || typeof value.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(value.expires_at_ms)
        || !Number.isSafeInteger(expiresAtMs)
        || expiresAtMs <= Date.now()
        || expiresAtMs > Date.now() + 305_000
        || value.hls_url !== livepeerHlsUrl(playbackId)) {
        throw new Error('invalid_livepeer_playback_token');
    }
    return value as LivepeerPlaybackToken;
}

function livepeerHlsUrl(playbackId: string): string {
    return `https://playback.livepeer.studio/asset/hls/${playbackId}/index.m3u8`;
}

function isLivepeerPlaybackUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && !url.port
            && !url.username
            && !url.password
            && (url.hostname === 'playback.livepeer.studio'
                || url.hostname === 'livepeercdn.com'
                || url.hostname === 'livepeercdn.studio'
                || url.hostname === 'asset-cdn.lp-playback.com'
                || url.hostname.endsWith('.lp-playback.studio'));
    } catch {
        return false;
    }
}

function bridgeRoute(route = PLAYBACK_ROUTE): string {
    try {
        const url = new URL(route, APP_CONFIG.livepeerBridgeUrl);
        if (url.protocol !== 'https:') throw new Error('invalid_livepeer_bridge_url');
        return url.toString();
    } catch {
        throw new Error('invalid_livepeer_bridge_url');
    }
}

function canonicalPlaybackV2Message(request: Record<string, string>): string {
    return [
        request.domain,
        request.version,
        request.network,
        request.contract_id,
        request.account_id,
        request.origin,
        request.request_nonce,
        request.request_expires_at_ms,
        request.body_sha256,
        request.certificate_sha256,
    ].join('\n');
}

function browserOrigin(): string {
    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : APP_CONFIG.publicAppUrl;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'https:'
            && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
            throw new Error('invalid_livepeer_origin');
        }
        return url.origin;
    } catch {
        throw new Error('invalid_livepeer_origin');
    }
}

function randomNonce(): string {
    return base64Encode(crypto.getRandomValues(new Uint8Array(32)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function canonicalControlMessage(envelope: Record<string, string>): string {
    return [
        envelope.domain,
        envelope.version,
        envelope.method,
        envelope.route,
        envelope.network,
        envelope.contract_id,
        envelope.account_id,
        envelope.resource,
        envelope.session_public_key,
        envelope.origin,
        envelope.device_nonce,
        envelope.expires_at_ms,
        envelope.body_sha256,
    ].join('\n');
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson(object[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
    try {
        const value = await response.json();
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function requireFeature(): void {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) throw new Error('livepeer_control_disabled');
}
