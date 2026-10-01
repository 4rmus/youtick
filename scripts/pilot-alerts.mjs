#!/usr/bin/env node
// Read-only pilot alert evaluator: counts critical signals in Cloudflare telemetry and the Livepeer events DLQ,
// then posts one youtick.pilot-alert.v1 envelope per breached signal to the single Google Chat channel.
// It never mutates Cloudflare state; the only write is the Chat message.

import { pathToFileURL } from 'node:url';

export const PILOT_TARGET = Object.freeze({
    readModelWorker: 'youtick-market-read-model-public-testnet',
    webWorker: 'youtick-web-public-testnet',
    dlqName: 'youtick-livepeer-events-dlq-public-testnet',
});
export const WINDOW_MS = 10 * 60_000;
const API = 'https://api.cloudflare.com/client/v4';
const RUNBOOK = 'docs/testnet-pilot-runbook.md#incident-ilk-mudahale';
const CHAT_WEBHOOK_PATTERN = /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9_-]+\/messages\?[^\s#]+$/;

// Each signal is a substring of an exact JSON log line emitted by the source (key order is fixed there).
export const SIGNALS = Object.freeze([
    { alert_id: 'current_catalog_capacity', service: 'readModelWorker', threshold: 1,
        needles: ['"warning_code":"catalog_capacity_warning"', '"error_code":"catalog_capacity_exceeded"'],
        first_action: 'plan_catalog_capacity_before_ceiling' },
    { alert_id: 'current_catalog_unavailable', service: 'readModelWorker', threshold: 1,
        needles: ['"route":"current_catalog","http_code":503'],
        first_action: 'verify_catalog_refresh_and_last_verified_block' },
    { alert_id: 'read_model_ingestion_stalled', service: 'readModelWorker', threshold: 5,
        needles: ['"schema":"youtick.read-model-ingestion.v1","status":"failed"'],
        first_action: 'hold_ingestion_and_inspect_stalled_block' },
    { alert_id: 'near_rpc_errors', service: 'webWorker', threshold: 10,
        needles: ['"outcome":"network_error"', '"outcome":"transient"'],
        first_action: 'hold_chain_mutations_and_verify_finality' },
    { alert_id: 'near_rpc_errors', service: 'readModelWorker', threshold: 10,
        needles: ['"error_code":"read_model_final_rpc_unavailable"'],
        first_action: 'hold_chain_mutations_and_verify_finality' },
]);
// The read model runs every minute; silence means missing telemetry, not health.
const HEARTBEAT = { service: 'readModelWorker', needles: ['"schema":"youtick.read-model-ingestion.v1"'] };

export function envelope(alertId, observedValue, threshold, firstAction, observedAt, source) {
    return {
        schema: 'youtick.pilot-alert.v1',
        alert_id: alertId,
        severity: 'critical',
        channel: 'pilot_primary',
        source,
        observed_value: observedValue,
        threshold,
        first_action: firstAction,
        runbook: RUNBOOK,
        observed_at: new Date(observedAt).toISOString(),
    };
}

async function cloudflare(fetchImpl, token, path, init = {}) {
    let response;
    let payload;
    try {
        response = await fetchImpl(`${API}${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(15_000),
        });
        payload = await response.json();
    } catch {
        throw new Error('pilot_alerts_query_failed');
    }
    if (!response.ok || payload?.success === false || payload?.errors?.length) throw new Error('pilot_alerts_query_failed');
    return payload;
}

async function countEvents(context, service, needles) {
    let total = 0;
    for (const needle of needles) {
        const payload = await cloudflare(context.fetchImpl, context.token,
            `/accounts/${context.accountId}/workers/observability/telemetry/query`, {
                method: 'POST',
                body: JSON.stringify({
                    queryId: 'youtick-pilot-alerts',
                    timeframe: { from: context.now - WINDOW_MS, to: context.now },
                    view: 'calculations',
                    parameters: {
                        calculations: [{ operator: 'count' }],
                        filters: [
                            { key: '$metadata.service', operation: 'eq', type: 'string', value: PILOT_TARGET[service] },
                            { key: '$metadata.message', operation: 'includes', type: 'string', value: needle },
                        ],
                        filterCombination: 'and',
                    },
                }),
            });
        const calculations = payload?.result?.calculations;
        const aggregates = Array.isArray(calculations) ? calculations[0]?.aggregates ?? [] : null;
        // An unrecognised response shape fails closed instead of reading as zero.
        if (!Array.isArray(aggregates) || aggregates.some(({ value } = {}) => !Number.isFinite(value) || value < 0)) {
            throw new Error('pilot_alerts_query_invalid');
        }
        total += aggregates.reduce((sum, { value }) => sum + value, 0);
    }
    return total;
}

async function dlqDepth(context) {
    const listing = await cloudflare(context.fetchImpl, context.token,
        `/accounts/${context.accountId}/queues?name=${encodeURIComponent(PILOT_TARGET.dlqName)}`);
    const matches = (Array.isArray(listing?.result) ? listing.result : []).filter(({ queue_name: name }) => name === PILOT_TARGET.dlqName);
    if (matches.length !== 1 || !/^[a-f0-9]{32}$/.test(matches[0].queue_id)) throw new Error('pilot_alerts_query_invalid');
    const payload = await cloudflare(context.fetchImpl, context.token, '/graphql', {
        method: 'POST',
        body: JSON.stringify({
            query: 'query DlqBacklog($accountTag: string!, $queueId: string!, $start: Time!, $end: Time!) { viewer { accounts(filter: { accountTag: $accountTag }) { queueBacklogAdaptiveGroups(limit: 1, filter: { queueId: $queueId, datetime_geq: $start, datetime_leq: $end }) { avg { messages } } } } }',
            variables: { accountTag: context.accountId, queueId: matches[0].queue_id,
                start: new Date(context.now - WINDOW_MS).toISOString(), end: new Date(context.now).toISOString() },
        }),
    });
    const accounts = payload?.data?.viewer?.accounts;
    if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error('pilot_alerts_query_invalid');
    // No backlog sample in the window means an empty DLQ.
    const depth = accounts[0].queueBacklogAdaptiveGroups?.[0]?.avg?.messages ?? 0;
    if (!Number.isFinite(depth) || depth < 0) throw new Error('pilot_alerts_query_invalid');
    return Math.ceil(depth);
}

export async function evaluatePilotAlerts({ fetchImpl = fetch, token, accountId, now = Date.now() }) {
    if (typeof token !== 'string' || token.length < 32 || /\s/.test(token) || !/^[a-f0-9]{32}$/.test(accountId || '')) {
        throw new Error('pilot_alerts_not_configured');
    }
    const context = { fetchImpl, token, accountId, now };
    const alerts = [];
    const breached = new Map();
    for (const signal of SIGNALS) {
        const count = await countEvents(context, signal.service, signal.needles);
        if (count >= signal.threshold) {
            const previous = breached.get(signal.alert_id);
            breached.set(signal.alert_id, envelope(signal.alert_id, Math.max(count, previous?.observed_value ?? 0),
                signal.threshold, signal.first_action, now, PILOT_TARGET[signal.service]));
        }
    }
    alerts.push(...breached.values());
    if (await countEvents(context, HEARTBEAT.service, HEARTBEAT.needles) === 0) {
        alerts.push(envelope('read_model_telemetry_missing', 0, 1, 'hold_ingestion_and_inspect_stalled_block', now,
            PILOT_TARGET.readModelWorker));
    }
    const depth = await dlqDepth(context);
    if (depth > 0) {
        alerts.push(envelope('livepeer_events_dlq_depth', depth, 0, 'close_new_uploads_and_inspect_dlq', now, PILOT_TARGET.dlqName));
    }
    return alerts;
}

export async function deliverPilotAlerts(alerts, webhookUrl, fetchImpl = fetch) {
    if (!CHAT_WEBHOOK_PATTERN.test(webhookUrl || '')) throw new Error('pilot_alerts_channel_not_configured');
    for (const alert of alerts) {
        // One thread per alert and UTC day keeps a persisting breach from flooding the space.
        const url = `${webhookUrl}&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;
        let response;
        try {
            response = await fetchImpl(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({
                    text: `[${alert.severity}] ${alert.alert_id}: ${alert.observed_value} (threshold ${alert.threshold})\n`
                        + `first action: ${alert.first_action} (${alert.runbook})\n${JSON.stringify(alert)}`,
                    thread: { threadKey: `${alert.alert_id}-${alert.observed_at.slice(0, 10)}` },
                }),
                signal: AbortSignal.timeout(15_000),
            });
        } catch {
            throw new Error('pilot_alerts_delivery_failed');
        }
        if (!response.ok) throw new Error('pilot_alerts_delivery_failed');
    }
}

export async function runPilotAlerts(env, fetchImpl = fetch, now = Date.now()) {
    let alerts;
    try {
        alerts = await evaluatePilotAlerts({ fetchImpl, token: env.CLOUDFLARE_MONITOR_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID, now });
    } catch (error) {
        // A monitor that cannot see is itself an incident.
        const code = error instanceof Error ? error.message : 'pilot_alerts_query_failed';
        alerts = [envelope(code, 1, 0, 'hold_activation_and_compare_exact_sha', now, 'pilot-alerts')];
    }
    if (alerts.length) await deliverPilotAlerts(alerts, env.OPS_ALERT_CHAT_WEBHOOK_URL, fetchImpl);
    return alerts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runPilotAlerts(process.env).then((alerts) => {
        for (const alert of alerts) process.stdout.write(`${JSON.stringify(alert)}\n`);
        process.exitCode = alerts.length ? 1 : 0;
    }, (error) => {
        process.stderr.write(`${error instanceof Error ? error.message : 'pilot_alerts_failed'}\n`);
        process.exitCode = 1;
    });
}
