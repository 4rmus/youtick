import { dependencyFetch } from './dependency-fetch';
import type { Env } from './env';
import type {
    JsonObject,
    OnChainJob,
    PublicTestnetBetaJob,
    PublicTestnetBetaState,
    FinalizePublication,
} from './types';
import { ACCOUNT_ID_PATTERN } from './constants';
import { requireObject, isHttpsUrl, bytesToBase64 } from './helpers';

type FinalJob = { job: OnChainJob; blockHash: string };
const SPONSORED_UPLOAD_FINAL_BLOCK_MAX_AGE_MS = 60_000;

export async function readFinalBlock(env: Env): Promise<{ height: number; timestampMs: number }> {
    const payload = await nearRpcRaw(env, 'block', { finality: 'final' });
    const result = requireObject(payload.result, 'near_finalize_pending');
    const header = requireObject(result.header, 'near_finalize_pending');
    if (typeof header.height !== 'number'
        || !Number.isSafeInteger(header.height)
        || header.height < 1
        || typeof header.timestamp_nanosec !== 'string'
        || !/^[1-9][0-9]{0,29}$/.test(header.timestamp_nanosec)) {
        throw new Error('near_finalize_pending');
    }
    const timestampMsBig = BigInt(header.timestamp_nanosec) / 1_000_000n;
    if (timestampMsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('near_finalize_pending');
    }
    const timestampMs = Number(timestampMsBig);
    const now = Date.now();
    if (timestampMs > now || now - timestampMs > SPONSORED_UPLOAD_FINAL_BLOCK_MAX_AGE_MS) {
        throw new Error('near_finalize_pending');
    }
    return { height: header.height, timestampMs };
}

export async function readFinalMediaJob(env: Env, jobId: string): Promise<FinalJob> {
    if (!isHttpsUrl(env.NEAR_RPC_URL) || !ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')) {
        throw new Error('runtime_not_configured');
    }
    let response: Response;
    let payload: { result?: { result?: number[]; block_hash?: unknown }; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'get_media_job', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'paid-media-livepeer-v1-job',
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: env.MARKET_CONTRACT_ID,
                    method_name: 'get_media_job',
                    args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ job_id: jobId }))),
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('near_job_query_failed');
    }
    if (!response.ok
        || payload.error
        || !Array.isArray(payload.result?.result)
        || typeof payload.result.block_hash !== 'string') {
        throw new Error('near_job_query_failed');
    }
    const raw = new TextDecoder().decode(new Uint8Array(payload.result.result));
    let job: unknown;
    try {
        job = raw ? JSON.parse(raw) as unknown : null;
    } catch {
        throw new Error('near_job_response_invalid');
    }
    if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('near_job_not_found');
    return { job: job as OnChainJob, blockHash: payload.result.block_hash };
}

export async function readFinalPublicTestnetBetaJob(
    env: Env,
    jobId: string,
): Promise<PublicTestnetBetaJob | null> {
    const value = await readFinalPublicTestnetBetaView(
        env,
        'get_public_testnet_beta_job',
        { job_id: jobId },
    );
    return value === null
        ? null
        : requireObject(value, 'near_job_response_invalid') as PublicTestnetBetaJob;
}

export async function readFinalPublicTestnetBetaState(env: Env): Promise<PublicTestnetBetaState | null> {
    const value = await readFinalPublicTestnetBetaView(
        env,
        'get_public_testnet_beta_state',
        {},
    );
    return value === null
        ? null
        : requireObject(value, 'near_job_response_invalid') as PublicTestnetBetaState;
}

export async function hasFinalPublicTestnetBetaJobToday(env: Env, creatorId: string): Promise<boolean> {
    const value = await readFinalPublicTestnetBetaView(
        env,
        'has_public_testnet_beta_job_today',
        { creator_id: creatorId },
    );
    if (typeof value !== 'boolean') throw new Error('near_job_response_invalid');
    return value;
}

export async function readFinalPublicTestnetBetaView(
    env: Env,
    methodName: string,
    args: JsonObject,
): Promise<unknown> {
    const payload = await nearRpc(env, {
        request_type: 'call_function',
        finality: 'final',
        account_id: env.MARKET_CONTRACT_ID,
        method_name: methodName,
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(args))),
    });
    const result = requireObject(payload.result, 'near_job_query_failed');
    if (!Array.isArray(result.result)) throw new Error('near_job_query_failed');
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result as number[])));
    } catch {
        throw new Error('near_job_response_invalid');
    }
    return value;
}

export async function readFinalAccessKey(
    env: Env,
    accountId: string,
    publicKey: string,
): Promise<{ permission: 'FullAccess' | JsonObject }> {
    let response: Response;
    let payload: { result?: { permission?: unknown }; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'device_certificate_key', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'youtick-device-certificate-key',
                method: 'query',
                params: {
                    request_type: 'view_access_key',
                    finality: 'final',
                    account_id: accountId,
                    public_key: publicKey,
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('playback_authorization_unavailable');
    }
    if (!response.ok) throw new Error('playback_authorization_unavailable');
    if (payload.error) {
        const detail = JSON.stringify(payload.error);
        throw new Error(/UNKNOWN_ACCESS_KEY|does not exist|not found/i.test(detail)
            ? 'playback_denied'
            : 'playback_authorization_unavailable');
    }
    if (payload.result?.permission !== 'FullAccess') throw new Error('playback_denied');
    return { permission: 'FullAccess' };
}

export async function nearPlaybackView(
    env: Env,
    contractId: string,
    methodName: string,
    args: JsonObject,
    blockId?: string,
): Promise<{ value: unknown; blockHash: string }> {
    let response: Response;
    let payload: { result?: { result?: number[]; block_hash?: unknown }; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'playback_authorization', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `paid-media-livepeer-v1-playback-${methodName}`,
                method: 'query',
                params: {
                    request_type: 'call_function',
                    ...(blockId ? { block_id: blockId } : { finality: 'final' }),
                    account_id: contractId,
                    method_name: methodName,
                    args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(args))),
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('playback_authorization_unavailable');
    }
    if (!response.ok
        || payload.error
        || !Array.isArray(payload.result?.result)
        || typeof payload.result.block_hash !== 'string'
        || (blockId && payload.result.block_hash !== blockId)) {
        throw new Error('playback_authorization_unavailable');
    }
    const raw = new TextDecoder().decode(new Uint8Array(payload.result.result));
    try {
        return {
            value: raw ? JSON.parse(raw) as unknown : null,
            blockHash: payload.result.block_hash,
        };
    } catch {
        throw new Error('playback_authorization_unavailable');
    }
}

export async function finalTicketStatus(env: Env, ticketId: string): Promise<string | null> {
    const { value } = await nearPlaybackView(env, env.MARKET_CONTRACT_ID!, 'get_ticket', { ticket_id: ticketId });
    if (value === null) return null;
    const ticket = requireObject(value, 'playback_authorization_unavailable');
    if (typeof ticket.status !== 'string') throw new Error('playback_authorization_unavailable');
    return ticket.status;
}

export async function sendTransaction(env: Env, signedTxBase64: string): Promise<'sent' | 'invalid_nonce' | 'failed' | 'unknown'> {
    const payload = await nearRpcRaw(env, 'send_tx', {
        signed_tx_base64: signedTxBase64,
        wait_until: 'FINAL',
    });
    if (payload.error) return classifyNearError(payload.error);
    const result = requireObject(payload.result, 'near_finalize_pending');
    const status = result.status;
    if (status && typeof status === 'object' && !Array.isArray(status) && 'Failure' in status) {
        return 'failed';
    }
    return 'sent';
}

export async function queryTransaction(env: Env, txHash: string): Promise<'sent' | 'invalid_nonce' | 'failed' | 'unknown'> {
    return queryTransactionForAccount(env, txHash, env.NEAR_OPERATOR_ACCOUNT_ID!);
}

export async function queryTransactionForAccount(
    env: Env,
    txHash: string,
    senderAccountId: string,
): Promise<'sent' | 'invalid_nonce' | 'failed' | 'unknown'> {
    const payload = await nearRpcRaw(env, 'tx', {
        tx_hash: txHash,
        sender_account_id: senderAccountId,
        wait_until: 'FINAL',
    });
    if (payload.error) return classifyNearError(payload.error);
    const result = requireObject(payload.result, 'near_finalize_pending');
    const status = result.status;
    if (status && typeof status === 'object' && !Array.isArray(status) && 'Failure' in status) {
        return 'failed';
    }
    return 'sent';
}

function classifyNearError(error: unknown): 'invalid_nonce' | 'failed' | 'unknown' {
    const value = JSON.stringify(error);
    // INVALID_TRANSACTION is NEAR's generic class (signature, balance, action errors); only its InvalidNonce cause is a nonce race.
    if (/InvalidNonce|EXPIRED_TRANSACTION/i.test(value)) return 'invalid_nonce';
    if (/UNKNOWN_TRANSACTION|TIMEOUT_ERROR|timeout/i.test(value)) return 'unknown';
    return 'failed';
}

export async function finalPublicationMatches(env: Env, submission: FinalizePublication): Promise<boolean> {
    const value = await readFinalPublication(env, submission);
    if (!value) return false;
    if (!publicationMatches(submission, value)) throw new Error('near_finalize_mismatch');
    return true;
}

export async function readFinalPublication(
    env: Env,
    submission: FinalizePublication,
): Promise<JsonObject | null> {
    return readFinalPublicationById(env, submission.job_id);
}

export async function finalPublicationSalesSuspended(env: Env, publicationId: string): Promise<boolean> {
    const publication = await readFinalPublicationById(env, publicationId);
    return publication?.publication_id === publicationId
        && ['SALES_SUSPENDED', 'TAKEDOWN'].includes(String(publication.availability));
}

export async function readFinalPublicationById(env: Env, publicationId: string): Promise<JsonObject | null> {
    const payload = await nearRpc(env, {
        request_type: 'call_function',
        finality: 'final',
        account_id: env.MARKET_CONTRACT_ID,
        method_name: 'get_publication',
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({
            publication_id: publicationId,
        }))),
    });
    const result = requireObject(payload.result, 'near_finalize_pending');
    if (!Array.isArray(result.result)) throw new Error('near_finalize_pending');
    const raw = new TextDecoder().decode(new Uint8Array(result.result as number[]));
    if (!raw || raw === 'null') return null;
    let publication: unknown;
    try {
        publication = JSON.parse(raw);
    } catch {
        throw new Error('near_finalize_mismatch');
    }
    return requireObject(publication, 'near_finalize_mismatch');
}

export function publicationMatches(submission: FinalizePublication, value: JsonObject): boolean {
    return value.publication_id === submission.job_id
        && value.creator_id === submission.creator_id
        && value.generation === submission.generation
        && value.expected_source_bytes === submission.expected_source_bytes
        && value.profile_id === submission.profile_id
        && value.profile_config_sha256 === submission.profile_config_sha256
        && value.asset_id_hash === submission.asset_id_hash
        && value.playback_id === submission.playback_id
        && value.project_id_hash === submission.project_id_hash
        && value.verified_source_bytes === submission.verified_source_bytes
        && value.provider_source_fingerprint === submission.provider_source_fingerprint
        && value.ready_at_ms === submission.ready_at_ms
        && value.published_availability === submission.availability;
}

export async function nearRpc(env: Env, params: JsonObject): Promise<JsonObject> {
    const payload = await nearRpcRaw(env, 'query', params);
    if (payload.error) throw new Error('near_finalize_pending');
    return payload;
}

export async function nearRpcRaw(env: Env, method: string, params: unknown): Promise<JsonObject> {
    let response: Response;
    try {
        response = await dependencyFetch(
            'near_rpc',
            method === 'send_tx' ? 'operator_broadcast' : 'operator_query',
            env.NEAR_RPC_URL!,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: `paid-media-livepeer-v1-${method}`, method, params }),
                signal: AbortSignal.timeout(5_000),
            },
        );
    } catch {
        throw new Error('near_finalize_pending');
    }
    if (!response.ok) throw new Error('near_finalize_pending');
    try {
        return requireObject(await response.json(), 'near_finalize_pending');
    } catch {
        throw new Error('near_finalize_pending');
    }
}
