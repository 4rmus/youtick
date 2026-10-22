// V2 upload through NEAR Auth (roadmap E5b.4). A creator who signed in with Google or a passkey
// has no wallet; the two upload steps that need the account's signature go through one approval
// each on the NEAR Auth screen, which the relayer turns into an MPC signature and relays:
// - the upload fee: USDC `ft_transfer_call` to Market V2 with a plain `create_paid_job` message
//   (protocol/youtick-market-v2 `upload_msg`: no sponsor quote, no playback session);
// - `replace_upload_key` when the per-job upload key is lost.
// Every other step (preflight, intent, tus upload, heartbeat) is signed by the per-job upload key
// and reuses lib/livepeer-upload unchanged. The job is confirmed only by `get_media_job` on chain.
import { KeyPair, PublicKey, actions, buildDelegateAction, encodeDelegateAction } from 'near-api-js';
import profiles from '../../../../protocol/paid-media-livepeer-v1/profiles.json';
import { hasTitleContent } from '../../../../protocol/paid-media-livepeer-v1/title';
import { requestDelegateApproval, type OidcEnvironment, type PopupLike } from '../near-auth/oidc';
import { V2_MEDIA_CONFIG, type V2MediaProfile } from '../constants';
import {
    STREAM_PROFILE_HASH,
    livepeerUploadFeeUsdc,
    loadLivepeerJobSessionKey,
    persistLivepeerJobSessionKey,
    readLivepeerUploadDraft,
    requestLivepeerUploadIntent,
    setUploadDraftFlag,
    validateJobSessionIdentity,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    type LivepeerUploadIntent,
    type LivepeerUploadStatus,
} from '../livepeer-upload';
import type { V2Config } from './config';
import type { ViewContract } from './tickets';

/**
 * Market V2 profile id (protocol/youtick-market-v2 `upload_msg`); must match
 * workers/relayer/src/upload.ts `UPLOAD_PROFILE_ID`. The V1 path keeps its own id.
 */
export const PROFILE_ID = 'paid-media-v1';
/** Must match workers/relayer/src/upload.ts: the relayer rebuilds these exact bytes. */
export const UPLOAD_GAS = 100_000_000_000_000n;
export const UPLOAD_DEPOSIT = 1n;
export const UPLOAD_KEY_GAS = 100_000_000_000_000n;
export const UPLOAD_KEY_DEPOSIT = 0n;
/** Blocks the approval stays valid for; the relayer accepts at most 1,200. */
export const DELEGATE_TTL_BLOCKS = 600n;
/** Market V2 refuses a lower ticket price. */
export const MIN_TICKET_PRICE_USDC = 5_000_000n;
/** How long a fresh upload key stays valid; the Bridge's upload window is shorter. */
export const UPLOAD_KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE_BYTES = 200;
const MAX_SOURCE_BYTES = 20_000_000_000n;
/**
 * How long /studio waits for processing and the on-chain publication once the source is sent;
 * the job stays resumable past it. No M0-P7 run (processing time by source length) exists yet:
 * the media-account dashboard import of a 10 s 1080p source was ready in 13 s, and the spike's
 * long sources reached ready at 33-64 % of their encode, so the wait is sized generously.
 */
export const PROCESSING_WAIT_MS = 30 * 60 * 1000;
export const PROCESSING_POLL_MS = 5_000;

/**
 * Profile config hash a new V2 job is paid under (`NEXT_PUBLIC_V2_MEDIA_PROFILE`): the legacy
 * profile by default, the Stream descriptor hash with `stream`. The profile id stays `PROFILE_ID`.
 */
export function v2UploadProfileHash(profile: V2MediaProfile = V2_MEDIA_CONFIG.profile): string {
    return profile === 'stream' ? STREAM_PROFILE_HASH : profiles.legacy.hash;
}

/**
 * A Stream-profile fee is paid only while the Bridge reports its Stream adapter configured
 * (`/__health` `streamConfigured`); anything else stops before the approval, so no fee is taken.
 */
async function requireStreamConfigured(fetcher: typeof fetch, bridgeUrl: string): Promise<void> {
    let value: Record<string, unknown> = {};
    try {
        const response = await fetcher(`${bridgeUrl}/__health`, {
            method: 'GET', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) value = await response.json().catch(() => ({})) as Record<string, unknown>;
    } catch {
        // Unreachable counts as not configured.
    }
    if (value.streamConfigured !== true) throw new UploadError('media_provider_not_ready');
}

export interface UploadArgs {
    receiver_id: string;
    amount: string;
    msg: string;
}

export interface UploadKeyArgs {
    job_id: string;
    new_public_key: string;
    expires_at_ms: string;
}

export interface MediaJobView {
    job_id: string;
    creator_id: string;
    title: string;
    price_usdc: string;
    expected_source_bytes: string;
    profile_id: string;
    profile_config_sha256: string;
    status: string;
    upload_public_key: string;
    upload_key_expires_at_ms: string;
    fee_asset: string;
}

export interface UploadDeps {
    view: ViewContract;
    /** Final-state access key of the user's account: nonce and the block height it was read at. */
    accessKey: (accountId: string, publicKey: string) => Promise<{ nonce: bigint; blockHeight: bigint }>;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    oidc?: OidcEnvironment;
    randomNonce?: () => string;
}

export class UploadError extends Error {}

/** The `create_paid_job` message with its keys in protocol order; the relayer refuses any other. */
export function buildUploadMessage(input: {
    jobId: string; title: string; priceUsdc: string; expectedSourceBytes: string; profileConfigSha256: string;
    uploadPublicKey: string; uploadKeyExpiresAtMs: string;
}): string {
    const title = input.title.trim();
    if (!hasTitleContent(title) || new TextEncoder().encode(title).length > MAX_TITLE_BYTES || /[\p{Cc}]/u.test(title)) {
        throw new UploadError('invalid_title');
    }
    if (!/^[1-9][0-9]{0,38}$/.test(input.priceUsdc) || BigInt(input.priceUsdc) < MIN_TICKET_PRICE_USDC) throw new UploadError('invalid_ticket_price');
    if (!/^[1-9][0-9]{0,19}$/.test(input.expectedSourceBytes) || BigInt(input.expectedSourceBytes) > MAX_SOURCE_BYTES) {
        throw new UploadError('source_limit_exceeded');
    }
    if (!/^[0-9a-f]{64}$/.test(input.profileConfigSha256) || !/^[1-9][0-9]{0,19}$/.test(input.uploadKeyExpiresAtMs)) throw new UploadError('upload_invalid');
    return JSON.stringify({
        action: 'create_paid_job',
        job_id: input.jobId,
        title,
        price_usdc: input.priceUsdc,
        expected_source_bytes: input.expectedSourceBytes,
        profile_id: PROFILE_ID,
        profile_config_sha256: input.profileConfigSha256,
        upload_public_key: input.uploadPublicKey,
        upload_key_expires_at_ms: input.uploadKeyExpiresAtMs,
    });
}

function delegateBytes(input: {
    senderId: string; receiverId: string; publicKey: string; nonce: bigint; maxBlockHeight: bigint;
    method: string; args: object; gas: bigint; deposit: bigint;
}): Uint8Array {
    return encodeDelegateAction(buildDelegateAction({
        senderId: input.senderId,
        receiverId: input.receiverId,
        publicKey: PublicKey.fromString(input.publicKey),
        nonce: input.nonce,
        maxBlockHeight: input.maxBlockHeight,
        actions: [actions.functionCall(input.method, { ...input.args }, input.gas, input.deposit)],
    }));
}

export function uploadDelegateBytes(input: {
    senderId: string; publicKey: string; usdcContractId: string; args: UploadArgs; nonce: bigint; maxBlockHeight: bigint;
}): Uint8Array {
    return delegateBytes({
        senderId: input.senderId, receiverId: input.usdcContractId, publicKey: input.publicKey, nonce: input.nonce,
        maxBlockHeight: input.maxBlockHeight, method: 'ft_transfer_call', args: input.args, gas: UPLOAD_GAS, deposit: UPLOAD_DEPOSIT,
    });
}

export function uploadKeyDelegateBytes(input: {
    senderId: string; publicKey: string; marketContractId: string; args: UploadKeyArgs; nonce: bigint; maxBlockHeight: bigint;
}): Uint8Array {
    return delegateBytes({
        senderId: input.senderId, receiverId: input.marketContractId, publicKey: input.publicKey, nonce: input.nonce,
        maxBlockHeight: input.maxBlockHeight, method: 'replace_upload_key', args: input.args, gas: UPLOAD_KEY_GAS, deposit: UPLOAD_KEY_DEPOSIT,
    });
}

async function postJson(fetcher: typeof fetch, url: string, body: unknown): Promise<{ status: number; value: Record<string, unknown> }> {
    let response: Response;
    try {
        response = await fetcher(url, {
            method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
        });
    } catch {
        throw new UploadError('relayer_unavailable');
    }
    const value = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, value };
}

function errorCode(value: Record<string, unknown>, fallback: string): string {
    return typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error) ? value.error : fallback;
}

function toUploadError(error: unknown): UploadError {
    if (error instanceof UploadError) return error;
    return new UploadError(error instanceof Error && /^[a-z_]{1,64}$/.test(error.message) ? error.message : 'upload_failed');
}

interface Session {
    accountId: string;
    publicKey: string;
}

interface RelayInput {
    config: V2Config;
    session: Session;
    popup: PopupLike;
    redirectUri: string;
    deps: UploadDeps;
    path: '/v1/uploads' | '/v1/upload-keys';
    /** Codes the relayer answers when the chain already holds the result; the caller then only confirms. */
    alreadyDone: readonly string[];
}

/**
 * One NEAR Auth approval of `bytes`, relayed through the relayer route. The signing token is sent
 * once: it expires within about a minute, and the user's nonce moves once the relay lands, so a
 * pending relay is followed by its id on the status route. Resolves with `relayed` or `exists`.
 */
async function relayApproval(input: RelayInput, bytes: Uint8Array, fields: { nonce: bigint; maxBlockHeight: bigint; args: object }): Promise<'relayed' | 'exists'> {
    const { config, deps } = input;
    const fetcher = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const accessToken = await requestDelegateApproval(input.popup, {
        issuer: config.auth.provider.issuer, clientId: config.auth.clientId, redirectUri: input.redirectUri,
        nonce: deps.randomNonce?.() ?? crypto.randomUUID(), audience: config.auth.provider.signingAudience, delegateBytes: bytes,
    }, deps.oidc);
    let relayed = await postJson(fetcher, `${config.relayerUrl}${input.path}`, {
        access_token: accessToken, args: fields.args, nonce: fields.nonce.toString(), max_block_height: fields.maxBlockHeight.toString(),
    });
    if (input.alreadyDone.includes(errorCode(relayed.value, ''))) return 'exists';
    const uploadId = relayed.value.uploadId;
    for (let attempt = 0; relayed.status !== 200; attempt += 1) {
        if (relayed.status !== 202 || typeof uploadId !== 'string' || !/^[0-9a-f]{64}$/.test(uploadId) || attempt >= 20) {
            throw new UploadError(errorCode(relayed.value, 'upload_pending'));
        }
        await sleep(3_000);
        relayed = await postJson(fetcher, `${config.relayerUrl}/v1/uploads/status`, { upload_id: uploadId });
    }
    return 'relayed';
}

async function readJob(deps: UploadDeps, marketContractId: string, jobId: string): Promise<MediaJobView | null> {
    return deps.view<MediaJobView | null>(marketContractId, 'get_media_job', { job_id: jobId });
}

/** Polls final state until the job carries `uploadPublicKey` for this creator. */
async function confirmUploadKey(deps: UploadDeps, marketContractId: string, accountId: string, jobId: string, uploadPublicKey: string): Promise<MediaJobView> {
    const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const job = await readJob(deps, marketContractId, jobId).catch(() => null);
        if (job && job.creator_id === accountId && job.upload_public_key === uploadPublicKey) return job;
        await sleep(2_000);
    }
    throw new UploadError('upload_not_confirmed');
}

/**
 * Pays the upload fee for a new job and returns the per-job upload public key. The relayer is
 * asked only after the chain shows no job under this id; an identical authorized job is reused,
 * a job whose upload key is lost needs `prepareV2UploadResume`.
 */
export async function authorizeV2PaidJob(input: {
    config: V2Config;
    usdcContractId: string;
    session: Session;
    jobId: string;
    title: string;
    priceUsdc: string;
    expectedSourceBytes: number;
    popup: PopupLike;
    redirectUri: string;
    deps: UploadDeps;
    signal?: AbortSignal;
}): Promise<string> {
    const { config, session, deps } = input;
    const now = deps.now ?? (() => Date.now());
    const closePopup = () => { if (!input.popup.closed) input.popup.close(); };
    try {
        input.signal?.throwIfAborted();
        validateJobSessionIdentity(session.accountId, input.jobId);
        const existing = loadLivepeerJobSessionKey(session.accountId, input.jobId);
        const keyPair = existing?.keyPair ?? KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();
        const uploadKeyExpiresAtMs = existing?.uploadKeyExpiresAtMs ?? String(now() + UPLOAD_KEY_LIFETIME_MS);
        const expectedSourceBytes = String(input.expectedSourceBytes);
        const mediaProfile = V2_MEDIA_CONFIG.profile;
        const msg = buildUploadMessage({
            jobId: input.jobId, title: input.title, priceUsdc: input.priceUsdc, expectedSourceBytes,
            profileConfigSha256: v2UploadProfileHash(mediaProfile), uploadPublicKey: publicKey, uploadKeyExpiresAtMs,
        });
        const onChain = await readJob(deps, config.marketContractId, input.jobId);
        if (onChain) {
            if (onChain.creator_id !== session.accountId) throw new UploadError('livepeer_paid_job_conflict');
            if (onChain.upload_public_key === publicKey && onChain.status === 'Authorized') {
                closePopup();
                return publicKey;
            }
            // Same job, lost or expired key: the resume path replaces the key instead of paying again.
            throw new UploadError('livepeer_resume_required');
        }
        const args: UploadArgs = { receiver_id: config.marketContractId, amount: livepeerUploadFeeUsdc(input.expectedSourceBytes), msg };
        if (mediaProfile === 'stream') {
            await requireStreamConfigured(deps.fetch ?? ((...request: Parameters<typeof fetch>) => fetch(...request)), config.bridgeUrl);
        }
        const key = await deps.accessKey(session.accountId, session.publicKey);
        const nonce = key.nonce + 1n;
        const maxBlockHeight = key.blockHeight + DELEGATE_TTL_BLOCKS;
        const bytes = uploadDelegateBytes({ senderId: session.accountId, publicKey: session.publicKey, usdcContractId: input.usdcContractId, args, nonce, maxBlockHeight });
        // The key is kept before the approval, so a closed tab can still finish the upload it paid for.
        if (!existing) persistLivepeerJobSessionKey(session.accountId, input.jobId, keyPair, uploadKeyExpiresAtMs);
        input.signal?.throwIfAborted();
        await relayApproval({ config, session, popup: input.popup, redirectUri: input.redirectUri, deps, path: '/v1/uploads', alreadyDone: ['job_exists'] },
            bytes, { nonce, maxBlockHeight, args });
        // The relay landed; only the chain says whether the Market created the job or refunded the fee.
        await confirmUploadKey(deps, config.marketContractId, session.accountId, input.jobId, publicKey);
        return publicKey;
    } catch (error) {
        closePopup();
        throw toUploadError(error);
    }
}

/** Bridge job states in which the source is still expected from this client. */
const UPLOADABLE_STATES = ['UPLOAD_READY', 'UPLOADING'];
/** Bridge job states that end an upload; a new job (and a new fee) is the only way forward. */
export const TERMINAL_UPLOAD_STATES = ['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED', 'AUTO_CLOSED'];

/**
 * Resumes an upload whose fee was paid: replaces the upload key through the relayer when this tab
 * no longer holds it (or it expired), reads the Bridge's job state (`recovery: 'reconcile'`), and
 * asks for the upload intent again only while the Bridge still expects the source. The V2 Bridge
 * has no `recovery: 'resume'` path (that is the public-testnet lease recovery), so a job past the
 * upload comes back as a status for the caller to wait on. `popup` is used only when a key must be
 * replaced and is closed otherwise.
 */
export async function prepareV2UploadResume(input: {
    config: V2Config;
    session: Session;
    jobId: string;
    file: File;
    popup: PopupLike;
    redirectUri: string;
    deps: UploadDeps;
    signal?: AbortSignal;
}): Promise<LivepeerUploadIntent | LivepeerUploadStatus> {
    const { config, session, deps } = input;
    const now = deps.now ?? (() => Date.now());
    const closePopup = () => { if (!input.popup.closed) input.popup.close(); };
    try {
        input.signal?.throwIfAborted();
        validateJobSessionIdentity(session.accountId, input.jobId);
        const draft = await readLivepeerUploadDraft(session.accountId, input.file);
        if (!draft || draft.jobId !== input.jobId) throw new UploadError('livepeer_resume_file_mismatch');
        const source = validateLivepeerSourceFile(input.file);
        if (!source.ok) throw new UploadError(source.error);
        const job = await readJob(deps, config.marketContractId, input.jobId);
        if (!job) throw new UploadError('livepeer_job_missing');
        if (job.creator_id !== session.accountId) throw new UploadError('livepeer_job_creator_mismatch');
        if (job.status !== 'Authorized') throw new UploadError('livepeer_already_published');
        let current = loadLivepeerJobSessionKey(session.accountId, input.jobId);
        if (current?.keyPair.getPublicKey().toString() !== job.upload_public_key || Number(job.upload_key_expires_at_ms) <= now()) {
            const keyPair = KeyPair.fromRandom('ed25519');
            const publicKey = keyPair.getPublicKey().toString();
            const expiresAtMs = String(now() + UPLOAD_KEY_LIFETIME_MS);
            const args: UploadKeyArgs = { job_id: input.jobId, new_public_key: publicKey, expires_at_ms: expiresAtMs };
            const key = await deps.accessKey(session.accountId, session.publicKey);
            const nonce = key.nonce + 1n;
            const maxBlockHeight = key.blockHeight + DELEGATE_TTL_BLOCKS;
            const bytes = uploadKeyDelegateBytes({ senderId: session.accountId, publicKey: session.publicKey, marketContractId: config.marketContractId, args, nonce, maxBlockHeight });
            persistLivepeerJobSessionKey(session.accountId, input.jobId, keyPair, expiresAtMs);
            writeLivepeerUploadDraft(session.accountId, { ...draft, keyReplacementPending: true });
            input.signal?.throwIfAborted();
            await relayApproval({ config, session, popup: input.popup, redirectUri: input.redirectUri, deps, path: '/v1/upload-keys', alreadyDone: [] },
                bytes, { nonce, maxBlockHeight, args });
            await confirmUploadKey(deps, config.marketContractId, session.accountId, input.jobId, publicKey);
            current = loadLivepeerJobSessionKey(session.accountId, input.jobId);
            if (!current) throw new UploadError('livepeer_session_key_missing');
        } else {
            closePopup();
        }
        setUploadDraftFlag(session.accountId, input.jobId, 'keyReplacementPending', false);
        input.signal?.throwIfAborted();
        const intent = {
            accountId: session.accountId, jobId: input.jobId, generation: 1, expectedSourceBytes: input.file.size,
            sourceType: source.sourceType, sourceFingerprintSha256: draft.sourceFingerprintSha256, signal: input.signal,
            // The job keeps the hash it was paid under, whatever this build's media profile is.
            profileId: PROFILE_ID, profileConfigSha256: job.profile_config_sha256,
        };
        const status = await requestLivepeerUploadIntent({ ...intent, recovery: 'reconcile' });
        if (!UPLOADABLE_STATES.includes(status.state)) return status;
        return await requestLivepeerUploadIntent(intent);
    } catch (error) {
        closePopup();
        throw toUploadError(error);
    }
}
