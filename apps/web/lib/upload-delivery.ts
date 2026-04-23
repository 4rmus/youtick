import { uploadToCrust } from './crust';
import { CidCollector } from './crust/cid-collector';
import { encryptBufferWithCounter } from './kms/encryption';
import { extractIpfsCid } from './ipfs-media';
import { runWithConcurrency, toBlobPart } from './utils';
import type { DeliverySegmentPayload } from './types';
import type { PackagedDeliveryAsset } from './video-delivery';

export interface UploadDeliveryCallbacks {
    onStatus: (status: string) => void;
    onProgress: (progress: number) => void;
}

export async function uploadSegmentedDeliveryAsset(params: {
    packagedAsset: PackagedDeliveryAsset;
    accountId: string;
    encrypted: boolean;
    aesKeyB64?: string;
    thumbnailRef?: string | null;
    posterBlob?: Blob | null;
    collector: CidCollector;
    callbacks: UploadDeliveryCallbacks;
}): Promise<{ manifestCid: string }> {
    const {
        packagedAsset,
        accountId: uploaderAccountId,
        encrypted,
        aesKeyB64,
        thumbnailRef,
        posterBlob,
        collector,
        callbacks,
    } = params;
    const {
        combinePackagedSegmentPayloads,
        createDeliverySegment,
        toDeliveryManifestV2,
        warmupGatewayCids,
        DELIVERY_UPLOAD_CONCURRENCY,
    } = await import('./video-delivery');

    if (encrypted && !aesKeyB64) {
        throw new Error('Segmented encrypted delivery requires an AES key');
    }
    const encryptionKey = aesKeyB64;

    let posterCid: string | undefined;
    if (posterBlob) {
        try {
            callbacks.onStatus('Uploading poster image...');
            const posterResult = await uploadToCrust(posterBlob, uploaderAccountId);
            posterCid = posterResult.cid;
            collector.add(posterResult.cid, posterResult.size, 'poster');
        } catch (posterError) {
            console.warn('[upload-delivery] Poster upload failed, continuing without poster:', posterError);
        }
    }

    callbacks.onStatus('Uploading initialization segment...');
    const initBytes = new Uint8Array(packagedAsset.initSegment);
    let initCounterB64: string | undefined;
    let initUploadBlob: Blob;

    if (encrypted) {
        const encryptedInit = await encryptBufferWithCounter(initBytes, encryptionKey as string);
        initCounterB64 = encryptedInit.counterB64;
        initUploadBlob = new Blob([toBlobPart(encryptedInit.ciphertext)], { type: 'application/octet-stream' });
    } else {
        initUploadBlob = new Blob([initBytes], { type: 'video/mp4' });
    }

    const initUpload = await uploadToCrust(initUploadBlob, uploaderAccountId);
    collector.add(initUpload.cid, initUpload.size, 'init-segment');

    let uploadedSegmentCount = 0;
    const uploadedSegments = await runWithConcurrency(
        packagedAsset.segments,
        DELIVERY_UPLOAD_CONCURRENCY,
        async (segment) => {
            const payload = combinePackagedSegmentPayloads(segment.payloads);
            const payloadBytes = new Uint8Array(payload.buffer);
            let payloadCounterB64: string | undefined;
            let payloadBlob: Blob;

            if (encrypted) {
                const encryptedPayload = await encryptBufferWithCounter(payloadBytes, encryptionKey as string);
                payloadCounterB64 = encryptedPayload.counterB64;
                payloadBlob = new Blob([toBlobPart(encryptedPayload.ciphertext)], { type: 'application/octet-stream' });
            } else {
                payloadBlob = new Blob([payloadBytes], { type: 'video/mp4' });
            }

            const uploadResult = await uploadToCrust(payloadBlob, uploaderAccountId);
            collector.add(uploadResult.cid, uploadResult.size, 'media-segment');
            const uploadedPayloads: DeliverySegmentPayload[] = [{
                cid: uploadResult.cid,
                trackId: payload.trackId,
                kind: payload.kind,
                byteLength: payload.byteLength,
                startMs: payload.startMs,
                endMs: payload.endMs,
                counterB64: payloadCounterB64,
            }];

            uploadedSegmentCount += 1;
            const progress = Math.round((uploadedSegmentCount / packagedAsset.segments.length) * 100);
            callbacks.onProgress(progress);
            callbacks.onStatus(`Uploading delivery segments... ${progress}%`);

            return createDeliverySegment(segment.seq, uploadedPayloads);
        },
    );

    callbacks.onStatus('Uploading delivery manifest...');
    const manifest = toDeliveryManifestV2(
        packagedAsset,
        initUpload.cid,
        packagedAsset.tracks,
        uploadedSegments,
        {
            encrypted,
            posterCid,
            initSegmentCounterB64: initCounterB64,
        },
    );

    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestResult = await uploadToCrust(manifestBlob, uploaderAccountId);
    collector.add(manifestResult.cid, manifestResult.size, 'manifest');

    const thumbnailCid = thumbnailRef ? extractIpfsCid(thumbnailRef) : null;
    const warmupItems = [
        thumbnailCid ? { cid: thumbnailCid, kind: 'image' as const } : null,
        posterCid ? { cid: posterCid, kind: 'image' as const } : null,
        { cid: initUpload.cid, kind: 'segment' as const },
        ...(uploadedSegments[0]?.payloads.map((payload) => ({ cid: payload.cid, kind: 'segment' as const })) ?? []),
    ].filter(Boolean) as Array<{ cid: string; kind: 'image' | 'segment' }>;

    void warmupGatewayCids(warmupItems);

    return { manifestCid: manifestResult.cid };
}
