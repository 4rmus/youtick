import { actions, KeyPair, type KeyPairString } from 'near-api-js';
import { GAS_CONSTANTS, NEAR_CONFIG } from './constants';
import type { WalletInstance } from './types';

const ACCESS_GRANT_CACHE_PREFIX = 'youtick:access-grant:';
const ACCESS_GRANT_SKEW_MS = 30_000;
// AG-1 fix: In-memory cache for session grants with secret keys.
// Keyed by cache key string. Cleared on page unload (sessionStorage lifecycle).
const inMemoryGrants = new Map<string, BrowserSessionGrant>();
const pendingGrantPromises = new Map<string, Promise<BrowserSessionGrant | null>>();

export type SessionGrantScope = 'Play' | 'Publish' | 'ClaimGift' | 'ClaimTrial';

export interface BrowserSessionGrant {
    accountId: string;
    sessionPublicKey: string;
    secretKey: KeyPairString;
    scope: SessionGrantScope;
    resourceId: string | null;
    expiresAt: number;
    originHash: string | null;
    deviceHash: string | null;
}

// AG-1 fix: Only public metadata is persisted to sessionStorage.
// The secretKey is held in memory only and never written to browser storage.
interface PersistedSessionGrant {
    accountId: string;
    sessionPublicKey: string;
    scope: SessionGrantScope;
    resourceId: string | null;
    expiresAt: number;
    originHash: string | null;
    deviceHash: string | null;
}

function cacheKey(accountId: string, scope: SessionGrantScope, resourceId?: string): string {
    return `${ACCESS_GRANT_CACHE_PREFIX}${accountId}:${scope}:${resourceId || '*'}`;
}

function getScopeTtlMs(scope: SessionGrantScope): number {
    switch (scope) {
        case 'Play':
            return 5 * 60 * 1000;
        case 'Publish':
            return 10 * 60 * 1000;
        case 'ClaimGift':
        case 'ClaimTrial':
            return 5 * 60 * 1000;
    }
}

async function hashString(input: string): Promise<string> {
    if (typeof window === 'undefined') {
        return input;
    }

    if (window.crypto?.subtle) {
        const bytes = new TextEncoder().encode(input);
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    return btoa(input);
}

async function getOriginHash(): Promise<string | null> {
    if (typeof window === 'undefined' || !window.location?.origin) {
        return null;
    }

    return hashString(window.location.origin);
}

async function getDeviceHash(): Promise<string | null> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return null;
    }

    const seed = [
        navigator.userAgent,
        navigator.language,
        navigator.platform,
        String(navigator.hardwareConcurrency || 0),
    ].join('::');

    return hashString(seed);
}

function readCachedGrant(accountId: string, scope: SessionGrantScope, resourceId?: string): BrowserSessionGrant | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const key = cacheKey(accountId, scope, resourceId);

    // AG-1 fix: Check in-memory cache first (has secretKey).
    const inMemory = inMemoryGrants.get(key);
    if (inMemory) {
        if (Date.now() + ACCESS_GRANT_SKEW_MS >= inMemory.expiresAt) {
            inMemoryGrants.delete(key);
            sessionStorage.removeItem(key);
            return null;
        }
        return inMemory;
    }

    // Check sessionStorage for public metadata only (no secretKey).
    // This handles page navigations within the same tab where in-memory was lost
    // but the grant is still valid — the caller will need to re-issue if signing is required.
    const raw = sessionStorage.getItem(key);
    if (!raw) {
        return null;
    }

    try {
        const persisted = JSON.parse(raw) as PersistedSessionGrant;
        if (Date.now() + ACCESS_GRANT_SKEW_MS >= persisted.expiresAt) {
            sessionStorage.removeItem(key);
            return null;
        }
        // Secret key not available from persisted storage — caller must re-issue.
        return null;
    } catch {
        sessionStorage.removeItem(key);
        return null;
    }
}

function persistGrant(grant: BrowserSessionGrant): void {
    if (typeof window === 'undefined') {
        return;
    }

    const key = cacheKey(grant.accountId, grant.scope, grant.resourceId || undefined);

    // AG-1 fix: Store full grant (with secretKey) in memory only.
    // Persist only public metadata to sessionStorage.
    inMemoryGrants.set(key, grant);

    const persisted: PersistedSessionGrant = {
        accountId: grant.accountId,
        sessionPublicKey: grant.sessionPublicKey,
        scope: grant.scope,
        resourceId: grant.resourceId,
        expiresAt: grant.expiresAt,
        originHash: grant.originHash,
        deviceHash: grant.deviceHash,
    };
    sessionStorage.setItem(key, JSON.stringify(persisted));
}

export function clearSessionGrantCache(accountId?: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    const prefix = accountId ? `${ACCESS_GRANT_CACHE_PREFIX}${accountId}:` : ACCESS_GRANT_CACHE_PREFIX;
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }

    for (const key of keysToRemove) {
        sessionStorage.removeItem(key);
        inMemoryGrants.delete(key);
        pendingGrantPromises.delete(key);
    }
}

export async function ensureSessionGrant(params: {
    accountId: string;
    scope: SessionGrantScope;
    resourceId?: string;
    wallet: WalletInstance;
    skipCache?: boolean;
}): Promise<BrowserSessionGrant | null> {
    if (typeof window === 'undefined') {
        return null;
    }

    if (typeof params.wallet.signAndSendTransaction !== 'function') {
        return null;
    }

    const cacheStorageKey = cacheKey(params.accountId, params.scope, params.resourceId);
    if (!params.skipCache) {
        const cached = readCachedGrant(params.accountId, params.scope, params.resourceId);
        if (cached) {
            return cached;
        }
    } else {
        // Explicit invalidation: purge any stale entry before issuing a new grant
        clearSessionGrantCache(params.accountId);
    }

    const pendingGrant = pendingGrantPromises.get(cacheStorageKey);
    if (pendingGrant) {
        return pendingGrant;
    }

    const grantPromise = (async () => {
        const keyPair = KeyPair.fromRandom('ed25519');
        const sessionPublicKey = keyPair.getPublicKey().toString();
        const ttlMs = getScopeTtlMs(params.scope);
        const originHash = await getOriginHash();
        const deviceHash = await getDeviceHash();

        await params.wallet.signAndSendTransaction({
            receiverId: NEAR_CONFIG.accessContractId,
            actions: [
                actions.functionCall(
                    'issue_session_grant',
                    {
                        session_pk: sessionPublicKey,
                        scope: params.scope,
                        resource_id: params.resourceId || null,
                        ttl_ms: ttlMs,
                        origin_hash: originHash,
                        device_hash: deviceHash,
                    },
                    GAS_CONSTANTS.mediumGas,
                    BigInt(0),
                ),
            ],
        });

        const grant: BrowserSessionGrant = {
            accountId: params.accountId,
            sessionPublicKey,
            secretKey: keyPair.toString(),
            scope: params.scope,
            resourceId: params.resourceId || null,
            expiresAt: Date.now() + ttlMs,
            originHash,
            deviceHash,
        };

        persistGrant(grant);
        return grant;
    })().finally(() => {
        pendingGrantPromises.delete(cacheStorageKey);
    });

    pendingGrantPromises.set(cacheStorageKey, grantPromise);
    return grantPromise;
}

/**
 * Manually invalidate a specific session grant from all caches.
 * Call this after on-chain revocation (e.g., ticket resale, access revocation)
 * to ensure the browser does not reuse a stale grant.
 */
export function invalidateSessionGrant(
    accountId: string,
    scope: SessionGrantScope,
    resourceId?: string,
): void {
    const key = cacheKey(accountId, scope, resourceId);
    inMemoryGrants.delete(key);
    pendingGrantPromises.delete(key);
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem(key);
    }
}

export async function signSessionGrantPayload(
    grant: BrowserSessionGrant,
    payload: string,
): Promise<{ signature: string; publicKey: string; originHash: string | null; deviceHash: string | null }> {
    const keyPair = KeyPair.fromString(grant.secretKey);
    const signature = await keyPair.sign(new TextEncoder().encode(payload));
    const signatureHex = Array.from(signature.signature, (byte) => byte.toString(16).padStart(2, '0')).join('');

    return {
        signature: signatureHex,
        publicKey: grant.sessionPublicKey,
        originHash: grant.originHash,
        deviceHash: grant.deviceHash,
    };
}
