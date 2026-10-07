// `/v3/playback-tokens`: a device-signed request per token. The Bridge settles the ticket
// (`mark_watched`) before the first token, so `playback_pending` is retried briefly.
import { buildPlaybackV3Body, MAX_PLAYBACK_REQUEST_TTL_MS, playbackDeviceNonce } from '../ticket-keys/messages';
import type { DeviceKey } from './device-key';

export interface PlaybackV3Token {
    playbackId: string;
    token: string;
    hlsUrl: string;
    expiresAtMs: number;
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
            return { playbackId: value.playback_id, token: value.token, hlsUrl: value.hls_url, expiresAtMs: Number(value.expires_at_ms) };
        }
        const code = typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error) ? value.error : 'playback_unavailable';
        if (code === 'playback_pending' && attempt < retries) {
            await sleep(2_000);
            continue;
        }
        throw new PlaybackV3Error(code, response.status);
    }
}
