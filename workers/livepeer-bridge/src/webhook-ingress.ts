import type { MediaProviderKind } from './media-provider';
import { MEDIA_PROVIDER_HEADER, MEDIA_WEBHOOK_TIME_HEADER } from './media-provider';
import type { Env } from './env';
import type { LivepeerWebhookQueueMessage } from './types';
import { MAX_CONTROL_BODY_BYTES, ACCOUNT_ID_PATTERN, JOB_ID_PATTERN } from './constants';
import {
    formatLog,
    requireObject,
    requireExactKeys,
    bytesToBase64,
    errorStatus,
    safeErrorCode,
    json,
} from './helpers';
import { validWebhookConfig, validStreamWebhookConfig, validWebhookQueuePolicy } from './config';
import { jobObjectName } from './object-names';
import { mediaProvider } from './provider-registry';
import { signalStreamAdmission } from './admission';

export function forwardLivepeerWebhook(request: Request, env: Env): Promise<Response> {
    return forwardProviderWebhook(request, env, 'studio');
}

/**
 * One ingress pipeline per adapter route: the adapter authenticates and routes the raw body
 * before any Queue send or job-object call; the job object re-parses the same bytes.
 */
export async function forwardProviderWebhook(
    request: Request,
    env: Env,
    kind: MediaProviderKind,
): Promise<Response> {
    const startedAtMs = Date.now();
    try {
        if (!env.LIVEPEER_CONTROL
            || !(kind === 'stream' ? validStreamWebhookConfig(env) : validWebhookConfig(env))) {
            throw new Error('runtime_not_configured');
        }
        const rawBody = new Uint8Array(await request.arrayBuffer());
        if (rawBody.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
        // Each route names its adapter; the adapter owns the signature header and scheme.
        const provider = mediaProvider(env, { provider: kind });
        const event = await provider.verifyWebhook(rawBody, request.headers, Date.now());
        if (kind === 'stream') await signalStreamAdmission(env, { lastWebhookAtMs: Date.now() });
        const route = event?.route;
        if (!route) return json({ accepted: true, ignored: true }, 202);
        if (env.LIVEPEER_WEBHOOK_QUEUE_ENABLED === 'true') {
            if (!env.LIVEPEER_EVENTS || !validWebhookQueuePolicy(env)) {
                throw new Error('webhook_queue_unavailable');
            }
            try {
                await env.LIVEPEER_EVENTS.send({
                    schema: 'youtick.livepeer-webhook-queue.v1',
                    network: env.NEAR_NETWORK!,
                    contract_id: env.MARKET_CONTRACT_ID!,
                    job_id: route.jobId,
                    generation: route.generation,
                    enqueued_at_ms: String(Date.now()),
                    raw_body_base64: bytesToBase64(rawBody),
                    ...(kind === 'stream' ? {
                        provider: 'stream' as const,
                        ...(event ? { signed_time_ms: String(event.timestampMs) } : {}),
                    } : {}),
                } satisfies LivepeerWebhookQueueMessage, { contentType: 'json' });
            } catch {
                throw new Error('webhook_queue_unavailable');
            }
            console.info(formatLog('webhook_ack_completed', {
                delivery: 'QUEUE',
                httpCode: 202,
                latencyMs: Math.max(0, Date.now() - startedAtMs),
            }));
            return json({ accepted: true, queued: true }, 202);
        }
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
            route.jobId,
            route.generation,
        )));
        return await object.fetch(new Request('https://object/internal/livepeer-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [MEDIA_PROVIDER_HEADER]: provider.id,
                // Stream signs the time outside the body; the job object folds it into the digest.
                ...(kind === 'stream' && event ? { [MEDIA_WEBHOOK_TIME_HEADER]: String(event.timestampMs) } : {}),
            },
            body: rawBody,
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog(kind === 'stream' ? 'stream_webhook_rejected' : 'livepeer_webhook_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

export function parseLivepeerWebhookQueueMessage(value: unknown): LivepeerWebhookQueueMessage {
    const input = requireObject(value, 'invalid_webhook');
    requireExactKeys(input, [
        'schema',
        'network',
        'contract_id',
        'job_id',
        'generation',
        'enqueued_at_ms',
        'raw_body_base64',
        ...['provider', 'signed_time_ms'].filter((key) => input[key] !== undefined),
    ], 'invalid_webhook');
    if ((input.provider !== undefined && input.provider !== 'stream')
        || (input.signed_time_ms !== undefined
            && (typeof input.signed_time_ms !== 'string' || !/^[1-9][0-9]{0,15}$/.test(input.signed_time_ms)))) {
        throw new Error('invalid_webhook');
    }
    const maxEncodedBodyLength = Math.ceil(MAX_CONTROL_BODY_BYTES / 3) * 4;
    if (input.schema !== 'youtick.livepeer-webhook-queue.v1'
        || !['testnet', 'mainnet'].includes(String(input.network))
        || typeof input.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(input.contract_id)
        || typeof input.job_id !== 'string'
        || !JOB_ID_PATTERN.test(input.job_id)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.enqueued_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(input.enqueued_at_ms)
        || typeof input.raw_body_base64 !== 'string'
        || input.raw_body_base64.length < 4
        || input.raw_body_base64.length > maxEncodedBodyLength
        || input.raw_body_base64.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.raw_body_base64)) {
        throw new Error('invalid_webhook');
    }
    return input as LivepeerWebhookQueueMessage;
}
