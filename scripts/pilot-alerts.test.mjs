import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SIGNALS, PILOT_TARGET, WINDOW_MS, evaluatePilotAlerts, runPilotAlerts } from './pilot-alerts.mjs';
import { marketReadModelWorker } from '../read-model/worker.mjs';

const now = Date.parse('2026-09-29T12:00:00Z');
const token = 't'.repeat(40);
const accountId = 'a'.repeat(32);
const queueId = 'b'.repeat(32);
const webhook = 'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k&token=t';

function cloudflare({ counts = {}, depth = null, heartbeat = 5, shape = 'ok', chat = [] } = {}) {
    return async (url, init = {}) => {
        const href = String(url);
        if (href.startsWith('https://chat.googleapis.com/')) {
            chat.push({ url: href, body: JSON.parse(init.body) });
            return Response.json({});
        }
        assert.equal(init.headers.Authorization, `Bearer ${token}`);
        if (href.includes('/workers/observability/telemetry/query')) {
            const body = JSON.parse(init.body);
            assert.equal(init.method, 'POST');
            assert.deepEqual(body.timeframe, { from: now - WINDOW_MS, to: now });
            const [service, message] = body.parameters.filters;
            const key = `${service.value}|${message.value}`;
            const value = message.value === '"schema":"youtick.read-model-ingestion.v1"' ? heartbeat : counts[key] ?? 0;
            if (shape === 'unknown') return Response.json({ success: true, result: { rows: [] } });
            return Response.json({ success: true, result: { calculations: [{ aggregates: value ? [{ value }] : [] }] } });
        }
        if (href.endsWith(`/queues?name=${PILOT_TARGET.dlqName}`)) {
            assert.equal(init.method, undefined);
            return Response.json({ success: true, result: [{ queue_name: PILOT_TARGET.dlqName, queue_id: queueId }] });
        }
        if (href.endsWith('/graphql')) {
            const body = JSON.parse(init.body);
            assert.doesNotMatch(body.query, /mutation/);
            assert.equal(body.variables.queueId, queueId);
            return Response.json({ data: { viewer: { accounts: [{ queueBacklogAdaptiveGroups: depth === null ? [] : [{ avg: { messages: depth } }] }] } } });
        }
        throw new Error(`unexpected ${href}`);
    };
}
const key = (service, needle) => `${PILOT_TARGET[service]}|${needle}`;

test('quiet pilot raises nothing and posts nothing', async () => {
    const chat = [];
    assert.deepEqual(await runPilotAlerts({ CLOUDFLARE_MONITOR_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId,
        OPS_ALERT_CHAT_WEBHOOK_URL: webhook }, cloudflare({ chat }), now), []);
    assert.equal(chat.length, 0);
});

test('each critical signal breaches at its threshold and posts one threaded envelope', async () => {
    const counts = {
        [key('readModelWorker', '"warning_code":"catalog_capacity_warning"')]: 1,
        [key('readModelWorker', '"route":"current_catalog","http_code":503')]: 2,
        [key('readModelWorker', '"schema":"youtick.read-model-ingestion.v1","status":"failed"')]: 5,
        [key('webWorker', '"outcome":"network_error"')]: 6,
        [key('webWorker', '"outcome":"transient"')]: 4,
    };
    const chat = [];
    const alerts = await runPilotAlerts({ CLOUDFLARE_MONITOR_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId,
        OPS_ALERT_CHAT_WEBHOOK_URL: webhook }, cloudflare({ counts, depth: 2.2, chat }), now);
    assert.deepEqual(alerts.map(({ alert_id: id, observed_value: value }) => [id, value]), [
        ['current_catalog_capacity', 1], ['current_catalog_unavailable', 2], ['read_model_ingestion_stalled', 5],
        ['near_rpc_errors', 10], ['livepeer_events_dlq_depth', 3],
    ]);
    assert.equal(chat.length, 5);
    for (const [index, message] of chat.entries()) {
        assert.ok(message.url.endsWith('&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD'));
        assert.equal(message.body.thread.threadKey, `${alerts[index].alert_id}-2026-09-29`);
        assert.ok(message.body.text.includes(JSON.stringify(alerts[index])));
        assert.equal(alerts[index].schema, 'youtick.pilot-alert.v1');
        assert.equal(alerts[index].channel, 'pilot_primary');
    }
    // Below-threshold noise stays quiet.
    const quiet = await evaluatePilotAlerts({ fetchImpl: cloudflare({ counts: {
        [key('readModelWorker', '"schema":"youtick.read-model-ingestion.v1","status":"failed"')]: 4,
        [key('webWorker', '"outcome":"transient"')]: 9 } }), token, accountId, now });
    assert.deepEqual(quiet, []);
});

test('missing telemetry, unknown response shapes and query failures fail closed as alerts', async () => {
    const env = { CLOUDFLARE_MONITOR_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId, OPS_ALERT_CHAT_WEBHOOK_URL: webhook };
    assert.deepEqual((await runPilotAlerts(env, cloudflare({ heartbeat: 0 }), now)).map(({ alert_id: id }) => id),
        ['read_model_telemetry_missing']);
    assert.deepEqual((await runPilotAlerts(env, cloudflare({ shape: 'unknown' }), now)).map(({ alert_id: id }) => id),
        ['pilot_alerts_query_invalid']);
    const failing = cloudflare();
    const broken = async (url, init) => (String(url).startsWith('https://chat.') ? failing(url, init) : new Response('no', { status: 403 }));
    assert.deepEqual((await runPilotAlerts(env, broken, now)).map(({ alert_id: id }) => id), ['pilot_alerts_query_failed']);
    assert.deepEqual((await runPilotAlerts({ ...env, CLOUDFLARE_MONITOR_TOKEN: '' }, cloudflare(), now))
        .map(({ alert_id: id }) => id), ['pilot_alerts_not_configured']);
    await assert.rejects(runPilotAlerts({ ...env, CLOUDFLARE_MONITOR_TOKEN: '', OPS_ALERT_CHAT_WEBHOOK_URL: 'https://evil.example/hook' },
        cloudflare(), now), /pilot_alerts_channel_not_configured/);
});

test('every needle is a substring of a log line the source actually emits', async () => {
    const lines = [];
    const logger = { log: value => lines.push(String(value)), error: value => lines.push(String(value)) };
    const env = { READ_MODEL_ENABLED: 'true', READ_MODEL_CURRENT_CATALOG_ENABLED: 'true', VIDEO_ENVIRONMENT: 'public-testnet',
        READ_MODEL_NETWORK: 'testnet', READ_MODEL_CONTRACT_ID: 'market.testnet', MARKET_CONTRACT_ID: 'market.testnet',
        MARKET_READ_MODEL: {}, READ_MODEL_NEAR_RPC_URL: 'https://rpc.invalid', READ_MODEL_START_BLOCK_HEIGHT: '100',
        READ_MODEL_MAX_BLOCKS_PER_RUN: '180' };
    // Scheduled failure line (ingestion schema) through the real worker handler.
    const waits = [];
    marketReadModelWorker.scheduled({ cron: '*/1 * * * *' }, { ...env, READ_MODEL_CURRENT_CATALOG_ENABLED: 'false',
        READ_MODEL_INGESTION_ENABLED: 'true' }, { waitUntil: promise => waits.push(promise.catch(() => undefined)) },
    { logger, fetchFinalHeight: async () => { throw new Error('read_model_final_rpc_unavailable'); } });
    await Promise.all(waits);
    // Refresh lines: worker.mjs logs { schema, ...result } and { schema, status, error_code }.
    lines.push(JSON.stringify({ schema: 'youtick.current-catalog-refresh.v1', status: 'updated', warning_code: 'catalog_capacity_warning' }), JSON.stringify({ schema: 'youtick.current-catalog-refresh.v1', status: 'failed',
        error_code: 'catalog_capacity_exceeded' }));
    const sources = {
        api: await readFile(new URL('../read-model/api.mjs', import.meta.url), 'utf8'),
        catalog: await readFile(new URL('../read-model/current-catalog.mjs', import.meta.url), 'utf8'),
        worker: await readFile(new URL('../read-model/worker.mjs', import.meta.url), 'utf8'),
        proxy: await readFile(new URL('../apps/web/app/api/near-rpc/proxy.ts', import.meta.url), 'utf8'),
    };
    // Log key order in the source decides the JSON substring.
    assert.match(sources.api, /route: readModelRoute\([^)]*\)[^,]*,\s*http_code: response\.status/);
    assert.match(sources.catalog, /warning_code: 'catalog_capacity_warning'/);
    assert.match(sources.worker, /'catalog_capacity_exceeded'/);
    assert.match(sources.proxy, /event: 'near_rpc_upstream_completed'[\s\S]*outcome,\n/);
    lines.push(JSON.stringify({ schema: 'youtick.market-read-api.v1', event: 'read_model_request_completed',
        route: 'current_catalog', http_code: 503, latency_ms: 1 }));
    for (const outcome of ['network_error', 'transient']) {
        lines.push(JSON.stringify({ event: 'near_rpc_upstream_completed', upstream: 'public-1', mode: 'read', method: 'query',
            status: 0, latency_ms: 1, outcome }));
    }
    for (const needle of SIGNALS.flatMap(({ needles }) => needles).concat('"schema":"youtick.read-model-ingestion.v1"')) {
        assert.ok(lines.some(line => line.includes(needle)), needle);
    }
    assert.ok(lines.some(line => line.includes('"error_code":"read_model_final_rpc_unavailable"')));
});
