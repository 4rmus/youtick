import { KeyPair, PublicKey } from 'near-api-js';
import { NEAR_CONFIG } from './constants';
import { BrowserKeyStore } from './keystore-v7';
import {
    type ManagedNearAccount,
    persistManagedKeyPair,
    readManagedNearAccount,
    writeManagedNearAccount,
} from './managed-near-account';
import { ensureOnboardingKey } from './gift-service';

export interface GuestIdentity {
    accountId: string;
    publicKey: string;
    secretKey: string;
}

interface GuestBootstrapResponse {
    ok: boolean;
    accountId: string;
    bootstrapped: boolean;
    error?: string;
}

interface GuestFreeClaimResponse {
    ok: boolean;
    accountId: string;
    claimed: boolean;
    alreadyOwned: boolean;
    error?: string;
}

export function publicKeyToImplicitAccountId(publicKey: string): string {
    const normalized = publicKey.startsWith('ed25519:') ? publicKey : `ed25519:${publicKey}`;
    const parsedPublicKey = PublicKey.fromString(normalized);
    return Array.from(parsedPublicKey.data)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
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

export async function bootstrapGuestAccount(
    identity: GuestIdentity,
): Promise<GuestBootstrapResponse> {
    const onboardingKey = await ensureOnboardingKey();
    if (!onboardingKey.ok) {
        return {
            ok: false,
            accountId: identity.accountId,
            bootstrapped: false,
            error: onboardingKey.error,
        };
    }

    const { sponsorImplicitGuestDirect } = await import('./gift-service');
    const result = await sponsorImplicitGuestDirect(identity.publicKey);
    if (!result.success) {
        return {
            ok: false,
            accountId: identity.accountId,
            bootstrapped: false,
            error: result.error,
        };
    }

    await persistGuestIdentity(identity);
    return {
        ok: true,
        accountId: result.accountId || identity.accountId,
        bootstrapped: true,
    };
}

export async function claimFreeTicketAsGuest(
    encryptedCid: string,
    identity: GuestIdentity,
): Promise<GuestFreeClaimResponse> {
    const onboardingKey = await ensureOnboardingKey();
    if (!onboardingKey.ok) {
        return {
            ok: false,
            accountId: identity.accountId,
            claimed: false,
            alreadyOwned: false,
            error: onboardingKey.error || "Onboarding key unavailable.",
        };
    }

    const { claimFreeTicketDirect } = await import('./gift-service');
    const result = await claimFreeTicketDirect(identity.accountId, encryptedCid);
    if (!result.success) {
        return {
            ok: false,
            accountId: identity.accountId,
            claimed: false,
            alreadyOwned: false,
            error: result.error,
        };
    }

    await persistGuestIdentity(identity);
    return {
        ok: true,
        accountId: identity.accountId,
        claimed: true,
        alreadyOwned: false,
    };
}
