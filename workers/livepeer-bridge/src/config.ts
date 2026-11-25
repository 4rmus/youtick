import { KeyPairSigner } from 'near-api-js';
import { STREAM_PROFILE_MAX_DURATION_SECONDS } from './media-provider';
import { decodeStreamKeyText } from './cloudflare-stream-provider';
import type { Env } from './env';
import type { MediaProfileId, OutboxMethod } from './types';
import {
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
    IDENTIFIER_PATTERN,
    PROVIDER_ID_PATTERN,
    V1_OUTBOX_METHODS,
    NEUTRAL_OUTBOX_METHODS,
    LEGACY_PROFILE_ID,
} from './constants';
import { isHttpsOrigin, isHttpsUrl, validApiKey } from './helpers';

const TESTNET_USDC_CONTRACT_ID = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const MAINNET_USDC_CONTRACT_ID = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const MARKET_V2_OUTBOX_METHODS = new Set<OutboxMethod>([...NEUTRAL_OUTBOX_METHODS, 'mark_watched', 'release_expired']);
const NEUTRAL_PROFILE_ID = 'paid-media-v1' satisfies MediaProfileId;

export function isMarketV2(env: Env): boolean {
    return env.MARKET_PROTOCOL === 'v2';
}

/**
 * Where the native rate limiter (PUBLIC_BETA_RATE_LIMITER, 30 requests / 60 s per IP and per
 * account on PUBLIC_BETA_RATE_LIMIT_ROUTES) is enforced: the public-beta packet, public testnet and
 * every Market V2 deployment. V2 has no other limit on its upload routes (2026-11-03 threat review),
 * and its release config always carries the binding; without it the routes fail closed (503).
 */
export function rateLimitedEnvironment(env: Env): boolean {
    return isPublicBetaPacket(env) || isPublicTestnetEnvironment(env) || isMarketV2(env);
}

// The on-chain operator key must allow exactly these methods; V1 deployments are unchanged.
export function operatorOutboxMethods(env: Env): Set<OutboxMethod> {
    return isMarketV2(env) ? MARKET_V2_OUTBOX_METHODS : V1_OUTBOX_METHODS;
}

export function finalizeMethod(env: Env): OutboxMethod {
    return isMarketV2(env) ? 'finalize_publication' : 'finalize_livepeer_publication';
}

export function suspendMethod(env: Env): OutboxMethod {
    return isMarketV2(env) ? 'suspend_sales' : 'suspend_livepeer_sales';
}

// The only profile id a new upload or finalization may carry on this deployment.
export function marketProfileId(env: Env): MediaProfileId {
    return isMarketV2(env) ? NEUTRAL_PROFILE_ID : LEGACY_PROFILE_ID;
}

// Playback also honours publications finalized on the V2 testnet before the MC rename.
export function playbackProfileIdAccepted(env: Env, profileId: unknown): boolean {
    return profileId === marketProfileId(env) || (isMarketV2(env) && profileId === LEGACY_PROFILE_ID);
}

export function creatorAllowlist(env: Env): Set<string> {
    const values = (env.LIVEPEER_CREATOR_ALLOWLIST || '').split(',').map((value) => value.trim()).filter(Boolean);
    return values.length > 0
        && (values.every((value) => ACCOUNT_ID_PATTERN.test(value))
            || (values.length === 1 && values[0] === '*'))
        ? new Set(values)
        : new Set();
}

export function creatorAllowed(env: Env, creator: string): boolean {
    if (isPublicTestnetEnvironment(env)) return ACCOUNT_ID_PATTERN.test(creator);
    const allowlist = creatorAllowlist(env);
    return allowlist.has('*') || allowlist.has(creator);
}

export function isPublicTestnetEnvironment(env: Env): boolean {
    return env.VIDEO_ENVIRONMENT === 'public-testnet';
}

export function isPublicBetaPacket(env: Env): boolean {
    const allowlist = creatorAllowlist(env);
    return env.VIDEO_ENVIRONMENT !== 'public-testnet'
        && env.NEAR_NETWORK === 'testnet'
        && env.LIVEPEER_BRIDGE_ENABLED === 'true'
        && env.LIVEPEER_NEW_UPLOADS_ENABLED === 'true'
        && env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED === 'true'
        && env.LIVEPEER_PLAYBACK_V2_ENABLED === 'true'
        && env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED === 'true'
        && env.LIVEPEER_OPERATOR_MUTATIONS_ENABLED === 'true'
        && env.LIVEPEER_SPONSORED_UPLOADS_ENABLED === 'true'
        && env.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED === 'true'
        && env.LIVEPEER_OPERATOR_JOB_ID === ''
        && env.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS === '20000000'
        && env.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS === '2000000'
        && (allowlist.has('*') || allowlist.size === 2);
}

// V2 testnet (separate Bridge, decision D9): any job of an explicitly named creator; never a wildcard or mainnet.
export function isMarketV2TestnetCreatorScope(env: Env): boolean {
    const allowlist = creatorAllowlist(env);
    return isMarketV2(env)
        && env.NEAR_NETWORK === 'testnet'
        && !isPublicTestnetEnvironment(env)
        && allowlist.size > 0
        && !allowlist.has('*');
}

export function operatorJobAllowed(env: Env, jobId: string, creator?: string): boolean {
    return isPublicTestnetEnvironment(env)
        ? JOB_ID_PATTERN.test(jobId) && (creator === undefined || ACCOUNT_ID_PATTERN.test(creator))
        : isPublicBetaPacket(env) || isMarketV2TestnetCreatorScope(env)
        ? creator === undefined || creatorAllowed(env, creator)
        : env.LIVEPEER_OPERATOR_JOB_ID === jobId
            && (creator === undefined || creatorAllowed(env, creator));
}

export function operationReservation(env: Env): bigint | null {
    // Public testnet uses upload quotas, not estimated dollar reservations.
    if (isPublicTestnetEnvironment(env)) return 0n;
    const job = env.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS || '';
    return /^[1-9][0-9]{0,19}$/.test(job) ? BigInt(job) : null;
}

export function monthlyBudget(env: Env): bigint | null {
    if (isPublicTestnetEnvironment(env)) return null;
    const budget = env.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS || '';
    return /^[1-9][0-9]{0,19}$/.test(budget) ? BigInt(budget) : null;
}

export function usdcContractId(env: Env): string {
    if (env.NEAR_NETWORK === 'testnet') return TESTNET_USDC_CONTRACT_ID;
    if (env.NEAR_NETWORK === 'mainnet') return MAINNET_USDC_CONTRACT_ID;
    throw new Error('runtime_not_configured');
}

// Stream adapter switches. With the flag on, Market V2 runs Stream-only (OD19): the Studio
// configuration is not required and new Studio-hash intents are refused. V1 is unchanged.
export function streamEnabled(env: Env): boolean {
    return env.MEDIA_PROVIDER_STREAM_ENABLED === 'true';
}

export function studioActive(env: Env): boolean {
    return !(isMarketV2(env) && streamEnabled(env));
}

export function positiveIntegerVar(value: string | undefined, max = Number.MAX_SAFE_INTEGER): number | null {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
}

export function streamMaxDurationSeconds(env: Env): number | null {
    // 1..36000 is Stream's documented range; the descriptor cap (7200) binds this deployment.
    const value = positiveIntegerVar(env.STREAM_MAX_DURATION_SECONDS, 36_000);
    return value !== null && value <= STREAM_PROFILE_MAX_DURATION_SECONDS ? value : null;
}

export function streamStuckTimeoutMs(env: Env): number | null {
    return positiveIntegerVar(env.STREAM_STUCK_TIMEOUT_MS);
}

// STREAM_SIGNING_PUBLIC_KEY is base64 of an SPKI PEM (or the PEM itself); the release checks the pair.
function validStreamPublicKey(value: string | undefined): boolean {
    if (typeof value !== 'string' || value.trim().length < 64) return false;
    try {
        return decodeStreamKeyText(value).startsWith('-----BEGIN PUBLIC KEY-----');
    } catch {
        return false;
    }
}

export function validStreamConfig(env: Env): boolean {
    return /^[0-9a-f]{32}$/.test(env.STREAM_ACCOUNT_ID || '')
        && typeof env.STREAM_API_TOKEN === 'string'
        && env.STREAM_API_TOKEN.length >= 16
        && !/[\s]/.test(env.STREAM_API_TOKEN)
        && /^[a-z0-9]{1,64}$/.test(env.STREAM_CUSTOMER_CODE || '')
        && /^[0-9a-f]{32}$/.test(env.STREAM_SIGNING_KEY_ID || '')
        && validStreamPublicKey(env.STREAM_SIGNING_PUBLIC_KEY)
        && typeof env.STREAM_SIGNING_KEY_PEM === 'string'
        && env.STREAM_SIGNING_KEY_PEM.trim().length >= 64
        && typeof env.STREAM_WEBHOOK_SECRET === 'string'
        && env.STREAM_WEBHOOK_SECRET.length >= 16
        && (env.STREAM_WEBHOOK_SECRET_PREVIOUS === undefined || env.STREAM_WEBHOOK_SECRET_PREVIOUS === ''
            || env.STREAM_WEBHOOK_SECRET_PREVIOUS.length >= 16)
        && streamLimitsConsistent(env)
        && streamStuckTimeoutMs(env) !== null;
}

// The budget and the capacity must each fit at least one upload at the cap (the release tooling
// refuses the same combination with stream_limits_inconsistent).
function streamLimitsConsistent(env: Env): boolean {
    const cap = streamMaxDurationSeconds(env);
    const capacity = positiveIntegerVar(env.STREAM_STORAGE_MINUTES_CAPACITY);
    const budget = positiveIntegerVar(env.STREAM_RESERVATION_SECONDS_BUDGET);
    return cap !== null && capacity !== null && budget !== null && budget >= cap && capacity * 60 >= cap;
}

// Validators are evaluated per active adapter: Studio unless Market V2 runs Stream-only, Stream
// when its flag is on. The flag off with no STREAM_* values is "not configured", never an error.
export function validWebhookConfig(env: Env): boolean {
    return (!studioActive(env) || validStudioWebhookSecrets(env))
        && validProviderVerificationConfig(env)
        && validOperatorConfig(env);
}

export function validStudioWebhookSecrets(env: Env): boolean {
    return typeof env.LIVEPEER_WEBHOOK_SECRET === 'string'
        && env.LIVEPEER_WEBHOOK_SECRET.length >= 16
        && (env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS === undefined
            || env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS.length >= 16);
}

export function validStreamWebhookConfig(env: Env): boolean {
    return validStreamConfig(env) && validOperatorConfig(env);
}

export function validWebhookQueuePolicy(env: Env): boolean {
    return env.NEAR_NETWORK === 'testnet'
        && env.LIVEPEER_WEBHOOK_QUEUE_BATCH_SIZE === '10'
        && env.LIVEPEER_WEBHOOK_QUEUE_BATCH_TIMEOUT_SECONDS === '5'
        && env.LIVEPEER_WEBHOOK_QUEUE_MAX_RETRIES === '3'
        && env.LIVEPEER_WEBHOOK_QUEUE_MAX_CONCURRENCY === '1'
        && env.LIVEPEER_WEBHOOK_QUEUE_RETENTION_SECONDS === (isPublicTestnetEnvironment(env) ? '86400' : '345600')
        && env.LIVEPEER_WEBHOOK_QUEUE_DLQ === (isPublicTestnetEnvironment(env)
            ? 'youtick-livepeer-events-dlq-public-testnet' : 'youtick-livepeer-events-dlq-testnet');
}

export function validTerminalArchiveConfig(env: Env): boolean {
    return env.UPLOAD_JOB_ARCHIVE_ENABLED === 'true'
        && env.NEAR_NETWORK === 'testnet'
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && Boolean(env.MARKET_READ_MODEL);
}

export function validOperatorArchiveConfig(env: Env): boolean {
    return env.OPERATOR_OUTBOX_ARCHIVE_ENABLED === 'true'
        && env.NEAR_NETWORK === 'testnet'
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ACCOUNT_ID_PATTERN.test(env.NEAR_OPERATOR_ACCOUNT_ID || '')
        && Number.isSafeInteger(Number(env.NEAR_OPERATOR_KEY_EPOCH))
        && Number(env.NEAR_OPERATOR_KEY_EPOCH) > 0
        && Boolean(env.MARKET_READ_MODEL);
}

export function validAdmissionConfig(env: Env): boolean {
    return (isPublicTestnetEnvironment(env) || creatorAllowlist(env).size > 0)
        && (isPublicTestnetEnvironment(env)
            || (operationReservation(env) !== null && monthlyBudget(env) !== null))
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '');
}

export function validAdmissionReopenConfig(env: Env): boolean {
    return ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && typeof env.LIVEPEER_PAID_MEDIA_OPERATOR_ID === 'string'
        && IDENTIFIER_PATTERN.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_ID)
        && typeof env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN === 'string'
        && env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN.length >= 32
        && !/[\r\n]/.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN)
        && (env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS === undefined
            || (env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS.length >= 32
                && !/[\r\n]/.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS)));
}

export function validOperatorStatusConfig(env: Env): boolean {
    return validAdmissionReopenConfig(env) && validOperatorConfig(env);
}

export function validProviderVerificationConfig(env: Env): boolean {
    return (!studioActive(env) || validStudioVerificationConfig(env))
        && (!streamEnabled(env) || validStreamConfig(env));
}

export function validStudioVerificationConfig(env: Env): boolean {
    return validApiKey(env.LIVEPEER_API_KEY)
        && typeof env.LIVEPEER_PROJECT_ID === 'string'
        && PROVIDER_ID_PATTERN.test(env.LIVEPEER_PROJECT_ID)
        && typeof env.LIVEPEER_API_TOKEN_NAME === 'string'
        && env.LIVEPEER_API_TOKEN_NAME.length >= 1
        && env.LIVEPEER_API_TOKEN_NAME.length <= 128;
}

export function validPlaybackConfig(env: Env): boolean {
    return isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ACCOUNT_ID_PATTERN.test(env.ACCESS_CONTRACT_ID || '')
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && (!studioActive(env) || validStudioPlaybackKeys(env))
        && (!streamEnabled(env) || validStreamConfig(env));
}

function validStudioPlaybackKeys(env: Env): boolean {
    return typeof env.LIVEPEER_JWT_PRIVATE_KEY === 'string'
        && env.LIVEPEER_JWT_PRIVATE_KEY.length >= 64
        && typeof env.LIVEPEER_JWT_PUBLIC_KEY === 'string'
        && env.LIVEPEER_JWT_PUBLIC_KEY.length >= 32
        && !/[\r\n]/.test(env.LIVEPEER_JWT_PUBLIC_KEY)
        && typeof env.LIVEPEER_JWT_ISSUER === 'string'
        && isHttpsOrigin(env.LIVEPEER_JWT_ISSUER);
}

export function validPlaybackV2Config(env: Env): boolean {
    return isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && (!studioActive(env) || (validApiKey(env.LIVEPEER_API_KEY) && validStudioPlaybackKeys(env)))
        && (!streamEnabled(env) || validStreamConfig(env));
}

export function validCreatorFeeQuoteConfig(env: Env): boolean {
    return !isPublicTestnetEnvironment(env)
        && env.LIVEPEER_NEAR_CREATOR_FEE_ENABLED === 'true' && validQuoteSigningConfig(env);
}

function validQuoteSigningConfig(env: Env): boolean {
    return ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && typeof env.CREATOR_FEE_QUOTE_PRIVATE_KEY === 'string'
        && env.CREATOR_FEE_QUOTE_PRIVATE_KEY.length >= 64
        && /^[1-9][0-9]{0,9}$/.test(env.CREATOR_FEE_QUOTE_KEY_VERSION || '')
        && Number(env.CREATOR_FEE_QUOTE_KEY_VERSION) <= 0xffff_ffff;
}

export function validSponsoredUploadQuoteConfig(env: Env): boolean {
    // Fail closed on Market V2: the compact upload format carries the V1 profile id, which the
    // MC contract no longer accepts, so the V2 Bridge never quotes or relays sponsored uploads.
    if (isMarketV2(env)) return false;
    return env.LIVEPEER_SPONSORED_UPLOADS_ENABLED === 'true'
        && validQuoteSigningConfig(env)
        && validAdmissionConfig(env);
}

export function validSponsoredUploadRelayConfig(env: Env): boolean {
    if (isMarketV2(env)) return false;
    const accountId = env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID || '';
    const structurallyValid = validSponsoredUploadQuoteConfig(env)
        && ACCOUNT_ID_PATTERN.test(accountId)
        && accountId !== env.MARKET_CONTRACT_ID
        && accountId !== env.ACCESS_CONTRACT_ID
        && accountId !== env.NEAR_OPERATOR_ACCOUNT_ID
        && typeof env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY === 'string'
        && /^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY)
        && /^[1-9][0-9]{0,9}$/.test(env.NEAR_SPONSOR_RELAYER_KEY_EPOCH || '');
    if (!structurallyValid) return false;
    try {
        KeyPairSigner.fromSecretKey(env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`);
        return true;
    } catch {
        return false;
    }
}

export function validOperatorConfig(env: Env): boolean {
    const structurallyValid = isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ACCOUNT_ID_PATTERN.test(env.NEAR_OPERATOR_ACCOUNT_ID || '')
        && typeof env.NEAR_OPERATOR_PRIVATE_KEY === 'string'
        && /^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(env.NEAR_OPERATOR_PRIVATE_KEY)
        && /^[1-9][0-9]{0,9}$/.test(env.NEAR_OPERATOR_KEY_EPOCH || '')
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '');
    if (!structurallyValid) return false;
    try {
        KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
        return true;
    } catch {
        return false;
    }
}
