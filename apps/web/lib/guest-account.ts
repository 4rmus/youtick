import { KeyPair, PublicKey, type KeyPairString } from 'near-api-js';
import { APP_CONFIG, NEAR_CONFIG } from './constants';
import { BrowserKeyStore } from './keystore-v7';
import {
    type ManagedNearAccount,
    persistManagedKeyPair,
    readManagedNearAccount,
    writeManagedNearAccount,
} from './managed-near-account';

export interface GuestIdentity {
    accountId: string;
    publicKey: string;
    secretKey: string;
}

interface GuestBootstrapResponse {
    ok: boolean;
    accountId: string;
    bootstrapped: boolean;
}

interface GuestFreeClaimResponse {
    ok: boolean;
    accountId: string;
    claimed: boolean;
    alreadyOwned: boolean;
}

const INSTALL_ID_STORAGE_KEY = 'guestInstallId';

function getDefaultGuestRelayerUrl(): string {
    if (typeof window === 'undefined') {
        return '';
    }

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:8788';
    }

    return '';
}

function getGuestRelayerBaseUrl(): string {
    return process.env.NEXT_PUBLIC_GUEST_RELAYER_URL || getDefaultGuestRelayerUrl();
}

function requireGuestRelayerBaseUrl(): string {
    const baseUrl = getGuestRelayerBaseUrl();
    if (!baseUrl) {
        throw new Error('Guest service is not configured. Set NEXT_PUBLIC_GUEST_RELAYER_URL.');
    }
    return baseUrl;
}

export function publicKeyToImplicitAccountId(publicKey: string): string {
    const normalized = publicKey.startsWith('ed25519:') ? publicKey : `ed25519:${publicKey}`;
    const parsedPublicKey = PublicKey.fromString(normalized);
    return Array.from(parsedPublicKey.data)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

export function ensureGuestInstallId(): string {
    if (typeof window === 'undefined') {
        return '';
    }

    const existing = localStorage.getItem(INSTALL_ID_STORAGE_KEY);
    if (existing) {
        return existing;
    }

    const nextValue = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_STORAGE_KEY, nextValue);
    return nextValue;
}

async function readExistingGuestIdentity(): Promise<GuestIdentity | null> {
    const managed = readManagedNearAccount();
    if (!managed || managed.kind !== 'guest') {
        return null;
    }

    const keyStore = new BrowserKeyStore();
    const keyPair = await keyStore.getKey(NEAR_CONFIG.networkId, managed.accountId);
    if (!keyPair) {
        return null;
    }

    return {
        accountId: managed.accountId,
        publicKey: keyPair.getPublicKey().toString(),
        secretKey: keyPair.toString(),
    };
}

export async function getOrCreateGuestIdentity(): Promise<GuestIdentity> {
    const existing = await readExistingGuestIdentity();
    if (existing) {
        return existing;
    }

    const keyPair = KeyPair.fromRandom('ed25519');
    return {
        accountId: publicKeyToImplicitAccountId(keyPair.getPublicKey().toString()),
        publicKey: keyPair.getPublicKey().toString(),
        secretKey: keyPair.toString(),
    };
}

export async function persistGuestIdentity(identity: GuestIdentity): Promise<ManagedNearAccount> {
    await persistManagedKeyPair(identity.accountId, identity.secretKey);
    return writeManagedNearAccount(identity.accountId, 'guest');
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const baseUrl = requireGuestRelayerBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const result = await response.json() as { ok?: boolean; error?: string } & T;
    if (!response.ok || result.ok === false) {
        throw new Error(result.error || 'Guest service request failed');
    }
    return result;
}

export async function bootstrapGuestAccount(
    identity: GuestIdentity,
    turnstileToken?: string | null,
): Promise<GuestBootstrapResponse> {
    const installId = ensureGuestInstallId();
    const result = await postJson<GuestBootstrapResponse>('/guest/bootstrap', {
        publicKey: identity.publicKey,
        installId,
        turnstileToken: turnstileToken || null,
        origin: APP_CONFIG.publicAppUrl,
    });

    await persistGuestIdentity(identity);
    return result;
}

export async function claimFreeTicketAsGuest(
    encryptedCid: string,
    identity: GuestIdentity,
    turnstileToken?: string | null,
): Promise<GuestFreeClaimResponse> {
    const installId = ensureGuestInstallId();
    const result = await postJson<GuestFreeClaimResponse>('/free/claim', {
        publicKey: identity.publicKey,
        encryptedCid,
        installId,
        turnstileToken: turnstileToken || null,
        origin: APP_CONFIG.publicAppUrl,
    });

    await persistGuestIdentity(identity);
    return result;
}
