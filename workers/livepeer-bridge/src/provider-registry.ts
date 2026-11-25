import type { MediaProvider, MediaProviderKind, ProviderIdentityExpectation } from './media-provider';
import { mediaProfileFamily, streamSupportsProfile } from './media-provider';
import { LivepeerProvider, livepeerSupportsProfile } from './livepeer-provider';
import { CloudflareStreamProvider } from './cloudflare-stream-provider';
import type { Env } from './env';
import type { JsonObject, JobRecord } from './types';
import { PLAYBACK_MIN_TTL_SECONDS, STREAM_DEFAULT_STUCK_TIMEOUT_MS, JOB_ID_PATTERN } from './constants';
import { sha256Hex } from './helpers';
import {
    streamEnabled,
    studioActive,
    streamMaxDurationSeconds,
    streamStuckTimeoutMs,
    validStreamConfig,
    validProviderVerificationConfig,
    validPlaybackConfig,
} from './config';

const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const STREAM_MIN_READY_PENDING_MS = 60 * 60 * 1000;

function studioProvider(env: Env): LivepeerProvider {
    return new LivepeerProvider(env.LIVEPEER_API_KEY, {
        readyVerificationEnabled: validProviderVerificationConfig(env),
        sha256: sha256Hex,
        projectId: env.LIVEPEER_PROJECT_ID,
        jwt: {
            privateKey: env.LIVEPEER_JWT_PRIVATE_KEY,
            issuer: env.LIVEPEER_JWT_ISSUER,
            publicKey: env.LIVEPEER_JWT_PUBLIC_KEY,
        },
        verificationTokensEnabled: validPlaybackConfig(env),
        verificationTokenTtlSeconds: PLAYBACK_MIN_TTL_SECONDS,
        webhookSecrets: [env.LIVEPEER_WEBHOOK_SECRET, env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS],
        webhookToleranceMs: WEBHOOK_TOLERANCE_MS,
        isValidJobId: (jobId) => JOB_ID_PATTERN.test(jobId),
    });
}

export function streamProvider(env: Env): CloudflareStreamProvider {
    return new CloudflareStreamProvider({
        accountId: env.STREAM_ACCOUNT_ID,
        apiToken: env.STREAM_API_TOKEN,
        customerCode: env.STREAM_CUSTOMER_CODE,
        signingKeyId: env.STREAM_SIGNING_KEY_ID,
        signingKey: env.STREAM_SIGNING_KEY_PEM,
        webhookSecrets: [env.STREAM_WEBHOOK_SECRET, env.STREAM_WEBHOOK_SECRET_PREVIOUS],
        webhookToleranceMs: WEBHOOK_TOLERANCE_MS,
        maxDurationSeconds: streamMaxDurationSeconds(env) ?? undefined,
        // A ready webhook may precede the ladder by a long transcode: never shorter than 60 minutes.
        readyPendingWindowMs: Math.max(streamStuckTimeoutMs(env) ?? STREAM_DEFAULT_STUCK_TIMEOUT_MS, STREAM_MIN_READY_PENDING_MS),
        verificationTokenTtlSeconds: PLAYBACK_MIN_TTL_SECONDS,
        sha256: sha256Hex,
        isValidJobId: (jobId) => JOB_ID_PATTERN.test(jobId),
        readyVerificationEnabled: validStreamConfig(env),
    });
}

// Adapter registry: registering a provider here is the only change the call sites need.
// supportsProfile is static so request parsers can check a hash without building an adapter.
const MEDIA_PROVIDER_REGISTRY: Record<MediaProviderKind, {
    create(env: Env): MediaProvider;
    supportsProfile(profileConfigSha256: unknown): boolean;
}> = {
    studio: { create: studioProvider, supportsProfile: livepeerSupportsProfile },
    stream: { create: streamProvider, supportsProfile: streamSupportsProfile },
};
const DEFAULT_MEDIA_PROVIDER: MediaProviderKind = 'studio';

/**
 * Adapter for a job (by its recorded provider; absent means Studio) or for a publication
 * (by its profile_config_sha256, through each registered supportsProfile). Default: Studio.
 */
export function mediaProvider(
    env: Env,
    selector?: { provider?: MediaProviderKind } | string | null,
): MediaProvider {
    const kind = selector && typeof selector === 'object'
        ? selector.provider ?? DEFAULT_MEDIA_PROVIDER
        : (typeof selector === 'string'
            && (Object.keys(MEDIA_PROVIDER_REGISTRY) as MediaProviderKind[])
                .find((candidate) => MEDIA_PROVIDER_REGISTRY[candidate].supportsProfile(selector)))
            || DEFAULT_MEDIA_PROVIDER;
    // A record written by a newer build (unknown provider) fails closed with a coded error.
    if (!Object.hasOwn(MEDIA_PROVIDER_REGISTRY, kind)) throw new Error('runtime_not_configured');
    return MEDIA_PROVIDER_REGISTRY[kind].create(env);
}

export function jobProviderKind(job: Pick<JobRecord, 'provider'>): MediaProviderKind {
    return job.provider ?? 'studio';
}

// New intents: the Stream hash needs the flag; Studio hashes stay open unless V2 is Stream-only.
export function uploadProfileAccepted(env: Env, hash: unknown): boolean {
    const family = mediaProfileFamily(hash);
    return family === 'stream' ? streamEnabled(env) : family === 'studio' && studioActive(env);
}

export function supportedMediaProfile(hash: unknown): hash is string {
    return typeof hash === 'string'
        && Object.values(MEDIA_PROVIDER_REGISTRY).some((entry) => entry.supportsProfile(hash));
}

export function providerIdentity(
    job: JobRecord,
    assetId: string,
    apiTokenName: string | null | undefined,
): ProviderIdentityExpectation {
    return {
        jobId: job.jobId,
        generation: job.generation,
        assetId,
        playbackId: job.playbackId,
        projectId: job.projectId,
        apiTokenName,
    };
}

export function publicationProfileHash(publication: unknown): string | undefined {
    return publication && typeof publication === 'object'
        && typeof (publication as JsonObject).profile_config_sha256 === 'string'
        ? (publication as JsonObject).profile_config_sha256 as string
        : undefined;
}
