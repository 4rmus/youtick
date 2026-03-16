import type { KeyPair } from 'near-api-js';
import { clearSessionGrantCache, ensureSessionGrant, signSessionGrantPayload, type SessionGrantScope } from '../access-grants';
import { NEAR_CONFIG } from '../constants';
import { BrowserKeyStore } from '../keystore-v7';
import { getThresholdConfig, listActiveDecryptionOperatorEndpoints, listActiveDecryptionOperators } from '../registry';
import { getActiveUploadSessionKey } from '../upload-session-manager';
import type { WalletInstance } from '../types';
import { reconstructSecretFromShares, splitSecretIntoShares, type SecretShare } from './shares';

const DEFAULT_KMS_BASE_URL =
    process.env.NEXT_PUBLIC_KMS_URL ||
    (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:8787'
        : 'https://youtick-kms.araafatsum.workers.dev');

const AUTH_CACHE_PREFIX = 'youtick:kms-auth:';
const AUTH_CACHE_SKEW_MS = 30_000;
const KMS_HEALTH_CACHE_MS = 60_000;

interface KMSHealthData {
    network?: string;
    contract?: string;
}

const kmsHealthValidatedAtByUrl = new Map<string, number>();
const kmsHealthValidationPromiseByUrl = new Map<string, Promise<void>>();

export interface KMSStoreResult {
    videoId: string;
    stored: boolean;
}

export interface KMSRetrieveResult {
    aesKeyB64?: string;
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
    const urls = [DEFAULT_KMS_BASE_URL];

    try {
        const registryUrls = await listActiveDecryptionOperatorEndpoints();
        urls.push(...registryUrls);
    } catch {
        // Registry lookup is best-effort.
    }

    return Array.from(new Set(urls.filter(Boolean)));
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

function authCacheKey(
    baseUrl: string,
    accountId: string,
    action: 'store' | 'retrieve',
    videoId: string,
): string {
    return `${AUTH_CACHE_PREFIX}${baseUrl}:${accountId}:${action}:${videoId}`;
}

function decodeBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function encodeHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
    } catch {
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

    const prefix = accountId ? `${AUTH_CACHE_PREFIX}${accountId}:` : AUTH_CACHE_PREFIX;
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }

    for (const key of keysToRemove) {
        sessionStorage.removeItem(key);
    }
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
            signature: encodeHex(signature.signature),
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

async function trySessionGrantSignedKmsRequest<T>(
    baseUrl: string,
    endpoint: 'store' | 'retrieve',
    accountId: string,
    videoId: string,
    extraBody: Record<string, unknown>,
    wallet: WalletInstance,
    signal?: AbortSignal,
): Promise<T | null> {
    const scope: SessionGrantScope = endpoint === 'store' ? 'Publish' : 'Play';
    const grant = await ensureSessionGrant({
        accountId,
        scope,
        resourceId: videoId,
        wallet,
    });

    if (!grant) {
        return null;
    }

    const timestamp = Date.now();
    const payload = JSON.stringify({
        action: endpoint,
        videoId,
        timestamp,
        originHash: grant.originHash,
        deviceHash: grant.deviceHash,
    });

    const signed = await signSessionGrantPayload(grant, payload);
    const response = await fetch(`${baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
            ...extraBody,
            timestamp,
            signature: signed.signature,
            publicKey: signed.publicKey,
            originHash: signed.originHash,
            deviceHash: signed.deviceHash,
        }),
    });

    const result = await response.json() as { ok: boolean; error?: string; data?: T };

    if (result.ok) {
        return result.data as T;
    }

    if (response.status === 401) {
        clearSessionGrantCache(accountId);
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
        nonce: decodeBase64(challengeResult.data.nonce),
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
        allowTokenFallback?: boolean;
        signal?: AbortSignal;
    },
): Promise<T> {
    await ensureKmsConfigMatchesApp(baseUrl);

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

    const sessionGrantResult = await trySessionGrantSignedKmsRequest<T>(
        baseUrl,
        endpoint,
        accountId,
        videoId,
        extraBody,
        wallet,
        options?.signal,
    );
    if (sessionGrantResult) {
        return sessionGrantResult;
    }

    if (options?.allowTokenFallback === false) {
        throw new KMSError(
            endpoint === 'store' ? 'STORE_FAILED' : 'RETRIEVE_FAILED',
            `Token fallback disabled for ${endpoint}`,
        );
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

    const shares = splitSecretIntoShares(aesKeyB64, totalShares, requiredShares);
    let successfulStores = 0;
    let lastSuccess: KMSStoreResult | null = null;
    let lastError: unknown = null;

    for (let index = 0; index < operators.length; index += 1) {
        const operator = operators[index];
        const share = shares[index];
        try {
            const result = await executeKmsRequest<KMSStoreResult>(
                operator.endpoint,
                'store',
                accountId,
                videoId,
                {
                    videoId,
                    ...({
                        shareB64: share.shareB64,
                        shareId: share.shareId,
                        totalShares,
                        requiredShares,
                        scheme: 'shamir-v1',
                    } satisfies ShareStoreBody),
                },
                wallet,
            );
            successfulStores += 1;
            lastSuccess = result;
        } catch (error) {
            lastError = error;
        }
    }

    if (successfulStores >= requiredShares && lastSuccess) {
        return lastSuccess;
    }

    if (lastError) {
        throw lastError;
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

    const shares: SecretShare[] = [];
    const debugTrace: KMSShareDebugTrace[] = [];
    const controllers = operators.map(() => new AbortController());
    const pendingResults = new Map(
        operators.map((operator, index) => [
            index,
            executeKmsRequest<KMSRetrieveResult>(
                operator.endpoint,
                'retrieve',
                accountId,
                videoId,
                { videoId },
                wallet,
                {
                    allowTokenFallback: false,
                    signal: controllers[index].signal,
                },
            ).then(
                (value) => ({ index, status: 'fulfilled' as const, value }),
                (reason) => ({ index, status: 'rejected' as const, reason }),
            ),
        ]),
    );

    while (pendingResults.size > 0) {
        const settled = await Promise.race(pendingResults.values());
        pendingResults.delete(settled.index);
        const operator = operators[settled.index];

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

        if (typeof settled.value.aesKeyB64 === 'string') {
            controllers.forEach((controller) => controller.abort());
            debugTrace.push({
                operatorEndpoint: operator.endpoint,
                operatorAccountId: settled.value.operatorAccountId,
                status: 'fulfilled',
                returned: 'full-key',
            });
            console.info('[KMS] Share retrieval trace', {
                videoId,
                accountId,
                mode: 'legacy-full-key',
                debugTrace,
            });
            return settled.value.aesKeyB64;
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

    const baseUrls = await listKmsBaseUrls();
    let lastError: unknown = null;

    for (const baseUrl of baseUrls) {
        try {
            await ensureKmsConfigMatchesApp(baseUrl);

            const localResult = await tryLocalSignedKmsRequest<KMSStoreResult>(
                baseUrl,
                'store',
                accountId,
                videoId,
                { videoId, aesKeyB64 },
            );
            if (localResult) {
                return localResult;
            }
        } catch (error) {
            lastError = error;
        }
    }

    for (const baseUrl of baseUrls) {
        try {
            await ensureKmsConfigMatchesApp(baseUrl);

            const sessionGrantResult = await trySessionGrantSignedKmsRequest<KMSStoreResult>(
                baseUrl,
                'store',
                accountId,
                videoId,
                { videoId, aesKeyB64 },
                wallet,
            );
            if (sessionGrantResult) {
                return sessionGrantResult;
            }
        } catch (error) {
            lastError = error;
        }
    }

    for (const baseUrl of baseUrls) {
        try {
            await ensureKmsConfigMatchesApp(baseUrl);

            const token = await requestKmsAuthToken(baseUrl, videoId, 'store', accountId, wallet);
            try {
                return await fetchKmsWithToken<KMSStoreResult>(
                    baseUrl,
                    'store',
                    { videoId, aesKeyB64 },
                    token,
                );
            } catch (error) {
                if (error instanceof KMSError && error.code === 'AUTH_EXPIRED') {
                    const refreshed = await requestKmsAuthToken(baseUrl, videoId, 'store', accountId, wallet);
                    return fetchKmsWithToken<KMSStoreResult>(
                        baseUrl,
                        'store',
                        { videoId, aesKeyB64 },
                        refreshed,
                    );
                }
                throw error;
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    throw new KMSError(
        'STORE_FAILED',
        'No active KMS operator accepted the store request',
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

    const baseUrls = await listKmsBaseUrls();
    let lastError: unknown = null;

    for (const baseUrl of baseUrls) {
        try {
            await ensureKmsConfigMatchesApp(baseUrl);

            const localResult = await tryLocalSignedKmsRequest<KMSRetrieveResult>(
                baseUrl,
                'retrieve',
                accountId,
                videoId,
                { videoId },
            );
            if (localResult?.aesKeyB64) {
                return localResult.aesKeyB64;
            }
        } catch (error) {
            lastError = error;
        }
    }

    for (const baseUrl of baseUrls) {
        try {
            await ensureKmsConfigMatchesApp(baseUrl);

            const sessionGrantResult = await trySessionGrantSignedKmsRequest<KMSRetrieveResult>(
                baseUrl,
                'retrieve',
                accountId,
                videoId,
                { videoId },
                wallet,
            );
            if (sessionGrantResult?.aesKeyB64) {
                return sessionGrantResult.aesKeyB64;
            }
        } catch (error) {
            lastError = error;
        }
    }

    for (const baseUrl of baseUrls) {
        try {
            await ensureKmsConfigMatchesApp(baseUrl);

            const token = await requestKmsAuthToken(baseUrl, videoId, 'retrieve', accountId, wallet);
            try {
                const result = await fetchKmsWithToken<KMSRetrieveResult>(
                    baseUrl,
                    'retrieve',
                    { videoId },
                    token,
                );
                if (result.aesKeyB64) {
                    return result.aesKeyB64;
                }
                throw new KMSError('RETRIEVE_FAILED', 'KMS did not return a reconstructed key');
            } catch (error) {
                if (error instanceof KMSError && error.code === 'AUTH_EXPIRED') {
                    const refreshed = await requestKmsAuthToken(baseUrl, videoId, 'retrieve', accountId, wallet);
                    const result = await fetchKmsWithToken<KMSRetrieveResult>(
                        baseUrl,
                        'retrieve',
                        { videoId },
                        refreshed,
                    );
                    if (result.aesKeyB64) {
                        return result.aesKeyB64;
                    }
                    throw new KMSError('RETRIEVE_FAILED', 'KMS did not return a reconstructed key');
                }
                throw error;
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    throw new KMSError(
        'RETRIEVE_FAILED',
        'No active KMS operator accepted the retrieve request',
    );
}
