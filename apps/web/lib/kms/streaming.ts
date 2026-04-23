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

import { CRUST_CONSTANTS, CRUST_GATEWAYS } from '@/lib/crust/config';
import { decryptChunk, decryptFull, type VideoManifest } from './encryption';

// ============================================================================
// Types
// ============================================================================

export interface StreamingPlayerOptions {
    /** IPFS gateway base URL */
    gatewayUrl?: string;
    /** How many chunks to buffer ahead */
    bufferAhead?: number;
    /** Minimum decrypted bytes to prepare before first playback */
    initialBufferBytes?: number;
    /** Callback for playback progress */
    onProgress?: (loaded: number, total: number) => void;
    /** Callback for errors */
    onError?: (error: Error) => void;
}

const DEFAULT_GATEWAY = 'https://ipfs.io/ipfs';
const RANGE_NOT_SUPPORTED = 'RANGE_NOT_SUPPORTED';
const DEFAULT_INITIAL_BUFFER_BYTES = 4 * 1024 * 1024;

interface GatewayFetchResult {
    gateway: string;
    response: Response;
}

function normalizeGatewayBase(url: string): string {
    return url.replace(/\/+$/, '');
}

function getGatewayCandidates(preferredGateway?: string): string[] {
    const candidates: string[] = [];

    if (preferredGateway) {
        candidates.push(normalizeGatewayBase(preferredGateway));
    }

    for (const gateway of CRUST_GATEWAYS) {
        candidates.push(normalizeGatewayBase(gateway.url));
    }

    if (!candidates.includes(DEFAULT_GATEWAY)) {
        candidates.push(DEFAULT_GATEWAY);
    }

    return [...new Set(candidates)];
}

function prioritizeGateway(gateways: string[], preferredGateway?: string): string[] {
    if (!preferredGateway) return gateways;

    const normalizedPreferred = normalizeGatewayBase(preferredGateway);
    const rest = gateways.filter((gateway) => gateway !== normalizedPreferred);
    return [normalizedPreferred, ...rest];
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number = CRUST_CONSTANTS.FETCH_TIMEOUT,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchRangeFromGateways(
    cid: string,
    start: number,
    end: number,
    gateways: string[],
    preferredGateway?: string,
): Promise<GatewayFetchResult> {
    const errors: string[] = [];
    const noRangeGateways: string[] = [];
    const normalizedPreferred = preferredGateway ? normalizeGatewayBase(preferredGateway) : undefined;

    if (normalizedPreferred) {
        try {
            return await fetchRangeFromGateway(cid, start, end, normalizedPreferred);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith(RANGE_NOT_SUPPORTED)) {
                noRangeGateways.push(normalizedPreferred);
            } else {
                errors.push(msg);
            }
        }
    }

    const raceGateways = prioritizeGateway(gateways, normalizedPreferred)
        .filter((gateway) => gateway !== normalizedPreferred)
        .slice(0, 3);

    try {
        return await Promise.any(
            raceGateways.map(async (gateway) => await fetchRangeFromGateway(cid, start, end, gateway)),
        );
    } catch (err: unknown) {
        if (err instanceof AggregateError) {
            for (const entry of err.errors) {
                const msg = entry instanceof Error ? entry.message : String(entry);
                if (msg.startsWith(RANGE_NOT_SUPPORTED)) {
                    noRangeGateways.push(msg.slice(RANGE_NOT_SUPPORTED.length + 2));
                } else {
                    errors.push(msg);
                }
            }
        }
    }

    if (noRangeGateways.length > 0) {
        throw new Error(`${RANGE_NOT_SUPPORTED}: ${[...new Set(noRangeGateways)].join(', ')}`);
    }

    throw new Error(`IPFS range fetch failed: ${errors.join('; ')}`);
}

async function fetchRangeFromGateway(
    cid: string,
    start: number,
    end: number,
    gateway: string,
): Promise<GatewayFetchResult> {
    const url = `${gateway}/${cid}`;

    try {
        const response = await fetchWithTimeout(url, {
            headers: { Range: `bytes=${start}-${end}` },
        });

        if (response.status === 206) {
            return { gateway, response };
        }

        if (response.ok && response.status === 200) {
            throw new Error(`${RANGE_NOT_SUPPORTED}: ${gateway}`);
        }

        throw new Error(`${gateway}: HTTP ${response.status}`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith(RANGE_NOT_SUPPORTED) || msg.startsWith(`${gateway}:`)) {
            throw err instanceof Error ? err : new Error(msg);
        }

        throw new Error(`${gateway}: ${msg}`);
    }
}

async function fetchFullFromGateways(
    cid: string,
    gateways: string[],
    preferredGateway?: string,
): Promise<GatewayFetchResult> {
    const errors: string[] = [];

    // Full-file reads for app-uploaded encrypted videos are most reliable via Crust API.
    for (const endpoint of [CRUST_CONSTANTS.READ_ENDPOINT, CRUST_CONSTANTS.READ_ENDPOINT_FALLBACK]) {
        try {
            const response = await fetchWithTimeout(`${endpoint}?arg=${cid}`, {
                method: 'POST',
            });
            if (response.ok) {
                return { gateway: endpoint, response };
            }
            errors.push(`${endpoint}: HTTP ${response.status}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${endpoint}: ${msg}`);
        }
    }

    const orderedGateways = prioritizeGateway(gateways, preferredGateway);
    for (const gateway of orderedGateways) {
        const url = `${gateway}/${cid}`;
        try {
            const response = await fetchWithTimeout(url, {});
            if (response.ok) {
                return { gateway, response };
            }
            errors.push(`${gateway}: HTTP ${response.status}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${gateway}: ${msg}`);
        }
    }

    throw new Error(`IPFS fetch failed across all gateways: ${errors.join('; ')}`);
}

// ============================================================================
// Helpers
// ============================================================================

/** Convert a Uint8Array to a Blob-safe ArrayBuffer view */
function toBlobPart(data: Uint8Array): ArrayBuffer {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function getChunkByteRange(manifest: VideoManifest, chunkIndex: number): { start: number; end: number } {
    const start = chunkIndex * manifest.chunkSize;
    const end = Math.min(start + manifest.chunkSize, manifest.originalSize) - 1;
    return { start, end };
}

async function downloadDecryptedChunk(
    cid: string,
    aesKeyB64: string,
    manifest: VideoManifest,
    chunkIndex: number,
    gateways: string[],
    preferredGateway?: string,
): Promise<{ decrypted: Uint8Array; gateway: string }> {
    const { start, end } = getChunkByteRange(manifest, chunkIndex);
    const { response, gateway } = await fetchRangeFromGateways(
        cid,
        start,
        end,
        gateways,
        preferredGateway,
    );
    const encrypted = new Uint8Array(await response.arrayBuffer());
    const decrypted = await decryptChunk(encrypted, aesKeyB64, manifest, chunkIndex);

    return { decrypted, gateway };
}

function getInitialChunkCount(manifest: VideoManifest, initialBufferBytes?: number): number {
    const targetBytes = Math.max(
        manifest.chunkSize,
        initialBufferBytes ?? DEFAULT_INITIAL_BUFFER_BYTES,
    );

    return Math.min(
        manifest.totalChunks,
        Math.max(1, Math.ceil(targetBytes / manifest.chunkSize)),
    );
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
const MAX_BLOB_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function createDecryptedBlobUrl(
    cid: string,
    aesKeyB64: string,
    manifest: VideoManifest,
    options: StreamingPlayerOptions = {},
): Promise<string> {
    if (manifest.originalSize > MAX_BLOB_SIZE_BYTES) {
        throw new Error(
            `Video size (${(manifest.originalSize / 1024 / 1024).toFixed(1)}MB) exceeds ` +
            `the maximum allowed for Blob playback (${MAX_BLOB_SIZE_BYTES / 1024 / 1024}MB). ` +
            `Use MSE-based streaming instead.`
        );
    }

    const gateways = getGatewayCandidates(options.gatewayUrl);
    let activeGateway = options.gatewayUrl ? normalizeGatewayBase(options.gatewayUrl) : undefined;

    if (manifest.totalChunks === 1) {
        // Single chunk — just download, decrypt, and return
        const { response, gateway } = await fetchFullFromGateways(cid, gateways, activeGateway);
        activeGateway = gateway;
        const encrypted = new Uint8Array(await response.arrayBuffer());
        const decrypted = await decryptChunk(encrypted, aesKeyB64, manifest, 0);
        const blob = new Blob([toBlobPart(decrypted)], { type: manifest.contentType });
        return URL.createObjectURL(blob);
    }

    // Multi-chunk: download all, decrypt, and merge into a single blob
    const decryptedChunks: ArrayBuffer[] = new Array(manifest.totalChunks);
    let loadedBytes = 0;

    for (let i = 0; i < manifest.totalChunks; i++) {
        try {
            const { decrypted, gateway } = await downloadDecryptedChunk(
                cid,
                aesKeyB64,
                manifest,
                i,
                gateways,
                activeGateway,
            );
            activeGateway = gateway;
            decryptedChunks[i] = toBlobPart(decrypted);

            loadedBytes += decrypted.length;
            options.onProgress?.(loadedBytes, manifest.originalSize);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            if (i === 0 || message.startsWith(RANGE_NOT_SUPPORTED)) {
                // First chunk failed or Range unsupported — degrade to full download.
                return await fallbackFullDownload(cid, aesKeyB64, manifest, gateways, activeGateway);
            }
            throw err instanceof Error ? err : new Error(String(err));
        }
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
    const gateways = getGatewayCandidates(options.gatewayUrl);
    let activeGateway = options.gatewayUrl ? normalizeGatewayBase(options.gatewayUrl) : undefined;

    try {
        // For single chunk or small files, use direct approach
        if (manifest.totalChunks <= 2) {
            const blobUrl = await createDecryptedBlobUrl(cid, aesKeyB64, manifest, options);
            if (options.onSourceUpdate) options.onSourceUpdate(blobUrl);
            return;
        }

        // Multi-chunk progressive approach:
        // 1. Download + decrypt an initial playback buffer
        // 2. Return the blob for immediate playback
        // 3. Download remaining chunks in background (non-blocking)
        const initialChunkCount = getInitialChunkCount(manifest, options.initialBufferBytes);
        const initialChunks: ArrayBuffer[] = [];
        let initialLoadedBytes = 0;
        try {
            for (let i = 0; i < initialChunkCount; i++) {
                const { decrypted, gateway } = await downloadDecryptedChunk(
                    cid,
                    aesKeyB64,
                    manifest,
                    i,
                    gateways,
                    activeGateway,
                );
                activeGateway = gateway;
                initialChunks.push(toBlobPart(decrypted));
                initialLoadedBytes += decrypted.length;
                options.onProgress?.(initialLoadedBytes, manifest.originalSize);
            }
        } catch {
            // Fallback to full download if Range not supported
            const blobUrl = await fallbackFullDownload(cid, aesKeyB64, manifest, gateways, activeGateway);
            if (options.onSourceUpdate) options.onSourceUpdate(blobUrl);
            return;
        }

        // Start playback with a larger initial buffer so MP4 metadata is more likely to be available.
        const firstBlob = new Blob(initialChunks, { type: manifest.contentType });
        if (options.onSourceUpdate) options.onSourceUpdate(URL.createObjectURL(firstBlob));

        if (initialChunkCount >= manifest.totalChunks) {
            return;
        }

        // Download remaining chunks in background non-blocking
        (async () => {
            try {
                const allChunks: ArrayBuffer[] = new Array(manifest.totalChunks);
                for (let i = 0; i < initialChunkCount; i++) {
                    allChunks[i] = initialChunks[i];
                }
                let loadedBytes = initialLoadedBytes;

                for (let i = initialChunkCount; i < manifest.totalChunks; i++) {
                    const { decrypted, gateway } = await downloadDecryptedChunk(
                        cid,
                        aesKeyB64,
                        manifest,
                        i,
                        gateways,
                        activeGateway,
                    );
                    activeGateway = gateway;
                    allChunks[i] = toBlobPart(decrypted);
                    loadedBytes += decrypted.length;
                    options.onProgress?.(loadedBytes, manifest.originalSize);
                }

                // Swap to complete video blob
                const completeBlob = new Blob(allChunks, { type: manifest.contentType });
                if (options.onSourceUpdate) options.onSourceUpdate(URL.createObjectURL(completeBlob));
            } catch (err) {
                console.error('[streamKmsVideo] Background streaming failed:', err);
                try {
                    const blobUrl = await fallbackFullDownload(cid, aesKeyB64, manifest, gateways, activeGateway);
                    if (options.onSourceUpdate) options.onSourceUpdate(blobUrl);
                    options.onProgress?.(manifest.originalSize, manifest.originalSize);
                } catch (fallbackErr) {
                    options.onError?.(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
                }
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
    cid: string,
    aesKeyB64: string,
    manifest: VideoManifest,
    gateways: string[],
    preferredGateway?: string,
): Promise<string> {
    const { response } = await fetchFullFromGateways(cid, gateways, preferredGateway);
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
