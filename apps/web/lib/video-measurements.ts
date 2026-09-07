import type { PlaybackEvent } from '@livepeer/react';
import { NEAR_CONFIG, NEAR_NETWORK } from '@/lib/constants';

type VideoPhase = 'payment_preparation' | 'payment_options' | 'sponsored_quote' | 'wallet_signature'
    | 'wallet_transaction' | 'payment_relay' | 'payment_finality' | 'source_transfer'
    | 'playback_preparation' | 'playback_token_initial' | 'playback_token_renewal';

// Local console only: no collector, persistent storage, URLs, keys or raw errors.
function report(details: Record<string, unknown>): void {
    try {
        console.info(JSON.stringify({
            event: 'video_measurement',
            schema: 'youtick.video-measurement.v1',
            network: NEAR_NETWORK,
            market: NEAR_CONFIG.marketContractId,
            clock: 'performance',
            timeOriginMs: performance.timeOrigin,
            observedAtMs: performance.now(),
            ...details,
        }));
    } catch {
        // Measurement failure must never change a payment or playback result.
    }
}

export function startVideoMeasurement(
    phase: VideoPhase,
    sourceBytes?: number,
) {
    const startedAtMs = performance.now();
    const size = typeof sourceBytes === 'number' && Number.isSafeInteger(sourceBytes) && sourceBytes >= 0
        ? sourceBytes : undefined;
    report({ phase, outcome: 'started', startedAtMs, sourceBytes: size });
    let finished = false;
    return (outcome: 'completed' | 'failed' | 'cancelled') => {
        if (finished) return;
        finished = true;
        report({
            phase, outcome, startedAtMs, sourceBytes: size,
            durationMs: Math.max(0, performance.now() - startedAtMs),
        });
    };
}

export async function measureVideoOperation<T>(
    phase: VideoPhase,
    run: () => Promise<T>,
    sourceBytes?: number,
): Promise<T> {
    const finish = startVideoMeasurement(phase, sourceBytes);
    try {
        const value = await run();
        finish('completed');
        return value;
    } catch (error) {
        finish('failed');
        throw error;
    }
}

export function observeVideoState(state: string, publishedAtMs?: number): void {
    if (!['UPLOAD_READY', 'UPLOADING', 'PROCESSING', 'READY_VERIFIED', 'FINALIZE_QUEUED',
        'FINALIZE_RETRY', 'ONCHAIN_PUBLISHED', 'PROVIDER_FAILED', 'UPLOAD_EXPIRED', 'PUBLICATION_OBSERVED'].includes(state)) return;
    report({
        phase: 'state_observed', state,
        // Chain time is correlation metadata, never subtracted from the browser clock.
        chainPublishedAtMs: Number.isSafeInteger(publishedAtMs) ? publishedAtMs : undefined,
    });
}

export function recordVideoPlaybackEvents(events: PlaybackEvent[]): void {
    for (const event of events) {
        if (!['heartbeat', 'first-frame', 'play', 'pause', 'ended', 'error', 'warning'].includes(event.type)) continue;
        const metrics: Record<string, number> = {};
        if (event.type === 'heartbeat') {
            for (const key of ['play_to_first_frame_ms', 'time_playing_ms', 'time_waiting_ms',
                'time_stalled_ms', 'waiting_count', 'stalled_count', 'errors', 'warnings', 'duration_ms'] as const) {
                const value = event[key];
                if (typeof value === 'number' && Number.isFinite(value) && value >= 0) metrics[key] = value;
            }
        }
        report({
            phase: 'player_event', playerEvent: event.type, metrics,
            // SDK events arrive in batches. Arrival time is not first-frame time.
            playerTimestampMs: Number.isFinite(event.timestamp) ? event.timestamp : undefined,
        });
    }
}
