/**
 * Shared codec utilities for base64 and hex encoding/decoding.
 * Single source of truth — use these everywhere instead of ad-hoc implementations.
 */

/** Encode a Uint8Array or ArrayBuffer to a base64 string */
export function base64Encode(data: Uint8Array | ArrayBuffer): string {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/** Decode a base64 string to a Uint8Array */
export function base64Decode(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Encode a Uint8Array to a hex string */
export function hexEncode(data: Uint8Array): string {
    return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Decode a hex string to a Uint8Array */
export function hexDecode(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
