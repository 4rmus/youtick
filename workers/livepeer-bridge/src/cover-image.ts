// Provider-neutral cover image read: bounded, type-sniffed, and refusing bytes that echo a secret.
// Adapters decide the URL and how the playback credential travels (header or path).
import { dependencyFetch, type DependencyLabel } from './dependency-fetch';
import type { ProviderCover } from './media-provider';

export const MAX_PUBLICATION_COVER_BYTES = 2 * 1024 * 1024;

export type PublicationCoverContentType = ProviderCover['contentType'];

export async function fetchCoverImage(
    dependency: DependencyLabel,
    url: string,
    headers: Record<string, string>,
    sensitiveValues: string[],
): Promise<ProviderCover> {
    let response: Response;
    try {
        response = await dependencyFetch(dependency, 'cover_read', url, {
            method: 'GET',
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('provider_unavailable');
    }
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if ([401, 403].includes(response.status)) throw new Error('publication_cover_image_denied');
    if (response.status >= 300 && response.status < 400) {
        throw new Error('publication_cover_image_redirected');
    }
    if (response.status !== 200) throw new Error('publication_cover_image_status');
    const contentLength = response.headers.get('Content-Length');
    const declaredContentType = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (declaredContentType !== 'image/jpeg' && declaredContentType !== 'image/png') {
        throw new Error('publication_cover_image_type');
    }
    if (contentLength !== null && (!/^[0-9]+$/.test(contentLength)
        || Number(contentLength) > MAX_PUBLICATION_COVER_BYTES)) {
        throw new Error('publication_cover_image_size');
    }
    if (!response.body) throw new Error('provider_playback_mismatch');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_PUBLICATION_COVER_BYTES) {
            await reader.cancel();
            throw new Error('publication_cover_image_size');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const contentType = publicationCoverContentType(bytes);
    if (!contentType) throw new Error('publication_cover_image_invalid');
    if (contentType !== declaredContentType) throw new Error('publication_cover_image_type');
    if (sensitiveValues.some((value) => containsBytes(bytes, new TextEncoder().encode(value)))) {
        throw new Error('provider_playback_mismatch');
    }
    return { bytes, contentType };
}

function containsBytes(body: Uint8Array, needle: Uint8Array): boolean {
    if (needle.byteLength === 0 || needle.byteLength > body.byteLength) return false;
    outer: for (let offset = 0; offset <= body.byteLength - needle.byteLength; offset += 1) {
        for (let index = 0; index < needle.byteLength; index += 1) {
            if (body[offset + index] !== needle[index]) continue outer;
        }
        return true;
    }
    return false;
}

function validJpeg(bytes: Uint8Array): boolean {
    return bytes.byteLength >= 4
        && bytes[0] === 0xff
        && bytes[1] === 0xd8
        && bytes[2] === 0xff
        && bytes[bytes.byteLength - 2] === 0xff
        && bytes[bytes.byteLength - 1] === 0xd9;
}

function validPng(bytes: Uint8Array): boolean {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdr = [0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52];
    const iend = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    return bytes.byteLength >= 45
        && signature.every((byte, index) => bytes[index] === byte)
        && ihdr.every((byte, index) => bytes[signature.length + index] === byte)
        && iend.every((byte, index) => bytes[bytes.byteLength - iend.length + index] === byte);
}

export function publicationCoverContentType(bytes: Uint8Array): PublicationCoverContentType | null {
    if (validJpeg(bytes)) return 'image/jpeg';
    if (validPng(bytes)) return 'image/png';
    return null;
}
