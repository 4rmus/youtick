import type { Env } from './env';
import { ACCOUNT_ID_PATTERN, JOB_ID_PATTERN } from './constants';
import {
    formatLog,
    readJsonObject,
    requireExactKeys,
    errorStatus,
    safeErrorCode,
    json,
    withCors,
} from './helpers';

export const CREATOR_PENDING_UPLOAD_ROUTE = '/v1/creators/pending-upload';
const CREATOR_PENDING_UPLOAD_KEY = 'creator-pending-upload';

type CreatorPendingUploadRecord = {
    schema: 'youtick.creator-pending-upload.v1';
    creator: string;
    jobId: string;
    recordedAtMs: number;
};

// One object per creator keeps this index out of the sponsor relayer's bounded storage.
function creatorPendingUploadObject(env: Env, creator: string): DurableObjectStub {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    return env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName([
        'creator-pending-upload',
        env.NEAR_NETWORK,
        env.MARKET_CONTRACT_ID,
        creator,
    ].join(':')));
}

// A discovery hint for browsers that lost local recovery state. NEAR remains the job
// authority: callers verify the returned job on chain, and a failed write never fails a relay.
export async function rememberCreatorPaidJob(env: Env, creator: string, jobId: string): Promise<void> {
    try {
        const response = await creatorPendingUploadObject(env, creator).fetch(new Request(
            'https://object/internal/creator-pending-upload',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creator_id: creator, job_id: jobId }),
            },
        ));
        if (!response.ok) throw new Error('creator_pending_upload_record_failed');
    } catch (error) {
        console.error(formatLog('creator_pending_upload_record_failed', { code: safeErrorCode(error) }));
    }
}

export async function recordCreatorPendingUpload(state: DurableObjectState, request: Request): Promise<Response> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['creator_id', 'job_id'], 'invalid_creator_pending_upload');
    const creator = value.creator_id;
    const jobId = value.job_id;
    if (typeof creator !== 'string' || !ACCOUNT_ID_PATTERN.test(creator)
        || typeof jobId !== 'string' || !JOB_ID_PATTERN.test(jobId)) {
        throw new Error('invalid_creator_pending_upload');
    }
    const record: CreatorPendingUploadRecord = {
        schema: 'youtick.creator-pending-upload.v1',
        creator,
        jobId,
        recordedAtMs: Date.now(),
    };
    await state.storage.put(CREATOR_PENDING_UPLOAD_KEY, record);
    return json({ recorded: true });
}

export async function readCreatorPendingUpload(state: DurableObjectState, url: URL): Promise<Response> {
    const creator = url.searchParams.get('creator_id') || '';
    if (!ACCOUNT_ID_PATTERN.test(creator)) throw new Error('invalid_creator_pending_upload');
    const record = await state.storage.get<CreatorPendingUploadRecord>(CREATOR_PENDING_UPLOAD_KEY);
    return json({
        schema: 'youtick.creator-pending-upload.v1',
        creator_id: creator,
        job_id: record?.creator === creator ? record.jobId : null,
    });
}

export async function forwardCreatorPendingUpload(
    creator: string,
    env: Env,
    corsOrigin: string,
): Promise<Response> {
    try {
        if (!ACCOUNT_ID_PATTERN.test(creator)) throw new Error('invalid_creator_pending_upload');
        const object = creatorPendingUploadObject(env, creator);
        const response = await object.fetch(new Request(
            `https://object/internal/creator-pending-upload?creator_id=${encodeURIComponent(creator)}`,
        ));
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        return withCors(new Response(response.body, { status: response.status, headers }), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('creator_pending_upload_read_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}
