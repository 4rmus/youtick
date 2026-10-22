// `/v3/playback-tokens`: a device-signed request per token. The Bridge settles the ticket
// (`mark_watched`) before the first token, so `playback_pending` is retried briefly.
// A Stream answer (`provider: 'cloudflare-stream'`) carries the token in the HLS URL path; that URL
// must be exactly the one the configured customer code and the answered token give.
import { STREAM_CUSTOMER_CODE_PATTERN, V2_MEDIA_CONFIG } from '../constants';
import { buildPlaybackV3Body, MAX_PLAYBACK_REQUEST_TTL_MS, playbackDeviceNonce } from '../ticket-keys/messages';
import type { DeviceKey } from './device-key';
import { expectedStreamHlsUrl, STREAM_TOKEN_PATTERN } from './stream-playback';

export interface PlaybackV3Token {
    playbackId: string;
    token: string;
    hlsUrl: string;
    expiresAtMs: number;
    /** Present only on a Stream answer; a Studio answer has no `provider`. */
    provider?: 'cloudflare-stream';
}

/**
 * Source for native HLS (iOS Safari), which cannot send a header: a Studio token goes in the
 * `jwt` query; a Stream URL already carries its token in the path and is used as it is.
 */
export function nativePlaybackSource(access: PlaybackV3Token): string {
    return access.provider === 'cloudflare-stream'
        ? access.hlsUrl
        : `${access.hlsUrl}?jwt=${encodeURIComponent(access.token)}`;
}

function validStreamAnswer(value: Record<string, unknown>, customerCode: string): boolean {
    return STREAM_CUSTOMER_CODE_PATTERN.test(customerCode)
        && typeof value.token === 'string' && STREAM_TOKEN_PATTERN.test(value.token)
        && value.hls_url === expectedStreamHlsUrl(customerCode, value.token);
}

export class PlaybackV3Error extends Error {
    constructor(code: string, readonly status: number) {
        super(code);
    }
}

export async function requestPlaybackV3Token(input: {
    bridgeUrl: string;
    network: string;
    contractId: string;
    ticketId: string;
    origin: string;
    device: DeviceKey;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    pendingRetries?: number;
    /** Public delivery code a Stream answer's host must use; defaults to the build's value. */
    streamCustomerCode?: string;
}): Promise<PlaybackV3Token> {
    const fetcher = input.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const now = input.now ?? (() => Date.now());
    const retries = input.pendingRetries ?? 10;
    for (let attempt = 0; ; attempt += 1) {
        const nowMs = now();
        const body = await buildPlaybackV3Body({
            network: input.network, contract_id: input.contractId, ticket_id: input.ticketId,
            session_public_key: input.device.sessionPublicKey, origin: input.origin, device_nonce: playbackDeviceNonce(),
            expires_at_ms: String(nowMs + MAX_PLAYBACK_REQUEST_TTL_MS - 30_000),
        }, input.device.sign, nowMs);
        let response: Response;
        try {
            response = await fetcher(`${input.bridgeUrl}/v3/playback-tokens`, {
                method: 'POST', cache: 'no-store', credentials: 'omit',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                signal: AbortSignal.timeout(30_000),
            });
        } catch {
            throw new PlaybackV3Error('playback_unavailable', 0);
        }
        const value = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (response.ok) {
            if (value.schema !== 'youtick.livepeer-playback-token.v3' || typeof value.playback_id !== 'string'
                || typeof value.token !== 'string' || typeof value.hls_url !== 'string'
                || typeof value.expires_at_ms !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value.expires_at_ms)) {
                throw new PlaybackV3Error('playback_unavailable', response.status);
            }
            const access = { playbackId: value.playback_id, token: value.token, hlsUrl: value.hls_url, expiresAtMs: Number(value.expires_at_ms) };
            if (value.provider === undefined) return access;
            if (value.provider !== 'cloudflare-stream'
                || !validStreamAnswer(value, input.streamCustomerCode ?? V2_MEDIA_CONFIG.streamCustomerCode)) {
                throw new PlaybackV3Error('playback_unavailable', response.status);
            }
            return { ...access, provider: 'cloudflare-stream' };
        }
        const code = typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error) ? value.error : 'playback_unavailable';
        if (code === 'playback_pending' && attempt < retries) {
            await sleep(2_000);
            continue;
        }
        throw new PlaybackV3Error(code, response.status);
    }
}
