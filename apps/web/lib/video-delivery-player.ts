import { fetchFromGateways } from './crust';
import { decodeCounter, importAESKey } from './kms';
import {
    DELIVERY_BUFFER_AHEAD_MS,
    DELIVERY_BUFFER_BEHIND_MS,
    DELIVERY_FETCH_CONCURRENCY,
    getEffectiveManifestDurationMs,
} from './video-delivery';
import type { DeliveryManifestV2, DeliverySegment } from './types';

export type DeliveryPlaybackPhase = 'startup' | 'seek' | 'steady';

export interface DeliveryPlaybackMetrics {
    phase: DeliveryPlaybackPhase;
    currentTimeSeconds: number;
    playableAheadSeconds: number;
    playableUntilSeconds: number;
    targetPlayableAheadSeconds: number;
    fetchingSegments: number;
    readySegments: number;
    queuedSegments: number;
    bufferedSegments: number;
    bytesLoaded: number;
    bytesTotal: number;
}

type BufferOperation =
    | { type: 'append'; buffer: ArrayBuffer; segmentSeq?: number; byteLength?: number }
    | { type: 'remove'; start: number; end: number };

const BUFFER_TOLERANCE_MS = 250;
const STARTUP_PLAYABLE_AHEAD_MS = Math.min(6_000, DELIVERY_BUFFER_AHEAD_MS);
const SEEK_PLAYABLE_AHEAD_MS = 4_000;
const STEADY_PLAYABLE_AHEAD_MS = Math.min(12_000, DELIVERY_BUFFER_AHEAD_MS);
const PREFETCH_AHEAD_MS = Math.min(6_000, Math.max(0, DELIVERY_BUFFER_AHEAD_MS - STEADY_PLAYABLE_AHEAD_MS));

export interface DeliveryPlaybackSession {
    objectUrl: string;
    getPreferredSeekTime(targetSeconds: number): number;
    start(videoElement: HTMLVideoElement): void;
    destroy(): void;
}

export interface DeliveryPlaybackOptions {
    aesKeyB64?: string;
    onProgress?: (loaded: number, total: number) => void;
    onBufferedTimeChange?: (bufferedSeconds: number) => void;
    onMetricsChange?: (metrics: DeliveryPlaybackMetrics) => void;
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
    const bufferedSegments = new Set<number>();
    const loadingSegments = new Set<number>();
    const queuedSegments = new Set<number>();
    const countedSegments = new Set<number>();
    const readySegments = new Map<number, { buffer: ArrayBuffer; byteLength: number }>();
    const operationQueue: BufferOperation[] = [];
    const activeRequests = new Set<AbortController>();
    let sourceBuffer: SourceBuffer | null = null;
    let video: HTMLVideoElement | null = null;
    let destroyed = false;
    let sourceOpened = false;
    let playbackPhase: DeliveryPlaybackPhase = 'startup';
    let loadedBytes = 0;
    let initSegmentCounted = false;
    let requestGeneration = 0;
    let lastPrunedBeforeMs = 0;
    let activeOperation: BufferOperation | null = null;
    let nextSegmentSeqToQueue = orderedSegments[0]?.seq ?? 0;
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

    const allSegmentsLoaded = () => countedSegments.size >= orderedSegments.length;

    const getCurrentTimeMs = () => Math.max(0, Math.floor((video?.currentTime ?? 0) * 1_000));

    const getTargetPlayableAheadMs = () => {
        switch (playbackPhase) {
            case 'seek':
                return SEEK_PLAYABLE_AHEAD_MS;
            case 'steady':
                return STEADY_PLAYABLE_AHEAD_MS;
            case 'startup':
            default:
                return STARTUP_PLAYABLE_AHEAD_MS;
        }
    };

    const getBufferedRanges = () => {
        if (sourceBuffer?.buffered && sourceBuffer.buffered.length > 0) {
            return sourceBuffer.buffered;
        }

        return video?.buffered;
    };

    const getPlayableWindow = (currentTimeMs: number) => {
        const buffered = getBufferedRanges();
        if (!buffered || buffered.length === 0) {
            return {
                playableUntilMs: currentTimeMs,
                playableAheadMs: 0,
            };
        }

        for (let index = 0; index < buffered.length; index += 1) {
            const startMs = Math.max(0, Math.floor(buffered.start(index) * 1_000));
            const endMs = Math.max(startMs, Math.floor(buffered.end(index) * 1_000));
            const overlapsCurrentTime = startMs <= currentTimeMs + BUFFER_TOLERANCE_MS
                && endMs >= Math.max(0, currentTimeMs - BUFFER_TOLERANCE_MS);

            if (!overlapsCurrentTime) {
                continue;
            }

            return {
                playableUntilMs: endMs,
                playableAheadMs: Math.max(0, endMs - currentTimeMs),
            };
        }

        return {
            playableUntilMs: currentTimeMs,
            playableAheadMs: 0,
        };
    };

    const advancePlaybackPhaseIfReady = (playableAheadMs: number) => {
        if (playbackPhase === 'startup' && playableAheadMs >= STARTUP_PLAYABLE_AHEAD_MS) {
            playbackPhase = 'steady';
        } else if (playbackPhase === 'seek' && playableAheadMs >= SEEK_PLAYABLE_AHEAD_MS) {
            playbackPhase = 'steady';
        }
    };

    const reportMetrics = () => {
        const currentTimeMs = getCurrentTimeMs();
        const { playableUntilMs, playableAheadMs } = getPlayableWindow(currentTimeMs);
        advancePlaybackPhaseIfReady(playableAheadMs);
        const targetPlayableAheadMs = getTargetPlayableAheadMs();

        options.onBufferedTimeChange?.(playableUntilMs / 1_000);
        options.onMetricsChange?.({
            phase: playbackPhase,
            currentTimeSeconds: currentTimeMs / 1_000,
            playableAheadSeconds: playableAheadMs / 1_000,
            playableUntilSeconds: playableUntilMs / 1_000,
            targetPlayableAheadSeconds: targetPlayableAheadMs / 1_000,
            fetchingSegments: loadingSegments.size,
            readySegments: readySegments.size,
            queuedSegments: queuedSegments.size,
            bufferedSegments: bufferedSegments.size,
            bytesLoaded: loadedBytes,
            bytesTotal: totalBytes,
        });
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

        activeOperation = operation;

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
        readySegments.clear();

        for (const operation of operationQueue) {
            if (operation.type === 'append' && typeof operation.segmentSeq === 'number') {
                queuedSegments.delete(operation.segmentSeq);
            }
        }
        operationQueue.length = 0;

        if (activeOperation?.type === 'append' && typeof activeOperation.segmentSeq === 'number') {
            queuedSegments.delete(activeOperation.segmentSeq);
        }

        if (!sourceBuffer?.updating) {
            activeOperation = null;
            reportMetrics();
            return;
        }

        try {
            sourceBuffer.abort();
        } catch {
            // Ignore abort races during seek teardown.
        }

        activeOperation = null;
        reportMetrics();
    };

    const advanceAppendCursor = () => {
        while (bufferedSegments.has(nextSegmentSeqToQueue) || queuedSegments.has(nextSegmentSeqToQueue)) {
            nextSegmentSeqToQueue += 1;
        }
    };

    const queueReadySegmentsInOrder = () => {
        advanceAppendCursor();

        while (true) {
            const nextReadySegment = readySegments.get(nextSegmentSeqToQueue);
            if (!nextReadySegment) {
                break;
            }

            readySegments.delete(nextSegmentSeqToQueue);
            queuedSegments.add(nextSegmentSeqToQueue);
            appendOperation({
                type: 'append',
                buffer: nextReadySegment.buffer,
                segmentSeq: nextSegmentSeqToQueue,
                byteLength: nextReadySegment.byteLength,
            });
            nextSegmentSeqToQueue += 1;
            advanceAppendCursor();
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
            reportMetrics();
            return;
        }

        for (const segment of orderedSegments) {
            const window = segmentWindows.get(segment.seq);
            if (window && window.endMs < removeBeforeMs) {
                bufferedSegments.delete(segment.seq);
            }
        }

        lastPrunedBeforeMs = removeBeforeMs;
        appendOperation({ type: 'remove', start: 0, end: removeBeforeMs / 1_000 });
        reportMetrics();
    };

    const fetchPayloadBuffer = async (
        cid: string,
        counterB64?: string,
        signal?: AbortSignal,
    ): Promise<ArrayBuffer> => {
        const response = await fetchFromGateways(cid, {
            purpose: 'segment',
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
        if (
            destroyed
            || bufferedSegments.has(segment.seq)
            || loadingSegments.has(segment.seq)
            || queuedSegments.has(segment.seq)
            || readySegments.has(segment.seq)
        ) {
            reportMetrics();
            return;
        }

        loadingSegments.add(segment.seq);
        reportMetrics();
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

            readySegments.set(segment.seq, {
                buffer: concatenateArrayBuffers(buffers),
                byteLength: segment.payloads.reduce((sum, payload) => sum + payload.byteLength, 0),
            });
            queueReadySegmentsInOrder();
            reportMetrics();
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
            reportMetrics();
        }
    };

    const scheduleSegments = () => {
        if (destroyed || !video || !sourceOpened || !sourceBuffer) {
            return;
        }

        const currentMs = getCurrentTimeMs();
        const { playableAheadMs } = getPlayableWindow(currentMs);
        advancePlaybackPhaseIfReady(playableAheadMs);
        const targetPlayableAheadMs = getTargetPlayableAheadMs();
        const criticalEndMs = currentMs + targetPlayableAheadMs;
        const targetStartMs = Math.max(0, currentMs - (playbackPhase === 'seek' ? 500 : 1_000));
        const prefetchEndMs = playableAheadMs >= targetPlayableAheadMs
            ? criticalEndMs + PREFETCH_AHEAD_MS
            : criticalEndMs;
        const generation = requestGeneration;

        const candidates = orderedSegments.filter(
            (segment) => segmentOverlapsWindow(segment, targetStartMs, prefetchEndMs)
                && !bufferedSegments.has(segment.seq)
                && !loadingSegments.has(segment.seq)
                && !queuedSegments.has(segment.seq)
                && !readySegments.has(segment.seq),
        ).sort((a, b) => {
            const aWindow = segmentWindows.get(a.seq);
            const bWindow = segmentWindows.get(b.seq);
            const aPriority = getSegmentPriority(aWindow, currentMs, criticalEndMs);
            const bPriority = getSegmentPriority(bWindow, currentMs, criticalEndMs);

            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }

            return a.seq - b.seq;
        });

        void runWithConcurrency(
            candidates,
            DELIVERY_FETCH_CONCURRENCY,
            async (segment) => await loadSegment(segment, generation),
        );

        pruneBufferedSegments(currentMs);
        reportMetrics();
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
            if (activeOperation?.type === 'append' && typeof activeOperation.segmentSeq === 'number') {
                queuedSegments.delete(activeOperation.segmentSeq);
                bufferedSegments.add(activeOperation.segmentSeq);
                if (!countedSegments.has(activeOperation.segmentSeq) && typeof activeOperation.byteLength === 'number') {
                    countedSegments.add(activeOperation.segmentSeq);
                    loadedBytes += activeOperation.byteLength;
                    reportProgress();
                }
            }

            activeOperation = null;
            ensureFixedDuration();
            reportMetrics();
            queueReadySegmentsInOrder();
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
            reportMetrics();
            scheduleSegments();
        } catch (error) {
            options.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
    };

    const handleTimeUpdate = () => {
        scheduleSegments();
    };

    const handleSeeking = () => {
        playbackPhase = 'seek';
        requestGeneration += 1;
        abortActiveRequests();
        clearPendingOperations();
        loadingSegments.clear();
        if (video) {
            const currentMs = Math.max(0, Math.floor(video.currentTime * 1_000));
            nextSegmentSeqToQueue = findSegmentSeqForTime(currentMs, orderedSegments);
            pruneBufferedSegments(currentMs, true);
        }
        queueReadySegmentsInOrder();
        reportMetrics();
        scheduleSegments();
    };

    const getPreferredSeekTime = (targetSeconds: number): number => {
        const targetMs = Math.max(0, Math.round(targetSeconds * 1_000));

        const containingVideoSegment = orderedSegments.find((segment) => {
            const window = segmentWindows.get(segment.seq);
            return Boolean(window?.hasVideo && window.startMs <= targetMs && window.endMs >= targetMs);
        });
        if (containingVideoSegment) {
            return (segmentWindows.get(containingVideoSegment.seq)?.startMs ?? targetMs) / 1_000;
        }

        const nextVideoSegment = orderedSegments.find((segment) => {
            const window = segmentWindows.get(segment.seq);
            return Boolean(window?.hasVideo && window.startMs > targetMs);
        });
        if (nextVideoSegment) {
            return (segmentWindows.get(nextVideoSegment.seq)?.startMs ?? targetMs) / 1_000;
        }

        const previousVideoSegment = [...orderedSegments]
            .reverse()
            .find((segment) => {
                const window = segmentWindows.get(segment.seq);
                return Boolean(window?.hasVideo && window.startMs <= targetMs);
            });

        return previousVideoSegment
            ? (segmentWindows.get(previousVideoSegment.seq)?.startMs ?? targetMs) / 1_000
            : targetSeconds;
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

        reportMetrics();

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
        getPreferredSeekTime,
        start,
        destroy,
    };
}

function findSegmentSeqForTime(timeMs: number, segments: DeliverySegment[]): number {
    if (segments.length === 0) {
        return 0;
    }

    const containingSegment = segments.find((segment) => {
        const start = Math.min(...segment.payloads.map((payload) => payload.startMs));
        const end = Math.max(...segment.payloads.map((payload) => payload.endMs));
        return start <= timeMs && end >= timeMs;
    });
    if (containingSegment) {
        return containingSegment.seq;
    }

    const nextSegment = segments.find((segment) => {
        const start = Math.min(...segment.payloads.map((payload) => payload.startMs));
        return start > timeMs;
    });

    return nextSegment?.seq ?? segments[segments.length - 1].seq;
}

function segmentOverlapsWindow(segment: DeliverySegment, windowStartMs: number, windowEndMs: number): boolean {
    const start = Math.min(...segment.payloads.map((payload) => payload.startMs));
    const end = Math.max(...segment.payloads.map((payload) => payload.endMs));
    return end >= windowStartMs && start <= windowEndMs;
}

function getSegmentPriority(
    window: { startMs: number; endMs: number; hasVideo: boolean } | undefined,
    currentMs: number,
    criticalEndMs: number,
): number {
    if (!window) {
        return 3;
    }

    if (window.startMs <= currentMs + BUFFER_TOLERANCE_MS && window.endMs >= currentMs - BUFFER_TOLERANCE_MS) {
        return 0;
    }

    if (window.startMs <= criticalEndMs) {
        return 1;
    }

    return 2;
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
