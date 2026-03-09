import { fetchFromGateways } from './crust';
import { decodeCounter, importAESKey } from './kms';
import {
    DELIVERY_BUFFER_AHEAD_MS,
    DELIVERY_BUFFER_BEHIND_MS,
    DELIVERY_FETCH_CONCURRENCY,
    DELIVERY_STARTUP_SEGMENTS,
    getEffectiveManifestDurationMs,
} from './video-delivery';
import type { DeliveryManifestV2, DeliverySegment } from './types';

type BufferOperation =
    | { type: 'append'; buffer: ArrayBuffer }
    | { type: 'remove'; start: number; end: number };

export interface DeliveryPlaybackSession {
    objectUrl: string;
    start(videoElement: HTMLVideoElement): void;
    destroy(): void;
}

export interface DeliveryPlaybackOptions {
    aesKeyB64?: string;
    onProgress?: (loaded: number, total: number) => void;
    onBufferedTimeChange?: (bufferedSeconds: number) => void;
    onError?: (error: Error) => void;
}

export function createDeliveryPlaybackSession(
    manifest: DeliveryManifestV2,
    options: DeliveryPlaybackOptions = {},
): DeliveryPlaybackSession {
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    const targetDuration = getEffectiveManifestDurationMs(manifest) / 1_000;
    const orderedSegments = [...manifest.segments].sort((a, b) => a.seq - b.seq);
    const segmentWindows = new Map(
        orderedSegments.map((segment) => [
            segment.seq,
            {
                startMs: Math.min(...segment.payloads.map((payload) => payload.startMs)),
                endMs: Math.max(...segment.payloads.map((payload) => payload.endMs)),
                hasVideo: segment.payloads.some((payload) => payload.kind === 'video'),
            },
        ]),
    );
    const totalBytes = manifest.initSegment.byteLength
        + orderedSegments.reduce(
            (sum, segment) => sum + segment.payloads.reduce((inner, payload) => inner + payload.byteLength, 0),
            0,
        );
    const loadedSegments = new Set<number>();
    const loadingSegments = new Set<number>();
    const operationQueue: BufferOperation[] = [];
    const activeRequests = new Set<AbortController>();
    let sourceBuffer: SourceBuffer | null = null;
    let video: HTMLVideoElement | null = null;
    let destroyed = false;
    let sourceOpened = false;
    let startupCompleted = false;
    let loadedBytes = 0;
    let initSegmentCounted = false;
    let requestGeneration = 0;
    let lastPrunedBeforeMs = 0;
    const importedAesKeyPromise = manifest.encrypted && options.aesKeyB64
        ? importAESKey(options.aesKeyB64)
        : null;

    const appendOperation = (operation: BufferOperation) => {
        operationQueue.push(operation);
        flushQueue();
    };

    const reportProgress = () => {
        options.onProgress?.(loadedBytes, totalBytes);
    };

    const allSegmentsLoaded = () => loadedSegments.size >= orderedSegments.length;

    const reportBufferedTime = () => {
        const buffered = video?.buffered;
        if (buffered && buffered.length > 0) {
            const currentTime = video?.currentTime ?? 0;

            for (let index = 0; index < buffered.length; index += 1) {
                const start = buffered.start(index);
                const end = buffered.end(index);
                if (start <= currentTime + 0.25 && end >= currentTime) {
                    options.onBufferedTimeChange?.(end);
                    return;
                }
            }

            options.onBufferedTimeChange?.(buffered.end(buffered.length - 1));
            return;
        }

        options.onBufferedTimeChange?.(0);
    };

    const ensureFixedDuration = () => {
        if (mediaSource.readyState !== 'open') {
            return;
        }

        if (!Number.isFinite(targetDuration) || targetDuration <= 0) {
            return;
        }

        if (Math.abs(mediaSource.duration - targetDuration) > 0.01) {
            try {
                mediaSource.duration = targetDuration;
            } catch {
                // Ignore duration races while the source buffer updates.
            }
        }
    };

    const flushQueue = () => {
        if (destroyed || !sourceBuffer || sourceBuffer.updating || operationQueue.length === 0) {
            return;
        }

        const operation = operationQueue.shift();
        if (!operation) {
            return;
        }

        if (operation.type === 'append') {
            sourceBuffer.appendBuffer(operation.buffer);
            return;
        }

        const end = Math.max(operation.start, operation.end);
        sourceBuffer.remove(operation.start, end);
    };

    const finalizeIfComplete = () => {
        if (
            destroyed
            || !sourceBuffer
            || sourceBuffer.updating
            || operationQueue.length > 0
            || loadingSegments.size > 0
            || !allSegmentsLoaded()
            || mediaSource.readyState !== 'open'
        ) {
            return;
        }

        try {
            ensureFixedDuration();
            mediaSource.endOfStream();
        } catch {
            // Ignore if the media source has already been finalized.
        }
    };

    const abortActiveRequests = () => {
        for (const controller of activeRequests) {
            controller.abort();
        }
        activeRequests.clear();
    };

    const clearPendingOperations = () => {
        operationQueue.length = 0;

        if (!sourceBuffer?.updating) {
            return;
        }

        try {
            sourceBuffer.abort();
        } catch {
            // Ignore abort races during seek teardown.
        }
    };

    const pruneBufferedSegments = (currentMs: number, aggressive: boolean = false) => {
        if (!sourceBuffer || mediaSource.readyState !== 'open') {
            return;
        }

        const removeBeforeMs = Math.max(
            0,
            currentMs - (aggressive ? 1_000 : DELIVERY_BUFFER_BEHIND_MS),
        );

        if (removeBeforeMs <= 0 || removeBeforeMs <= lastPrunedBeforeMs) {
            return;
        }

        let hasBufferedContent = false;
        try {
            hasBufferedContent = sourceBuffer.buffered.length > 0
                && sourceBuffer.buffered.start(0) < removeBeforeMs / 1_000;
        } catch {
            hasBufferedContent = false;
        }

        if (!hasBufferedContent) {
            return;
        }

        for (const segment of orderedSegments) {
            const window = segmentWindows.get(segment.seq);
            if (window && window.endMs < removeBeforeMs) {
                loadedSegments.delete(segment.seq);
            }
        }

        lastPrunedBeforeMs = removeBeforeMs;
        appendOperation({ type: 'remove', start: 0, end: removeBeforeMs / 1_000 });
    };

    const fetchPayloadBuffer = async (
        cid: string,
        counterB64?: string,
        signal?: AbortSignal,
    ): Promise<ArrayBuffer> => {
        const response = await fetchFromGateways(cid, {
            signal,
            timeout: 8_000,
        });
        const encrypted = new Uint8Array(await response.arrayBuffer());
        if (!manifest.encrypted || !counterB64) {
            return encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength) as ArrayBuffer;
        }

        if (!importedAesKeyPromise) {
            throw new Error('Encrypted delivery manifest requires an AES key');
        }

        const cryptoKey = await importedAesKeyPromise;
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CTR', counter: decodeCounter(counterB64) as BufferSource, length: 64 },
            cryptoKey,
            encrypted as BufferSource,
        );
        return decrypted.slice(0);
    };

    const loadSegment = async (segment: DeliverySegment, generation: number) => {
        if (destroyed || loadedSegments.has(segment.seq) || loadingSegments.has(segment.seq)) {
            return;
        }

        loadingSegments.add(segment.seq);
        const controller = new AbortController();
        activeRequests.add(controller);

        try {
            const buffers = await Promise.all(
                [...segment.payloads]
                    .sort((a, b) => {
                        if (a.startMs !== b.startMs) {
                            return a.startMs - b.startMs;
                        }
                        if (a.kind === b.kind) {
                            return 0;
                        }
                        return a.kind === 'video' ? -1 : 1;
                    })
                    .map(async (payload) => await fetchPayloadBuffer(payload.cid, payload.counterB64, controller.signal)),
            );

            if (destroyed || generation !== requestGeneration) {
                return;
            }

            loadedSegments.add(segment.seq);
            loadedBytes += segment.payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
            reportProgress();
            reportBufferedTime();
            appendOperation({ type: 'append', buffer: concatenateArrayBuffers(buffers) });
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }
            if (!destroyed) {
                options.onError?.(error instanceof Error ? error : new Error(String(error)));
            }
        } finally {
            loadingSegments.delete(segment.seq);
            activeRequests.delete(controller);
        }
    };

    const scheduleSegments = () => {
        if (destroyed || !video || !sourceOpened || !sourceBuffer) {
            return;
        }

        const currentMs = startupCompleted
            ? Math.max(0, Math.floor(video.currentTime * 1_000))
            : 0;
        const startupTargetMs = startupCompleted
            ? currentMs
            : Math.max(
                currentMs + DELIVERY_BUFFER_AHEAD_MS,
                getStartupWindowEndMs(orderedSegments, DELIVERY_STARTUP_SEGMENTS),
            );
        const targetStartMs = Math.max(0, currentMs - 1_000);
        const targetEndMs = startupTargetMs + DELIVERY_BUFFER_AHEAD_MS;
        const generation = requestGeneration;

        const candidates = orderedSegments.filter(
            (segment) => segmentOverlapsWindow(segment, targetStartMs, targetEndMs)
                && !loadedSegments.has(segment.seq)
                && !loadingSegments.has(segment.seq),
        );

        void runWithConcurrency(
            candidates,
            DELIVERY_FETCH_CONCURRENCY,
            async (segment) => await loadSegment(segment, generation),
        );

        pruneBufferedSegments(currentMs);
        finalizeIfComplete();
    };

    const handleSourceOpen = async () => {
        if (destroyed || sourceOpened) {
            return;
        }

        sourceOpened = true;
        ensureFixedDuration();
        sourceBuffer = mediaSource.addSourceBuffer(`video/mp4; codecs="${manifest.codec}"`);
        sourceBuffer.mode = 'segments';
        sourceBuffer.addEventListener('updateend', () => {
            ensureFixedDuration();
            if (!startupCompleted && loadedSegments.size >= Math.min(DELIVERY_STARTUP_SEGMENTS, orderedSegments.length)) {
                startupCompleted = true;
            }
            flushQueue();
            scheduleSegments();
            finalizeIfComplete();
        });

        try {
            const initBuffer = await fetchPayloadBuffer(
                manifest.initSegment.cid,
                manifest.initSegment.counterB64,
            );
            if (!initSegmentCounted) {
                initSegmentCounted = true;
                loadedBytes += manifest.initSegment.byteLength;
                reportProgress();
            }
            appendOperation({ type: 'append', buffer: initBuffer });
            scheduleSegments();
        } catch (error) {
            options.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
    };

    const handleTimeUpdate = () => {
        scheduleSegments();
    };

    const handleSeeking = () => {
        requestGeneration += 1;
        abortActiveRequests();
        clearPendingOperations();
        loadingSegments.clear();
        if (video) {
            pruneBufferedSegments(Math.max(0, Math.floor(video.currentTime * 1_000)), true);
            reportBufferedTime();
        }
        scheduleSegments();
    };

    const start = (videoElement: HTMLVideoElement) => {
        if (destroyed) {
            return;
        }

        video = videoElement;
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('seeking', handleSeeking);

        if (video.src !== objectUrl) {
            video.src = objectUrl;
        }

        if (mediaSource.readyState === 'open') {
            void handleSourceOpen();
            return;
        }

        mediaSource.addEventListener('sourceopen', () => {
            void handleSourceOpen();
        }, { once: true });
    };

    const destroy = () => {
        destroyed = true;
        requestGeneration += 1;
        abortActiveRequests();
        clearPendingOperations();
        if (video) {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('seeking', handleSeeking);
        }
        if (sourceBuffer?.updating) {
            try {
                sourceBuffer.abort();
            } catch {
                // Ignore teardown races.
            }
        }
        if (mediaSource.readyState === 'open') {
            try {
                mediaSource.endOfStream();
            } catch {
                // Ignore if already closed.
            }
        }
        URL.revokeObjectURL(objectUrl);
    };

    return {
        objectUrl,
        start,
        destroy,
    };
}

function segmentOverlapsWindow(segment: DeliverySegment, windowStartMs: number, windowEndMs: number): boolean {
    const start = Math.min(...segment.payloads.map((payload) => payload.startMs));
    const end = Math.max(...segment.payloads.map((payload) => payload.endMs));
    return end >= windowStartMs && start <= windowEndMs;
}

function getStartupWindowEndMs(segments: DeliverySegment[], startupSegmentCount: number): number {
    if (segments.length === 0) {
        return 0;
    }

    const targetIndex = Math.min(segments.length - 1, Math.max(0, startupSegmentCount - 1));
    const targetSegment = segments[targetIndex];
    return Math.max(...targetSegment.payloads.map((payload) => payload.endMs));
}

async function runWithConcurrency<T>(
    values: T[],
    concurrency: number,
    handler: (value: T) => Promise<void>,
): Promise<void> {
    const queue = [...values];
    const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
        while (queue.length > 0) {
            const next = queue.shift();
            if (!next) {
                return;
            }
            await handler(next);
        }
    });

    await Promise.all(workers);
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
