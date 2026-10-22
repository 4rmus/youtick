import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import handler, { LivepeerControl, type Env } from './index';
import { STREAM_TEST_VALUES as V } from './stream-test-fixtures';
import {
    API,
    CREATOR,
    controlNamespace,
    createState,
    createStreamKeys,
    finalJobRpc,
    internalStreamWebhook,
    streamBackend,
    streamEnv,
    streamIntentRequest,
    streamJobRecord,
    streamVideo,
    type StreamBackend,
    type StreamKeys,
} from './stream-test-harness';

let keys: StreamKeys;
beforeAll(async () => { keys = await createStreamKeys(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function admissionRequest(path: string, body: Record<string, unknown>): Request {
    return new Request(`https://object/internal/admission/${path}`, { method: 'POST', body: JSON.stringify(body) });
}

function candidate(jobId: string, creator: string, extra: Record<string, unknown> = {}) {
    return { jobId, generation: 1, creator, expectedSourceBytes: V.LENGTH, ...extra };
}

/** Real admission and job objects wired through one LIVEPEER_CONTROL double. */
async function wired(options: { env?: Partial<Env>; backend?: Partial<StreamBackend['state']>; job?: Record<string, unknown> } = {}) {
    const backend = await streamBackend(keys, options.backend);
    backend.state.rpc = (body) => body.params.method_name === 'get_media_job' ? finalJobRpc(keys) : null;
    vi.stubGlobal('fetch', backend.fetch);
    const admissionState = createState();
    const jobState = createState();
    let admission!: LivepeerControl;
    const { namespace, operatorCalls } = controlNamespace({ admission: { fetch: (request) => admission.fetch(request) } });
    const env = streamEnv(keys, {
        LIVEPEER_CREATOR_ALLOWLIST: `${CREATOR},other.testnet,third.testnet`,
        LIVEPEER_CONTROL: namespace,
        ...options.env,
    });
    admission = new LivepeerControl(admissionState.state, env);
    if (options.job) jobState.values.set('job:v1', streamJobRecord(options.job));
    const control = new LivepeerControl(jobState.state, env);
    const job = () => jobState.values.get('job:v1') as Record<string, unknown>;
    const admissionRecord = () => admissionState.values.get('admission:v1') as Record<string, any> | undefined;
    const calls = (predicate: (call: StreamBackend['calls'][number]) => boolean) => backend.calls.filter(predicate);
    return { backend, admission, admissionState, jobState, control, env, job, admissionRecord, calls, operatorCalls };
}

const isDelete = (call: { method: string; url: string }) => call.method === 'DELETE' && call.url === `${API}/${V.UID}`;
const isVideoGet = (call: { method: string; url: string }) => call.method === 'GET' && call.url === `${API}/${V.UID}`;

async function seedReservation(run: Awaited<ReturnType<typeof wired>>, jobId = 'job-001') {
    const response = await run.admission.fetch(admissionRequest('reserve', candidate(jobId, CREATOR, { reservedSeconds: 7200 })));
    expect(response.status).toBe(200);
}

describe('Stream admission: reservation budget and storage headroom', () => {
    it('denies a second open reservation over the budget, admits Studio beside it, and releases at READY_VERIFIED', async () => {
        const run = await wired();
        await seedReservation(run);
        expect(run.admissionRecord()!.stream).toMatchObject({
            openReservedSeconds: 7200, verifiedStorageSeconds: 0,
            reservations: { 'job-001:1': { seconds: 7200 } },
        });
        expect(run.admissionRecord()!.schema).toBe('youtick.livepeer-admission.v2');

        const preflight = await run.admission.fetch(admissionRequest('preflight', candidate('job-002', 'other.testnet', { reservedSeconds: 7200 })));
        expect(preflight.status).toBe(409);
        expect(await preflight.json()).toEqual({ error: 'admission_denied', reason: 'reservation_budget' });
        const denied = await run.admission.fetch(admissionRequest('reserve', candidate('job-002', 'other.testnet', { reservedSeconds: 7200 })));
        expect(denied.status).toBe(409);

        // A Studio job (no reservation) shares the admission object and is not counted.
        const studio = await run.admission.fetch(admissionRequest('reserve', candidate('studio-job', 'third.testnet')));
        expect(studio.status).toBe(200);
        expect(run.admissionRecord()!.stream.openReservedSeconds).toBe(7200);
        expect(Object.keys(run.admissionRecord()!.reservations).sort()).toEqual(['job-001:1', 'studio-job:1']);

        const ready = await run.admission.fetch(admissionRequest('mark', { jobId: 'job-001', generation: 1, state: 'READY_VERIFIED', durationSeconds: 180 }));
        expect(ready.status).toBe(200);
        expect(run.admissionRecord()!.stream).toMatchObject({ openReservedSeconds: 0, verifiedStorageSeconds: 180, reservations: {} });
        // Idempotent: a second mark never counts the duration twice.
        await run.admission.fetch(admissionRequest('mark', { jobId: 'job-001', generation: 1, state: 'ONCHAIN_PUBLISHED' }));
        expect(run.admissionRecord()!.stream.verifiedStorageSeconds).toBe(180);
        await run.admission.fetch(admissionRequest('mark', { jobId: 'studio-job', generation: 1, state: 'PROVIDER_FAILED' }));

        const admitted = await run.admission.fetch(admissionRequest('reserve', candidate('job-002', 'other.testnet', { reservedSeconds: 7200 })));
        expect(admitted.status).toBe(200);
    });

    it('answers reservation_budget on the public preflight of a Stream-only Market V2', async () => {
        const run = await wired({ env: { LIVEPEER_BRIDGE_ENABLED: 'true' } });
        await seedReservation(run);
        const response = await handler.fetch(new Request('https://bridge.youtick.net/v1/upload-preflight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'https://app.youtick.net' },
            body: JSON.stringify({ creator_id: 'other.testnet', job_id: 'job-002', generation: 1, expected_source_bytes: V.LENGTH }),
        }), run.env);
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'admission_denied', reason: 'reservation_budget' });
    });

    it.each(['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED'])('releases the reservation at %s', async (state) => {
        const run = await wired();
        await seedReservation(run);
        await run.admission.fetch(admissionRequest('mark', { jobId: 'job-001', generation: 1, state }));
        expect(run.admissionRecord()!.stream.openReservedSeconds).toBe(0);
    });

    it('drops a reservation Stream can no longer hold (24 h) and keeps the field through an admission reopen', async () => {
        const run = await wired();
        await seedReservation(run);
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
        const status = await run.admission.fetch(new Request('https://object/internal/admission/stream-status'));
        expect(await status.json()).toMatchObject({ openReservedSeconds: 0, reservationBudgetSeconds: 7200, storageMinutesCapacity: 1000 });
    });

    it('auto-closes admission when verified Stream storage exceeds the capacity', async () => {
        const run = await wired({ env: { STREAM_STORAGE_MINUTES_CAPACITY: '2' } });
        await seedReservation(run);
        await run.admission.fetch(admissionRequest('mark', { jobId: 'job-001', generation: 1, state: 'READY_VERIFIED', durationSeconds: 121 }));
        expect(run.admissionRecord()).toMatchObject({
            status: 'AUTO_CLOSED', closure: { code: 'provider_budget_or_inventory' },
            stream: { verifiedStorageSeconds: 121 },
        });
        const next = await run.admission.fetch(admissionRequest('reserve', candidate('job-002', 'other.testnet', { reservedSeconds: 60 })));
        expect(next.status).toBe(503);
    });

    it('refuses a Stream intent with provider_admission_closed when storage headroom is below the cap', async () => {
        const run = await wired({ backend: { storageMinutes: 881 } });
        const response = await run.control.fetch(await streamIntentRequest(keys));
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'provider_admission_closed' });
        expect(run.job()).toMatchObject({ state: 'AUTHORIZED', provider: 'stream' });
        expect(run.calls((call) => call.method === 'POST' && call.url.endsWith('?direct_user=true'))).toHaveLength(0);
        expect(run.admissionRecord()).toBeUndefined();
    });

    it('admits a Stream intent with headroom, books the cap and records the observed usage', async () => {
        const run = await wired({ backend: { storageMinutes: 880 } });
        const response = await run.control.fetch(await streamIntentRequest(keys));
        expect(response.status).toBe(201);
        expect(run.admissionRecord()!.stream).toMatchObject({ openReservedSeconds: 7200, storageMinutesUsed: 880 });
        expect(run.jobState.alarms.length).toBeGreaterThan(0);
    });
});

describe('Stream lifecycle: bounded poll and deletion', () => {
    it('finalizes through the poll when the ready webhook is lost', async () => {
        const run = await wired({ job: { state: 'UPLOADING' } });
        await seedReservation(run);
        await run.control.alarm();
        expect(run.job().state).toBe('ONCHAIN_PUBLISHED');
        expect(run.admissionRecord()!.stream).toMatchObject({ openReservedSeconds: 0, verifiedStorageSeconds: 180 });
        expect(run.operatorCalls.filter((request) => new URL(request.url).pathname === '/internal/finalize')).toHaveLength(1);
    });

    it('moves an uploading job to PROCESSING and polls again in a minute', async () => {
        const run = await wired({ job: { state: 'UPLOADING' }, backend: { video: await streamVideo('video-inprogress.json') } });
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        await run.control.alarm();
        expect(run.job().state).toBe('PROCESSING');
        expect(run.jobState.alarms.at(-1)).toBe(now + 60_000);
    });

    it('fails a job stuck inprogress at 0% beyond STREAM_STUCK_TIMEOUT_MS and deletes it once', async () => {
        const run = await wired({
            env: { STREAM_STUCK_TIMEOUT_MS: '900000' },
            job: { state: 'PROCESSING', stateChangedAtMs: Date.now() - 900_001 },
            backend: { video: await streamVideo('video-inprogress-lagging.json') },
        });
        await seedReservation(run);
        await run.control.alarm();
        expect(run.job()).toMatchObject({ state: 'PROVIDER_FAILED', providerDelete: { outcome: 'DELETED' } });
        expect(run.calls(isDelete)).toHaveLength(1);
        expect(run.admissionRecord()!.stream).toMatchObject({ openReservedSeconds: 0, stuckProcessingJobs: 1 });
        await run.control.alarm();
        expect(run.calls(isDelete)).toHaveLength(1);
    });

    it('keeps polling a slow job that is making progress', async () => {
        const run = await wired({
            env: { STREAM_STUCK_TIMEOUT_MS: '900000' },
            job: { state: 'PROCESSING', stateChangedAtMs: Date.now() - 3_600_000 },
            backend: { video: await streamVideo('video-inprogress.json') },
        });
        await run.control.alarm();
        expect(run.job().state).toBe('PROCESSING');
    });

    it('fails a job the poll finds in error and deletes the UID', async () => {
        const run = await wired({ job: { state: 'PROCESSING' }, backend: { video: await streamVideo('webhook-error-duration.json') } });
        await seedReservation(run);
        await run.control.alarm();
        expect(run.job().state).toBe('PROVIDER_FAILED');
        expect(run.calls(isDelete)).toHaveLength(1);
    });

    it('expires an abandoned upload whose lease lapsed and releases its reservation', async () => {
        const run = await wired({
            job: { state: 'UPLOAD_READY', leaseExpiresAtMs: Date.now() - 1 },
            backend: { video: await streamVideo('video-pendingupload.json') },
        });
        await seedReservation(run);
        await run.control.alarm();
        expect(run.job()).toMatchObject({ state: 'UPLOAD_EXPIRED', providerDelete: { outcome: 'DELETED' } });
        expect(run.admissionRecord()!.stream.openReservedSeconds).toBe(0);
    });

    it('keeps an upload with a live lease', async () => {
        const run = await wired({ job: { state: 'UPLOAD_READY' }, backend: { video: await streamVideo('video-pendingupload.json') } });
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        await run.control.alarm();
        expect(run.job().state).toBe('UPLOAD_READY');
        expect(run.jobState.alarms.at(-1)).toBe(now + 5 * 60_000);
    });

    it('expires any pre-ready job past the 24 h URL life without a provider read', async () => {
        const created = Date.now() - 24 * 60 * 60 * 1000;
        const run = await wired({
            job: { state: 'PROCESSING', providerCreate: { attempts: 1, lastAttemptAtMs: created, retryPolicy: 'RECONCILE_ONLY', completedAtMs: created } },
        });
        await seedReservation(run);
        await run.control.alarm();
        expect(run.job().state).toBe('UPLOAD_EXPIRED');
        expect(run.calls(isVideoGet)).toHaveLength(0);
        expect(run.calls(isDelete)).toHaveLength(1);
    });

    it('records a missing UID on delete as MISSING, not an error', async () => {
        const run = await wired({ job: { state: 'PROCESSING' }, backend: { deleteStatus: 404 } });
        await seedReservation(run);
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-error-nonvideo.json')));
        expect(run.job()).toMatchObject({ state: 'PROVIDER_FAILED', providerDelete: { outcome: 'MISSING' } });
    });

    it('closes admission after an ambiguous delete', async () => {
        const run = await wired({ job: { state: 'PROCESSING' }, backend: { deleteStatus: 500 } });
        await seedReservation(run);
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-error-nonvideo.json')));
        expect(run.job()).toMatchObject({ providerDelete: { outcome: 'AMBIGUOUS' } });
        expect(run.admissionRecord()).toMatchObject({ status: 'AUTO_CLOSED' });
    });

    it('fails a job whose UID vanished before readiness', async () => {
        const run = await wired({ job: { state: 'PROCESSING' }, backend: { video: null, deleteStatus: 404 } });
        await seedReservation(run);
        await run.control.alarm();
        expect(run.job().state).toBe('PROVIDER_FAILED');
    });

    it('keeps the job object far below the record ceiling through a full Stream lifecycle', async () => {
        const run = await wired({ job: { state: 'UPLOADING' } });
        await seedReservation(run);
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-inprogress.json')));
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(run.job().state).toBe('ONCHAIN_PUBLISHED');
        expect(run.jobState.values.size).toBeLessThanOrEqual(4);
        expect(JSON.stringify(run.job()).length).toBeLessThan(4096);
    });

    it('keeps the admission record bounded across many Stream cycles', async () => {
        const run = await wired({ env: { LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '100000000000' } });
        let size = 0;
        for (let index = 0; index < 20; index += 1) {
            const jobId = `job-${index}`;
            const creator = index % 2 === 0 ? CREATOR : 'other.testnet';
            vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 1 + index));
            expect((await run.admission.fetch(admissionRequest('reserve', candidate(jobId, creator, { reservedSeconds: 7200 })))).status).toBe(200);
            await run.admission.fetch(admissionRequest('mark', { jobId, generation: 1, state: 'READY_VERIFIED', durationSeconds: 10 }));
            await run.admission.fetch(admissionRequest('mark', { jobId, generation: 1, state: 'ONCHAIN_PUBLISHED' }));
            const current = JSON.stringify(run.admissionRecord()).length;
            if (index === 1) size = current;
            if (index > 1) expect(current).toBeLessThanOrEqual(size + 64);
        }
        expect(run.admissionRecord()!.stream).toMatchObject({ openReservedSeconds: 0, verifiedStorageSeconds: 200, reservations: {} });
    });

    it('refuses the Stream signal record when the admission object is at its record ceiling', async () => {
        const run = await wired();
        for (let index = 0; index < 256; index += 1) run.admissionState.values.set(`filler:${index}`, index);
        const response = await run.admission.fetch(admissionRequest('stream-signal', { lastWebhookAtMs: Date.now() }));
        expect(await response.json()).toEqual({ error: 'durable_object_record_limit' });
    });
});

describe('Stream cron', () => {
    it('logs stream_storage_headroom every run and refreshes the health block', async () => {
        const run = await wired({ backend: { storageMinutes: 42 } });
        const logs: string[] = [];
        vi.spyOn(console, 'info').mockImplementation((line: string) => { logs.push(String(line)); });
        const pending: Promise<unknown>[] = [];
        await handler.scheduled({} as ScheduledController, run.env, { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext);
        await Promise.all(pending);
        const headroom = logs.map((line) => JSON.parse(line)).find((line) => line.event === 'stream_storage_headroom');
        expect(headroom.details).toEqual({ totalStorageMinutes: 42, capacityMinutes: 1000, headroomMinutes: 958, uploadsThatFit: 7 });
        const status = await run.admission.fetch(new Request('https://object/internal/admission/stream-status'));
        expect(await status.json()).toMatchObject({ storageMinutesUsed: 42 });
    });

    it('does not read Stream when the flag is off', async () => {
        const run = await wired({ env: { MEDIA_PROVIDER_STREAM_ENABLED: 'false' } });
        const pending: Promise<unknown>[] = [];
        await handler.scheduled({} as ScheduledController, run.env, { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext);
        await Promise.all(pending);
        expect(run.calls((call) => call.url.startsWith(API))).toHaveLength(0);
    });
});
