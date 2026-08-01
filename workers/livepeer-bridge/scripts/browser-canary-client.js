import { Upload } from '/tus-client.js';

const SOURCE_BYTES = 20 * 1024 * 1024;
const CHECKPOINTS = { 0: 6 * 1024 * 1024, 30: 14 * 1024 * 1024 };
const RESUME_OFFSETS = { 0: 0, 30: 6 * 1024 * 1024, 70: 14 * 1024 * 1024 };
const status = document.querySelector('#status');
const evidence = document.querySelector('#evidence');

function show(state, detail = {}) {
    status.textContent = state;
    evidence.textContent = JSON.stringify(detail, null, 2);
}

async function post(path, body = {}) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path}_${response.status}`);
    return response.json();
}

async function cleanup(error) {
    try {
        const receipt = await post('/cleanup');
        show(error ? 'failed-cleaned' : 'complete', { error, receipt });
    } catch (cleanupError) {
        show('cleanup-failed', { error, cleanup_error: cleanupError.message });
    }
}

async function run() {
    show('creating-intent');
    const intent = await post('/intent');
    const stageKey = `youtick-livepeer-canary:${intent.run_id}`;
    const stage = Number(localStorage.getItem(stageKey) || '0');
    if (![0, 30, 70].includes(stage)) throw new Error('browser_stage_invalid');

    const bytes = new Uint8Array(SOURCE_BYTES);
    bytes.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const file = new File([bytes], `livepeer-canary-${intent.run_id}.mp4`, {
        type: 'video/mp4',
        lastModified: 1785542400000,
    });
    const targetOffset = CHECKPOINTS[stage] ?? SOURCE_BYTES;
    let pausing = false;

    const upload = new Upload(file, {
        endpoint: intent.tus_endpoint,
        chunkSize: 1024 * 1024,
        metadata: { filename: file.name, filetype: file.type },
        removeFingerprintOnSuccess: true,
        retryDelays: [0, 1000, 3000],
        onAfterResponse: async (request, response) => {
            if (request.getMethod() === 'HEAD') {
                await post('/event', {
                    kind: 'head',
                    offset: Number(response.getHeader('Upload-Offset')),
                    stage,
                });
            }
        },
        onChunkComplete: async (_chunkBytes, acceptedBytes) => {
            if (targetOffset === SOURCE_BYTES || acceptedBytes !== targetOffset || pausing) return;
            pausing = true;
            await upload.abort(false);
            const nextStage = stage === 0 ? 30 : 70;
            localStorage.setItem(stageKey, String(nextStage));
            await post('/event', { kind: 'checkpoint', offset: acceptedBytes, stage: nextStage });
            show(`paused-${nextStage}`, { accepted_bytes: acceptedBytes, source_bytes: SOURCE_BYTES });
        },
        onError: async () => {
            if (!pausing) await cleanup('upload_failed');
        },
        onSuccess: async () => {
            localStorage.removeItem(stageKey);
            await post('/event', { kind: 'success', offset: SOURCE_BYTES, stage: 100 });
            await cleanup(null);
        },
    });

    const previousUploads = await upload.findPreviousUploads();
    if (stage > 0) {
        if (previousUploads.length !== 1) throw new Error(`previous_upload_count_${previousUploads.length}`);
        upload.resumeFromPreviousUpload(previousUploads[0]);
    } else if (previousUploads.length !== 0) {
        throw new Error(`unexpected_previous_upload_count_${previousUploads.length}`);
    }
    await post('/event', { kind: 'client_start', offset: RESUME_OFFSETS[stage], stage });
    show(stage === 0 ? 'uploading-new' : `resuming-${stage}`, { source_bytes: SOURCE_BYTES });
    upload.start();
}

run().catch(() => cleanup('canary_failed'));
