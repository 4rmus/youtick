import type { MediaProfileId, OutboxMethod } from './types';

export const MAX_CONTROL_BODY_BYTES = 64 * 1024;
export const MAX_SOURCE_BYTES = 20_000_000_000n;
export const PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES = 1_000_000_000n;
export const MIN_CREATOR_UPLOAD_FEE_USD_MICROS = 500_000n;
export const CREATOR_FEE_QUOTE_LIFETIME_MS = 120_000;
export const SPONSORED_RELAY_REJECTION_CODES = Object.freeze({
    delegate_decode: 'invalid_sponsored_upload_relay_delegate_decode',
    delegate_shape: 'invalid_sponsored_upload_relay_delegate_shape',
    quote_validation: 'invalid_sponsored_upload_relay_quote_validation',
    signature_validation: 'invalid_sponsored_upload_relay_signature_validation',
    freshness: 'invalid_sponsored_upload_relay_freshness',
    access_key: 'invalid_sponsored_upload_relay_access_key',
});
export const CONTROL_MAX_FUTURE_MS = 5 * 60 * 1000;
export const LIFECYCLE_DELETE_BATCH = 128;
export const PLAYBACK_MIN_TTL_SECONDS = 120;
export const PLAYBACK_MAX_TTL_SECONDS = 300;
export const PLAYBACK_V2_TTL_SECONDS = 180;
export const STREAM_DEFAULT_STUCK_TIMEOUT_MS = 15 * 60 * 1000;
export const PROVIDER_POLICY_CACHE_MS = 30 * 1000;
export const JOB_KEY = 'job:v1';
export const RECONCILE_KEY = 'reconcile:v1';
export const RECONCILE_HEALTHY_INTERVAL_MS = 15 * 60 * 1000;
export const RECONCILE_CONFIRMATION_MS = 60 * 1000;
export const RECONCILE_BACKOFF_MS = [60, 120, 240, 480, 900].map((seconds) => seconds * 1000);
export const OPERATOR_ARCHIVE_SCAN_KEY = 'operator:archive-scan:v1';
export const ADMISSION_KEY = 'admission:v1';
export const ADMISSION_LEASE_HEARTBEAT_MS = 5 * 60 * 1000;
export const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
export const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const SESSION_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const LEASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
export const PLAYBACK_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
// V1 (Preview, public testnet) keeps the Livepeer-named methods; Market V2 (gate MC) renamed them.
export const V1_OUTBOX_METHODS = new Set<OutboxMethod>([
    'finalize_livepeer_publication',
    'suspend_livepeer_sales',
]);
export const NEUTRAL_OUTBOX_METHODS = new Set<OutboxMethod>(['finalize_publication', 'suspend_sales']);
// Env-less record validity: records of either generation stay valid in storage and status reads.
export const OUTBOX_METHODS = new Set<OutboxMethod>([...V1_OUTBOX_METHODS, ...NEUTRAL_OUTBOX_METHODS]);
export const LEGACY_PROFILE_ID = 'paid-media-livepeer-v1' satisfies MediaProfileId;
