// Ticket keys for protocol/youtick-market-v2 ("Ticket keys"). Keys are never stored: every device
// re-derives them from the CKD key, so seeds and private keys must stay in memory only.
import { ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { baseEncode } from 'near-api-js';
import { hexEncode } from '../crypto/codec';

export const ROOT_SALT = 'youtick.market-v2.root.v1';
export const ROOT_INFO = 'youtick.market-v2.ticket-root';
export const TICKET_INFO = 'youtick.market-v2.ticket.v1';

const utf8 = (value: string) => new TextEncoder().encode(value);

export function deriveRootKey(ckdKey: Uint8Array): Uint8Array {
    if (ckdKey.length !== 32) throw new Error('invalid_ckd_key');
    return hkdf(sha256, ckdKey, utf8(ROOT_SALT), utf8(ROOT_INFO), 32);
}

export function deriveTicketSeed(rootKey: Uint8Array, index: number): Uint8Array {
    if (rootKey.length !== 32) throw new Error('invalid_root_key');
    if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) throw new Error('invalid_ticket_index');
    const info = new Uint8Array(TICKET_INFO.length + 4);
    info.set(utf8(TICKET_INFO));
    new DataView(info.buffer).setUint32(TICKET_INFO.length, index, false);
    return hkdf(sha256, rootKey, new Uint8Array(0), info, 32);
}

export interface TicketKey {
    index: number;
    /** NEAR form, `ed25519:<base58>`. */
    publicKey: string;
    /** Lowercase hex SHA-256 of the raw 32-byte public key. */
    ticketId: string;
    sign(message: string): string;
}

export const nearPublicKey = (raw: Uint8Array) => `ed25519:${baseEncode(raw)}`;
export const ticketIdFromPublicKey = (raw: Uint8Array) => hexEncode(sha256(raw));

function base64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/** The Ed25519 ticket key for index `n`; `sign` returns the standard base64 signature. */
export function ticketKey(rootKey: Uint8Array, index: number): TicketKey {
    const seed = deriveTicketSeed(rootKey, index);
    const raw = ed25519.getPublicKey(seed);
    return {
        index,
        publicKey: nearPublicKey(raw),
        ticketId: ticketIdFromPublicKey(raw),
        sign: (message) => base64(ed25519.sign(utf8(message), seed)),
    };
}
