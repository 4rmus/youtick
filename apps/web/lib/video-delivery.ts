import { METADATA_SCHEMA } from './constants';
import { CRUST_CONSTANTS } from './crust/config';
import { fetchFromGateways } from './crust';
import type {
    DeliveryManifestV2,
    DeliverySegment,
    DeliverySegmentPayload,
    DeliveryTrackInfo,
} from './types';
import {
    estimateSegmentSizeBytes,
    groupPayloadsByVideoAnchor,
    estimateSharedSegmentSampleCount,
} from './video-delivery-segmentation';

export const DELIVERY_MANIFEST_VERSION = 2 as const;
export const DELIVERY_SEGMENT_DURATION_MS = 4_000;
export const DELIVERY_STARTUP_SEGMENTS = 2;
export const DELIVERY_BUFFER_AHEAD_MS = 20_000;
export const DELIVERY_BUFFER_BEHIND_MS = 10_000;
export const DELIVERY_UPLOAD_CONCURRENCY = 4;
export const DELIVERY_FETCH_CONCURRENCY = 2;
export const DELIVERY_WARMUP_GATEWAYS = 3;
export const SEGMENTED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
export const DISPLAY_MEDIA_MANIFEST_TIMEOUT_MS = 2_500;

const resolvedDisplayMediaCache = new Map<string, string | null>();
const pendingDisplayMediaCache = new Map<string, Promise<string | null>>();

export interface PackagedSegmentPayload {
    trackId: number;
    kind: 'audio' | 'video';
    codec: string;
    byteLength: number;
    startMs: number;
    endMs: number;
    buffer: ArrayBuffer;
}

export interface PackagedDeliverySegment {
    seq: number;
    durationMs: number;
    payloads: PackagedSegmentPayload[];
}

export interface PackagedDeliveryAsset {
    version: typeof DELIVERY_MANIFEST_VERSION;
    packaging: 'cmaf';
    encrypted: boolean;
    codec: string;
    contentType: 'video/mp4';
    durationMs: number;
    initSegment: ArrayBuffer;
    tracks: DeliveryTrackInfo[];
    segments: PackagedDeliverySegment[];
}

export function shouldUseSegmentedDelivery(contentType: string | undefined | null): boolean {
    if (!contentType) {
        return false;
    }

    return SEGMENTED_VIDEO_TYPES.has(contentType);
}

export function isDeliveryManifestV2(value: unknown): value is DeliveryManifestV2 {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const manifest = value as Partial<DeliveryManifestV2>;
    return manifest.version === DELIVERY_MANIFEST_VERSION
        && manifest.packaging === 'cmaf'
        && typeof manifest.codec === 'string'
        && manifest.contentType === 'video/mp4'
        && typeof manifest.durationMs === 'number'
        && typeof manifest.initSegment?.cid === 'string'
        && Array.isArray(manifest.tracks)
        && Array.isArray(manifest.segments);
}

export async function fetchDeliveryManifest(
    cid: string,
    options?: { timeout?: number },
): Promise<unknown> {
    const response = await fetchFromGateways(cid, {
        purpose: 'manifest',
        timeout: options?.timeout,
    });
    return await response.json();
}

export function buildSegmentedEventTitle(
    thumbnailRef: string | undefined,
    manifestCid: string,
    title: string,
): string {
    const { delimiter } = METADATA_SCHEMA;
    return [
        manifestCid,
        thumbnailRef || '',
        title,
    ].join(delimiter);
}

export function buildManifestPosterUrl(manifest: DeliveryManifestV2): string | null {
    if (!manifest.thumbnails?.posterCid) {
        return null;
    }

    return `ipfs://${manifest.thumbnails.posterCid}`;
}

export function pickPreferredPosterUrl(
    thumbnailUrl: string | null | undefined,
    manifest?: DeliveryManifestV2 | null,
): string | null {
    return (manifest ? buildManifestPosterUrl(manifest) : null) ?? thumbnailUrl ?? null;
}

export function getEffectiveManifestDurationMs(manifest: DeliveryManifestV2): number {
    const segmentEndMs = manifest.segments.length > 0
        ? Math.max(...manifest.segments.flatMap((segment) => segment.payloads.map((payload) => payload.endMs)))
        : 0;

    return Math.max(manifest.durationMs || 0, segmentEndMs);
}

export function shouldUseSegmentedPlayback(manifest: DeliveryManifestV2): boolean {
    if (manifest.segments.length === 0) {
        return false;
    }

    const effectiveDurationMs = getEffectiveManifestDurationMs(manifest);
    const maxSegmentDurationMs = Math.max(...manifest.segments.map((segment) => segment.durationMs));
    const maxPayloadBytes = Math.max(...manifest.segments.flatMap((segment) => segment.payloads.map((payload) => payload.byteLength)));

    if (effectiveDurationMs > 20_000 && manifest.segments.length < 4) {
        return false;
    }

    if (maxSegmentDurationMs > DELIVERY_SEGMENT_DURATION_MS * 3) {
        return false;
    }

    if (maxPayloadBytes > 4 * 1024 * 1024) {
        return false;
    }

    return true;
}

export async function resolvePreferredMediaUrl(
    thumbnailUrl: string | null,
    manifestCid?: string | null,
): Promise<string | null> {
    if (!manifestCid) {
        return thumbnailUrl;
    }

    const cacheKey = `${manifestCid}::${thumbnailUrl ?? ''}`;
    if (resolvedDisplayMediaCache.has(cacheKey)) {
        return resolvedDisplayMediaCache.get(cacheKey) ?? thumbnailUrl;
    }

    const pending = pendingDisplayMediaCache.get(cacheKey);
    if (pending) {
        return await pending;
    }

    const resolution = (async () => {
        try {
            const manifest = await fetchDeliveryManifest(manifestCid, {
                timeout: DISPLAY_MEDIA_MANIFEST_TIMEOUT_MS,
            });
            if (isDeliveryManifestV2(manifest)) {
                return pickPreferredPosterUrl(thumbnailUrl, manifest);
            }
        } catch {
            // Fall back to the title-embedded thumbnail below.
        }

        return thumbnailUrl;
    })()
        .then((resolvedUrl) => {
            resolvedDisplayMediaCache.set(cacheKey, resolvedUrl);
            return resolvedUrl;
        })
        .finally(() => {
            pendingDisplayMediaCache.delete(cacheKey);
        });

    pendingDisplayMediaCache.set(cacheKey, resolution);
    return await resolution;
}

export async function packageVideoForDelivery(file: File): Promise<PackagedDeliveryAsset | null> {
    if (!shouldUseSegmentedDelivery(file.type)) {
        return null;
    }

    if (typeof Worker !== 'undefined') {
        try {
            return await packageVideoForDeliveryInWorker(file);
        } catch (error) {
            console.warn('[video-delivery] Worker packaging failed, falling back to main thread:', error);
        }
    }

    return await packageVideoForDeliveryOnMainThread(file);
}

export async function warmupGatewayCids(
    items: Array<{ cid: string; kind: 'image' | 'segment' }>,
): Promise<void> {
    const warmupEndpoints = [CRUST_CONSTANTS.READ_ENDPOINT];

    await Promise.allSettled(
        items.map(async ({ cid }) => {
            await Promise.allSettled(
                warmupEndpoints.map(async (endpoint) => {
                    await fetch(`${endpoint}?arg=${cid}`, {
                        method: 'POST',
                    });
                }),
            );
        }),
    );
}

export function toDeliveryManifestV2(
    asset: PackagedDeliveryAsset,
    initSegmentCid: string,
    tracks: DeliveryTrackInfo[],
    segments: DeliverySegment[],
    options?: {
        encrypted?: boolean;
        posterCid?: string;
        initSegmentCounterB64?: string;
    },
): DeliveryManifestV2 {
    return {
        version: DELIVERY_MANIFEST_VERSION,
        packaging: 'cmaf',
        encrypted: options?.encrypted ?? asset.encrypted,
        codec: asset.codec,
        contentType: 'video/mp4',
        durationMs: asset.durationMs,
        thumbnails: options?.posterCid ? { posterCid: options.posterCid } : undefined,
        initSegment: {
            cid: initSegmentCid,
            byteLength: asset.initSegment.byteLength,
            counterB64: options?.initSegmentCounterB64,
        },
        tracks,
        segments,
    };
}

export function createDeliverySegment(
    seq: number,
    payloads: DeliverySegmentPayload[],
): DeliverySegment {
    const start = Math.min(...payloads.map((payload) => payload.startMs));
    const end = Math.max(...payloads.map((payload) => payload.endMs));

    return {
        seq,
        durationMs: Math.max(1, end - start),
        payloads,
    };
}

export function combinePackagedSegmentPayloads(
    payloads: PackagedSegmentPayload[],
): PackagedSegmentPayload {
    const sortedPayloads = [...payloads].sort((a, b) => {
        if (a.startMs !== b.startMs) {
            return a.startMs - b.startMs;
        }

        if (a.kind === b.kind) {
            return 0;
        }

        return a.kind === 'video' ? -1 : 1;
    });
    const primaryPayload = sortedPayloads.find((payload) => payload.kind === 'video') ?? sortedPayloads[0];

    return {
        trackId: primaryPayload.trackId,
        kind: sortedPayloads.some((payload) => payload.kind === 'video') ? 'video' : primaryPayload.kind,
        codec: primaryPayload.codec,
        byteLength: sortedPayloads.reduce((sum, payload) => sum + payload.byteLength, 0),
        startMs: Math.min(...sortedPayloads.map((payload) => payload.startMs)),
        endMs: Math.max(...sortedPayloads.map((payload) => payload.endMs)),
        buffer: concatenateArrayBuffers(sortedPayloads.map((payload) => payload.buffer)),
    };
}

type MP4BoxBuffer = ArrayBuffer & { fileStart: number };

interface TrackLike {
    id: number;
    codec: string;
    bitrate: number;
    timescale: number;
    duration: number;
    nb_samples: number;
    audio?: unknown;
    video?: unknown;
}

interface SampleLike {
    dts: number;
    duration: number;
    timescale: number;
}

async function packageVideoForDeliveryOnMainThread(file: File): Promise<PackagedDeliveryAsset> {
    const mp4box = await import('mp4box');
    // keepMdatData=true is required for sample extraction/segmentation.
    const mp4boxFile = mp4box.createFile(true);
    const sourceBuffer = (await file.arrayBuffer()) as MP4BoxBuffer;
    sourceBuffer.fileStart = 0;

    const readyInfo = await new Promise<{
        duration: number;
        timescale: number;
        tracks: TrackLike[];
    }>((resolve, reject) => {
        mp4boxFile.onReady = (info) => resolve(info as { duration: number; timescale: number; tracks: TrackLike[] });
        mp4boxFile.onError = (message) => reject(new Error(String(message)));
        mp4boxFile.appendBuffer(sourceBuffer, true);
    });

    const selectedTracks = readyInfo.tracks.filter((track) => track.audio || track.video);
    if (!selectedTracks.length) {
        throw new Error('No playable audio/video tracks found for segmentation');
    }

    // Progressive MP4 inputs commonly lack mvex/mehd. mp4box's initializeSegmentation()
    // still reads this field from the parsed source movie before it rewrites the init segment.
    const sourceMovie = mp4boxFile.moov as {
        mvex?: {
            mehd?: {
                fragment_duration?: number;
            };
        };
    } | undefined;
    if (sourceMovie) {
        sourceMovie.mvex ??= {};
        sourceMovie.mvex.mehd ??= {};
        sourceMovie.mvex.mehd.fragment_duration = readyInfo.duration;
    }

    const fallbackDurationMs = Math.max(1, Math.round((readyInfo.duration / readyInfo.timescale) * 1_000));
    const tracks: DeliveryTrackInfo[] = selectedTracks.map((track) => ({
        id: track.id,
        kind: track.audio ? 'audio' : 'video',
        codec: track.codec,
        bitrate: track.bitrate || 0,
        timescale: track.timescale,
    }));
    const codec = tracks.map((track) => track.codec).join(', ');
    const sampleMaps = new Map<number, SampleLike[]>(
        selectedTracks.map((track) => [track.id, mp4boxFile.getTrackSamplesInfo(track.id) as SampleLike[]]),
    );
    // mp4box requires the same nbSamples value across all fragmented tracks.
    // Use the smallest 4s-equivalent count so video does not balloon into 10s+ segments.
    const sharedSegmentSampleCount = estimateSharedSegmentSampleCount(
        sampleMaps.values(),
        DELIVERY_SEGMENT_DURATION_MS,
    );
    const payloads: PackagedSegmentPayload[] = [];
    const lastSampleByTrack = new Map<number, number>();
    const completedTracks = new Set<number>();

    for (const track of selectedTracks) {
        mp4boxFile.setSegmentOptions(
            track.id,
            { trackId: track.id },
            {
                nbSamples: sharedSegmentSampleCount,
                sizePerSegment: estimateSegmentSizeBytes(
                    track,
                    fallbackDurationMs,
                    file.size,
                    selectedTracks.length,
                    DELIVERY_SEGMENT_DURATION_MS,
                ),
                rapAlignement: !track.audio,
            },
        );
    }

    const initSegmentResult = mp4boxFile.initializeSegmentation();
    const initSegment = concatenateArrayBuffers(
        normalizeInitSegmentResult(initSegmentResult).map((segment) => segment.buffer.slice(0)),
    );

    const done = new Promise<void>((resolve) => {
        mp4boxFile.onSegment = (trackId, _user, buffer, nextSample, last) => {
            const track = tracks.find((entry) => entry.id === trackId);
            const samples = sampleMaps.get(trackId) ?? [];
            const startSample = lastSampleByTrack.get(trackId) ?? 0;
            const segmentSamples = samples.slice(startSample, nextSample);
            lastSampleByTrack.set(trackId, nextSample);

            if (segmentSamples.length && track) {
                const startMs = Math.round((segmentSamples[0].dts / segmentSamples[0].timescale) * 1_000);
                const finalSample = segmentSamples[segmentSamples.length - 1];
                const endMs = Math.round(((finalSample.dts + finalSample.duration) / finalSample.timescale) * 1_000);
                const payload: PackagedSegmentPayload = {
                    trackId,
                    kind: track.kind,
                    codec: track.codec,
                    byteLength: buffer.byteLength,
                    startMs,
                    endMs,
                    buffer: buffer.slice(0),
                };

                payloads.push(payload);
                mp4boxFile.releaseUsedSamples(trackId, nextSample);
            }

            if (last) {
                completedTracks.add(trackId);
                if (completedTracks.size === tracks.length) {
                    resolve();
                }
            }
        };
    });

    mp4boxFile.start();
    mp4boxFile.flush();
    await done;

    const segments = groupPayloadsByVideoAnchor(payloads, DELIVERY_SEGMENT_DURATION_MS)
        .map((sortedPayloads, seq) => {
            const startMs = Math.min(...sortedPayloads.map((payload) => payload.startMs));
            const endMs = Math.max(...sortedPayloads.map((payload) => payload.endMs));

            return {
                seq,
                durationMs: Math.max(1, endMs - startMs),
                payloads: sortedPayloads,
            };
        });

    const packagedDurationMs = segments.length > 0
        ? Math.max(...segments.flatMap((segment) => segment.payloads.map((payload) => payload.endMs)))
        : fallbackDurationMs;

    return {
        version: DELIVERY_MANIFEST_VERSION,
        packaging: 'cmaf',
        encrypted: false,
        codec,
        contentType: 'video/mp4',
        durationMs: Math.max(fallbackDurationMs, packagedDurationMs),
        initSegment,
        tracks,
        segments,
    };
}

function normalizeInitSegmentResult(
    value: { buffer: ArrayBuffer } | Array<{ buffer: ArrayBuffer }>,
): Array<{ buffer: ArrayBuffer }> {
    return Array.isArray(value) ? value : [value];
}

function concatenateArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    if (buffers.length === 1) {
        return buffers[0];
    }

    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const buffer of buffers) {
        combined.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }

    return combined.buffer;
}

type PackagingWorkerRequest = {
    type: 'package';
    file: File;
};

type PackagingWorkerResponse =
    | { type: 'success'; asset: PackagedDeliveryAsset }
    | { type: 'error'; message: string };

async function packageVideoForDeliveryInWorker(file: File): Promise<PackagedDeliveryAsset> {
    return await new Promise<PackagedDeliveryAsset>((resolve, reject) => {
        const worker = new Worker(new URL('./video-delivery.worker.ts', import.meta.url), { type: 'module' });

        const cleanup = () => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            worker.terminate();
        };

        const handleMessage = (event: MessageEvent<PackagingWorkerResponse>) => {
            cleanup();
            if (event.data.type === 'success') {
                resolve(event.data.asset);
                return;
            }

            reject(new Error(event.data.message));
        };

        const handleError = (event: ErrorEvent) => {
            cleanup();
            reject(event.error instanceof Error ? event.error : new Error(event.message || 'Video packaging worker failed'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);
        worker.postMessage({ type: 'package', file } satisfies PackagingWorkerRequest);
    });
}
