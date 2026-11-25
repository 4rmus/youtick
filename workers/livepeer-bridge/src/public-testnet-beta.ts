import profiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';
import { livepeerSupportsProfile } from './livepeer-provider';
import type { Env } from './env';
import type {
    UploadIntentRequest,
    UploadHeartbeatRequest,
    OnChainJob,
    PublicTestnetBetaJob,
    PublicTestnetBetaState,
    JobRecord,
} from './types';
import { PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES, ACCOUNT_ID_PATTERN, SHA256_PATTERN } from './constants';
import { requireObject, requireExactKeys, sha256Hex, isHttpsUrl, json } from './helpers';
import { rateLimitedEnvironment, isPublicTestnetEnvironment, isPublicBetaPacket } from './config';
import { readFinalPublicTestnetBetaState, readFinalPublicTestnetBetaView } from './near-rpc';

const PUBLIC_TESTNET_BETA_JOB_TTL_MS = 24 * 60 * 60 * 1_000;

const PUBLIC_UPLOAD_POLICY_CACHE_MS = 30_000;
let publicUploadPolicyCache: { scope: string; profileHash: string; expiresAtMs: number } | null = null;

export function resetPublicUploadPolicyCache(): void {
    publicUploadPolicyCache = null;
}

// Gate checks may reuse a verified policy for 30s per isolate; quote and relay pass fresh to read final state.
// Any failed read clears the cache, so a mismatch is never masked after it has been observed.
export async function requirePublicUploadPolicy(env: Env, options: { fresh?: boolean } = {}): Promise<string> {
    if (!isPublicTestnetEnvironment(env) || env.NEAR_NETWORK !== 'testnet'
        || !ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        || !env.MARKET_CONTRACT_ID?.endsWith('.testnet') || !isHttpsUrl(env.NEAR_RPC_URL)) {
        throw new Error('deployment_binding_mismatch');
    }
    const scope = `${env.NEAR_NETWORK}:${env.MARKET_CONTRACT_ID}:${env.NEAR_RPC_URL}`;
    const cached = publicUploadPolicyCache;
    if (!options.fresh && cached?.scope === scope && cached.expiresAtMs > Date.now()) return cached.profileHash;
    publicUploadPolicyCache = null;
    const profileHash = await readPublicUploadPolicy(env);
    publicUploadPolicyCache = { scope, profileHash, expiresAtMs: Date.now() + PUBLIC_UPLOAD_POLICY_CACHE_MS };
    return profileHash;
}

async function readPublicUploadPolicy(env: Env): Promise<string> {
    const value = requireObject(await readFinalPublicTestnetBetaView(
        env, 'get_public_upload_policy', {},
    ), 'deployment_binding_mismatch');
    requireExactKeys(value, ['version', 'environment', 'network', 'market_contract_id',
        'max_source_bytes', 'job_ttl_ms', 'signed_quote_required', 'profiles'], 'deployment_binding_mismatch');
    if (value.version !== 1 || value.environment !== 'public-testnet' || value.network !== env.NEAR_NETWORK
        || value.market_contract_id !== env.MARKET_CONTRACT_ID
        || value.max_source_bytes !== '5000000000' || value.job_ttl_ms !== '86400000'
        || value.signed_quote_required !== true || !Array.isArray(value.profiles) || ![1, 2, 3].includes(value.profiles.length)) {
        throw new Error('deployment_binding_mismatch');
    }
    const expected = value.profiles.length === 1 ? [profiles.legacy]
        : value.profiles.length === 2 ? [profiles.adaptive, profiles.legacy]
            : [profiles.fullHd, profiles.adaptive, profiles.legacy];
    for (const [index, entry] of value.profiles.entries()) {
        const profile = requireObject(entry, 'deployment_binding_mismatch');
        requireExactKeys(profile, ['profile_id', 'profile_config_sha256'], 'deployment_binding_mismatch');
        if (profile.profile_id !== 'paid-media-livepeer-v1' || profile.profile_config_sha256 !== expected[index].hash) {
            throw new Error('deployment_binding_mismatch');
        }
    }
    return expected[0].hash;
}

export function publicUploadJobDeadline(job: OnChainJob, requireUnexpired = true): number {
    if (job.generation !== 1 || job.fee_asset !== 'USDC' || !['Authorized', 'Published'].includes(String(job.status))
        || typeof job.fee_quote_hash !== 'string' || !SHA256_PATTERN.test(job.fee_quote_hash)
        || typeof job.created_at_ms !== 'number' || !Number.isSafeInteger(job.created_at_ms) || job.created_at_ms <= 0
        || typeof job.expected_source_bytes !== 'string' || !/^[1-9][0-9]*$/.test(job.expected_source_bytes)
        || BigInt(job.expected_source_bytes) > 5_000_000_000n
        || job.profile_id !== 'paid-media-livepeer-v1' || !livepeerSupportsProfile(job.profile_config_sha256)) {
        throw new Error('on_chain_job_mismatch');
    }
    const deadline = job.created_at_ms + PUBLIC_TESTNET_BETA_JOB_TTL_MS;
    if (!Number.isSafeInteger(deadline) || (requireUnexpired && job.status !== 'Published' && deadline <= Date.now())) {
        throw new Error('on_chain_job_mismatch');
    }
    return deadline;
}

export async function publicBetaRateLimitResponse(
    request: Request,
    env: Env,
    route: string,
): Promise<Response | null> {
    if (!env.PUBLIC_BETA_RATE_LIMITER) {
        return json({ error: 'runtime_not_configured' }, 503);
    }
    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
        || 'unknown';
    try {
        if (!(await env.PUBLIC_BETA_RATE_LIMITER.limit({ key: `${route}:ip:${ip}` })).success) {
            const response = json({ error: 'rate_limited' }, 429);
            response.headers.set('Retry-After', '60');
            return response;
        }
    } catch {
        return json({ error: 'runtime_not_configured' }, 503);
    }
    return null;
}

export async function enforcePublicBetaAccountRateLimit(
    env: Env,
    route: string,
    account: string,
): Promise<void> {
    if (!rateLimitedEnvironment(env)) return;
    if (!env.PUBLIC_BETA_RATE_LIMITER) throw new Error('runtime_not_configured');
    let outcome: RateLimitOutcome;
    try {
        outcome = await env.PUBLIC_BETA_RATE_LIMITER.limit({ key: `${route}:account:${account}` });
    } catch {
        throw new Error('runtime_not_configured');
    }
    if (!outcome.success) throw new Error('rate_limited');
}

export function publicBetaDeadlineExpired(record: JobRecord): boolean {
    return record.absoluteDeadlineAtMs !== undefined && record.absoluteDeadlineAtMs <= Date.now();
}

export async function requireActivePublicTestnetBetaForPlayback(env: Env): Promise<void> {
    if (isPublicTestnetEnvironment(env)) {
        await requirePublicUploadPolicy(env);
        return;
    }
    if (!isPublicBetaPacket(env)) return;
    const state = await readFinalPublicTestnetBetaState(env);
    if (!state
        || state.version !== 1
        || state.closed_at_ms !== null
        || !Number.isSafeInteger(Number(state.ends_at_ms))
        || Number(state.ends_at_ms) <= Date.now()) {
        throw new Error('playback_denied');
    }
}

export async function requirePublicTestnetBetaJob(
    input: UploadIntentRequest | UploadHeartbeatRequest,
    job: OnChainJob,
    marker: PublicTestnetBetaJob | null,
    state: PublicTestnetBetaState | null,
): Promise<void> {
    const now = Date.now();
    const request = {
        creator_id: job.creator_id,
        job_id: job.job_id,
        title: job.title,
        price_usdc: job.price_usdc,
        expected_source_bytes: job.expected_source_bytes,
        profile_id: job.profile_id,
        profile_config_sha256: job.profile_config_sha256,
        upload_public_key: job.upload_public_key,
        upload_key_expires_at_ms: job.upload_key_expires_at_ms,
    };
    const admittedAtMs = Number(marker?.admitted_at_ms);
    const deadlineAtMs = Number(marker?.deadline_at_ms);
    const endsAtMs = Number(state?.ends_at_ms);
    if (!marker
        || !state
        || state.version !== 1
        || state.closed_at_ms !== null
        || !Number.isSafeInteger(endsAtMs)
        || endsAtMs <= now
        || marker.creator_id !== input.envelope.account_id
        || marker.generation !== 1
        || input.body.generation !== 1
        || marker.sponsor_quote_id !== job.fee_quote_hash
        || marker.request_sha256 !== await sha256Hex(JSON.stringify(request))
        || !Number.isSafeInteger(admittedAtMs)
        || !Number.isSafeInteger(deadlineAtMs)
        || deadlineAtMs <= now
        || deadlineAtMs > admittedAtMs + PUBLIC_TESTNET_BETA_JOB_TTL_MS
        || deadlineAtMs > endsAtMs
        || BigInt(String(job.expected_source_bytes)) > PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES) {
        throw new Error('on_chain_job_mismatch');
    }
}
