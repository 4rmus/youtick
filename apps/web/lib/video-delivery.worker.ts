import { createFile } from 'mp4box';

import type { DeliveryTrackInfo } from './types';

const DELIVERY_MANIFEST_VERSION = 2 as const;
const DELIVERY_SEGMENT_DURATION_MS = 4_000;

interface PackagedSegmentPayload {
    trackId: number;
    kind: 'audio' | 'video';
    codec: string;
    byteLength: number;
    startMs: number;
    endMs: number;
    buffer: ArrayBuffer;
}

interface PackagedDeliveryAsset {
    version: typeof DELIVERY_MANIFEST_VERSION;
    packaging: 'cmaf';
    encrypted: boolean;
    codec: string;
    contentType: 'video/mp4';
    durationMs: number;
    initSegment: ArrayBuffer;
    tracks: DeliveryTrackInfo[];
    segments: Array<{
        seq: number;
        durationMs: number;
        payloads: PackagedSegmentPayload[];
    }>;
}

type WorkerRequest = {
    type: 'package';
    file: File;
};

type WorkerResponse =
    | { type: 'success'; asset: PackagedDeliveryAsset }
    | { type: 'error'; message: string };

type WorkerScope = {
    onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
    postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

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

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = async (event) => {
    if (event.data.type !== 'package') {
        return;
    }

    try {
        const asset = await packageFile(event.data.file);
        const transferables: Transferable[] = [
            asset.initSegment,
            ...asset.segments.flatMap((segment) => segment.payloads.map((payload) => payload.buffer)),
        ];

        workerScope.postMessage({ type: 'success', asset }, transferables);
    } catch (error) {
        workerScope.postMessage({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
        });
    }
};

async function packageFile(file: File): Promise<PackagedDeliveryAsset> {
    const mp4boxFile = createFile(true);
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
    const payloadGroups = new Map<number, PackagedSegmentPayload[]>();
    const lastSampleByTrack = new Map<number, number>();
    const completedTracks = new Set<number>();

    for (const track of selectedTracks) {
        mp4boxFile.setSegmentOptions(
            track.id,
            { trackId: track.id },
            {
                nbSamples: estimateSegmentSampleCount(sampleMaps.get(track.id) ?? []),
                sizePerSegment: estimateSegmentSizeBytes(track, fallbackDurationMs, file.size, selectedTracks.length),
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
                const seq = Math.max(0, Math.floor(startMs / DELIVERY_SEGMENT_DURATION_MS));
                const payload: PackagedSegmentPayload = {
                    trackId,
                    kind: track.kind,
                    codec: track.codec,
                    byteLength: buffer.byteLength,
                    startMs,
                    endMs,
                    buffer: buffer.slice(0),
                };

                const group = payloadGroups.get(seq) ?? [];
                group.push(payload);
                payloadGroups.set(seq, group);
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

    const segments = [...payloadGroups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([seq, payloads]) => {
            const sortedPayloads = [...payloads].sort((a, b) => {
                if (a.startMs !== b.startMs) {
                    return a.startMs - b.startMs;
                }

                if (a.kind === b.kind) {
                    return 0;
                }

                return a.kind === 'video' ? -1 : 1;
            });

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

function estimateSegmentSizeBytes(
    track: TrackLike,
    durationMs: number,
    totalFileSize: number,
    trackCount: number,
): number {
    if (track.bitrate > 0) {
        return Math.max(64 * 1024, Math.round((track.bitrate / 8) * (DELIVERY_SEGMENT_DURATION_MS / 1_000)));
    }

    const estimatedSegmentCount = Math.max(1, Math.ceil(durationMs / DELIVERY_SEGMENT_DURATION_MS));
    return Math.max(64 * 1024, Math.round(totalFileSize / (estimatedSegmentCount * trackCount)));
}

function estimateSegmentSampleCount(samples: SampleLike[]): number {
    if (samples.length === 0) {
        return 1;
    }

    let accumulatedMs = 0;
    let count = 0;

    for (const sample of samples) {
        accumulatedMs += (sample.duration / sample.timescale) * 1_000;
        count += 1;
        if (accumulatedMs >= DELIVERY_SEGMENT_DURATION_MS) {
            break;
        }
    }

    return Math.max(1, count);
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
