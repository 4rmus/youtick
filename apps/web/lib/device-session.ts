import { baseEncode, baseDecode } from 'near-api-js';
import { APP_CONFIG, NEAR_CONFIG, NEAR_NETWORK } from './constants';
import { base64Encode } from './crypto/codec';
import type { WalletInstance } from './types';
import { getProvider, viewContract } from './near';

const DEVICE_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const PUBLIC_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const pending = new Map<string, Promise<DeviceSession>>();
const listeners = new Set<() => void>();
let generation = 0;
let observedRevision: number | undefined;
let channel: BroadcastChannel | undefined;

type LegacyDeviceCertificate = {
    domain: 'youtick.device-session';
    version: '2';
    network: 'testnet' | 'mainnet';
    contract_id: string;
    session_public_key: string;
    origin_hash: string;
    scopes: ['play'];
    issued_at_ms: string;
    expires_at_ms: string;
};

export const PLAYBACK_DEVICE_DURATION_MS = '2592000000';
export type MarketDeviceCertificate = Omit<LegacyDeviceCertificate, 'version' | 'issued_at_ms' | 'expires_at_ms'> & {
    version: '3';
    account_id: string;
    authorization_duration_ms: typeof PLAYBACK_DEVICE_DURATION_MS;
};
export type DeviceSessionCertificate = LegacyDeviceCertificate | MarketDeviceCertificate;
export type PlaybackSessionAuthorization = {
    session_public_key: string;
    certificate_sha256: string;
    authorization_duration_ms: string;
};
type WalletCertificateProof = { account_id: string; public_key: string; signature: string; nonce: string };
type MarketCertificateProof = { account_id: string; kind: 'market'; signed_delegate_base64?: string };
export type DeviceSession = {
    certificate: DeviceSessionCertificate;
    certificate_proof: WalletCertificateProof | MarketCertificateProof;
    privateKey: CryptoKey;
};

type SignMessage = NonNullable<WalletInstance['signMessage']>;

function scope(): string {
    return `youtick:device-session:v2:${NEAR_NETWORK}:${NEAR_CONFIG.marketContractId}:${browserOrigin()}`;
}

function invalidate(): void {
    generation += 1;
    pending.clear();
    for (const listener of listeners) listener();
}

function watchSessionChanges(): void {
    if (!channel && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(scope());
        channel.onmessage = ({ data }) => {
            if (Number.isSafeInteger(data) && data > (observedRevision ?? 0)) {
                observedRevision = data;
                invalidate();
            }
        };
    }
}

export function onDeviceSessionCleared(listener: () => void): () => void {
    watchSessionChanges();
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

// IndexedDB structured-clones the non-extractable key; no secret string is serialized.
async function openStore(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') throw new Error('device_session_storage_unavailable');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(scope(), 1);
        request.onupgradeneeded = () => request.result.createObjectStore('sessions');
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => reject(new Error('device_session_storage_unavailable'));
    });
}

async function readStored(accountId: string): Promise<{ revision: number; session?: DeviceSession }> {
    watchSessionChanges();
    const db = await openStore();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('sessions', 'readonly');
        const store = transaction.objectStore('sessions');
        const revision = store.get('revision');
        const session = store.get(`account:${accountId}`);
        transaction.oncomplete = () => {
            db.close();
            const nextRevision = revision.result ?? 0;
            if (observedRevision === undefined) {
                // A cold page learns the existing revision; it is not a new logout.
                observedRevision = nextRevision;
            } else if (nextRevision > observedRevision) {
                observedRevision = nextRevision;
                // A read can beat the broadcast. Stop active players too, without
                // cancelling a fresh payment that started after the logout.
                for (const listener of listeners) listener();
            }
            resolve({ revision: revision.result ?? 0, session: session.result });
        };
        transaction.onerror = transaction.onabort = () => {
            db.close();
            reject(new Error('device_session_storage_unavailable'));
        };
    });
}

async function saveSession(session: DeviceSession, revision: number, expectedGeneration: number, reuseDevice = false): Promise<DeviceSession> {
    const db = await openStore();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('sessions', 'readwrite');
        const store = transaction.objectStore('sessions');
        let cancelled = false;
        let saved = session;
        const current = store.get('revision');
        current.onsuccess = () => {
            if ((current.result ?? 0) !== revision || expectedGeneration !== generation) {
                cancelled = true;
                transaction.abort();
                return;
            }
            const accountKey = `account:${session.certificate_proof.account_id}`;
            const existing = store.get(accountKey);
            existing.onsuccess = () => {
                if (reuseDevice && existing.result?.certificate?.version === '3') saved = existing.result;
                else store.put(session, accountKey);
            };
        };
        transaction.oncomplete = () => { db.close(); resolve(saved); };
        transaction.onerror = transaction.onabort = () => {
            db.close();
            reject(new Error(cancelled ? 'device_session_cancelled' : 'device_session_storage_unavailable'));
        };
    });
}

export function ensureDeviceSession(
    wallet: Pick<WalletInstance, 'signMessage'>,
    accountId: string,
    signal?: AbortSignal,
): Promise<DeviceSession> {
    return prepareDeviceSession(async (params) => {
        if (!wallet.signMessage) throw new Error('device_session_wallet_unsupported');
        return wallet.signMessage(params);
    }, accountId, signal);
}

// Called only by an explicit connect/verify action, never by playback or renewal.
export function connectDeviceSession(sign: SignMessage, signal?: AbortSignal): Promise<DeviceSession> {
    return prepareDeviceSession(sign, undefined, signal);
}

function prepareDeviceSession(sign: SignMessage, accountId?: string, signal?: AbortSignal): Promise<DeviceSession> {
    signal?.throwIfAborted();
    const key = accountId ?? 'connect';
    const existing = pending.get(key);
    if (existing) return existing;
    let expectedGeneration = generation;
    const cancel = () => { void clearDeviceSession().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    const work = (async () => {
        if (accountId) {
            const session = await readValidDeviceSession(accountId, () => { expectedGeneration = generation; });
            if (expectedGeneration !== generation) throw new Error('device_session_cancelled');
            if (session) return session;
        }
        const { revision } = await readStored(accountId ?? '');
        let keyPair: CryptoKeyPair;
        try {
            keyPair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair;
        } catch {
            throw new Error('device_session_crypto_unavailable');
        }
        const issuedAtMs = Date.now();
        const certificate: LegacyDeviceCertificate = {
            domain: 'youtick.device-session',
            version: '2',
            network: NEAR_NETWORK,
            contract_id: NEAR_CONFIG.marketContractId,
            session_public_key: `ed25519:${baseEncode(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)))}`,
            origin_hash: await sha256Hex(browserOrigin()),
            scopes: ['play'],
            issued_at_ms: String(issuedAtMs),
            expires_at_ms: String(issuedAtMs + DEVICE_SESSION_LIFETIME_MS),
        };
        const nonce = crypto.getRandomValues(new Uint8Array(32));
        if (expectedGeneration !== generation) throw new Error('device_session_cancelled');
        const proof = await sign({ message: canonicalDeviceCertificate(certificate), recipient: NEAR_CONFIG.marketContractId, nonce });
        if (!proof || typeof proof.accountId !== 'string'
            || typeof proof.publicKey !== 'string' || typeof proof.signature !== 'string'
            || (accountId && proof.accountId !== accountId)
            || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(proof.accountId)
            || proof.accountId.length < 2 || proof.accountId.length > 64
            || !PUBLIC_KEY_PATTERN.test(proof.publicKey) || !isSignature(proof.signature)) {
            throw new Error('device_session_wallet_proof_invalid');
        }
        const session: DeviceSession = {
            certificate,
            certificate_proof: { account_id: proof.accountId, public_key: proof.publicKey, signature: proof.signature, nonce: base64Url(nonce) },
            privateKey: keyPair.privateKey,
        };
        if (expectedGeneration !== generation || Number(certificate.expires_at_ms) <= Date.now()) {
            throw new Error('device_session_cancelled');
        }
        await saveSession(session, revision, expectedGeneration);
        if (expectedGeneration !== generation) throw new Error('device_session_cancelled');
        return session;
    })();
    pending.set(key, work);
    void work.finally(() => {
        signal?.removeEventListener('abort', cancel);
        if (pending.get(key) === work) pending.delete(key);
    }).catch(() => {});
    return work;
}

export async function getDeviceSession(accountId: string): Promise<DeviceSession | null> {
    const expectedGeneration = generation;
    const session = await readValidDeviceSession(accountId);
    if (!session || session.certificate.version !== '3') return session;
    let device: Record<string, unknown> | null;
    try {
        device = await viewContract<Record<string, unknown> | null>(
            getProvider(), NEAR_CONFIG.marketContractId, 'get_playback_device',
            { account_id: accountId, session_public_key: session.certificate.session_public_key },
        );
    } catch { throw new Error('playback_authorization_unavailable'); }
    if (expectedGeneration !== generation) throw new Error('device_session_cancelled');
    // Pending/expired devices keep their local key. Only a successful new payment
    // can authorize it; a lost wallet response can be reconciled after reload.
    if (!device || device.session_public_key !== session.certificate.session_public_key
        || device.certificate_sha256 !== await sha256Hex(canonicalDeviceCertificate(session.certificate))
        || typeof device.authorized_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.authorized_at_ms)
        || typeof device.expires_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.expires_at_ms)
        || Number(device.expires_at_ms) - Number(device.authorized_at_ms) !== Number(PLAYBACK_DEVICE_DURATION_MS)
        || Number(device.expires_at_ms) <= Date.now()) return null;
    const current = await readStored(accountId);
    if (expectedGeneration !== generation || current.session?.certificate.session_public_key !== session.certificate.session_public_key) {
        throw new Error('device_session_cancelled');
    }
    return session;
}

export async function preparePlaybackDevice(accountId: string): Promise<PlaybackSessionAuthorization> {
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(accountId) || accountId.length < 2 || accountId.length > 64) {
        throw new Error('device_session_account_invalid');
    }
    let expectedGeneration = generation;
    const key = `payment:${accountId}`;
    let work = pending.get(key);
    if (!work) {
        work = (async () => {
            const existing = await readValidDeviceSession(accountId, () => { expectedGeneration = generation; });
            if (expectedGeneration !== generation) throw new Error('device_session_cancelled');
            if (existing?.certificate.version === '3') return existing;
            const { revision } = await readStored(accountId);
            let pair: CryptoKeyPair;
            try {
                pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair;
            } catch { throw new Error('device_session_crypto_unavailable'); }
            const certificate: MarketDeviceCertificate = {
                domain: 'youtick.device-session', version: '3', network: NEAR_NETWORK,
                contract_id: NEAR_CONFIG.marketContractId, account_id: accountId,
                session_public_key: `ed25519:${baseEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))}`,
                origin_hash: await sha256Hex(browserOrigin()), scopes: ['play'],
                authorization_duration_ms: PLAYBACK_DEVICE_DURATION_MS,
            };
            return saveSession({ certificate, certificate_proof: { account_id: accountId, kind: 'market' }, privateKey: pair.privateKey },
                revision, expectedGeneration, true);
        })();
        pending.set(key, work);
        void work.finally(() => { if (pending.get(key) === work) pending.delete(key); }).catch(() => {});
    }
    const session = await work;
    const certificateHash = await sha256Hex(canonicalDeviceCertificate(session.certificate));
    const current = await readStored(accountId);
    if (expectedGeneration !== generation || current.session?.certificate.session_public_key !== session.certificate.session_public_key) {
        throw new Error('device_session_cancelled');
    }
    return {
        session_public_key: session.certificate.session_public_key,
        certificate_sha256: certificateHash,
        authorization_duration_ms: PLAYBACK_DEVICE_DURATION_MS,
    };
}

export async function rememberPlaybackDelegate(accountId: string, authorization: PlaybackSessionAuthorization, signedDelegate: string): Promise<void> {
    const expectedGeneration = generation;
    const { revision, session } = await readStored(accountId);
    if (!session || session.certificate.version !== '3'
        || session.certificate.session_public_key !== authorization.session_public_key
        || await sha256Hex(canonicalDeviceCertificate(session.certificate)) !== authorization.certificate_sha256) {
        throw new Error('device_session_cancelled');
    }
    await saveSession({ ...session, certificate_proof: { account_id: accountId, kind: 'market', signed_delegate_base64: signedDelegate } },
        revision, expectedGeneration);
}

async function readValidDeviceSession(accountId: string, invalidated?: () => void): Promise<DeviceSession | null> {
    if (typeof window === 'undefined') return null;
    const expectedGeneration = generation;
    const { session, revision } = await readStored(accountId);
    if (!session) return null;
    try {
        const { certificate, certificate_proof: proof, privateKey } = session;
        if (certificate.domain !== 'youtick.device-session' || !['2', '3'].includes(certificate.version)
            || certificate.network !== NEAR_NETWORK || certificate.contract_id !== NEAR_CONFIG.marketContractId
            || proof.account_id !== accountId || certificate.origin_hash !== await sha256Hex(browserOrigin())
            || !Array.isArray(certificate.scopes) || certificate.scopes.length !== 1 || certificate.scopes[0] !== 'play'
            || privateKey.type !== 'private' || privateKey.extractable || privateKey.algorithm.name !== 'Ed25519'
            || privateKey.usages.length !== 1 || privateKey.usages[0] !== 'sign'
            || !PUBLIC_KEY_PATTERN.test(certificate.session_public_key)) throw new Error('invalid_device_session');
        if (certificate.version === '2') {
            if ('kind' in proof || !/^[1-9][0-9]{12,15}$/.test(certificate.issued_at_ms)
                || !/^[1-9][0-9]{12,15}$/.test(certificate.expires_at_ms)
                || Number(certificate.issued_at_ms) > Date.now() || Number(certificate.expires_at_ms) <= Date.now()
                || Number(certificate.expires_at_ms) - Number(certificate.issued_at_ms) !== DEVICE_SESSION_LIFETIME_MS
                || !PUBLIC_KEY_PATTERN.test(proof.public_key) || !isSignature(proof.signature)
                || !/^[A-Za-z0-9_-]{43}$/.test(proof.nonce)) throw new Error('invalid_device_session');
        } else if (!('kind' in proof) || proof.kind !== 'market' || certificate.account_id !== accountId
            || certificate.authorization_duration_ms !== PLAYBACK_DEVICE_DURATION_MS) throw new Error('invalid_device_session');
        const publicKey = await crypto.subtle.importKey('raw', new Uint8Array(baseDecode(certificate.session_public_key.slice(8))), 'Ed25519', false, ['verify']);
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const signature = await crypto.subtle.sign('Ed25519', privateKey, challenge);
        if (!await crypto.subtle.verify('Ed25519', publicKey, signature, challenge)) throw new Error('invalid_device_session');
        if (expectedGeneration !== generation || revision !== observedRevision) return null;
        return session;
    } catch {
        if (expectedGeneration !== generation) return null;
        const clearing = clearDeviceSession();
        invalidated?.();
        await clearing;
        return null;
    }
}

export async function clearDeviceSession(): Promise<void> {
    invalidate();
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
    const db = await openStore();
    let clearedRevision = 0;
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('sessions', 'readwrite');
        const store = transaction.objectStore('sessions');
        const revision = store.get('revision');
        revision.onsuccess = () => {
            store.clear();
            clearedRevision = (revision.result ?? 0) + 1;
            store.put(clearedRevision, 'revision');
        };
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = transaction.onabort = () => { db.close(); reject(new Error('device_session_storage_unavailable')); };
    });
    observedRevision = Math.max(observedRevision ?? 0, clearedRevision);
    watchSessionChanges();
    channel?.postMessage(clearedRevision);
}

export function canonicalDeviceCertificate(certificate: DeviceSessionCertificate): string {
    return canonicalJson(certificate);
}

function browserOrigin(): string {
    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : APP_CONFIG.publicAppUrl;
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
        throw new Error('invalid_livepeer_origin');
    }
    return url.origin;
}

function isSignature(value: string): boolean {
    try {
        return atob(value).length === 64;
    } catch {
        return false;
    }
}

function base64Url(value: Uint8Array): string {
    return base64Encode(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson(object[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
