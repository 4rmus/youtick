/**
 * Youtick Encrypted Video Streaming Player
 *
 * Handles decrypting and streaming encrypted video chunks from IPFS.
 * Uses a Service Worker–style approach: fetches encrypted chunks via
 * Range Requests, decrypts them with AES-CTR, and feeds them to
 * a <video> element as a Blob URL or via MediaSource Extensions (MSE).
 *
 * Strategy:
 *   1. Start with Range-Based Fetcher (simple, works with all mp4)
 *   2. Upgrade to MSE when fMP4 conversion is integrated
 */

import { decryptChunk, decryptFull, type VideoManifest } from './encryption';

// ============================================================================
// Types
// ============================================================================

export interface StreamingPlayerOptions {
    /** IPFS gateway base URL */
    gatewayUrl?: string;
    /** How many chunks to buffer ahead */
    bufferAhead?: number;
    /** Callback for playback progress */
    onProgress?: (loaded: number, total: number) => void;
    /** Callback for errors */
    onError?: (error: Error) => void;
}

const DEFAULT_GATEWAY = 'https://ipfs.io/ipfs';

// ============================================================================
// Helpers
// ============================================================================

/** Convert a Uint8Array to a Blob-safe ArrayBuffer view */
function toBlobPart(data: Uint8Array): ArrayBuffer {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

// ============================================================================
// Streaming Player
// ============================================================================

/**
 * Create a playable Blob URL from an encrypted video stored on IPFS.
 *
 * Phase 1 approach: Downloads encrypted chunks progressively,
 * decrypts them, and creates a Blob URL for the <video> element.
 *
 * For instant playback, prioritizes the first chunk so video starts
 * within 1-2 seconds while remaining chunks download in background.
 *
 * @param cid - IPFS CID of the encrypted video
 * @param aesKeyB64 - Base64-encoded AES-256 key
 * @param manifest - Video manifest (chunk info, counter, etc.)
 * @param options - Player options
 * @returns Blob URL that can be set as video.src
 */
export async function createDecryptedBlobUrl(
    cid: string,
    aesKeyB64: string,
    manifest: VideoManifest,
    options: StreamingPlayerOptions = {},
): Promise<string> {
    const gateway = options.gatewayUrl || DEFAULT_GATEWAY;
    const url = `${gateway}/${cid}`;

    if (manifest.totalChunks === 1) {
        // Single chunk — just download, decrypt, and return
        const response = await fetch(url);
        if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);
        const encrypted = new Uint8Array(await response.arrayBuffer());
        const decrypted = await decryptChunk(encrypted, aesKeyB64, manifest, 0);
        const blob = new Blob([toBlobPart(decrypted)], { type: manifest.contentType });
        return URL.createObjectURL(blob);
    }

    // Multi-chunk: download all, decrypt, and merge into a single blob
    const decryptedChunks: ArrayBuffer[] = new Array(manifest.totalChunks);
    let loadedBytes = 0;

    for (let i = 0; i < manifest.totalChunks; i++) {
        const chunkStart = i * manifest.chunkSize;
        const chunkEnd = Math.min(chunkStart + manifest.chunkSize, manifest.originalSize) - 1;

        // Fetch the encrypted chunk via Range Request
        const response = await fetch(url, {
            headers: { Range: `bytes=${chunkStart}-${chunkEnd}` },
        });

        if (!response.ok && response.status !== 206) {
            // Fallback: some IPFS gateways don't support Range, fetch all
            if (i === 0) {
                return await fallbackFullDownload(url, aesKeyB64, manifest);
            }
            throw new Error(`Chunk ${i} fetch failed: ${response.status}`);
        }

        const encrypted = new Uint8Array(await response.arrayBuffer());
        const decrypted = await decryptChunk(encrypted, aesKeyB64, manifest, i);
        decryptedChunks[i] = toBlobPart(decrypted);

        loadedBytes += decrypted.length;
        options.onProgress?.(loadedBytes, manifest.originalSize);
    }

    const blob = new Blob(decryptedChunks, { type: manifest.contentType });
    return URL.createObjectURL(blob);
}

export async function streamKmsVideo(
    cid: string,
    aesKeyB64: string,
    manifest: VideoManifest,
    options: StreamingPlayerOptions & { onSourceUpdate?: (url: string) => void } = {},
): Promise<void> {
    const gateway = options.gatewayUrl || DEFAULT_GATEWAY;
    const url = `${gateway}/${cid}`;

    try {
        // For single chunk or small files, use direct approach
        if (manifest.totalChunks <= 2) {
            const blobUrl = await createDecryptedBlobUrl(cid, aesKeyB64, manifest, options);
            if (options.onSourceUpdate) options.onSourceUpdate(blobUrl);
            return;
        }

        // Multi-chunk progressive approach:
        // 1. Download + decrypt first chunk immediately
        // 2. Return the blob for immediate playback
        // 3. Download remaining chunks in background (non-blocking)

        const firstChunkEnd = Math.min(manifest.chunkSize, manifest.originalSize) - 1;
        const firstResponse = await fetch(url, {
            headers: { Range: `bytes=0-${firstChunkEnd}` },
        });

        let firstChunkDecrypted: Uint8Array;
        if (firstResponse.ok || firstResponse.status === 206) {
            const encrypted = new Uint8Array(await firstResponse.arrayBuffer());
            firstChunkDecrypted = await decryptChunk(encrypted, aesKeyB64, manifest, 0);
        } else {
            // Fallback to full download if Range not supported
            const blobUrl = await fallbackFullDownload(url, aesKeyB64, manifest);
            if (options.onSourceUpdate) options.onSourceUpdate(blobUrl);
            return;
        }

        // Start playback with just the first chunk
        const firstBlob = new Blob([toBlobPart(firstChunkDecrypted)], { type: manifest.contentType });
        if (options.onSourceUpdate) options.onSourceUpdate(URL.createObjectURL(firstBlob));

        options.onProgress?.(firstChunkDecrypted.length, manifest.originalSize);

        // Download remaining chunks in background non-blocking
        (async () => {
            try {
                const allChunks: ArrayBuffer[] = [toBlobPart(firstChunkDecrypted)];
                let loadedBytes = firstChunkDecrypted.length;

                for (let i = 1; i < manifest.totalChunks; i++) {
                    const chunkStart = i * manifest.chunkSize;
                    const chunkEnd = Math.min(chunkStart + manifest.chunkSize, manifest.originalSize) - 1;

                    const response = await fetch(url, {
                        headers: { Range: `bytes=${chunkStart}-${chunkEnd}` },
                    });

                    if (!response.ok && response.status !== 206) {
                        options.onError?.(new Error(`Chunk ${i} fetch failed: ${response.status}`));
                        break;
                    }

                    const encrypted = new Uint8Array(await response.arrayBuffer());
                    const decrypted = await decryptChunk(encrypted, aesKeyB64, manifest, i);
                    allChunks.push(toBlobPart(decrypted));
                    loadedBytes += decrypted.length;
                    options.onProgress?.(loadedBytes, manifest.originalSize);
                }

                // Swap to complete video blob
                const completeBlob = new Blob(allChunks, { type: manifest.contentType });
                if (options.onSourceUpdate) options.onSourceUpdate(URL.createObjectURL(completeBlob));
            } catch (err) {
                console.error('[streamKmsVideo] Background streaming failed:', err);
                options.onError?.(err instanceof Error ? err : new Error(String(err)));
            }
        })();

    } catch (error) {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
        throw error;
    }
}

// ============================================================================
// Fallback: Full Download (when Range not supported)
// ============================================================================

async function fallbackFullDownload(
    url: string,
    aesKeyB64: string,
    manifest: VideoManifest,
): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);

    const encrypted = new Uint8Array(await response.arrayBuffer());
    const decrypted = await decryptFull(encrypted, aesKeyB64, manifest.counterB64);
    const blob = new Blob([toBlobPart(decrypted)], { type: manifest.contentType });
    return URL.createObjectURL(blob);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Revoke a Blob URL to free memory.
 * Call this when the video element is no longer needed.
 */
export function revokeVideoUrl(blobUrl: string): void {
    URL.revokeObjectURL(blobUrl);
}
