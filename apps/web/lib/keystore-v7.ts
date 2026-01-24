// lib/keystore-v7.ts
// v7 compatible keystore wrapper for browser localStorage
import { KeyPair, KeyPairSigner, type KeyPairString } from 'near-api-js';

const LOCAL_STORAGE_KEY_PREFIX = 'near-api-js:keystore:';

/**
 * Browser localStorage-based key store compatible with near-api-js v7
 * Replaces the removed keyStores.BrowserLocalStorageKeyStore
 */
export class BrowserKeyStore {
    private prefix: string;

    constructor(prefix: string = LOCAL_STORAGE_KEY_PREFIX) {
        this.prefix = prefix;
    }

    private storageKeyForSecretKey(networkId: string, accountId: string): string {
        return `${this.prefix}${accountId}:${networkId}`;
    }

    /**
     * Store a key pair for an account
     */
    async setKey(networkId: string, accountId: string, keyPair: KeyPair): Promise<void> {
        if (typeof window === 'undefined') {
            console.warn('BrowserKeyStore: localStorage not available (server-side)');
            return;
        }
        const key = this.storageKeyForSecretKey(networkId, accountId);
        // KeyPair.toString() returns the secret key string (ed25519:...)
        localStorage.setItem(key, keyPair.toString());
    }

    /**
     * Get a key pair for an account
     */
    async getKey(networkId: string, accountId: string): Promise<KeyPair | null> {
        if (typeof window === 'undefined') {
            return null;
        }
        const key = this.storageKeyForSecretKey(networkId, accountId);
        const value = localStorage.getItem(key);
        if (!value) {
            return null;
        }
        return KeyPair.fromString(value as KeyPairString);
    }

    /**
     * Get a signer for an account (v7 pattern)
     */
    async getSigner(networkId: string, accountId: string): Promise<KeyPairSigner | null> {
        const keyPair = await this.getKey(networkId, accountId);
        if (!keyPair) {
            return null;
        }
        return new KeyPairSigner(keyPair);
    }

    /**
     * Remove a key pair for an account
     */
    async removeKey(networkId: string, accountId: string): Promise<void> {
        if (typeof window === 'undefined') {
            return;
        }
        const key = this.storageKeyForSecretKey(networkId, accountId);
        localStorage.removeItem(key);
    }

    /**
     * Clear all keys
     */
    async clear(): Promise<void> {
        if (typeof window === 'undefined') {
            return;
        }
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    /**
     * Get all account IDs stored for a network
     */
    async getAccounts(networkId: string): Promise<string[]> {
        if (typeof window === 'undefined') {
            return [];
        }
        const accounts: string[] = [];
        const suffix = `:${networkId}`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.prefix) && key.endsWith(suffix)) {
                const accountId = key.substring(
                    this.prefix.length,
                    key.length - suffix.length
                );
                accounts.push(accountId);
            }
        }
        return accounts;
    }
}

/**
 * In-memory key store for server-side usage
 */
export class InMemoryKeyStore {
    private keys: Map<string, KeyPair> = new Map();

    private storageKey(networkId: string, accountId: string): string {
        return `${accountId}:${networkId}`;
    }

    async setKey(networkId: string, accountId: string, keyPair: KeyPair): Promise<void> {
        this.keys.set(this.storageKey(networkId, accountId), keyPair);
    }

    async getKey(networkId: string, accountId: string): Promise<KeyPair | null> {
        return this.keys.get(this.storageKey(networkId, accountId)) || null;
    }

    async getSigner(networkId: string, accountId: string): Promise<KeyPairSigner | null> {
        const keyPair = await this.getKey(networkId, accountId);
        if (!keyPair) {
            return null;
        }
        return new KeyPairSigner(keyPair);
    }

    async removeKey(networkId: string, accountId: string): Promise<void> {
        this.keys.delete(this.storageKey(networkId, accountId));
    }

    async clear(): Promise<void> {
        this.keys.clear();
    }

    async getAccounts(networkId: string): Promise<string[]> {
        const accounts: string[] = [];
        const suffix = `:${networkId}`;
        for (const key of this.keys.keys()) {
            if (key.endsWith(suffix)) {
                accounts.push(key.substring(0, key.length - suffix.length));
            }
        }
        return accounts;
    }
}

// Default instances
export const browserKeyStore = new BrowserKeyStore();
export const inMemoryKeyStore = new InMemoryKeyStore();
