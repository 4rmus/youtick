import { Upload, type DetailedError, type PreviousUpload } from 'tus-js-client';
import { APP_CONFIG, FEATURE_FLAGS, MEDIA_UPLOAD_POLICY, NEAR_CONFIG } from '@/lib/constants';
import { base64Encode, hexEncode } from '@/lib/crypto/codec';
import { getActiveUploadSessionKey } from '@/lib/upload-session-manager';

const LIVEPEER_TUS_ORIGIN = 'https://origin.livepeer.com';
const PROFILE_ID = 'paid-media-livepeer-v1';
const PROFILE_CONFIG_SHA256 = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';

export type LivepeerUploadIntent = {
    schema: 'youtick.livepeer-upload-intent.v1';
    job_id: string;
    generation: number;
    expected_source_bytes: string;
    chunk_bytes: number;
    tus_endpoint: string;
    created: boolean;
};

export async function requestLivepeerUploadIntent(input: {
    accountId: string;
    jobId: string;
    generation: number;
    expectedSourceBytes: number;
}): Promise<LivepeerUploadIntent> {
    requireFeature();
    if (!Number.isSafeInteger(input.expectedSourceBytes)
        || input.expectedSourceBytes < 1
        || input.expectedSourceBytes > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes) {
        throw new Error('source_limit_exceeded');
    }
    const keyPair = getActiveUploadSessionKey(input.accountId);
    if (!keyPair) throw new Error('livepeer_session_key_missing');
    const route = '/v1/upload-intents';
    const origin = browserOrigin();
    const body = {
        job_id: input.jobId,
        generation: input.generation,
        expected_source_bytes: String(input.expectedSourceBytes),
        profile_id: PROFILE_ID,
        profile_config_sha256: PROFILE_CONFIG_SHA256,
    };
    const bodySha256 = await sha256Hex(canonicalJson(body));
    const envelope = {
        domain: 'youtick.paid-media-livepeer-v1.control',
        version: '1',
        method: 'POST',
        route,
        network: NEAR_CONFIG.networkId,
        contract_id: NEAR_CONFIG.marketContractId,
        account_id: input.accountId,
        resource: `job:${input.jobId}:${input.generation}`,
        session_public_key: keyPair.getPublicKey().toString(),
        origin,
        device_nonce: randomNonce(),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: bodySha256,
    };
    const signature = base64Encode(
        keyPair.sign(new TextEncoder().encode(canonicalControlMessage(envelope))).signature,
    );
    const response = await fetch(bridgeRoute(route), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Youtick-Signature': signature,
        },
        body: JSON.stringify({ body, envelope }),
        cache: 'no-store',
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string' ? value.error : `livepeer_control_http_${response.status}`);
    }
    return parseIntent(value, input);
}

export async function uploadLivepeerSource(
    file: File,
    intent: LivepeerUploadIntent,
    options?: {
        signal?: AbortSignal;
        onProgress?: (uploadedBytes: number, totalBytes: number) => void;
    },
): Promise<void> {
    requireFeature();
    validateUpload(file, intent);
    if (options?.signal?.aborted) throw new Error('livepeer_upload_aborted');

    let resolveUpload!: () => void;
    let rejectUpload!: (error: Error) => void;
    const completion = new Promise<void>((resolve, reject) => {
        resolveUpload = resolve;
        rejectUpload = reject;
    });
    const upload = new Upload(file, {
        endpoint: intent.tus_endpoint,
        chunkSize: MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes,
        fingerprint: async () => [
            'youtick-livepeer-v1',
            intent.job_id,
            intent.generation,
            file.name,
            file.type,
            file.size,
            file.lastModified,
            await sha256Hex(intent.tus_endpoint),
        ].join(':'),
        metadata: { filename: file.name, filetype: file.type },
        retryDelays: [0, 1000, 3000],
        removeFingerprintOnSuccess: true,
        storeFingerprintForResuming: true,
        onProgress: options?.onProgress,
        onShouldRetry: (error) => shouldRetry(error),
        onError: (error) => rejectUpload(new Error(
            errorStatus(error) === 409 ? 'livepeer_offset_conflict' : 'livepeer_upload_failed',
        )),
        onSuccess: () => resolveUpload(),
    });
    const abort = () => {
        void upload.abort(false).finally(() => rejectUpload(new Error('livepeer_upload_aborted')));
    };
    options?.signal?.addEventListener('abort', abort, { once: true });
    try {
        const previous = await upload.findPreviousUploads();
        if (previous.length > 1) throw new Error('livepeer_resume_ambiguous');
        if (previous.length === 1) {
            validatePreviousUpload(previous[0], file.size);
            upload.resumeFromPreviousUpload(previous[0]);
        }
        upload.start();
        await completion;
    } finally {
        options?.signal?.removeEventListener('abort', abort);
    }
}

function parseIntent(value: Record<string, unknown>, expected: {
    jobId: string;
    generation: number;
    expectedSourceBytes: number;
}): LivepeerUploadIntent {
    if (value.schema !== 'youtick.livepeer-upload-intent.v1'
        || value.job_id !== expected.jobId
        || value.generation !== expected.generation
        || value.expected_source_bytes !== String(expected.expectedSourceBytes)
        || value.chunk_bytes !== MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes
        || typeof value.tus_endpoint !== 'string'
        || !isLivepeerTusUrl(value.tus_endpoint)
        || typeof value.created !== 'boolean') {
        throw new Error('invalid_livepeer_upload_intent');
    }
    return value as LivepeerUploadIntent;
}

function validateUpload(file: File, intent: LivepeerUploadIntent): void {
    if (!Number.isSafeInteger(file.size)
        || file.size < 1
        || file.size > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes
        || String(file.size) !== intent.expected_source_bytes
        || intent.chunk_bytes !== MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes
        || !isLivepeerTusUrl(intent.tus_endpoint)) {
        throw new Error('invalid_livepeer_upload');
    }
}

function validatePreviousUpload(previous: PreviousUpload, expectedBytes: number): void {
    if (previous.size !== expectedBytes
        || !previous.uploadUrl
        || !isLivepeerTusUrl(previous.uploadUrl)) {
        throw new Error('invalid_livepeer_resume');
    }
}

function shouldRetry(error: DetailedError): boolean {
    const status = errorStatus(error);
    if (status === 409 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
    return status === 0 || status === 423 || status >= 500;
}

function errorStatus(error: Error | DetailedError): number {
    return 'originalResponse' in error && error.originalResponse
        ? error.originalResponse.getStatus()
        : 0;
}

function isLivepeerTusUrl(value: string): boolean {
    try {
        return new URL(value).origin === LIVEPEER_TUS_ORIGIN;
    } catch {
        return false;
    }
}

function requireFeature(): void {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) throw new Error('livepeer_control_disabled');
}

function browserOrigin(): string {
    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : APP_CONFIG.publicAppUrl;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'https:') throw new Error('invalid_livepeer_origin');
        return url.origin;
    } catch {
        throw new Error('invalid_livepeer_origin');
    }
}

function bridgeRoute(route: string): string {
    try {
        const url = new URL(route, APP_CONFIG.livepeerBridgeUrl);
        if (url.protocol !== 'https:') throw new Error('invalid_livepeer_bridge_url');
        return url.toString();
    } catch {
        throw new Error('invalid_livepeer_bridge_url');
    }
}

function randomNonce(): string {
    return base64Encode(crypto.getRandomValues(new Uint8Array(32)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function canonicalControlMessage(envelope: Record<string, string>): string {
    return [
        envelope.domain,
        envelope.version,
        envelope.method,
        envelope.route,
        envelope.network,
        envelope.contract_id,
        envelope.account_id,
        envelope.resource,
        envelope.session_public_key,
        envelope.origin,
        envelope.device_nonce,
        envelope.expires_at_ms,
        envelope.body_sha256,
    ].join('\n');
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson(object[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
    return hexEncode(new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    )));
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
    try {
        const value = await response.json();
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }
    } catch {
        // Mapped below.
    }
    throw new Error('invalid_livepeer_control_response');
}
