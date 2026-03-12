import type { KeyPair } from 'near-api-js';
import { NEAR_CONFIG } from '../constants';
import { BrowserKeyStore } from '../keystore-v7';
import { getActiveUploadSessionKey } from '../upload-session-manager';
import type { WalletInstance } from '../types';

const KMS_BASE_URL =
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

let kmsHealthValidatedAt = 0;
let kmsHealthValidationPromise: Promise<void> | null = null;

export interface KMSStoreResult {
    videoId: string;
    stored: boolean;
}

export interface KMSRetrieveResult {
    aesKeyB64: string;
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

async function ensureKmsConfigMatchesApp(): Promise<void> {
    if (typeof window === 'undefined') {
        return;
    }

    if (Date.now() - kmsHealthValidatedAt < KMS_HEALTH_CACHE_MS) {
        return;
    }

    if (kmsHealthValidationPromise) {
        return kmsHealthValidationPromise;
    }

    kmsHealthValidationPromise = (async () => {
        let response: Response;

        try {
            response = await fetch(`${KMS_BASE_URL}/health`, {
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

        kmsHealthValidatedAt = Date.now();
    })().finally(() => {
        kmsHealthValidationPromise = null;
    });

    return kmsHealthValidationPromise;
}

function authCacheKey(accountId: string, action: 'store' | 'retrieve', videoId: string): string {
    return `${AUTH_CACHE_PREFIX}${accountId}:${action}:${videoId}`;
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
    accountId: string,
    action: 'store' | 'retrieve',
    videoId: string,
): KMSAuthToken | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const raw = sessionStorage.getItem(authCacheKey(accountId, action, videoId));
    if (!raw) {
        return null;
    }

    try {
        const token = JSON.parse(raw) as KMSAuthToken;
        if (Date.now() + AUTH_CACHE_SKEW_MS >= token.expiresAt) {
            sessionStorage.removeItem(authCacheKey(accountId, action, videoId));
            return null;
        }
        return token;
    } catch {
        sessionStorage.removeItem(authCacheKey(accountId, action, videoId));
        return null;
    }
}

function persistAuthToken(token: KMSAuthToken): void {
    if (typeof window === 'undefined') {
        return;
    }

    sessionStorage.setItem(
        authCacheKey(token.accountId, token.action, token.videoId),
        JSON.stringify(token),
    );
}

function clearCachedAuthToken(
    accountId: string,
    action: 'store' | 'retrieve',
    videoId: string,
): void {
    if (typeof window === 'undefined') {
        return;
    }

    sessionStorage.removeItem(authCacheKey(accountId, action, videoId));
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
    endpoint: 'store' | 'retrieve',
    accountId: string,
    videoId: string,
    extraBody: Record<string, unknown>,
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

    const signature = keyPair.sign(new TextEncoder().encode(payload));
    const response = await fetch(`${KMS_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
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

async function requestKmsAuthToken(
    videoId: string,
    action: 'store' | 'retrieve',
    accountId: string,
    wallet: WalletInstance,
): Promise<KMSAuthToken> {
    const cached = readCachedAuthToken(accountId, action, videoId);
    if (cached) {
        return cached;
    }

    let challengeResponse: Response;
    try {
        challengeResponse = await fetch(`${KMS_BASE_URL}/auth/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, action, videoId }),
        });
    } catch (fetchError) {
        throw new KMSError(
            'NETWORK_ERROR',
            `KMS Connection failed (${KMS_BASE_URL}). Ensure worker is running.`,
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
        verifyResponse = await fetch(`${KMS_BASE_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            `KMS Connection failed (${KMS_BASE_URL}). Ensure worker is running.`,
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

    persistAuthToken(verifyResult.data);
    return verifyResult.data;
}

async function fetchKmsWithToken<T>(
    endpoint: 'store' | 'retrieve',
    body: Record<string, unknown>,
    token: KMSAuthToken,
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${KMS_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.token}`,
            },
            body: JSON.stringify(body),
        });
    } catch (fetchError) {
        throw new KMSError(
            'NETWORK_ERROR',
            `KMS Connection failed (${KMS_BASE_URL}). Ensure worker is running.`,
            fetchError as Error,
        );
    }

    const result = await response.json() as { ok: boolean; error?: string; data?: T };

    if (!result.ok) {
        if (response.status === 401) {
            clearCachedAuthToken(token.accountId, token.action, token.videoId);
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

export async function storeEncryptionKey(
    videoId: string,
    aesKeyB64: string,
    accountId: string,
    wallet: WalletInstance,
): Promise<KMSStoreResult> {
    await ensureKmsConfigMatchesApp();

    const localResult = await tryLocalSignedKmsRequest<KMSStoreResult>(
        'store',
        accountId,
        videoId,
        { videoId, aesKeyB64 },
    );
    if (localResult) {
        return localResult;
    }

    const token = await requestKmsAuthToken(videoId, 'store', accountId, wallet);

    try {
        return await fetchKmsWithToken<KMSStoreResult>(
            'store',
            { videoId, aesKeyB64 },
            token,
        );
    } catch (error) {
        if (error instanceof KMSError && error.code === 'AUTH_EXPIRED') {
            const refreshed = await requestKmsAuthToken(videoId, 'store', accountId, wallet);
            return fetchKmsWithToken<KMSStoreResult>('store', { videoId, aesKeyB64 }, refreshed);
        }
        throw error;
    }
}

export async function retrieveEncryptionKey(
    videoId: string,
    accountId: string,
    wallet: WalletInstance,
): Promise<string> {
    await ensureKmsConfigMatchesApp();

    const localResult = await tryLocalSignedKmsRequest<KMSRetrieveResult>(
        'retrieve',
        accountId,
        videoId,
        { videoId },
    );
    if (localResult) {
        return localResult.aesKeyB64;
    }

    const token = await requestKmsAuthToken(videoId, 'retrieve', accountId, wallet);

    try {
        const result = await fetchKmsWithToken<KMSRetrieveResult>(
            'retrieve',
            { videoId },
            token,
        );
        return result.aesKeyB64;
    } catch (error) {
        if (error instanceof KMSError && error.code === 'AUTH_EXPIRED') {
            const refreshed = await requestKmsAuthToken(videoId, 'retrieve', accountId, wallet);
            const result = await fetchKmsWithToken<KMSRetrieveResult>('retrieve', { videoId }, refreshed);
            return result.aesKeyB64;
        }
        throw error;
    }
}
