import { KeyPair } from 'near-api-js';
import { APP_CONFIG, NEAR_CONFIG, NEAR_NETWORK } from './constants';
import { base64Encode } from './crypto/codec';
import type { WalletInstance } from './types';

const DEVICE_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const PUBLIC_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const deviceSessions = new Map<string, DeviceSession>();

export type DeviceSessionCertificate = {
    domain: 'youtick.device-session';
    version: '1';
    network: 'testnet' | 'mainnet';
    account_id: string;
    session_public_key: string;
    origin_hash: string;
    scopes: ['play'];
    issued_at_ms: string;
    expires_at_ms: string;
};

export type DeviceSession = {
    certificate: DeviceSessionCertificate;
    certificate_proof: {
        public_key: string;
        signature: string;
        nonce: string;
    };
    secret_key: string;
};

function storageKey(accountId: string): string {
    return `${accountId}:${NEAR_NETWORK}`;
}

export async function ensureDeviceSession(
    wallet: Pick<WalletInstance, 'signMessage'>,
    accountId: string,
): Promise<DeviceSession> {
    const existing = await getDeviceSession(accountId);
    if (existing) return existing;
    if (typeof wallet.signMessage !== 'function') throw new Error('device_session_wallet_unsupported');

    const keyPair = KeyPair.fromRandom('ed25519');
    const issuedAtMs = Date.now();
    const certificate: DeviceSessionCertificate = {
        domain: 'youtick.device-session',
        version: '1',
        network: NEAR_NETWORK,
        account_id: accountId,
        session_public_key: keyPair.getPublicKey().toString(),
        origin_hash: await sha256Hex(browserOrigin()),
        scopes: ['play'],
        issued_at_ms: String(issuedAtMs),
        expires_at_ms: String(issuedAtMs + DEVICE_SESSION_LIFETIME_MS),
    };
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const proof = await wallet.signMessage({
        message: canonicalDeviceCertificate(certificate),
        recipient: NEAR_CONFIG.marketContractId,
        nonce,
    });
    if (!proof
        || proof.accountId !== accountId
        || typeof proof.publicKey !== 'string'
        || !PUBLIC_KEY_PATTERN.test(proof.publicKey)
        || typeof proof.signature !== 'string'
        || !isSignature(proof.signature)) {
        throw new Error('device_session_wallet_proof_invalid');
    }

    const session: DeviceSession = {
        certificate,
        certificate_proof: {
            public_key: proof.publicKey,
            signature: proof.signature,
            nonce: base64Url(nonce),
        },
        secret_key: keyPair.toString(),
    };
    deviceSessions.set(storageKey(accountId), session);
    return session;
}

export async function getDeviceSession(accountId: string): Promise<DeviceSession | null> {
    if (typeof window === 'undefined') return null;
    const key = storageKey(accountId);
    const session = deviceSessions.get(key);
    if (!session) return null;
    try {
        const keyPair = KeyPair.fromString(session.secret_key as `ed25519:${string}`);
        if (session.certificate.domain !== 'youtick.device-session'
            || session.certificate.version !== '1'
            || session.certificate.network !== NEAR_NETWORK
            || session.certificate.account_id !== accountId
            || session.certificate.session_public_key !== keyPair.getPublicKey().toString()
            || session.certificate.origin_hash !== await sha256Hex(browserOrigin())
            || session.certificate.scopes.length !== 1
            || session.certificate.scopes[0] !== 'play'
            || Number(session.certificate.expires_at_ms) <= Date.now()
            || Number(session.certificate.expires_at_ms) - Number(session.certificate.issued_at_ms)
                !== DEVICE_SESSION_LIFETIME_MS
            || !PUBLIC_KEY_PATTERN.test(session.certificate_proof.public_key)
            || !isSignature(session.certificate_proof.signature)
            || !/^[A-Za-z0-9_-]{43}$/.test(session.certificate_proof.nonce)) {
            throw new Error('invalid_device_session');
        }
        return session;
    } catch {
        deviceSessions.delete(key);
        return null;
    }
}

export async function clearDeviceSession(accountId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    deviceSessions.delete(storageKey(accountId));
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
