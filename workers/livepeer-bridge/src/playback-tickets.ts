import { canonicalPlaybackV3Message, decideTicketPlayback, parsePlaybackV3Body } from './playback-v3';
import { mediaProfileFamily } from './media-provider';
import type { Env } from './env';
import { PLAYBACK_V2_TTL_SECONDS, PROVIDER_POLICY_CACHE_MS } from './constants';
import {
    formatLog,
    readJsonObject,
    requireObject,
    allowedOrigins,
    errorStatus,
    safeErrorCode,
    json,
} from './helpers';
import { nearPlaybackView } from './near-rpc';
import { mediaProvider, publicationProfileHash } from './provider-registry';
import { forwardMarkWatched } from './operator-outbox';
import {
    verifyEd25519Signature,
    verifyStatelessProviderPolicy,
    playbackCacheKey,
    playbackCacheGet,
    playbackCachePut,
} from './playback-v2';

// V2 Market playback: the device session key signs the protocol request; the final ticket view
// authorizes; the first play finalizes mark_watched (escrow settlement) before any token.
export async function issueTicketPlaybackToken(request: Request, env: Env): Promise<Response> {
    const startedAtMs = performance.now();
    try {
        const input = parsePlaybackV3Body(await readJsonObject(request), {
            network: env.NEAR_NETWORK!,
            contractId: env.MARKET_CONTRACT_ID!,
            origins: allowedOrigins(env),
            nowMs: Date.now(),
        });
        await verifyEd25519Signature(
            input.request.session_public_key,
            input.signature,
            canonicalPlaybackV3Message(input.request),
        );
        const ticket = await nearPlaybackView(env, env.MARKET_CONTRACT_ID!, 'get_ticket', {
            ticket_id: input.request.ticket_id,
        });
        const ticketValue = ticket.value === null ? null : requireObject(ticket.value, 'playback_authorization_unavailable');
        const publication = ticketValue === null ? { value: null } : await nearPlaybackView(
            env,
            env.MARKET_CONTRACT_ID!,
            'get_publication',
            { publication_id: ticketValue.publication_id },
            ticket.blockHash,
        );
        const decision = decideTicketPlayback(ticketValue, publication.value, input.request, Date.now());
        let markWatchedRequired = false;
        if (decision.kind === 'watch') {
            markWatchedRequired = true;
            const response = await forwardMarkWatched(env, input.request.ticket_id);
            if (response.status !== 200) {
                // Only a refusal is reported as such; operator internals stay private.
                const failure = await response.json().catch(() => ({})) as { error?: unknown };
                throw new Error(failure.error === 'playback_denied' ? 'playback_denied' : 'playback_pending');
            }
        }
        // The publication read above carries the profile hash that selects the media adapter.
        const profileConfigSha256 = publicationProfileHash(publication.value);
        // Same 30-second provider-policy cache as /v2 (Studio keys are shared with /v2; Stream keys are namespaced).
        const providerCacheKey = await playbackCacheKey(
            env,
            'provider-policy',
            mediaProfileFamily(profileConfigSha256) === 'stream' ? `stream:${decision.playbackId}` : decision.playbackId,
        );
        let provider = playbackCacheGet<{ previewVttUrl?: string }>(providerCacheKey);
        if (!provider) {
            provider = await verifyStatelessProviderPolicy(env, decision.playbackId, profileConfigSha256);
            playbackCachePut(providerCacheKey, provider, Date.now() + PROVIDER_POLICY_CACHE_MS);
        }
        const nowMs = Date.now();
        const deviceRemainingSeconds = Math.floor((decision.deviceExpiresAtMs - nowMs) / 1000);
        if (deviceRemainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(PLAYBACK_V2_TTL_SECONDS, deviceRemainingSeconds);
        const issuedAtSeconds = Math.floor(nowMs / 1000);
        const adapter = mediaProvider(env, profileConfigSha256);
        const signed = await adapter.signPlayback(decision.playbackId, ttlSeconds, issuedAtSeconds);
        console.info(formatLog('ticket_playback_authorization_completed', {
            markWatched: markWatchedRequired,
            latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        // Studio responses stay byte-identical; Stream adds `provider` and never a preview VTT.
        return json({
            schema: 'youtick.livepeer-playback-token.v3',
            playback_id: decision.playbackId,
            token: signed.token,
            expires_at_ms: String(signed.expiresAtSeconds * 1000),
            hls_url: signed.hlsUrl,
            ...(adapter.id === 'stream'
                ? { provider: 'cloudflare-stream' }
                : provider.previewVttUrl ? { preview_vtt_url: provider.previewVttUrl } : {}),
        });
    } catch (error) {
        const code = safeErrorCode(error);
        const httpCode = errorStatus(code);
        console.error(formatLog('ticket_playback_request_failed', {
            code, httpCode, latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        return json({ error: code }, httpCode);
    }
}
