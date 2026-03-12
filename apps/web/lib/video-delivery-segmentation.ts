export interface SegmentationTrackLike {
    bitrate: number;
}

export interface SegmentationSampleLike {
    duration: number;
    timescale: number;
}

export interface SegmentationPayloadLike {
    kind: 'audio' | 'video';
    startMs: number;
    endMs: number;
}

export function estimateSegmentSizeBytes(
    track: SegmentationTrackLike,
    durationMs: number,
    totalFileSize: number,
    trackCount: number,
    targetSegmentDurationMs: number,
): number {
    if (track.bitrate > 0) {
        return Math.max(64 * 1024, Math.round((track.bitrate / 8) * (targetSegmentDurationMs / 1_000)));
    }

    const estimatedSegmentCount = Math.max(1, Math.ceil(durationMs / targetSegmentDurationMs));
    return Math.max(64 * 1024, Math.round(totalFileSize / (estimatedSegmentCount * trackCount)));
}

export function estimateTrackSegmentSampleCount(
    samples: SegmentationSampleLike[],
    targetSegmentDurationMs: number,
): number {
    if (samples.length === 0) {
        return 1;
    }

    let accumulatedMs = 0;
    let count = 0;

    for (const sample of samples) {
        accumulatedMs += (sample.duration / sample.timescale) * 1_000;
        count += 1;
        if (accumulatedMs >= targetSegmentDurationMs) {
            break;
        }
    }

    return Math.max(1, count);
}

export function estimateSharedSegmentSampleCount(
    sampleSets: Iterable<SegmentationSampleLike[]>,
    targetSegmentDurationMs: number,
): number {
    let sharedCount: number | null = null;

    for (const samples of sampleSets) {
        if (samples.length === 0) {
            continue;
        }

        const trackCount = estimateTrackSegmentSampleCount(samples, targetSegmentDurationMs);
        sharedCount = sharedCount === null
            ? trackCount
            : Math.min(sharedCount, trackCount);
    }

    return Math.max(1, sharedCount ?? 1);
}

export function groupPayloadsByVideoAnchor<T extends SegmentationPayloadLike>(
    payloads: T[],
    targetSegmentDurationMs: number,
): T[][] {
    const sortedPayloads = [...payloads].sort(comparePayloadTimeline);
    const videoPayloads = sortedPayloads.filter((payload) => payload.kind === 'video');

    if (videoPayloads.length === 0) {
        const groups = new Map<number, T[]>();

        for (const payload of sortedPayloads) {
            const seq = Math.max(0, Math.floor(payload.startMs / Math.max(targetSegmentDurationMs, 1)));
            const group = groups.get(seq) ?? [];
            group.push(payload);
            groups.set(seq, group);
        }

        return [...groups.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, group]) => [...group].sort(comparePayloadTimeline));
    }

    const groups = videoPayloads.map((payload) => [payload] as T[]);
    const videoStarts = videoPayloads.map((payload) => payload.startMs);

    for (const payload of sortedPayloads) {
        if (payload.kind === 'video') {
            continue;
        }

        const midpoint = payload.startMs + ((payload.endMs - payload.startMs) / 2);
        let targetIndex = 0;

        while (targetIndex + 1 < videoStarts.length && midpoint >= videoStarts[targetIndex + 1]) {
            targetIndex += 1;
        }

        groups[targetIndex].push(payload);
    }

    return groups.map((group) => [...group].sort(comparePayloadTimeline));
}

function comparePayloadTimeline(a: SegmentationPayloadLike, b: SegmentationPayloadLike): number {
    if (a.startMs !== b.startMs) {
        return a.startMs - b.startMs;
    }

    if (a.kind === b.kind) {
        return 0;
    }

    return a.kind === 'video' ? -1 : 1;
}
