// Provider-neutral webhook semantics. Each adapter authenticates and normalizes its own payloads
// (signature scheme, routing key, digest inputs); the job object only sees NormalizedWebhookEvent.
import type { MediaProviderKind, NormalizedWebhookEvent } from './media-provider';

const ACTIVE_UPLOAD_STATES = new Set(['UPLOAD_READY', 'UPLOADING', 'PROCESSING']);

/** A ready event always counts; a progress update counts only while the upload is still active. */
export function isReadinessEvent(event: NormalizedWebhookEvent, jobState: string): boolean {
    return event.event === 'ready'
        || (event.event === 'processing' && ACTIVE_UPLOAD_STATES.has(jobState) && event.phase === 'ready');
}

export function isProviderFailureEvent(event: NormalizedWebhookEvent): boolean {
    return event.event === 'failed' || event.event === 'deleted';
}

export function isProcessingEvent(event: NormalizedWebhookEvent): boolean {
    return event.event === 'processing' && event.phase === 'processing';
}

/**
 * An observation the job object makes itself (alarm continuation or upload reconcile read).
 * The digest only has to be unique per observation; it never collides with a provider digest
 * because its first line is a fixed marker.
 */
export async function synthesizedProviderEvent(
    input: {
        provider: MediaProviderKind;
        event: 'processing' | 'failed';
        assetId: string;
        phase: string;
        nowMs: number;
    },
    sha256: (value: string) => Promise<string>,
): Promise<NormalizedWebhookEvent> {
    return {
        provider: input.provider,
        event: input.event,
        providerEvent: `synthesized.${input.event}`,
        assetId: input.assetId,
        phase: input.phase,
        timestampMs: input.nowMs,
        digest: await sha256([
            'youtick.synthesized-provider-event.v1',
            input.provider,
            input.event,
            String(input.nowMs),
            input.assetId,
            input.phase,
        ].join('\n')),
    };
}
