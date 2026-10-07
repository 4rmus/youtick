// The V2 playback device key: a non-extractable Ed25519 WebCrypto key per network, Market and
// origin, kept in IndexedDB. Tickets list it in `devices`; the Bridge checks playback requests
// against that list. It is separate from the V1 wallet device session.
import { baseEncode } from 'near-api-js';
import { base64Encode, hexEncode } from '../crypto/codec';

export const DEVICE_CERTIFICATE_DOMAIN = 'youtick.market-v2.device';

export interface DeviceKeyBackend {
    get(name: string): Promise<CryptoKeyPair | undefined>;
    put(name: string, value: CryptoKeyPair): Promise<void>;
}

export interface DeviceKey {
    sessionPublicKey: string;
    certificate: string;
    certificateSha256: string;
    sign(message: Uint8Array): Promise<string>;
}

/** Canonical certificate the ticket key signs over through `certificate_sha256`. */
export function deviceCertificate(input: { network: string; contractId: string; origin: string; sessionPublicKey: string }): string {
    return JSON.stringify({
        domain: DEVICE_CERTIFICATE_DOMAIN, version: '1', network: input.network, contract_id: input.contractId,
        origin: input.origin, session_public_key: input.sessionPublicKey,
    });
}

export async function loadDeviceKey(
    scope: { network: string; contractId: string; origin: string },
    backend: DeviceKeyBackend = indexedDbBackend(),
): Promise<DeviceKey> {
    const name = `${scope.network}:${scope.contractId}:${scope.origin}`;
    let pair = await backend.get(name);
    if (!pair) {
        // The Bridge accepts 43-44 base58 characters; about 3 keys in a million encode shorter.
        do {
            pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair;
        } while (baseEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))).length < 43);
        await backend.put(name, pair);
    }
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const sessionPublicKey = `ed25519:${baseEncode(raw)}`;
    const certificate = deviceCertificate({ ...scope, sessionPublicKey });
    const certificateSha256 = hexEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(certificate))));
    const privateKey = pair.privateKey;
    return {
        sessionPublicKey,
        certificate,
        certificateSha256,
        sign: async (message) => base64Encode(new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, message as BufferSource))),
    };
}

function indexedDbBackend(): DeviceKeyBackend {
    const open = () => new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('youtick-v2-device', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('device_key_unavailable'));
    });
    const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
        const db = await open();
        try {
            return await new Promise<T>((resolve, reject) => {
                const request = action(db.transaction('keys', mode).objectStore('keys'));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(new Error('device_key_unavailable'));
            });
        } finally {
            db.close();
        }
    };
    return {
        get: (name) => run('readonly', (store) => store.get(name) as IDBRequest<CryptoKeyPair | undefined>),
        put: async (name, value) => { await run('readwrite', (store) => store.put(value, name)); },
    };
}
