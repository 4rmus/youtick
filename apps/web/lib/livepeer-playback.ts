import { KeyPair } from 'near-api-js';
import { getCachedSessionGrant } from '@/lib/access-grants';
import { APP_CONFIG, FEATURE_FLAGS, NEAR_CONFIG } from '@/lib/constants';
import { base64Encode } from '@/lib/crypto/codec';

const PLAYBACK_ROUTE = '/v1/playback-tokens';
const TOKEN_REFRESH_SKEW_MS = 30_000;

export type LivepeerPlaybackInput = {
    accountId: string;
    jobId: string;
    generation: number;
    playbackId: string;
};

type LivepeerPlaybackToken = {
    schema: 'youtick.livepeer-playback-token.v1';
    playback_id: string;
    token: string;
    expires_at_ms: string;
    hls_url: string;
};

export async function requestLivepeerPlaybackToken(
    input: LivepeerPlaybackInput,
    signal?: AbortSignal,
): Promise<LivepeerPlaybackToken> {
    requireFeature();
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
        version: '1',
        method: 'POST',
        route: PLAYBACK_ROUTE,
        network: NEAR_CONFIG.networkId,
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
    const response = await fetch(bridgeRoute(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Youtick-Signature': signature,
        },
        body: JSON.stringify({ body, envelope }),
        cache: 'no-store',
        signal,
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string' ? value.error : `livepeer_control_http_${response.status}`);
    }
    return parsePlaybackToken(value, input.playbackId);
}

export async function startLivepeerPlayback(
    video: HTMLVideoElement,
    input: LivepeerPlaybackInput,
    onError?: (error: Error) => void,
): Promise<{ destroy: () => void }> {
    const controller = new AbortController();
    let access = await requestLivepeerPlaybackToken(input, controller.signal);
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) {
        controller.abort();
        throw new Error('livepeer_playback_unsupported');
    }
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const hls = new Hls({
        xhrSetup: (xhr) => xhr.setRequestHeader('Livepeer-Jwt', access.token),
    });
    const scheduleRefresh = () => {
        const delay = Math.max(1_000, Number(access.expires_at_ms) - Date.now() - TOKEN_REFRESH_SKEW_MS);
        refreshTimer = setTimeout(async () => {
            try {
                access = await requestLivepeerPlaybackToken(input, controller.signal);
                scheduleRefresh();
            } catch (error) {
                if (controller.signal.aborted) return;
                onError?.(error instanceof Error ? error : new Error('livepeer_playback_failed'));
            }
        }, delay);
    };
    hls.loadSource(access.hls_url);
    hls.attachMedia(video);
    scheduleRefresh();
    return {
        destroy: () => {
            controller.abort();
            if (refreshTimer) clearTimeout(refreshTimer);
            hls.destroy();
        },
    };
}

function parsePlaybackToken(value: Record<string, unknown>, playbackId: string): LivepeerPlaybackToken {
    const expiresAtMs = Number(value.expires_at_ms);
    if (value.schema !== 'youtick.livepeer-playback-token.v1'
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

function bridgeRoute(): string {
    try {
        const url = new URL(PLAYBACK_ROUTE, APP_CONFIG.livepeerBridgeUrl);
        if (url.protocol !== 'https:') throw new Error('invalid_livepeer_bridge_url');
        return url.toString();
    } catch {
        throw new Error('invalid_livepeer_bridge_url');
    }
}

function browserOrigin(): string {
    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : APP_CONFIG.publicAppUrl;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'https:') throw new Error('invalid_livepeer_origin');
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
