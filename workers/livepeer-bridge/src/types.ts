import type {
    MediaProviderKind,
    MediaSourceType,
    ProviderVerificationCheckpoint,
    SourceBytesEvidence,
} from './media-provider';

export type JsonObject = Record<string, unknown>;
export type LivepeerSourceType = MediaSourceType;
// V1 deployments keep the Livepeer-named profile; Market V2 (gate MC) uses the provider-neutral id.
export type MediaProfileId = 'paid-media-livepeer-v1' | 'paid-media-v1';
export type UploadIntentBody = {
    job_id: string;
    generation: number;
    expected_source_bytes: string;
    source_fingerprint_sha256: string;
    source_type: LivepeerSourceType;
    profile_id: MediaProfileId;
    profile_config_sha256: string;
    recovery?: 'reconcile' | 'resume';
};
export type ControlEnvelope = {
    domain: 'youtick.paid-media-livepeer-v1.control';
    version: '2' | '3';
    method: 'POST';
    route: '/v1/upload-intents' | '/v1/upload-heartbeats'
        | '/v1/upload-cancellations' | '/v1/playback-tokens';
    network: 'testnet' | 'mainnet';
    contract_id: string;
    account_id: string;
    resource: string;
    session_public_key: string;
    origin: string;
    device_nonce: string;
    expires_at_ms: string;
    body_sha256: string;
};
export type UploadIntentRequest = {
    body: UploadIntentBody;
    envelope: ControlEnvelope;
};
export type UploadHeartbeatBody = {
    job_id: string;
    generation: number;
    lease_id: string;
};
export type UploadHeartbeatRequest = {
    body: UploadHeartbeatBody;
    envelope: ControlEnvelope;
};
export type UploadCancellationBody = {
    job_id: string;
    generation: number;
};
export type UploadCancellationRequest = {
    body: UploadCancellationBody;
    envelope: ControlEnvelope;
};
export type OnChainJob = {
    created_at_ms?: unknown;
    job_id?: unknown;
    creator_id?: unknown;
    profile_id?: unknown;
    profile_config_sha256?: unknown;
    expected_source_bytes?: unknown;
    generation?: unknown;
    status?: unknown;
    upload_public_key?: unknown;
    upload_key_expires_at_ms?: unknown;
    title?: unknown;
    price_usdc?: unknown;
    fee_asset?: unknown;
    fee_amount?: unknown;
    fee_usd_micro?: unknown;
    fee_quote_hash?: unknown;
};
export type PublicTestnetBetaJob = {
    creator_id: string;
    generation: number;
    request_sha256: string;
    sponsor_quote_id: string;
    admitted_at_ms: string;
    deadline_at_ms: string;
};
export type PublicTestnetBetaState = {
    version: number;
    started_at_ms: string;
    upload_closes_at_ms: string;
    ends_at_ms: string;
    closed_at_ms: string | null;
    total_job_count: number;
};
export type JobState = 'AUTHORIZED' | 'LEASED' | 'PROVIDER_CREATE_PENDING'
    | 'CREATE_PENDING' | 'CREATE_AMBIGUOUS' | 'UPLOAD_READY'
    | 'UPLOADING' | 'PROCESSING' | 'READY_VERIFIED' | 'FINALIZE_QUEUED'
    | 'FINALIZE_RETRY' | 'UPLOAD_EXPIRED' | 'PROVIDER_FAILED' | 'CANCELLED'
    | 'ONCHAIN_PUBLISHED';
export type JobRecord = {
    schema: 'youtick.livepeer-control-job.v1' | 'youtick.livepeer-control-job.v2';
    state: JobState;
    network: 'testnet' | 'mainnet';
    contractId: string;
    jobId: string;
    generation: number;
    creator: string;
    expectedSourceBytes: string;
    sourceFingerprintSha256?: string;
    sourceType: LivepeerSourceType;
    profileId: MediaProfileId;
    profileConfigSha256: string;
    createdAtMs: number;
    stateChangedAtMs?: number;
    terminalAtMs?: number;
    // Absent on every record written before the provider boundary: absent means 'studio'.
    provider?: MediaProviderKind;
    // Studio jobs always record the creating API token name; other adapters do not have one.
    apiTokenName?: string;
    leaseId?: string;
    leaseExpiresAtMs?: number;
    assetId?: string;
    playbackId?: string;
    projectId?: string;
    tusEndpoint?: string;
    publication?: FinalizePublication;
    providerVerification?: ProviderVerificationCheckpoint;
    // Persisted byte proof for adapters whose sourceBytesProof capability is 'tus-offset'.
    sourceBytesEvidence?: SourceBytesEvidence;
    // Stream: last reported state/pctComplete and when either last changed (stuck detection).
    streamProgress?: { state: string; pctComplete: number; changedAtMs: number };
    finalizeRetry?: {
        attempts: number;
        lastHttpStatus: number;
        nextAttemptAtMs: number;
    };
    providerCreate?: {
        attempts: 1;
        lastAttemptAtMs: number;
        retryPolicy: 'RECONCILE_ONLY';
        lastErrorCode?: 'provider_admission_closed' | 'provider_create_ambiguous'
            | 'provider_unavailable';
        ambiguousAtMs?: number;
        completedAtMs?: number;
    };
    terminalArchive?: {
        status: 'PENDING' | 'RETRY' | 'COMMITTED';
        attempts: number;
        createdAtMs: number;
        nextAttemptAtMs: number;
        archiveSha256?: string;
        committedAtMs?: number;
        cleanupEligibleAtMs?: number;
    };
    absoluteDeadlineAtMs?: number;
    providerDelete?: {
        assetIdSha256: string;
        outcome: 'DELETED' | 'MISSING' | 'AMBIGUOUS';
        attemptedAtMs: number;
    };
};
type ReconcileStatus = 'HEALTHY' | 'DRIFT_BLOCKED' | 'PROVIDER_UNKNOWN' | 'NEAR_UNKNOWN';
export type ReconcileRecord = {
    schema: 'youtick.livepeer-reconcile.v1';
    status: ReconcileStatus;
    consecutiveErrors: number;
    nextReconcileAtMs: number;
    uploadReadFailed?: boolean;
    uploadErrorCode?: string;
    lastGoodAtMs?: number;
    lastDrift?: {
        code: string;
        firstObservedAtMs: number;
        lastObservedAtMs: number;
        observations: number;
    };
    recovery?: {
        firstObservedAtMs: number;
        observations: number;
    };
    salesSuspensionQueuedAtMs?: number;
};
type LegacyOutboxMethod = 'finalize_livepeer_publication' | 'suspend_livepeer_sales';
type NeutralOutboxMethod = 'finalize_publication' | 'suspend_sales';
export type OutboxMethod = LegacyOutboxMethod | NeutralOutboxMethod | 'mark_watched' | 'release_expired';
export type OutboxInput = {
    idempotencyKey: string;
    method: OutboxMethod;
    jobId: string;
    generation: number;
    payloadSha256: string;
};
export type OutboxRecord = OutboxInput & {
    schema: 'youtick.livepeer-control-outbox.v1';
    state: 'PENDING' | 'CONFIRMED';
    createdAtMs: number;
};
export type FinalizePublication = {
    job_id: string;
    generation: number;
    creator_id: string;
    expected_source_bytes: string;
    profile_id: MediaProfileId;
    profile_config_sha256: string;
    asset_id_hash: string;
    playback_id: string;
    project_id_hash: string;
    verified_source_bytes: string;
    provider_source_fingerprint: string | null;
    ready_at_ms: string;
    availability: 'ACTIVE';
};
export type OperatorRecord = {
    schema: 'youtick.livepeer-operator-outbox.v1';
    state: 'PENDING' | 'RESERVED' | 'SIGNED' | 'BROADCAST' | 'CONFIRMED';
    method: OutboxMethod;
    idempotencyKey: string;
    payloadSha256: string;
    createdAtMs: number;
    nonce?: string;
    blockHash?: string;
    signedTxBase64?: string;
    txHash?: string;
    confirmedAtMs?: number;
    archive?: {
        status: 'PENDING' | 'RETRY' | 'COMMITTED';
        attempts: number;
        createdAtMs: number;
        nextAttemptAtMs: number;
        archiveSha256?: string;
        committedAtMs?: number;
        cleanupEligibleAtMs?: number;
    };
};
export type OperatorArchiveScan = {
    after?: string;
    earliestRetryAtMs?: number;
};
export type AdmissionJobState = 'CREATE_PENDING' | 'CREATE_AMBIGUOUS' | 'UPLOAD_READY'
    | 'UPLOADING' | 'READY_VERIFIED' | 'FINALIZE_QUEUED';
export type AdmissionReservation = {
    creator: string;
    expectedSourceBytes: string;
    estimatedProviderCostUsdMicros: string;
    state: AdmissionJobState;
    createdAtMs: number;
    leaseId?: string;
    expiresAtMs?: number;
    lastHeartbeatAtMs?: number;
    ambiguousAtMs?: number;
};
export type AdmissionRecord = {
    schema: 'youtick.livepeer-admission.v2';
    status: 'OPEN' | 'AUTO_CLOSED';
    reservations: Record<string, AdmissionReservation>;
    daily: { utcDay: string; globalAttempts: number; creatorAttempts: Record<string, number> };
    monthly: { utcMonth: string; reservedBudgetUsdMicros: string };
    providerFailures?: {
        count: number;
        firstObservedAtMs: number;
        lastObservedAtMs: number;
    };
    closure?: { code: string; observedAtMs: number };
    // Cloudflare Stream bookkeeping (optional; the schema literal is unchanged).
    stream?: StreamAdmissionState;
};
export type StreamReservation = { seconds: number; createdAtMs: number; expiresAtMs: number };
export type StreamAdmissionState = {
    // Sum of `reservations`: maxDurationSeconds Stream booked at upload creation and still holds.
    openReservedSeconds: number;
    reservations: Record<string, StreamReservation>;
    // Durations of videos that reached READY_VERIFIED (never decremented: a conservative bound).
    verifiedStorageSeconds: number;
    storageMinutesUsed?: number;
    storageObservedAtMs?: number;
    lastWebhookAtMs?: number;
    // Stuck terminations in the last 24 h (bounded list) and the latest one.
    stuckAtMs?: number[];
    lastStuckAtMs?: number;
};
export type AdmissionLease = {
    leaseId: string;
    expiresAtMs: number;
};
export type AdmissionResolutionCode = 'PROVIDER_ABSENCE_CONFIRMED'
    | 'TUS_TERMINATION_CONFIRMED'
    | 'INVENTORY_RECONCILED'
    | 'BUDGET_WINDOW_ROLLED';
export type AdmissionReopenInput = {
    idempotencyKey: string;
    operatorId: string;
    closureCode: string;
    closureObservedAtMs: number;
    incidentId: string;
    evidenceSha256: string;
    resolutionCode: AdmissionResolutionCode;
    jobId: string | null;
    generation: number | null;
};
export type LivepeerWebhookQueueMessage = {
    schema: 'youtick.livepeer-webhook-queue.v1';
    network: string;
    contract_id: string;
    job_id: string;
    generation: number;
    enqueued_at_ms: string;
    raw_body_base64: string;
    // Optional, Stream only (Studio messages are unchanged): the adapter and the signed time.
    provider?: 'stream';
    signed_time_ms?: string;
};
