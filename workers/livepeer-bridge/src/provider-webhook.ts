export type JsonObject = Record<string, unknown>;

export type WebhookEvent = {
    event: string;
    timestamp: number;
    payload: JsonObject;
};

export function parseWebhook(value: JsonObject): WebhookEvent {
    if (typeof value.event !== 'string'
        || value.event.length < 1
        || value.event.length > 64
        || !Number.isSafeInteger(value.timestamp)
        || !value.payload
        || typeof value.payload !== 'object'
        || Array.isArray(value.payload)) {
        throw new Error('invalid_webhook');
    }
    return {
        event: value.event,
        timestamp: value.timestamp as number,
        payload: value.payload as JsonObject,
    };
}

export function webhookAsset(webhook: WebhookEvent): JsonObject | null {
    const asset = webhook.payload.asset;
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return null;
    const snapshot = (asset as JsonObject).snapshot;
    return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? snapshot as JsonObject
        : asset as JsonObject;
}

export function webhookRoute(
    webhook: WebhookEvent,
    isValidJobId: (value: string) => boolean,
): { jobId: string; generation: number } | null {
    const asset = webhookAsset(webhook);
    if (!asset || !['asset.ready', 'asset.updated', 'asset.failed', 'asset.deleted'].includes(webhook.event)) {
        return null;
    }
    const creator = asset.creatorId;
    if (!creator || typeof creator !== 'object' || Array.isArray(creator)) return null;
    const value = (creator as JsonObject).value;
    if ((creator as JsonObject).type !== 'unverified' || typeof value !== 'string') return null;
    const separator = value.lastIndexOf(':');
    if (separator < 1) return null;
    const jobId = value.slice(0, separator);
    const generation = Number(value.slice(separator + 1));
    return isValidJobId(jobId) && Number.isSafeInteger(generation) && generation > 0
        ? { jobId, generation }
        : null;
}

export async function webhookDigest(
    webhook: WebhookEvent,
    asset: JsonObject,
    rawBodyHash: string,
    sha256: (value: string) => Promise<string>,
): Promise<string> {
    return sha256([
        String(webhook.timestamp),
        rawBodyHash,
        String(asset.id || ''),
        providerPhase(asset),
    ].join('\n'));
}

export function providerPhase(asset: JsonObject): string {
    const status = asset.status;
    return status && typeof status === 'object' && !Array.isArray(status)
        ? String((status as JsonObject).phase || '')
        : '';
}
