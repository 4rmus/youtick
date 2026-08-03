import { Upload, type DetailedError } from 'tus-js-client';
import {
    KeyPair,
    type KeyPairString,
    PublicKey,
    actions,
} from 'near-api-js';
import {
    APP_CONFIG,
    FEATURE_FLAGS,
    GAS_CONSTANTS,
    MEDIA_UPLOAD_POLICY,
    NEAR_CONFIG,
} from '@/lib/constants';
import { base64Encode, hexEncode } from '@/lib/crypto/codec';
import type { WalletInstance } from '@/lib/types';

const LIVEPEER_TUS_ORIGIN = 'https://origin.livepeer.com';
const PROFILE_ID = 'paid-media-livepeer-v1';
const PROFILE_CONFIG_SHA256 = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
const LIVEPEER_SESSION_STORAGE_PREFIX = 'youtick:livepeer-job-session:';
const TESTNET_CREATOR_KEY_ALLOWANCE_YOCTO = 8_000_000_000_000_000_000_000n;
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type LivepeerUploadIntent = {
    schema: 'youtick.livepeer-upload-intent.v1';
    job_id: string;
    generation: number;
    expected_source_bytes: string;
    chunk_bytes: number;
    tus_endpoint: string;
    created: boolean;
};

export function livepeerUploadFeeUsdc(sourceBytes: number): string {
    if (!Number.isSafeInteger(sourceBytes)
        || sourceBytes < 1
        || sourceBytes > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes) {
        throw new Error('source_limit_exceeded');
    }
    return ((BigInt(sourceBytes) * 3n + 9_999n) / 10_000n).toString();
}

export function livepeerSessionKeyAllowanceYocto(
    networkId: 'testnet' | 'mainnet' = NEAR_CONFIG.networkId,
): bigint {
    if (networkId !== 'testnet') throw new Error('livepeer_session_key_budget_unset');
    return TESTNET_CREATOR_KEY_ALLOWANCE_YOCTO;
}

export async function authorizeLivepeerPaidJob(wallet: WalletInstance, input: {
    accountId: string;
    jobId: string;
    title: string;
    priceUsdc: string;
    expectedSourceBytes: number;
}): Promise<string> {
    requireFeature();
    validateJobSessionIdentity(input.accountId, input.jobId);
    const title = input.title.trim();
    if (!title || new TextEncoder().encode(title).length > 200) throw new Error('invalid_title');
    if (!/^[1-9][0-9]{0,19}$/.test(input.priceUsdc)
        || BigInt(input.priceUsdc) < 2_000_000n) {
        throw new Error('invalid_ticket_price');
    }
    const amount = livepeerUploadFeeUsdc(input.expectedSourceBytes);
    const allowanceYocto = livepeerSessionKeyAllowanceYocto();
    const existingKey = loadLivepeerJobSessionKey(input.accountId, input.jobId);
    const keyPair = existingKey ?? KeyPair.fromRandom('ed25519');
    const publicKey = keyPair.getPublicKey().toString();

    const transactions = [
        ...(!existingKey ? [{
            receiverId: input.accountId,
            actions: [actions.addFunctionCallAccessKey(
                PublicKey.fromString(publicKey),
                NEAR_CONFIG.marketContractId,
                ['create_paid_job'],
                allowanceYocto,
            )],
        }] : []),
        {
            receiverId: NEAR_CONFIG.usdcContractId,
            actions: [actions.functionCall(
                'ft_transfer_call',
                {
                    receiver_id: NEAR_CONFIG.marketContractId,
                    amount,
                    memo: 'YouTick creator upload fee',
                    msg: JSON.stringify({
                        action: 'create_paid_job',
                        job_id: input.jobId,
                        title,
                        price_usdc: input.priceUsdc,
                        expected_source_bytes: String(input.expectedSourceBytes),
                        profile_id: PROFILE_ID,
                        profile_config_sha256: PROFILE_CONFIG_SHA256,
                    }),
                },
                GAS_CONSTANTS.mediumGas,
                1n,
            )],
        },
    ];

    if (!existingKey) persistLivepeerJobSessionKey(input.accountId, input.jobId, keyPair);
    try {
        await wallet.signAndSendTransactions({ transactions });
        return publicKey;
    } catch (error) {
        if (!existingKey) clearLivepeerJobSessionKey(input.accountId, input.jobId);
        throw error;
    }
}

export async function requestLivepeerUploadIntent(input: {
    wallet: WalletInstance;
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
    validateJobSessionIdentity(input.accountId, input.jobId);
    const keyPair = loadLivepeerJobSessionKey(input.accountId, input.jobId);
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
    const intent = parseIntent(value, input);
    await revokeLivepeerJobSessionKey(input.wallet, input.accountId, input.jobId);
    return intent;
}

export async function revokeLivepeerJobSessionKey(
    wallet: WalletInstance,
    accountId: string,
    jobId: string,
): Promise<boolean> {
    validateJobSessionIdentity(accountId, jobId);
    const keyPair = loadLivepeerJobSessionKey(accountId, jobId);
    if (!keyPair) return false;
    await wallet.signAndSendTransaction({
        receiverId: accountId,
        actions: [actions.deleteKey(keyPair.getPublicKey())],
    });
    clearLivepeerJobSessionKey(accountId, jobId);
    return true;
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
        uploadUrl: intent.tus_endpoint,
        chunkSize: MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes,
        parallelUploads: 1,
        retryDelays: [0, 1000, 3000],
        storeFingerprintForResuming: false,
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

function validateJobSessionIdentity(accountId: string, jobId: string): void {
    if (!ACCOUNT_ID_PATTERN.test(accountId) || !JOB_ID_PATTERN.test(jobId)) {
        throw new Error('invalid_livepeer_session');
    }
}

function livepeerJobSessionStorageKey(accountId: string, jobId: string): string {
    return `${LIVEPEER_SESSION_STORAGE_PREFIX}${accountId}:${jobId}`;
}

function persistLivepeerJobSessionKey(accountId: string, jobId: string, keyPair: KeyPair): void {
    if (typeof window === 'undefined') throw new Error('livepeer_session_storage_unavailable');
    const storageKey = livepeerJobSessionStorageKey(accountId, jobId);
    const value = JSON.stringify({
        secretKey: keyPair.toString(),
        publicKey: keyPair.getPublicKey().toString(),
    });
    try {
        sessionStorage.setItem(storageKey, value);
        if (sessionStorage.getItem(storageKey) !== value) throw new Error('storage_write_failed');
    } catch {
        try {
            sessionStorage.removeItem(storageKey);
        } catch {
            // Storage is already unavailable; fail closed below.
        }
        throw new Error('livepeer_session_storage_unavailable');
    }
}

function loadLivepeerJobSessionKey(accountId: string, jobId: string): KeyPair | null {
    if (typeof window === 'undefined') return null;
    const storageKey = livepeerJobSessionStorageKey(accountId, jobId);
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as { secretKey?: string; publicKey?: string };
        if (typeof value.secretKey !== 'string' || typeof value.publicKey !== 'string') {
            throw new Error('invalid_session_key');
        }
        const keyPair = KeyPair.fromString(value.secretKey as KeyPairString);
        if (keyPair.getPublicKey().toString() !== value.publicKey) {
            throw new Error('invalid_session_key');
        }
        return keyPair;
    } catch {
        try {
            sessionStorage.removeItem(storageKey);
        } catch {
            // Treat inaccessible storage as a missing session.
        }
        return null;
    }
}

function clearLivepeerJobSessionKey(accountId: string, jobId: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(livepeerJobSessionStorageKey(accountId, jobId));
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
