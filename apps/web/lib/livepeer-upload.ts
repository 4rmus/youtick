import { Upload, type DetailedError } from 'tus-js-client';
import {
    KeyPair,
    type KeyPairString,
    actions,
} from 'near-api-js';
import {
    APP_CONFIG,
    FEATURE_FLAGS,
    GAS_CONSTANTS,
    MEDIA_UPLOAD_POLICY,
    NEAR_CONFIG,
    NEAR_NETWORK,
} from '@/lib/constants';
import { base64Encode, hexEncode } from '@/lib/crypto/codec';
import { getProvider, viewContract } from '@/lib/near';
import type { WalletInstance } from '@/lib/types';
import type { UploadRecoveryStage } from '@/lib/livepeer-upload-state';

const LIVEPEER_TUS_ORIGIN = 'https://origin.livepeer.com';
const PROFILE_ID = 'paid-media-livepeer-v1';
const PROFILE_CONFIG_SHA256 = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
const LIVEPEER_SESSION_STORAGE_PREFIX = 'youtick:livepeer-job-session:';
const LIVEPEER_DRAFT_STORAGE_PREFIX = 'youtick:livepeer-ui-draft:';
const LIVEPEER_SOURCE_FINGERPRINT_WINDOW_BYTES = 1024 * 1024;
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MIN_CREATOR_UPLOAD_FEE_USDC = 500_000n;
const SPONSORED_UPLOAD_FEE_USDC = 100_000n;

const LIVEPEER_SOURCE_FORMATS = {
    mp4: { extension: 'mp4', mimeTypes: ['video/mp4'] },
    mov: { extension: 'mov', mimeTypes: ['video/quicktime'] },
    avi: { extension: 'avi', mimeTypes: ['video/x-msvideo', 'video/avi', 'video/msvideo'] },
    webm: { extension: 'webm', mimeTypes: ['video/webm'] },
    wmv: { extension: 'wmv', mimeTypes: ['video/x-ms-wmv', 'video/wmv'] },
    mkv: { extension: 'mkv', mimeTypes: ['video/x-matroska', 'video/mkv'] },
    flv: { extension: 'flv', mimeTypes: ['video/x-flv', 'video/flv'] },
} as const;

export type LivepeerSourceType = keyof typeof LIVEPEER_SOURCE_FORMATS;
export const LIVEPEER_SOURCE_ACCEPT = Object.values(LIVEPEER_SOURCE_FORMATS)
    .map(({ extension }) => `.${extension}`)
    .join(',');

export type LivepeerUploadIntent = {
    schema: 'youtick.livepeer-upload-intent.v2';
    job_id: string;
    generation: number;
    expected_source_bytes: string;
    source_type: LivepeerSourceType;
    chunk_bytes: number;
    tus_endpoint: string;
    lease_id: string;
    lease_expires_at_ms: string;
    heartbeat_interval_ms: number;
    created: boolean;
};

export type LivepeerUploadDraft = {
    schema: 'youtick.livepeer-ui-draft.v2';
    stage: UploadRecoveryStage;
    jobId: string;
    title: string;
    price: string;
    sourceBytes: number;
    sourceName: string;
    sourceLastModified: number;
    sourceFingerprintSha256: string;
};

const LIVEPEER_RECOVERY_STAGE_ORDER: Record<UploadRecoveryStage, number> = {
    payment_pending: 0,
    authorized: 1,
    upload_ready: 2,
    uploading: 3,
    provider_processing: 4,
};

export type LivepeerSourceValidation =
    | { ok: true; sourceType: LivepeerSourceType }
    | { ok: false; error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type' };

export type CreatorFeeAsset = 'USDC' | 'NEAR';
export type NearCreatorFeeQuote = {
    domain: 'youtick.creator-fee-quote';
    version: '1';
    network: string;
    contract_id: string;
    creator_id: string;
    job_id: string;
    expected_source_bytes: string;
    fee_usd_micro: string;
    near_usd_micro: string;
    fee_near_yocto: string;
    rate_source: 'outlayer-price-oracle-wrap-near-v1';
    rate_timestamp_ms: string;
    expires_at_ms: string;
    quote_key_version: number;
    quote_id: string;
};
export type SignedNearCreatorFeeQuote = {
    quote: NearCreatorFeeQuote;
    signature: string;
};
export type SponsoredUploadQuote = {
    domain: 'youtick.sponsored-upload-quote';
    version: '1';
    network: string;
    contract_id: string;
    creator_id: string;
    job_id: string;
    request_sha256: string;
    expected_source_bytes: string;
    upload_fee_usdc: string;
    sponsor_fee_usdc: string;
    total_fee_usdc: string;
    delegate_receiver_id: string;
    delegate_method: 'ft_transfer_call';
    delegate_gas: string;
    delegate_deposit_yocto: '1';
    issued_at_ms: string;
    quote_block_height: string;
    max_delegate_block_height: string;
    expires_at_ms: string;
    quote_key_version: number;
    quote_id: string;
};
export type SponsoredUploadQuoteSummary = {
    uploadFeeUsdc: string;
    sponsorFeeUsdc: string;
    totalFeeUsdc: string;
};
type SignedSponsoredUploadQuote = {
    quote: SponsoredUploadQuote;
    signature: string;
};
type LivepeerJobSession = {
    keyPair: KeyPair;
    uploadKeyExpiresAtMs: string;
    sponsoredDelegateBase64?: string;
};

export function selectCreatorFeeAsset(input: {
    usdcBalance: string;
    nearBalanceYocto: string;
    usdcFee: string;
    nearFeeYocto?: string;
    gasReserveYocto: string;
    gasSponsoredUsdc?: boolean;
}): { selected: CreatorFeeAsset | null; usable: CreatorFeeAsset[] } {
    const usdcUsable = BigInt(input.usdcBalance) >= BigInt(input.usdcFee)
        && (input.gasSponsoredUsdc
            || BigInt(input.nearBalanceYocto) >= BigInt(input.gasReserveYocto));
    const nearUsable = input.nearFeeYocto !== undefined
        && BigInt(input.nearBalanceYocto) >= BigInt(input.nearFeeYocto) + BigInt(input.gasReserveYocto);
    const usable: CreatorFeeAsset[] = [
        ...(usdcUsable ? ['USDC' as const] : []),
        ...(nearUsable ? ['NEAR' as const] : []),
    ];
    return { selected: usdcUsable ? 'USDC' : nearUsable ? 'NEAR' : null, usable };
}

export function validateLivepeerSourceFile(
    file: Pick<File, 'size' | 'type'> & Partial<Pick<File, 'name'>>,
): LivepeerSourceValidation {
    if (!Number.isSafeInteger(file.size) || file.size < 1) return { ok: false, error: 'empty_file' };
    if (file.size > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes) {
        return { ok: false, error: 'source_limit_exceeded' };
    }
    const sourceType = livepeerSourceType(file);
    return sourceType
        ? { ok: true, sourceType }
        : { ok: false, error: 'unsupported_video_type' };
}

export function livepeerSourceType(
    file: Pick<File, 'type'> & Partial<Pick<File, 'name'>>,
): LivepeerSourceType | null {
    const extension = file.name?.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    const mime = file.type.trim().toLowerCase();
    const entries = Object.entries(LIVEPEER_SOURCE_FORMATS) as Array<[
        LivepeerSourceType,
        (typeof LIVEPEER_SOURCE_FORMATS)[LivepeerSourceType],
    ]>;
    const byExtension = extension
        ? entries.find(([, format]) => format.extension === extension)?.[0]
        : undefined;
    const byMime = mime
        ? entries.find(([, format]) => (format.mimeTypes as readonly string[]).includes(mime))?.[0]
        : undefined;

    if ((extension && !byExtension) || (mime && !byMime) || (byExtension && byMime && byExtension !== byMime)) {
        return null;
    }
    return byExtension || byMime || null;
}

export function parseLivepeerPriceUsdc(value: string): string {
    const match = value.trim().match(/^(\d{1,8})(?:\.(\d{1,6}))?$/);
    if (!match) throw new Error('invalid_ticket_price');
    const amount = BigInt(match[1]) * 1_000_000n + BigInt((match[2] || '').padEnd(6, '0'));
    if (amount < 2_000_000n) throw new Error('invalid_ticket_price');
    return amount.toString();
}

export function createLivepeerJobId(): string {
    return `lp-${crypto.randomUUID()}`;
}

export function writeLivepeerUploadDraft(accountId: string, draft: LivepeerUploadDraft): void {
    validateJobSessionIdentity(accountId, draft.jobId);
    if (!isLivepeerUploadDraft(draft)) throw new Error('invalid_livepeer_draft');
    const storageKey = `${LIVEPEER_DRAFT_STORAGE_PREFIX}${accountId}`;
    let stage = draft.stage;
    try {
        const existing = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as unknown;
        if (isLivepeerUploadDraft(existing)
            && existing.jobId === draft.jobId
            && existing.sourceFingerprintSha256 === draft.sourceFingerprintSha256
            && LIVEPEER_RECOVERY_STAGE_ORDER[existing.stage] > LIVEPEER_RECOVERY_STAGE_ORDER[stage]) {
            stage = existing.stage;
        }
    } catch {
        // The new valid draft replaces malformed session-only UI state.
    }
    sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, stage }));
}

export async function readLivepeerUploadDraft(accountId: string, file: File): Promise<LivepeerUploadDraft | null> {
    const storageKey = `${LIVEPEER_DRAFT_STORAGE_PREFIX}${accountId}`;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    try {
        const draft = JSON.parse(raw) as LivepeerUploadDraft;
        validateJobSessionIdentity(accountId, draft.jobId);
        if (!isLivepeerUploadDraft(draft)) throw new Error('invalid_livepeer_draft');
        return draft.sourceBytes === file.size
            && draft.sourceName === file.name
            && draft.sourceLastModified === file.lastModified
            && draft.sourceFingerprintSha256 === await fingerprintLivepeerSource(file)
            ? draft
            : null;
    } catch {
        sessionStorage.removeItem(storageKey);
        return null;
    }
}

export function clearLivepeerUploadDraft(accountId: string): void {
    sessionStorage.removeItem(`${LIVEPEER_DRAFT_STORAGE_PREFIX}${accountId}`);
}

export function advanceLivepeerUploadDraftStage(
    accountId: string,
    jobId: string,
    stage: UploadRecoveryStage,
): void {
    validateJobSessionIdentity(accountId, jobId);
    const storageKey = `${LIVEPEER_DRAFT_STORAGE_PREFIX}${accountId}`;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
        const draft = JSON.parse(raw) as unknown;
        if (!isLivepeerUploadDraft(draft) || draft.jobId !== jobId) throw new Error('invalid');
        if (LIVEPEER_RECOVERY_STAGE_ORDER[stage] <= LIVEPEER_RECOVERY_STAGE_ORDER[draft.stage]) return;
        sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, stage }));
    } catch {
        sessionStorage.removeItem(storageKey);
    }
}

export async function fingerprintLivepeerSource(file: File): Promise<string> {
    if (!Number.isSafeInteger(file.size) || file.size < 1) throw new Error('empty_file');
    const windowBytes = Math.min(file.size, LIVEPEER_SOURCE_FINGERPRINT_WINDOW_BYTES);
    const head = new Uint8Array(await file.slice(0, windowBytes).arrayBuffer());
    const tailStart = Math.max(0, file.size - windowBytes);
    const tail = tailStart === 0
        ? new Uint8Array()
        : new Uint8Array(await file.slice(tailStart).arrayBuffer());
    const prefix = new TextEncoder().encode([
        'youtick.livepeer-source-fingerprint.v1',
        String(file.size),
        String(windowBytes),
        String(tail.byteLength),
        '',
    ].join('\n'));
    const input = new Uint8Array(prefix.byteLength + head.byteLength + tail.byteLength);
    input.set(prefix);
    input.set(head, prefix.byteLength);
    input.set(tail, prefix.byteLength + head.byteLength);
    return hexEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', input)));
}

function isLivepeerUploadDraft(value: unknown): value is LivepeerUploadDraft {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const draft = value as Record<string, unknown>;
    return draft.schema === 'youtick.livepeer-ui-draft.v2'
        && typeof draft.stage === 'string'
        && Object.hasOwn(LIVEPEER_RECOVERY_STAGE_ORDER, draft.stage)
        && typeof draft.jobId === 'string'
        && JOB_ID_PATTERN.test(draft.jobId)
        && typeof draft.title === 'string'
        && new TextEncoder().encode(draft.title).length <= 200
        && typeof draft.price === 'string'
        && draft.price.length <= 32
        && Number.isSafeInteger(draft.sourceBytes)
        && (draft.sourceBytes as number) > 0
        && (draft.sourceBytes as number) <= MEDIA_UPLOAD_POLICY.paidSourceMaxBytes
        && typeof draft.sourceName === 'string'
        && draft.sourceName.length > 0
        && draft.sourceName.length <= 1024
        && Number.isSafeInteger(draft.sourceLastModified)
        && (draft.sourceLastModified as number) >= 0
        && typeof draft.sourceFingerprintSha256 === 'string'
        && /^[0-9a-f]{64}$/.test(draft.sourceFingerprintSha256);
}

export function livepeerUploadFeeUsdc(sourceBytes: number): string {
    if (!Number.isSafeInteger(sourceBytes)
        || sourceBytes < 1
        || sourceBytes > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes) {
        throw new Error('source_limit_exceeded');
    }
    const byteFee = (BigInt(sourceBytes) * 3n + 9_999n) / 10_000n;
    return (byteFee < MIN_CREATOR_UPLOAD_FEE_USDC
        ? MIN_CREATOR_UPLOAD_FEE_USDC
        : byteFee).toString();
}

export async function authorizeLivepeerPaidJob(wallet: WalletInstance, input: {
    accountId: string;
    jobId: string;
    title: string;
    priceUsdc: string;
    expectedSourceBytes: number;
    asset?: CreatorFeeAsset;
    nearQuote?: SignedNearCreatorFeeQuote;
    allowSponsoredUsdc?: boolean;
    onSponsoredQuote?: (quote: SponsoredUploadQuoteSummary) => void | Promise<void>;
}): Promise<string> {
    requireFeature();
    const asset = input.asset ?? 'USDC';
    if (asset === 'NEAR') requireNearCreatorFee();
    validateJobSessionIdentity(input.accountId, input.jobId);
    const title = input.title.trim();
    if (!title || new TextEncoder().encode(title).length > 200) throw new Error('invalid_title');
    if (!/^[1-9][0-9]{0,19}$/.test(input.priceUsdc)
        || BigInt(input.priceUsdc) < 2_000_000n) {
        throw new Error('invalid_ticket_price');
    }
    const amount = livepeerUploadFeeUsdc(input.expectedSourceBytes);
    const existingSession = loadLivepeerJobSessionKey(input.accountId, input.jobId);
    const keyPair = existingSession?.keyPair ?? KeyPair.fromRandom('ed25519');
    const publicKey = keyPair.getPublicKey().toString();
    const uploadKeyExpiresAtMs = existingSession?.uploadKeyExpiresAtMs
        ?? String(Date.now() + 24 * 60 * 60 * 1000);
    const request = {
        creator_id: input.accountId,
        job_id: input.jobId,
        title,
        price_usdc: input.priceUsdc,
        expected_source_bytes: String(input.expectedSourceBytes),
        profile_id: PROFILE_ID,
        profile_config_sha256: PROFILE_CONFIG_SHA256,
        upload_public_key: publicKey,
        upload_key_expires_at_ms: uploadKeyExpiresAtMs,
    };
    const transaction = asset === 'USDC' ? {
        receiverId: NEAR_CONFIG.usdcContractId,
        actions: [actions.functionCall(
                'ft_transfer_call',
                {
                    receiver_id: NEAR_CONFIG.marketContractId,
                    amount,
                    memo: 'YouTick creator upload fee',
                    msg: JSON.stringify({
                        action: 'create_paid_job',
                        ...request,
                    }),
                },
                GAS_CONSTANTS.mediumGas,
                1n,
            )],
    } : {
        receiverId: NEAR_CONFIG.marketContractId,
        actions: [actions.functionCall(
            'create_paid_job_near',
            {
                request,
                quote: input.nearQuote?.quote,
                quote_signature: input.nearQuote?.signature,
            },
            GAS_CONSTANTS.mediumGas,
            BigInt(input.nearQuote?.quote.fee_near_yocto ?? '0'),
        )],
    };
    if (asset === 'NEAR' && !input.nearQuote) throw new Error('near_creator_fee_quote_required');

    const existingChainJob = await reconcilePaidJob(input.jobId);
    if (existingChainJob) {
        if (exactPaidJob(existingChainJob, request, asset)) return publicKey;
        if (!samePaidJob(existingChainJob, request, asset)) {
            throw new Error('livepeer_paid_job_conflict');
        }
        if (!existingSession) {
            persistLivepeerJobSessionKey(
                input.accountId,
                input.jobId,
                keyPair,
                uploadKeyExpiresAtMs,
            );
        }
        try {
            await wallet.signAndSendTransaction({
                receiverId: NEAR_CONFIG.marketContractId,
                actions: [actions.functionCall(
                    'replace_upload_key',
                    {
                        job_id: input.jobId,
                        new_public_key: publicKey,
                        expires_at_ms: uploadKeyExpiresAtMs,
                    },
                    GAS_CONSTANTS.mediumGas,
                    0n,
                )],
            });
            return publicKey;
        } catch (error) {
            const chainJob = await reconcilePaidJob(input.jobId).catch(() => undefined);
            if (chainJob && exactPaidJob(chainJob, request, asset)) return publicKey;
            if (chainJob && !samePaidJob(chainJob, request, asset)) {
                throw new Error('livepeer_paid_job_conflict');
            }
            throw error;
        }
    }
    if (!existingSession) {
        persistLivepeerJobSessionKey(
            input.accountId,
            input.jobId,
            keyPair,
            uploadKeyExpiresAtMs,
        );
    }
    try {
        if (asset === 'USDC' && existingSession?.sponsoredDelegateBase64) {
            await submitSponsoredUploadRelay(
                input.accountId,
                input.jobId,
                existingSession.sponsoredDelegateBase64,
            );
        } else if (asset === 'USDC'
            && FEATURE_FLAGS.enableSponsoredLivepeerUploads
            && input.allowSponsoredUsdc !== false
            && wallet.signDelegateActions) {
            const sponsoredQuote = await requestSponsoredUploadQuote(request);
            await input.onSponsoredQuote?.({
                uploadFeeUsdc: sponsoredQuote.quote.upload_fee_usdc,
                sponsorFeeUsdc: sponsoredQuote.quote.sponsor_fee_usdc,
                totalFeeUsdc: sponsoredQuote.quote.total_fee_usdc,
            });
            await signAndRelaySponsoredUpload(wallet, request, sponsoredQuote);
        } else {
            await wallet.signAndSendTransaction(transaction);
        }
        return publicKey;
    } catch (error) {
        const chainJob = await reconcilePaidJob(input.jobId).catch(() => undefined);
        if (chainJob && exactPaidJob(chainJob, request, asset)) return publicKey;
        if (chainJob) throw new Error('livepeer_paid_job_conflict');
        throw error;
    }
}

export async function readCreatorFeeBalances(accountId: string): Promise<{
    usdcBalance: string;
    nearBalanceYocto: string;
}> {
    if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error('invalid_account_id');
    const [usdcBalance, nearAccount] = await Promise.all([
        viewContract<string>(getProvider(), NEAR_CONFIG.usdcContractId, 'ft_balance_of', {
            account_id: accountId,
        }),
        getProvider().query({
            request_type: 'view_account',
            finality: 'final',
            account_id: accountId,
        }) as Promise<{ amount: string }>,
    ]);
    return { usdcBalance, nearBalanceYocto: nearAccount.amount };
}

export async function requestNearCreatorFeeQuote(input: {
    accountId: string;
    jobId: string;
    expectedSourceBytes: number;
}): Promise<SignedNearCreatorFeeQuote> {
    requireFeature();
    requireNearCreatorFee();
    validateJobSessionIdentity(input.accountId, input.jobId);
    const feeUsdMicro = livepeerUploadFeeUsdc(input.expectedSourceBytes);
    const response = await fetch(bridgeRoute('/v1/creator-fee-quotes/near'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creator_id: input.accountId,
            job_id: input.jobId,
            expected_source_bytes: String(input.expectedSourceBytes),
        }),
        cache: 'no-store',
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string'
            ? value.error
            : `livepeer_control_http_${response.status}`);
    }
    const quote = await parseNearCreatorFeeQuote(value, input, feeUsdMicro);
    return { quote, signature: value.signature as string };
}

async function requestSponsoredUploadQuote(
    request: Record<string, string>,
): Promise<SignedSponsoredUploadQuote> {
    const response = await fetch(bridgeRoute('/v1/sponsored-upload-quotes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request }),
        cache: 'no-store',
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string'
            ? value.error
            : `livepeer_control_http_${response.status}`);
    }
    return parseSponsoredUploadQuote(value, request);
}

async function signAndRelaySponsoredUpload(
    wallet: WalletInstance,
    request: Record<string, string>,
    signedQuote: SignedSponsoredUploadQuote,
): Promise<void> {
    if (!wallet.signDelegateActions) throw new Error('sponsored_upload_wallet_unsupported');
    const quote = signedQuote.quote;
    const signed = await wallet.signDelegateActions({
        blockHeightTtl: 200,
        delegateActions: [{
            receiverId: NEAR_CONFIG.usdcContractId,
            actions: [actions.functionCall(
                'ft_transfer_call',
                {
                    receiver_id: NEAR_CONFIG.marketContractId,
                    amount: quote.total_fee_usdc,
                    memo: 'YouTick creator upload fee',
                    msg: JSON.stringify({
                        action: 'create_paid_job',
                        ...request,
                        sponsor_quote: quote,
                        sponsor_quote_signature: signedQuote.signature,
                    }),
                },
                GAS_CONSTANTS.mediumGas,
                1n,
            )],
        }],
    });
    if (!Array.isArray(signed.signedDelegateActions)
        || signed.signedDelegateActions.length !== 1
        || typeof signed.signedDelegateActions[0] !== 'string'
        || signed.signedDelegateActions[0].length < 64) {
        throw new Error('invalid_sponsored_upload_delegate');
    }
    persistSponsoredDelegate(
        request.creator_id,
        request.job_id,
        signed.signedDelegateActions[0],
    );
    await submitSponsoredUploadRelay(
        request.creator_id,
        request.job_id,
        signed.signedDelegateActions[0],
    );
}

async function submitSponsoredUploadRelay(
    accountId: string,
    jobId: string,
    signedDelegateBase64: string,
): Promise<void> {
    const response = await fetch(bridgeRoute('/v1/sponsored-upload-relays'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signed_delegate_base64: signedDelegateBase64 }),
        cache: 'no-store',
    });
    const value = await readJson(response);
    if (!response.ok) {
        const code = typeof value.error === 'string'
            ? value.error
            : `livepeer_control_http_${response.status}`;
        if (code === 'invalid_sponsored_upload_relay'
            || code === 'sponsor_relay_failed') {
            clearSponsoredDelegate(accountId, jobId);
        }
        throw new Error(code);
    }
    if (value.accepted !== true
        || typeof value.relayed !== 'boolean'
        || value.job_id !== jobId
        || (value.tx_hash !== null && typeof value.tx_hash !== 'string')) {
        throw new Error('invalid_sponsored_upload_relay');
    }
}

async function parseSponsoredUploadQuote(
    value: Record<string, unknown>,
    request: Record<string, string>,
): Promise<SignedSponsoredUploadQuote> {
    const responseKeys = ['public_key_version', 'quote', 'request', 'signature'];
    const quoteKeys = [
        'contract_id', 'creator_id', 'delegate_deposit_yocto',
        'delegate_gas', 'delegate_method', 'delegate_receiver_id', 'domain',
        'expected_source_bytes', 'expires_at_ms', 'issued_at_ms', 'job_id',
        'max_delegate_block_height', 'quote_block_height', 'quote_id', 'quote_key_version',
        'request_sha256', 'sponsor_fee_usdc', 'total_fee_usdc', 'upload_fee_usdc',
        'version', 'network',
    ];
    if (Object.keys(value).sort().join(',') !== responseKeys.sort().join(',')
        || !value.request || typeof value.request !== 'object' || Array.isArray(value.request)
        || JSON.stringify(value.request) !== JSON.stringify(request)
        || !value.quote || typeof value.quote !== 'object' || Array.isArray(value.quote)
        || typeof value.signature !== 'string'
        || !isEd25519Signature(value.signature)) {
        throw new Error('invalid_sponsored_upload_quote');
    }
    const quote = value.quote as Record<string, unknown>;
    const integers = [
        'expected_source_bytes', 'upload_fee_usdc', 'sponsor_fee_usdc',
        'total_fee_usdc', 'delegate_gas', 'delegate_deposit_yocto', 'issued_at_ms',
        'quote_block_height',
        'max_delegate_block_height', 'expires_at_ms',
    ];
    if (Object.keys(quote).sort().join(',') !== quoteKeys.sort().join(',')
        || integers.some((field) => (
            typeof quote[field] !== 'string' || !/^[1-9][0-9]*$/.test(quote[field] as string)
        ))
        || quote.domain !== 'youtick.sponsored-upload-quote'
        || quote.version !== '1'
        || quote.network !== NEAR_NETWORK
        || quote.contract_id !== NEAR_CONFIG.marketContractId
        || quote.creator_id !== request.creator_id
        || quote.job_id !== request.job_id
        || quote.expected_source_bytes !== request.expected_source_bytes
        || quote.delegate_receiver_id !== NEAR_CONFIG.usdcContractId
        || quote.delegate_method !== 'ft_transfer_call'
        || quote.delegate_gas !== GAS_CONSTANTS.mediumGas.toString()
        || quote.delegate_deposit_yocto !== '1'
        || !Number.isInteger(quote.quote_key_version)
        || quote.quote_key_version !== value.public_key_version
        || typeof quote.request_sha256 !== 'string'
        || !/^[0-9a-f]{64}$/.test(quote.request_sha256)
        || typeof quote.quote_id !== 'string'
        || !/^[0-9a-f]{64}$/.test(quote.quote_id)) {
        throw new Error('invalid_sponsored_upload_quote');
    }
    const requestSha256 = await sha256Hex(JSON.stringify(request));
    const uploadFee = BigInt(livepeerUploadFeeUsdc(Number(request.expected_source_bytes)));
    const now = BigInt(Date.now());
    const issuedAt = BigInt(quote.issued_at_ms as string);
    const expiresAt = BigInt(quote.expires_at_ms as string);
    if (quote.request_sha256 !== requestSha256
        || BigInt(quote.upload_fee_usdc as string) !== uploadFee
        || BigInt(quote.sponsor_fee_usdc as string) !== SPONSORED_UPLOAD_FEE_USDC
        || BigInt(quote.total_fee_usdc as string) !== uploadFee + SPONSORED_UPLOAD_FEE_USDC
        || issuedAt > now
        || now - issuedAt > 120_000n
        || expiresAt <= now
        || expiresAt <= issuedAt
        || expiresAt - issuedAt > 120_000n
        || BigInt(quote.max_delegate_block_height as string)
            - BigInt(quote.quote_block_height as string) !== 200n) {
        throw new Error('invalid_sponsored_upload_quote');
    }
    const canonicalMessage = [
        'domain', 'version', 'network', 'contract_id', 'creator_id', 'job_id',
        'request_sha256', 'expected_source_bytes', 'upload_fee_usdc',
        'sponsor_fee_usdc', 'total_fee_usdc', 'delegate_receiver_id',
        'delegate_method', 'delegate_gas', 'delegate_deposit_yocto',
        'issued_at_ms', 'quote_block_height', 'max_delegate_block_height',
        'expires_at_ms', 'quote_key_version',
    ]
        .map((field) => String(quote[field]))
        .join('\n');
    if (quote.quote_id !== await sha256Hex(canonicalMessage)) {
        throw new Error('invalid_sponsored_upload_quote');
    }
    return { quote: quote as unknown as SponsoredUploadQuote, signature: value.signature };
}

export async function prepareCreatorFeePaymentOptions(input: {
    accountId: string;
    jobId: string;
    expectedSourceBytes: number;
    gasReserveYocto: string;
    gasSponsoredUsdc?: boolean;
}): Promise<{
    selected: CreatorFeeAsset | null;
    usable: CreatorFeeAsset[];
    usdcFee: string;
    nearQuote: SignedNearCreatorFeeQuote | undefined;
}> {
    if (!/^[1-9][0-9]*$/.test(input.gasReserveYocto)) {
        throw new Error('creator_fee_gas_reserve_not_configured');
    }
    const usdcFee = livepeerUploadFeeUsdc(input.expectedSourceBytes);
    const requiredUsdcFee = input.gasSponsoredUsdc
        ? (BigInt(usdcFee) + SPONSORED_UPLOAD_FEE_USDC).toString()
        : usdcFee;
    const balances = await readCreatorFeeBalances(input.accountId);
    const nearQuote = FEATURE_FLAGS.enableLivepeerNearCreatorFee
        ? await requestNearCreatorFeeQuote(input).catch(() => undefined)
        : undefined;
    const selection = selectCreatorFeeAsset({
        ...balances,
        usdcFee: requiredUsdcFee,
        nearFeeYocto: nearQuote?.quote.fee_near_yocto,
        gasReserveYocto: input.gasReserveYocto,
        gasSponsoredUsdc: input.gasSponsoredUsdc,
    });
    return { ...selection, usdcFee, nearQuote };
}

export function sponsoredUploadPaymentOptionsChanged(
    preparedSponsoredUsdc: boolean,
    hasMatchingCheckout: boolean,
): boolean {
    return preparedSponsoredUsdc && hasMatchingCheckout;
}

export function configuredCreatorFeeGasReserveYocto(): string {
    const value = process.env.NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO
        || process.env.NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO
        || '';
    if (!/^[1-9][0-9]*$/.test(value)) {
        throw new Error('creator_fee_gas_reserve_not_configured');
    }
    return value;
}

async function parseNearCreatorFeeQuote(
    value: Record<string, unknown>,
    expected: { accountId: string; jobId: string; expectedSourceBytes: number },
    feeUsdMicro: string,
): Promise<NearCreatorFeeQuote> {
    const quote = value.quote;
    if (!quote || typeof quote !== 'object' || Array.isArray(quote)) {
        throw new Error('invalid_near_creator_fee_quote');
    }
    const input = quote as Record<string, unknown>;
    const integerFields = [
        'expected_source_bytes', 'fee_usd_micro', 'near_usd_micro', 'fee_near_yocto',
        'rate_timestamp_ms', 'expires_at_ms',
    ];
    if (Object.keys(input).sort().join(',') !== [
        'contract_id', 'creator_id', 'domain', 'expected_source_bytes', 'expires_at_ms',
        'fee_near_yocto', 'fee_usd_micro', 'job_id', 'near_usd_micro', 'network',
        'quote_id', 'quote_key_version', 'rate_source', 'rate_timestamp_ms', 'version',
    ].sort().join(',')
        || integerFields.some((field) => (
            typeof input[field] !== 'string' || !/^[1-9][0-9]*$/.test(input[field] as string)
        ))
        || input.domain !== 'youtick.creator-fee-quote'
        || input.version !== '1'
        || input.network !== NEAR_NETWORK
        || input.contract_id !== NEAR_CONFIG.marketContractId
        || input.creator_id !== expected.accountId
        || input.job_id !== expected.jobId
        || input.expected_source_bytes !== String(expected.expectedSourceBytes)
        || input.fee_usd_micro !== feeUsdMicro
        || input.rate_source !== 'outlayer-price-oracle-wrap-near-v1'
        || !Number.isInteger(input.quote_key_version)
        || (input.quote_key_version as number) < 1
        || typeof input.quote_id !== 'string'
        || !/^[0-9a-f]{64}$/.test(input.quote_id)
        || value.public_key_version !== input.quote_key_version
        || typeof value.signature !== 'string'
        || !isEd25519Signature(value.signature)) {
        throw new Error('invalid_near_creator_fee_quote');
    }
    const now = BigInt(Date.now());
    const rateTimestamp = BigInt(input.rate_timestamp_ms as string);
    const expiresAt = BigInt(input.expires_at_ms as string);
    const nearUsdMicro = BigInt(input.near_usd_micro as string);
    const expectedNearFee = (BigInt(feeUsdMicro) * (10n ** 24n) + nearUsdMicro - 1n)
        / nearUsdMicro;
    if (rateTimestamp > now
        || now - rateTimestamp > 60_000n
        || expiresAt <= now
        || expiresAt - rateTimestamp > 120_000n
        || input.fee_near_yocto !== expectedNearFee.toString()) {
        throw new Error('invalid_near_creator_fee_quote');
    }
    const canonicalMessage = [
        'domain', 'version', 'network', 'contract_id', 'creator_id', 'job_id',
        'expected_source_bytes', 'fee_usd_micro', 'near_usd_micro', 'fee_near_yocto',
        'rate_source', 'rate_timestamp_ms', 'expires_at_ms', 'quote_key_version',
    ].map((field) => String(input[field])).join('\n');
    if (input.quote_id !== await sha256Hex(canonicalMessage)) {
        throw new Error('invalid_near_creator_fee_quote');
    }
    return input as NearCreatorFeeQuote;
}

function isEd25519Signature(value: string): boolean {
    try {
        return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).length === 64;
    } catch {
        return false;
    }
}

async function reconcilePaidJob(jobId: string): Promise<Record<string, unknown> | null> {
    return viewContract<Record<string, unknown> | null>(
        getProvider(), NEAR_CONFIG.marketContractId, 'get_media_job', { job_id: jobId },
    );
}

function exactPaidJob(
    job: Record<string, unknown>,
    request: Record<string, string>,
    asset: CreatorFeeAsset,
): boolean {
    return samePaidJob(job, request, asset)
        && job.upload_public_key === request.upload_public_key
        && job.upload_key_expires_at_ms === request.upload_key_expires_at_ms;
}

function samePaidJob(
    job: Record<string, unknown>,
    request: Record<string, string>,
    asset: CreatorFeeAsset,
): boolean {
    return job.job_id === request.job_id
        && job.creator_id === request.creator_id
        && job.title === request.title
        && job.price_usdc === request.price_usdc
        && job.expected_source_bytes === request.expected_source_bytes
        && job.profile_id === request.profile_id
        && job.profile_config_sha256 === request.profile_config_sha256
        && job.fee_asset === asset
        && job.status === 'Authorized';
}

export async function requestLivepeerUploadIntent(input: {
    accountId: string;
    jobId: string;
    generation: number;
    expectedSourceBytes: number;
    sourceFingerprintSha256: string;
    sourceType: LivepeerSourceType;
}): Promise<LivepeerUploadIntent> {
    requireFeature();
    if (!Number.isSafeInteger(input.expectedSourceBytes)
        || input.expectedSourceBytes < 1
        || input.expectedSourceBytes > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes) {
        throw new Error('source_limit_exceeded');
    }
    if (!/^[0-9a-f]{64}$/.test(input.sourceFingerprintSha256)) {
        throw new Error('invalid_source_fingerprint');
    }
    validateJobSessionIdentity(input.accountId, input.jobId);
    const session = loadLivepeerJobSessionKey(input.accountId, input.jobId);
    if (!session) throw new Error('livepeer_session_key_missing');
    const keyPair = session.keyPair;
    const route = '/v1/upload-intents';
    const origin = browserOrigin();
    const body = {
        job_id: input.jobId,
        generation: input.generation,
        expected_source_bytes: String(input.expectedSourceBytes),
        source_fingerprint_sha256: input.sourceFingerprintSha256,
        source_type: input.sourceType,
        profile_id: PROFILE_ID,
        profile_config_sha256: PROFILE_CONFIG_SHA256,
    };
    const bodySha256 = await sha256Hex(canonicalJson(body));
    const envelope = {
        domain: 'youtick.paid-media-livepeer-v1.control',
        version: '3',
        method: 'POST',
        route,
        network: NEAR_NETWORK,
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

export async function heartbeatLivepeerUploadLease(input: {
    accountId: string;
    intent: LivepeerUploadIntent;
}): Promise<string> {
    requireFeature();
    validateJobSessionIdentity(input.accountId, input.intent.job_id);
    const session = loadLivepeerJobSessionKey(input.accountId, input.intent.job_id);
    if (!session) throw new Error('livepeer_session_key_missing');
    const route = '/v1/upload-heartbeats';
    const origin = browserOrigin();
    const body = {
        job_id: input.intent.job_id,
        generation: input.intent.generation,
        lease_id: input.intent.lease_id,
    };
    const envelope = {
        domain: 'youtick.paid-media-livepeer-v1.control',
        version: '2',
        method: 'POST',
        route,
        network: NEAR_NETWORK,
        contract_id: NEAR_CONFIG.marketContractId,
        account_id: input.accountId,
        resource: `job:${input.intent.job_id}:${input.intent.generation}`,
        session_public_key: session.keyPair.getPublicKey().toString(),
        origin,
        device_nonce: randomNonce(),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: await sha256Hex(canonicalJson(body)),
    };
    const signature = base64Encode(session.keyPair.sign(
        new TextEncoder().encode(canonicalControlMessage(envelope)),
    ).signature);
    const response = await fetch(bridgeRoute(route), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Youtick-Signature': signature },
        body: JSON.stringify({ body, envelope }),
        cache: 'no-store',
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string'
            ? value.error
            : `livepeer_control_http_${response.status}`);
    }
    if (value.schema !== 'youtick.livepeer-upload-lease.v1'
        || value.job_id !== input.intent.job_id
        || value.generation !== input.intent.generation
        || value.lease_id !== input.intent.lease_id
        || typeof value.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(value.expires_at_ms)
        || BigInt(value.expires_at_ms) <= BigInt(Date.now())
        || value.heartbeat_interval_ms !== input.intent.heartbeat_interval_ms) {
        throw new Error('invalid_livepeer_upload_lease');
    }
    return value.expires_at_ms;
}

export async function cancelLivepeerUpload(input: {
    accountId: string;
    jobId: string;
    generation: number;
}): Promise<void> {
    requireFeature();
    validateJobSessionIdentity(input.accountId, input.jobId);
    if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
        throw new Error('invalid_livepeer_cancellation');
    }
    const session = loadLivepeerJobSessionKey(input.accountId, input.jobId);
    if (!session) throw new Error('livepeer_session_key_missing');
    const route = '/v1/upload-cancellations';
    const body = { job_id: input.jobId, generation: input.generation };
    const envelope = {
        domain: 'youtick.paid-media-livepeer-v1.control',
        version: '2',
        method: 'POST',
        route,
        network: NEAR_NETWORK,
        contract_id: NEAR_CONFIG.marketContractId,
        account_id: input.accountId,
        resource: `job:${input.jobId}:${input.generation}`,
        session_public_key: session.keyPair.getPublicKey().toString(),
        origin: browserOrigin(),
        device_nonce: randomNonce(),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: await sha256Hex(canonicalJson(body)),
    };
    const signature = base64Encode(session.keyPair.sign(
        new TextEncoder().encode(canonicalControlMessage(envelope)),
    ).signature);
    const response = await fetch(bridgeRoute(route), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Youtick-Signature': signature },
        body: JSON.stringify({ body, envelope }),
        cache: 'no-store',
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string'
            ? value.error
            : `livepeer_control_http_${response.status}`);
    }
    if (value.cancelled !== true
        || typeof value.duplicate !== 'boolean'
        || value.refundable !== false) {
        throw new Error('invalid_livepeer_cancellation');
    }
}

export async function preflightLivepeerUpload(input: {
    accountId: string;
    jobId: string;
    generation: number;
    expectedSourceBytes: number;
}): Promise<void> {
    requireFeature();
    validateJobSessionIdentity(input.accountId, input.jobId);
    if (!Number.isSafeInteger(input.generation)
        || input.generation < 1
        || !Number.isSafeInteger(input.expectedSourceBytes)
        || input.expectedSourceBytes < 1
        || input.expectedSourceBytes > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes) {
        throw new Error('invalid_upload_preflight');
    }
    const response = await fetch(bridgeRoute('/v1/upload-preflight'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creator_id: input.accountId,
            job_id: input.jobId,
            generation: input.generation,
            expected_source_bytes: String(input.expectedSourceBytes),
        }),
        cache: 'no-store',
    });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string'
            ? value.error
            : `livepeer_control_http_${response.status}`);
    }
    if (value.available !== true) throw new Error('invalid_upload_preflight');
}

export async function uploadLivepeerSource(
    file: File,
    intent: LivepeerUploadIntent,
    options?: {
        signal?: AbortSignal;
        onProgress?: (uploadedBytes: number, totalBytes: number) => void;
        heartbeat?: () => Promise<unknown>;
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
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleHeartbeat = () => {
        if (!options?.heartbeat) return;
        heartbeatTimer = setTimeout(() => {
            void options.heartbeat!().catch(() => undefined).finally(scheduleHeartbeat);
        }, intent.heartbeat_interval_ms);
    };
    options?.signal?.addEventListener('abort', abort, { once: true });
    try {
        scheduleHeartbeat();
        upload.start();
        await completion;
    } finally {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        options?.signal?.removeEventListener('abort', abort);
    }
}

function parseIntent(value: Record<string, unknown>, expected: {
    jobId: string;
    generation: number;
    expectedSourceBytes: number;
    sourceType: LivepeerSourceType;
}): LivepeerUploadIntent {
    if (value.schema !== 'youtick.livepeer-upload-intent.v2'
        || value.job_id !== expected.jobId
        || value.generation !== expected.generation
        || value.expected_source_bytes !== String(expected.expectedSourceBytes)
        || value.source_type !== expected.sourceType
        || value.chunk_bytes !== MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes
        || typeof value.tus_endpoint !== 'string'
        || !isLivepeerTusUrl(value.tus_endpoint)
        || typeof value.lease_id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.lease_id)
        || typeof value.lease_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(value.lease_expires_at_ms)
        || BigInt(value.lease_expires_at_ms) <= BigInt(Date.now())
        || value.heartbeat_interval_ms !== 5 * 60 * 1000
        || typeof value.created !== 'boolean') {
        throw new Error('invalid_livepeer_upload_intent');
    }
    return value as LivepeerUploadIntent;
}

function validateUpload(file: File, intent: LivepeerUploadIntent): void {
    const sourceType = livepeerSourceType(file);
    if (!Number.isSafeInteger(file.size)
        || file.size < 1
        || file.size > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes
        || String(file.size) !== intent.expected_source_bytes
        || sourceType !== intent.source_type
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

function requireNearCreatorFee(): void {
    if (!FEATURE_FLAGS.enableLivepeerNearCreatorFee) {
        throw new Error('near_creator_fee_disabled');
    }
}

function validateJobSessionIdentity(accountId: string, jobId: string): void {
    if (!ACCOUNT_ID_PATTERN.test(accountId) || !JOB_ID_PATTERN.test(jobId)) {
        throw new Error('invalid_livepeer_session');
    }
}

function livepeerJobSessionStorageKey(accountId: string, jobId: string): string {
    return `${LIVEPEER_SESSION_STORAGE_PREFIX}${accountId}:${jobId}`;
}

function persistLivepeerJobSessionKey(
    accountId: string,
    jobId: string,
    keyPair: KeyPair,
    uploadKeyExpiresAtMs: string,
): void {
    if (typeof window === 'undefined') throw new Error('livepeer_session_storage_unavailable');
    const storageKey = livepeerJobSessionStorageKey(accountId, jobId);
    const value = JSON.stringify({
        secretKey: keyPair.toString(),
        publicKey: keyPair.getPublicKey().toString(),
        uploadKeyExpiresAtMs,
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

function persistSponsoredDelegate(accountId: string, jobId: string, value: string): void {
    if (typeof window === 'undefined'
        || value.length < 64
        || value.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new Error('invalid_sponsored_upload_delegate');
    }
    const storageKey = livepeerJobSessionStorageKey(accountId, jobId);
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) throw new Error('livepeer_session_key_missing');
    try {
        const session = JSON.parse(raw) as Record<string, unknown>;
        session.sponsoredDelegateBase64 = value;
        sessionStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
        throw new Error('livepeer_session_storage_unavailable');
    }
}

function clearSponsoredDelegate(accountId: string, jobId: string): void {
    if (typeof window === 'undefined') return;
    const storageKey = livepeerJobSessionStorageKey(accountId, jobId);
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
        const session = JSON.parse(raw) as Record<string, unknown>;
        delete session.sponsoredDelegateBase64;
        sessionStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
        sessionStorage.removeItem(storageKey);
    }
}

function loadLivepeerJobSessionKey(accountId: string, jobId: string): LivepeerJobSession | null {
    if (typeof window === 'undefined') return null;
    const storageKey = livepeerJobSessionStorageKey(accountId, jobId);
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as {
            secretKey?: string;
            publicKey?: string;
            uploadKeyExpiresAtMs?: string;
            sponsoredDelegateBase64?: string;
        };
        if (typeof value.secretKey !== 'string'
            || typeof value.publicKey !== 'string'
            || typeof value.uploadKeyExpiresAtMs !== 'string'
            || !/^[1-9][0-9]{0,15}$/.test(value.uploadKeyExpiresAtMs)
            || BigInt(value.uploadKeyExpiresAtMs) <= BigInt(Date.now())
            || (value.sponsoredDelegateBase64 !== undefined
                && (value.sponsoredDelegateBase64.length < 64
                    || value.sponsoredDelegateBase64.length % 4 !== 0
                    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.sponsoredDelegateBase64)))) {
            throw new Error('invalid_session_key');
        }
        const keyPair = KeyPair.fromString(value.secretKey as KeyPairString);
        if (keyPair.getPublicKey().toString() !== value.publicKey) {
            throw new Error('invalid_session_key');
        }
        return {
            keyPair,
            uploadKeyExpiresAtMs: value.uploadKeyExpiresAtMs,
            sponsoredDelegateBase64: value.sponsoredDelegateBase64,
        };
    } catch {
        try {
            sessionStorage.removeItem(storageKey);
        } catch {
            // Treat inaccessible storage as a missing session.
        }
        return null;
    }
}

export function clearLivepeerJobSessionKey(accountId: string, jobId: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(livepeerJobSessionStorageKey(accountId, jobId));
}

function browserOrigin(): string {
    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : APP_CONFIG.publicAppUrl;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'https:'
            && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
            throw new Error('invalid_livepeer_origin');
        }
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
