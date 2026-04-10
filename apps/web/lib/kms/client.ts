import type { KeyPair } from 'near-api-js';
import { base64Decode, hexEncode } from '../crypto/codec';
import { NEAR_CONFIG } from '../constants';
import { BrowserKeyStore } from '../keystore-v7';
import { getThresholdConfig, listActiveDecryptionOperatorEndpoints, listActiveDecryptionOperators, type RegistryOperatorRecord } from '../registry';
import { getActiveUploadSessionKey } from '../upload-session-manager';
import type { WalletInstance } from '../types';
import { reconstructSecretFromShares, splitSecretIntoShares, type SecretShare } from './shares';

const DEFAULT_KMS_BASE_URL =
    process.env.NEXT_PUBLIC_KMS_URL ||
    (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:8787'
        : '');

const AUTH_CACHE_PREFIX = 'youtick:kms-auth:';
const AUTH_CACHE_SKEW_MS = 30_000;
const KMS_HEALTH_CACHE_MS = 60_000;
const KMS_OPERATOR_STATS_STORAGE_KEY = 'youtick:kms-operator-stats:v1';
const KMS_OPERATOR_FAILURE_COOLDOWN_MS = 60_000;
const KMS_OPERATOR_PRIMARY_BATCH_EXTRA = 1;
const KMS_OPERATOR_HEDGE_DELAY_MS = 250;
const KMS_DEFAULT_LATENCY_MS = 5_000;

interface KMSHealthData {
    network?: string;
    contract?: string;
}

interface KmsEndpointStats {
    avgLatencyMs?: number;
    successCount?: number;
    failureCount?: number;
    lastSuccessAt?: number;
    lastFailureAt?: number;
}

type KmsEndpointStatsStore = Record<string, KmsEndpointStats>;

const kmsHealthValidatedAtByUrl = new Map<string, number>();
const kmsHealthValidationPromiseByUrl = new Map<string, Promise<void>>();
let cachedKmsEndpointStats: KmsEndpointStatsStore | null = null;

export interface KMSStoreResult {
    videoId: string;
    stored: boolean;
}

export interface KMSRetrieveResult {
    shareB64?: string;
    shareId?: number;
    totalShares?: number;
    requiredShares?: number;
    scheme?: string;
    operatorAccountId?: string;
}

export interface KMSShareDebugTrace {
    operatorEndpoint: string;
    operatorAccountId?: string;
    status: 'fulfilled' | 'rejected';
    returned: 'full-key' | 'share' | 'none';
    shareId?: number;
    error?: string;
}

interface ShareStoreBody {
    shareB64: string;
    shareId: number;
    totalShares: number;
    requiredShares: number;
    scheme: 'shamir-v1';
}

interface SettledSuccess<T> {
    index: number;
    status: 'fulfilled';
    value: T;
}

interface SettledFailure {
    index: number;
    status: 'rejected';
    reason: unknown;
}

interface LaunchBackupSignal {
    type: 'launch-backup';
}

type SettledTaskResult<T> = SettledSuccess<T> | SettledFailure;

interface KMSAuthChallenge {
    challengeId: string;
    message: string;
    recipient: string;
    nonce: string;
    expiresAt: number;
}

interface KMSAuthToken {
    token: string;
    accountId: string;
    action: 'store' | 'retrieve';
    videoId: string;
    expiresAt: number;
}

export class KMSError extends Error {
    constructor(
        public code: string,
        message: string,
        public cause?: Error,
    ) {
        super(message);
        this.name = 'KMSError';
    }
}

async function listKmsBaseUrls(): Promise<string[]> {
    const urls = DEFAULT_KMS_BASE_URL ? [DEFAULT_KMS_BASE_URL] : [];

    try {
        const registryUrls = await listActiveDecryptionOperatorEndpoints();
        urls.push(...registryUrls);
    } catch (error) {
        console.warn('[KMS] Error fetching operator endpoints from registry:', error);
    }

    return sortUrlsByKmsPreference(Array.from(new Set(urls.filter(Boolean))));
}

async function ensureKmsConfigMatchesApp(baseUrl: string): Promise<void> {
    if (typeof window === 'undefined') {
        return;
    }

    const validatedAt = kmsHealthValidatedAtByUrl.get(baseUrl) || 0;
    if (Date.now() - validatedAt < KMS_HEALTH_CACHE_MS) {
        return;
    }

    const pendingPromise = kmsHealthValidationPromiseByUrl.get(baseUrl);
    if (pendingPromise) {
        return pendingPromise;
    }

    const validationPromise = (async () => {
        let response: Response;

        try {
            response = await fetch(`${baseUrl}/health`, {
                method: 'GET',
            });
        } catch {
            return;
        }

        if (!response.ok) {
            return;
        }

        let result: { ok: boolean; data?: KMSHealthData };
        try {
            result = await response.json() as { ok: boolean; data?: KMSHealthData };
        } catch {
            return;
        }

        const health = result.data;
        if (!result.ok || !health) {
            return;
        }

        const healthNetwork = health.network || 'unknown';
        const healthContract = health.contract || 'unknown';
        const networkMismatch = health.network && health.network !== NEAR_CONFIG.networkId;
        const contractMismatch = health.contract && health.contract !== NEAR_CONFIG.contractId;

        if (networkMismatch || contractMismatch) {
            throw new KMSError(
                'CONFIG_MISMATCH',
                `KMS is using ${healthContract} on ${healthNetwork}, but the app is using ${NEAR_CONFIG.contractId} on ${NEAR_CONFIG.networkId}. Update NEXT_PUBLIC_KMS_URL or redeploy the worker with the matching NEAR_CONTRACT_ID.`,
            );
        }

        kmsHealthValidatedAtByUrl.set(baseUrl, Date.now());
    })().finally(() => {
        kmsHealthValidationPromiseByUrl.delete(baseUrl);
    });

    kmsHealthValidationPromiseByUrl.set(baseUrl, validationPromise);
    return validationPromise;
}

function readKmsEndpointStats(): KmsEndpointStatsStore {
    if (cachedKmsEndpointStats) {
        return cachedKmsEndpointStats;
    }

    if (typeof window === 'undefined') {
        cachedKmsEndpointStats = {};
        return cachedKmsEndpointStats;
    }

    try {
        const raw = localStorage.getItem(KMS_OPERATOR_STATS_STORAGE_KEY);
        cachedKmsEndpointStats = raw ? JSON.parse(raw) as KmsEndpointStatsStore : {};
    } catch (error) {
        console.warn('[KMS] Error reading endpoint stats from localStorage:', error);
        cachedKmsEndpointStats = {};
    }

    return cachedKmsEndpointStats;
}

function persistKmsEndpointStats(stats: KmsEndpointStatsStore): void {
    cachedKmsEndpointStats = stats;

    if (typeof window === 'undefined') {
        return;
    }

    try {
        localStorage.setItem(KMS_OPERATOR_STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch {
        // Ignore storage failures; ordering falls back to registry order.
    }
}

function updateKmsEndpointStats(
    endpoint: string,
    updater: (current: KmsEndpointStats) => KmsEndpointStats,
): void {
    const stats = {
        ...readKmsEndpointStats(),
    };

    stats[endpoint] = updater(stats[endpoint] || {});
    persistKmsEndpointStats(stats);
}

function recordKmsEndpointSuccess(endpoint: string, latencyMs: number): void {
    updateKmsEndpointStats(endpoint, (current) => ({
        avgLatencyMs: current.avgLatencyMs
            ? Math.round((current.avgLatencyMs * 0.7) + (latencyMs * 0.3))
            : latencyMs,
        successCount: (current.successCount || 0) + 1,
        failureCount: current.failureCount || 0,
        lastSuccessAt: Date.now(),
        lastFailureAt: current.lastFailureAt,
    }));
}

function recordKmsEndpointFailure(endpoint: string): void {
    updateKmsEndpointStats(endpoint, (current) => ({
        avgLatencyMs: current.avgLatencyMs,
        successCount: current.successCount || 0,
        failureCount: (current.failureCount || 0) + 1,
        lastSuccessAt: current.lastSuccessAt,
        lastFailureAt: Date.now(),
    }));
}

function isKmsEndpointCoolingDown(endpoint: string): boolean {
    const stats = readKmsEndpointStats()[endpoint];
    if (!stats?.lastFailureAt) {
        return false;
    }

    if ((stats.lastSuccessAt || 0) >= stats.lastFailureAt) {
        return false;
    }

    return (Date.now() - stats.lastFailureAt) < KMS_OPERATOR_FAILURE_COOLDOWN_MS;
}

function sortUrlsByKmsPreference(urls: string[]): string[] {
    const stats = readKmsEndpointStats();

    return [...urls]
        .map((url, index) => ({
            url,
            index,
            stats: stats[url],
            coolingDown: isKmsEndpointCoolingDown(url),
        }))
        .sort((a, b) => {
            if (a.coolingDown !== b.coolingDown) {
                return a.coolingDown ? 1 : -1;
            }

            const aLatency = a.stats?.avgLatencyMs ?? (KMS_DEFAULT_LATENCY_MS + a.index);
            const bLatency = b.stats?.avgLatencyMs ?? (KMS_DEFAULT_LATENCY_MS + b.index);
            if (aLatency !== bLatency) {
                return aLatency - bLatency;
            }

            const aFailures = a.stats?.failureCount ?? 0;
            const bFailures = b.stats?.failureCount ?? 0;
            if (aFailures !== bFailures) {
                return aFailures - bFailures;
            }

            return a.index - b.index;
        })
        .map((entry) => entry.url);
}

function sortOperatorsByKmsPreference<T extends { endpoint: string }>(operators: T[]): T[] {
    const orderedEndpoints = sortUrlsByKmsPreference(operators.map((operator) => operator.endpoint));
    const endpointRank = new Map(orderedEndpoints.map((endpoint, index) => [endpoint, index]));

    return [...operators].sort(
        (a, b) => (endpointRank.get(a.endpoint) ?? 0) - (endpointRank.get(b.endpoint) ?? 0),
    );
}

function shouldRecordKmsEndpointFailure(error: unknown): boolean {
    if ((error as DOMException | undefined)?.name === 'AbortError') {
        return false;
    }

    if (error instanceof KMSError) {
        return !['ACCESS_DENIED', 'NOT_FOUND', 'AUTH_REJECTED', 'CONFIG_MISMATCH'].includes(error.code);
    }

    return true;
}

function getPrimaryOperatorBatchSize(totalOperators: number, requiredShares: number): number {
    return Math.min(
        totalOperators,
        Math.max(requiredShares + KMS_OPERATOR_PRIMARY_BATCH_EXTRA, requiredShares),
    );
}

function createSettledPromise<T>(index: number, promise: Promise<T>): Promise<SettledTaskResult<T>> {
    return promise.then(
        (value) => ({ index, status: 'fulfilled' as const, value }),
        (reason) => ({ index, status: 'rejected' as const, reason }),
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function authCacheKey(
    baseUrl: string,
    accountId: string,
    action: 'store' | 'retrieve',
    videoId: string,
): string {
    return `${AUTH_CACHE_PREFIX}${baseUrl}:${accountId}:${action}:${videoId}`;
}

function readCachedAuthToken(
    baseUrl: string,
    accountId: string,
    action: 'store' | 'retrieve',
    videoId: string,
): KMSAuthToken | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const raw = sessionStorage.getItem(authCacheKey(baseUrl, accountId, action, videoId));
    if (!raw) {
        return null;
    }

    try {
        const token = JSON.parse(raw) as KMSAuthToken;
        if (Date.now() + AUTH_CACHE_SKEW_MS >= token.expiresAt) {
            sessionStorage.removeItem(authCacheKey(baseUrl, accountId, action, videoId));
            return null;
        }
        return token;
    } catch (error) {
        console.warn('[KMS] Error parsing cached auth token:', error);
        sessionStorage.removeItem(authCacheKey(baseUrl, accountId, action, videoId));
        return null;
    }
}

function persistAuthToken(baseUrl: string, token: KMSAuthToken): void {
    if (typeof window === 'undefined') {
        return;
    }

    sessionStorage.setItem(
        authCacheKey(baseUrl, token.accountId, token.action, token.videoId),
        JSON.stringify(token),
    );
}

function clearCachedAuthToken(
    baseUrl: string,
    accountId: string,
    action: 'store' | 'retrieve',
    videoId: string,
): void {
    if (typeof window === 'undefined') {
        return;
    }

    sessionStorage.removeItem(authCacheKey(baseUrl, accountId, action, videoId));
}

export function clearKmsAuthCache(accountId?: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key?.startsWith(AUTH_CACHE_PREFIX)) {
            continue;
        }
        if (accountId && !key.includes(`:${accountId}:`)) {
            continue;
        }
        keysToRemove.push(key);
    }

    for (const key of keysToRemove) {
        sessionStorage.removeItem(key);
    }
}

export function clearKmsOperatorStats(): void {
    cachedKmsEndpointStats = null;

    if (typeof window === 'undefined') {
        return;
    }

    localStorage.removeItem(KMS_OPERATOR_STATS_STORAGE_KEY);
}

async function getLocalKmsSigningKey(accountId: string): Promise<KeyPair | null> {
    const activeUploadSessionKey = getActiveUploadSessionKey(accountId);
    if (activeUploadSessionKey) {
        return activeUploadSessionKey;
    }

    const keyStore = new BrowserKeyStore();
    const defaultKey = await keyStore.getKey(NEAR_CONFIG.networkId, accountId);
    if (defaultKey) {
        return defaultKey;
    }

    // Meteor wallet stores its browser-managed key under a custom prefix.
    const meteorKeyStore = new BrowserKeyStore('_meteor_wallet');
    return await meteorKeyStore.getKey(NEAR_CONFIG.networkId, accountId);
}

async function tryLocalSignedKmsRequest<T>(
    baseUrl: string,
    endpoint: 'store' | 'retrieve',
    accountId: string,
    videoId: string,
    extraBody: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<T | null> {
    const keyPair = await getLocalKmsSigningKey(accountId);
    if (!keyPair) {
        return null;
    }

    const timestamp = Date.now();
    const payload = JSON.stringify({
        action: endpoint,
        videoId,
        accountId,
        timestamp,
    });

    const signature = await keyPair.sign(new TextEncoder().encode(payload));
    const response = await fetch(`${baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
            ...extraBody,
            accountId,
            timestamp,
            signature: hexEncode(signature.signature),
            publicKey: keyPair.getPublicKey().toString(),
        }),
    });

    const result = await response.json() as { ok: boolean; error?: string; data?: T };

    if (result.ok) {
        return result.data as T;
    }

    if (response.status === 401) {
        return null;
    }

    throw new KMSError(
        endpoint === 'store' ? 'STORE_FAILED' : 'RETRIEVE_FAILED',
        result.error || `Failed to ${endpoint} key`,
    );
}

async function requestKmsAuthToken(
    baseUrl: string,
    videoId: string,
    action: 'store' | 'retrieve',
    accountId: string,
    wallet: WalletInstance,
    signal?: AbortSignal,
): Promise<KMSAuthToken> {
    const cached = readCachedAuthToken(baseUrl, accountId, action, videoId);
    if (cached) {
        return cached;
    }

    let challengeResponse: Response;
    try {
        challengeResponse = await fetch(`${baseUrl}/auth/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({ accountId, action, videoId }),
        });
    } catch (fetchError) {
        throw new KMSError(
            'NETWORK_ERROR',
            `KMS Connection failed (${baseUrl}). Ensure worker is running.`,
            fetchError as Error,
        );
    }

    const challengeResult = await challengeResponse.json() as {
        ok: boolean;
        error?: string;
        data?: KMSAuthChallenge;
    };

    if (!challengeResult.ok || !challengeResult.data) {
        throw new KMSError(
            'AUTH_CHALLENGE_FAILED',
            challengeResult.error || 'Failed to create KMS auth challenge',
        );
    }

    const signedMessage = await wallet.signMessage({
        message: challengeResult.data.message,
        recipient: challengeResult.data.recipient,
        nonce: base64Decode(challengeResult.data.nonce),
    });

    if (!signedMessage) {
        throw new KMSError('AUTH_REJECTED', 'Wallet did not return a signed message');
    }

    let verifyResponse: Response;
    try {
        verifyResponse = await fetch(`${baseUrl}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                challengeId: challengeResult.data.challengeId,
                accountId: signedMessage.accountId,
                publicKey: signedMessage.publicKey,
                signature: signedMessage.signature,
            }),
        });
    } catch (fetchError) {
        throw new KMSError(
            'NETWORK_ERROR',
            `KMS Connection failed (${baseUrl}). Ensure worker is running.`,
            fetchError as Error,
        );
    }

    const verifyResult = await verifyResponse.json() as {
        ok: boolean;
        error?: string;
        data?: KMSAuthToken;
    };

    if (!verifyResult.ok || !verifyResult.data) {
        throw new KMSError(
            verifyResponse.status === 401 ? 'AUTH_REJECTED' : 'AUTH_VERIFY_FAILED',
            verifyResult.error || 'Failed to verify KMS auth challenge',
        );
    }

    persistAuthToken(baseUrl, verifyResult.data);
    return verifyResult.data;
}

async function fetchKmsWithToken<T>(
    baseUrl: string,
    endpoint: 'store' | 'retrieve',
    body: Record<string, unknown>,
    token: KMSAuthToken,
    signal?: AbortSignal,
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${baseUrl}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.token}`,
            },
            signal,
            body: JSON.stringify(body),
        });
    } catch (fetchError) {
        throw new KMSError(
            'NETWORK_ERROR',
            `KMS Connection failed (${baseUrl}). Ensure worker is running.`,
            fetchError as Error,
        );
    }

    const result = await response.json() as { ok: boolean; error?: string; data?: T };

    if (!result.ok) {
        if (response.status === 401) {
            clearCachedAuthToken(baseUrl, token.accountId, token.action, token.videoId);
            throw new KMSError('AUTH_EXPIRED', result.error || 'KMS authorization expired');
        }
        if (response.status === 403) {
            throw new KMSError('ACCESS_DENIED', result.error || 'Access denied');
        }
        if (response.status === 404) {
            throw new KMSError('NOT_FOUND', result.error || 'Key not found');
        }
        throw new KMSError(
            endpoint === 'store' ? 'STORE_FAILED' : 'RETRIEVE_FAILED',
            result.error || `Failed to ${endpoint} key`,
        );
    }

    return result.data as T;
}

async function executeKmsRequest<T>(
    baseUrl: string,
    endpoint: 'store' | 'retrieve',
    accountId: string,
    videoId: string,
    extraBody: Record<string, unknown>,
    wallet: WalletInstance,
    options?: {
        signal?: AbortSignal;
    },
): Promise<T> {
    await ensureKmsConfigMatchesApp(baseUrl);

    // AG-1 fix: Try local key signing first (upload session or browser keystore).
    // If unavailable, fall through to NEP-413 wallet signing via Bearer tokens.
    // The old session-grant path that stored private keys in sessionStorage has been removed.
    const localResult = await tryLocalSignedKmsRequest<T>(
        baseUrl,
        endpoint,
        accountId,
        videoId,
        extraBody,
        options?.signal,
    );
    if (localResult) {
        return localResult;
    }

    const token = await requestKmsAuthToken(baseUrl, videoId, endpoint, accountId, wallet, options?.signal);
    try {
        return await fetchKmsWithToken<T>(
            baseUrl,
            endpoint,
            extraBody,
            token,
            options?.signal,
        );
    } catch (error) {
        if (error instanceof KMSError && error.code === 'AUTH_EXPIRED') {
            const refreshed = await requestKmsAuthToken(baseUrl, videoId, endpoint, accountId, wallet);
            return fetchKmsWithToken<T>(
                baseUrl,
                endpoint,
                extraBody,
                refreshed,
                options?.signal,
            );
        }
        throw error;
    }
}

async function executeTimedKmsRequest<T>(
    baseUrl: string,
    endpoint: 'store' | 'retrieve',
    accountId: string,
    videoId: string,
    extraBody: Record<string, unknown>,
    wallet: WalletInstance,
    options?: {
        signal?: AbortSignal;
    },
): Promise<T> {
    const startedAt = Date.now();

    try {
        const result = await executeKmsRequest<T>(
            baseUrl,
            endpoint,
            accountId,
            videoId,
            extraBody,
            wallet,
            options,
        );

        recordKmsEndpointSuccess(baseUrl, Math.max(1, Date.now() - startedAt));
        return result;
    } catch (error) {
        if (shouldRecordKmsEndpointFailure(error)) {
            recordKmsEndpointFailure(baseUrl);
        }
        throw error;
    }
}

async function storeShareBatch(
    entries: Array<{ operator: RegistryOperatorRecord; share: SecretShare }>,
    videoId: string,
    accountId: string,
    wallet: WalletInstance,
    totalShares: number,
    requiredShares: number,
    initialState?: {
        successfulStores: number;
        lastSuccess: KMSStoreResult | null;
        lastError: unknown;
    },
): Promise<{
    successfulStores: number;
    lastSuccess: KMSStoreResult | null;
    lastError: unknown;
}> {
    let successfulStores = initialState?.successfulStores || 0;
    let lastSuccess: KMSStoreResult | null = initialState?.lastSuccess || null;
    let lastError: unknown = initialState?.lastError ?? null;

    const pendingResults = new Map(
        entries.map((entry, index) => [
            index,
            createSettledPromise(
                index,
                executeTimedKmsRequest<KMSStoreResult>(
                    entry.operator.endpoint,
                    'store',
                    accountId,
                    videoId,
                    {
                        videoId,
                        ...({
                            shareB64: entry.share.shareB64,
                            shareId: entry.share.shareId,
                            totalShares,
                            requiredShares,
                            scheme: 'shamir-v1',
                        } satisfies ShareStoreBody),
                    },
                    wallet,
                ),
            ),
        ]),
    );

    while (pendingResults.size > 0) {
        const settled = await Promise.race(pendingResults.values());
        pendingResults.delete(settled.index);

        if (settled.status === 'fulfilled') {
            successfulStores += 1;
            lastSuccess = settled.value;
            if (successfulStores >= requiredShares) {
                return { successfulStores, lastSuccess, lastError };
            }
            continue;
        }

        lastError = settled.reason;
    }

    return { successfulStores, lastSuccess, lastError };
}

async function storeEncryptionKeyShares(
    videoId: string,
    aesKeyB64: string,
    accountId: string,
    wallet: WalletInstance,
): Promise<KMSStoreResult | null> {
    const operators = await listActiveDecryptionOperators();
    const threshold = await getThresholdConfig();

    const requiredShares = threshold?.required_shares ?? 0;
    const totalShares = operators.length;

    if (requiredShares < 2 || totalShares < requiredShares) {
        return null;
    }

    const orderedOperators = sortOperatorsByKmsPreference(operators);
    const shares = splitSecretIntoShares(aesKeyB64, totalShares, requiredShares);
    const entries = orderedOperators.map((operator, index) => ({
        operator,
        share: shares[index],
    }));
    const primaryBatchSize = getPrimaryOperatorBatchSize(entries.length, requiredShares);

    let state = await storeShareBatch(
        entries.slice(0, primaryBatchSize),
        videoId,
        accountId,
        wallet,
        totalShares,
        requiredShares,
    );

    if (state.successfulStores >= requiredShares && state.lastSuccess) {
        for (const entry of entries.slice(primaryBatchSize)) {
            void executeTimedKmsRequest<KMSStoreResult>(
                entry.operator.endpoint,
                'store',
                accountId,
                videoId,
                {
                    videoId,
                    ...({
                        shareB64: entry.share.shareB64,
                        shareId: entry.share.shareId,
                        totalShares,
                        requiredShares,
                        scheme: 'shamir-v1',
                    } satisfies ShareStoreBody),
                },
                wallet,
            ).catch(() => undefined);
        }

        return state.lastSuccess;
    }

    state = await storeShareBatch(
        entries.slice(primaryBatchSize),
        videoId,
        accountId,
        wallet,
        totalShares,
        requiredShares,
        state,
    );

    if (state.successfulStores >= requiredShares && state.lastSuccess) {
        return state.lastSuccess;
    }

    if (state.lastError) {
        throw state.lastError;
    }

    return null;
}

async function retrieveEncryptionKeyShares(
    videoId: string,
    accountId: string,
    wallet: WalletInstance,
): Promise<string | null> {
    const operators = await listActiveDecryptionOperators();
    const threshold = await getThresholdConfig();
    const requiredShares = threshold?.required_shares ?? 0;

    if (requiredShares < 2 || operators.length < requiredShares) {
        return null;
    }

    const orderedOperators = sortOperatorsByKmsPreference(operators);
    const shares: SecretShare[] = [];
    const debugTrace: KMSShareDebugTrace[] = [];
    const controllers = orderedOperators.map(() => new AbortController());
    const pendingResults = new Map<number, Promise<SettledTaskResult<KMSRetrieveResult>>>();
    const primaryBatchSize = getPrimaryOperatorBatchSize(orderedOperators.length, requiredShares);
    let launchedCount = 0;

    const queueRetrieveBatch = (endExclusive: number): void => {
        for (let index = launchedCount; index < endExclusive; index += 1) {
            const operator = orderedOperators[index];
            pendingResults.set(
                index,
                createSettledPromise(
                    index,
                    executeTimedKmsRequest<KMSRetrieveResult>(
                        operator.endpoint,
                        'retrieve',
                        accountId,
                        videoId,
                        { videoId },
                        wallet,
                        {
                            signal: controllers[index].signal,
                        },
                    ),
                ),
            );
        }

        launchedCount = endExclusive;
    };

    queueRetrieveBatch(primaryBatchSize);

    let backupSignal: Promise<LaunchBackupSignal> | null =
        launchedCount < orderedOperators.length
            ? delay(KMS_OPERATOR_HEDGE_DELAY_MS).then(() => ({ type: 'launch-backup' as const }))
            : null;

    while (pendingResults.size > 0 || launchedCount < orderedOperators.length) {
        if (pendingResults.size === 0 && launchedCount < orderedOperators.length) {
            queueRetrieveBatch(orderedOperators.length);
            backupSignal = null;
            continue;
        }

        const raceCandidates: Array<Promise<SettledTaskResult<KMSRetrieveResult> | LaunchBackupSignal>> = [
            ...pendingResults.values(),
        ];
        if (backupSignal) {
            raceCandidates.push(backupSignal);
        }

        const settled = await Promise.race(raceCandidates);
        if ('type' in settled) {
            queueRetrieveBatch(orderedOperators.length);
            backupSignal = null;
            continue;
        }

        pendingResults.delete(settled.index);
        const operator = orderedOperators[settled.index];

        if (settled.status === 'rejected') {
            if ((settled.reason as DOMException | undefined)?.name === 'AbortError') {
                continue;
            }

            debugTrace.push({
                operatorEndpoint: operator.endpoint,
                status: 'rejected',
                returned: 'none',
                error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            });
            continue;
        }

        if (settled.value.shareB64 && typeof settled.value.shareId === 'number') {
            shares.push({
                shareB64: settled.value.shareB64,
                shareId: settled.value.shareId,
            });
            debugTrace.push({
                operatorEndpoint: operator.endpoint,
                operatorAccountId: settled.value.operatorAccountId,
                status: 'fulfilled',
                returned: 'share',
                shareId: settled.value.shareId,
            });

            if (shares.length >= requiredShares) {
                controllers.forEach((controller) => controller.abort());
                const reconstructed = reconstructSecretFromShares(shares, requiredShares);
                console.info('[KMS] Share retrieval trace', {
                    videoId,
                    accountId,
                    mode: 'reconstructed',
                    requiredShares,
                    collectedShares: shares.length,
                    shareIds: shares.map((share) => share.shareId),
                    debugTrace,
                });
                return reconstructed;
            }
        } else {
            debugTrace.push({
                operatorEndpoint: operator.endpoint,
                operatorAccountId: settled.value.operatorAccountId,
                status: 'fulfilled',
                returned: 'none',
            });
        }
    }

    if (shares.length < requiredShares) {
        console.warn('[KMS] Share retrieval trace', {
            videoId,
            accountId,
            mode: 'insufficient-shares',
            requiredShares,
            collectedShares: shares.length,
            debugTrace,
        });
        return null;
    }

    return reconstructSecretFromShares(shares, requiredShares);
}

export async function storeEncryptionKey(
    videoId: string,
    aesKeyB64: string,
    accountId: string,
    wallet: WalletInstance,
): Promise<KMSStoreResult> {
    const shareResult = await storeEncryptionKeyShares(
        videoId,
        aesKeyB64,
        accountId,
        wallet,
    );
    if (shareResult) {
        return shareResult;
    }

    throw new KMSError(
        'SHARE_STORE_FAILED',
        'Share-based key storage failed. Ensure active operators are registered in the registry and threshold config is valid.',
    );
}

export async function retrieveEncryptionKey(
    videoId: string,
    accountId: string,
    wallet: WalletInstance,
): Promise<string> {
    const shareResult = await retrieveEncryptionKeyShares(
        videoId,
        accountId,
        wallet,
    );
    if (shareResult) {
        return shareResult;
    }

    throw new KMSError(
        'RETRIEVE_FAILED',
        'Could not reconstruct encryption key from operator shares. Ensure operators are active and threshold is met.',
    );
}
