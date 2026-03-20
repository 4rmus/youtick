import { KeyPair, type KeyPairString } from 'near-api-js';
import { BrowserKeyStore } from './keystore-v7';
import { NEAR_CONFIG } from './constants';

export type ManagedNearAccountKind = 'guest' | 'trial' | 'evm';

export interface ManagedNearAccount {
    accountId: string;
    kind: ManagedNearAccountKind;
}

const STORAGE_KEY = 'managedNearAccount';
const LEGACY_TRIAL_STORAGE_KEY = 'trialAccountId';
const LEGACY_EVM_STORAGE_KEY = 'evmLinkedNearAccount';

export function readManagedNearAccount(): ManagedNearAccount | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as ManagedNearAccount;
        if (!parsed?.accountId || !parsed?.kind) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

export function writeManagedNearAccount(accountId: string, kind: ManagedNearAccountKind): ManagedNearAccount {
    const record: ManagedNearAccount = { accountId, kind };

    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        if (kind === 'trial') {
            localStorage.setItem(LEGACY_TRIAL_STORAGE_KEY, accountId);
            localStorage.removeItem(LEGACY_EVM_STORAGE_KEY);
        } else if (kind === 'evm') {
            localStorage.setItem(LEGACY_EVM_STORAGE_KEY, accountId);
            localStorage.removeItem(LEGACY_TRIAL_STORAGE_KEY);
        } else {
            localStorage.removeItem(LEGACY_TRIAL_STORAGE_KEY);
            localStorage.removeItem(LEGACY_EVM_STORAGE_KEY);
        }
    }

    return record;
}

export function clearManagedNearAccount(): void {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_TRIAL_STORAGE_KEY);
    localStorage.removeItem(LEGACY_EVM_STORAGE_KEY);
}

export function migrateLegacyManagedNearAccount(): ManagedNearAccount | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const existing = readManagedNearAccount();
    if (existing) {
        return existing;
    }

    const legacyTrial = localStorage.getItem(LEGACY_TRIAL_STORAGE_KEY);
    if (legacyTrial) {
        return writeManagedNearAccount(legacyTrial, 'trial');
    }

    const legacyEvm = localStorage.getItem(LEGACY_EVM_STORAGE_KEY);
    if (legacyEvm) {
        return writeManagedNearAccount(legacyEvm, 'evm');
    }

    return null;
}

export async function persistManagedKeyPair(accountId: string, secretKey: string): Promise<void> {
    const keyStore = new BrowserKeyStore();
    const keyPair = KeyPair.fromString(secretKey as KeyPairString);
    await keyStore.setKey(NEAR_CONFIG.networkId, accountId, keyPair);
}

export async function removeManagedKeyPair(accountId: string): Promise<void> {
    const keyStore = new BrowserKeyStore();
    await keyStore.removeKey(NEAR_CONFIG.networkId, accountId);
}
