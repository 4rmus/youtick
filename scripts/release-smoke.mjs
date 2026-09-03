import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const REQUEST_TIMEOUT_MS = 30_000;
const VERSION_RE = /^[A-Za-z0-9-]+$/;
const VERSION_IDENTITY_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000];
const BOOTSTRAP_HEALTH_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
const BOOTSTRAP_PROPAGATION_STATUSES = new Set([404, 523]);
const STABLE_HEADERS = [
    'cache-control',
    'content-security-policy',
    'content-type',
    'location',
    'server',
    'x-proxy',
    'x-web4-origin',
];
const DISABLED_BRIDGE_MUTATIONS = [
    { path: '/v1/livepeer-webhooks', cors: false },
    { path: '/v1/operations/admission-reopen', cors: false },
    { path: '/v1/operations/provider-assets/delete', cors: false },
    { path: '/v1/upload-intents', cors: true },
    { path: '/v1/playback-tokens', cors: true },
    { path: '/v2/playback-tokens', cors: true },
    { path: '/v1/creator-fee-quotes/near', cors: true },
    { path: '/v1/sponsored-upload-quotes', cors: true },
    { path: '/v1/sponsored-upload-relays', cors: true },
];

export function canonicalJson(value) {
    const sort = (entry) => {
        if (Array.isArray(entry)) return entry.map(sort);
        if (!entry || typeof entry !== 'object') return entry;
        return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, sort(entry[key])]));
    };
    return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function httpUrl(value, label, originOnly = false) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`release_smoke_${label}_invalid`);
    }
    if (!['http:', 'https:'].includes(url.protocol)
        || url.username
        || url.password
        || (originOnly && (url.pathname !== '/' || url.search || url.hash))) {
        throw new Error(`release_smoke_${label}_invalid`);
    }
    return originOnly ? url.origin : url.toString();
}

function overrideHeaders(worker, version) {
    if (!worker && !version) return {};
    if (!/^[A-Za-z0-9_-]+$/.test(worker || '') || !VERSION_RE.test(version || '')) {
        throw new Error('release_smoke_version_override_invalid');
    }
    return { 'Cloudflare-Workers-Version-Overrides': `${worker}="${version}"` };
}

export function browserOverrideHeaders(requestUrl, webUrl, headers) {
    try {
        return new URL(requestUrl).origin === webUrl ? headers : {};
    } catch {
        return {};
    }
}

async function fetchBody(url, init, fetchImpl) {
    const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...init,
    });
    return { response, body: new Uint8Array(await response.arrayBuffer()) };
}

export async function fingerprintUrl(value, { fetchImpl = fetch } = {}) {
    const url = httpUrl(value, 'fingerprint_url');
    const { response, body } = await fetchBody(url, {}, fetchImpl);
    return {
        status: response.status,
        final_url: response.url || url,
        body_sha256: createHash('sha256').update(body).digest('hex'),
        headers: Object.fromEntries(STABLE_HEADERS.map((name) => [name, response.headers.get(name)])),
    };
}

function validFingerprint(value) {
    return value
        && typeof value === 'object'
        && Number.isInteger(value.status)
        && typeof value.final_url === 'string'
        && /^[0-9a-f]{64}$/.test(value.body_sha256 || '')
        && value.headers
        && STABLE_HEADERS.every((name) => value.headers[name] === null
            || typeof value.headers[name] === 'string');
}

export function compareFingerprints(before, after) {
    if (!validFingerprint(before) || !validFingerprint(after)) {
        throw new Error('release_smoke_fingerprint_invalid');
    }
    if (canonicalJson(before) !== canonicalJson(after)) {
        throw new Error(`release_smoke_fingerprints_differ\n${canonicalJson({ before, after })}`);
    }
    return { equal: true };
}

function text(body) {
    return new TextDecoder().decode(body);
}

function parseJson(body, label) {
    try {
        const value = JSON.parse(text(body));
        if (!value || typeof value !== 'object') throw new Error();
        return value;
    } catch {
        throw new Error(`release_smoke_${label}_json_invalid`);
    }
}

function expectStatus(response, expected, label) {
    if (response.status !== expected) {
        throw new Error(`release_smoke_${label}_status_${response.status}`);
    }
}

function expectJson(response, body, label) {
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
        throw new Error(`release_smoke_${label}_content_type_invalid`);
    }
    return parseJson(body, label);
}

async function request(baseUrl, path, init, headers, fetchImpl) {
    const merged = new Headers(init.headers);
    for (const [name, value] of Object.entries(headers)) merged.set(name, value);
    return fetchBody(new URL(path, `${baseUrl}/`), { ...init, headers: merged }, fetchImpl);
}

async function bridgeHealth(
    bridgeUrl, headers, expectedVersion, expectedBridgeEnabled, expectedUploadReady,
    expectedPlaybackReady, expectedSponsoredUploadReady, expectedPublicBetaRateLimitReady,
    bridgeBootstrap, fetchImpl, sleepFn,
) {
    const delays = bridgeBootstrap
        ? BOOTSTRAP_HEALTH_RETRY_DELAYS_MS
        : expectedVersion ? VERSION_IDENTITY_RETRY_DELAYS_MS : [0];
    let observedVersion;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
        const delay = delays[attempt];
        if (delay) await sleepFn(delay);
        const health = await request(bridgeUrl, '/__health', {}, headers, fetchImpl);
        if (health.response.status !== 200) {
            if (bridgeBootstrap
                && BOOTSTRAP_PROPAGATION_STATUSES.has(health.response.status)
                && attempt < delays.length - 1) {
                continue;
            }
            expectStatus(health.response, 200, 'bridge_health');
        }
        const healthJson = expectJson(health.response, health.body, 'bridge_health');
        const sponsoredUploadsReady = healthJson.sponsoredUploadQuoteReady === true
            && healthJson.sponsoredUploadRelayReady === true;
        const sponsoredUploadsClosed = healthJson.sponsoredUploadQuoteReady === false
            && healthJson.sponsoredUploadRelayReady === false;
        const sponsoredUploadsLegacyClosed = expectedSponsoredUploadReady === null
            && healthJson.sponsoredUploadQuoteReady === undefined
            && healthJson.sponsoredUploadRelayReady === undefined;
        const sponsoredUploadsMatch = expectedSponsoredUploadReady === true
            ? sponsoredUploadsReady
            : expectedSponsoredUploadReady === false
                ? sponsoredUploadsClosed
                : sponsoredUploadsReady || sponsoredUploadsClosed || sponsoredUploadsLegacyClosed;
        const operatorMutationMatch = expectedSponsoredUploadReady === true
            ? healthJson.operatorMutationEnabled === true
            : expectedSponsoredUploadReady === false
                ? healthJson.operatorMutationEnabled === false
                : healthJson.operatorMutationEnabled === undefined
                    || healthJson.operatorMutationEnabled === false
                    || (healthJson.operatorMutationEnabled === true && sponsoredUploadsReady);
        const publicBetaRateLimitMatch = expectedPublicBetaRateLimitReady === null
            || healthJson.publicBetaRateLimitReady === expectedPublicBetaRateLimitReady;
        const inferredUploadReady = healthJson.providerMutationEnabled === true
            && healthJson.newUploadReady === true;
        const inferredPlaybackReady = healthJson.providerMutationEnabled === false
            && healthJson.newUploadReady === false
            && healthJson.playbackReady === true
            && healthJson.playbackV2Ready === true
            && healthJson.playbackShadowV2Ready === false;
        const inferredEnabled = healthJson.stage === 'ENABLED'
            && (inferredUploadReady || inferredPlaybackReady)
            && sponsoredUploadsMatch
            && operatorMutationMatch
            && publicBetaRateLimitMatch;
        const inferredDisabled = healthJson.stage === 'DISABLED'
            && healthJson.providerMutationEnabled === false
            && healthJson.newUploadReady === false
            && !sponsoredUploadsReady
            && sponsoredUploadsMatch
            && operatorMutationMatch
            && publicBetaRateLimitMatch;
        const explicitPolicyMatch = healthJson.stage === (expectedBridgeEnabled ? 'ENABLED' : 'DISABLED')
            && healthJson.providerMutationEnabled === expectedUploadReady
            && healthJson.newUploadReady === expectedUploadReady
            && healthJson.playbackReady === expectedPlaybackReady
            && healthJson.playbackV2Ready === expectedPlaybackReady
            && healthJson.playbackShadowV2Ready === false
            && sponsoredUploadsMatch
            && operatorMutationMatch
            && publicBetaRateLimitMatch;
        if (expectedBridgeEnabled === null
            ? !inferredEnabled && !inferredDisabled
            : !explicitPolicyMatch) {
            throw new Error(expectedBridgeEnabled === null
                ? 'release_smoke_bridge_policy_invalid'
                : expectedBridgeEnabled
                    ? 'release_smoke_bridge_not_enabled'
                    : 'release_smoke_bridge_not_disabled');
        }
        if (!VERSION_RE.test(healthJson.versionId || '')) {
            throw new Error('release_smoke_bridge_version_invalid');
        }
        observedVersion = healthJson.versionId;
        if (!expectedVersion || healthJson.versionId === expectedVersion) return healthJson;
    }
    throw new Error(
        `release_smoke_bridge_version_mismatch expected=${expectedVersion} observed=${observedVersion}`,
    );
}

async function runChromeSmoke({ webUrl, headers }) {
    const { chromium } = await import(new URL(
        '../apps/web/node_modules/@playwright/test/index.mjs',
        import.meta.url,
    ));
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage();
        await page.route('**/*', async (route) => {
            const requestHeaders = route.request().headers();
            for (const [name, value] of Object.entries(
                browserOverrideHeaders(route.request().url(), webUrl, headers),
            )) requestHeaders[name.toLowerCase()] = value;
            await route.continue({ headers: requestHeaders });
        });
        let route = '/';
        const errors = [];
        page.on('console', (message) => {
            const value = message.text();
            if (message.type() === 'error'
                || /hydration (?:failed|error)|server rendered html.*(?:didn't|did not) match|text content does not match/i.test(value)) {
                errors.push(`${route}:console:${value.slice(0, 240)}`);
            }
        });
        page.on('pageerror', (error) => errors.push(`${route}:pageerror:${error.message.slice(0, 240)}`));
        for (route of ['/', '/tr']) {
            await page.goto(new URL(route, `${webUrl}/`).toString(), {
                waitUntil: 'networkidle',
                timeout: REQUEST_TIMEOUT_MS,
            });
        }
        if (errors.length) throw new Error(`release_smoke_browser_errors\n${errors.join('\n')}`);
        return { channel: 'chrome', routes: ['/', '/tr'] };
    } finally {
        await browser.close();
    }
}

export async function runReleaseSmoke({
    webUrl: webValue,
    bridgeUrl: bridgeValue,
    allowedOrigin: allowedValue,
    deniedOrigin: deniedValue,
    overrideWorker,
    overrideVersion,
    expectedBridgeVersion,
    expectedBridgeEnabled = false,
    expectedUploadReady = expectedBridgeEnabled === null ? null : expectedBridgeEnabled,
    expectedPlaybackReady = expectedBridgeEnabled === null ? null : false,
    expectedSponsoredUploadReady = expectedBridgeEnabled === null ? null : false,
    expectedPublicBetaRateLimitReady = null,
    bridgeBootstrap = false,
    includePlaybackV2 = true,
    includeProviderAssetDelete = true,
    fetchImpl = fetch,
    browserRunner = runChromeSmoke,
    sleepFn = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
    const webUrl = httpUrl(webValue, 'web_url', true);
    const bridgeUrl = httpUrl(bridgeValue, 'bridge_url', true);
    const allowedOrigin = httpUrl(allowedValue, 'allowed_origin', true);
    const deniedOrigin = httpUrl(deniedValue, 'denied_origin', true);
    if (allowedOrigin === deniedOrigin) throw new Error('release_smoke_origins_not_distinct');
    const headers = overrideHeaders(overrideWorker, overrideVersion);
    if (expectedBridgeVersion !== undefined && !VERSION_RE.test(expectedBridgeVersion)) {
        throw new Error('release_smoke_bridge_version_invalid');
    }
    if (overrideVersion && expectedBridgeVersion && overrideVersion !== expectedBridgeVersion) {
        throw new Error('release_smoke_bridge_version_expectation_conflict');
    }
    const expectedVersion = expectedBridgeVersion ?? overrideVersion;
    if (expectedBridgeEnabled !== null && typeof expectedBridgeEnabled !== 'boolean') {
        throw new Error('release_smoke_bridge_policy_invalid');
    }
    if ((expectedUploadReady !== null && typeof expectedUploadReady !== 'boolean')
        || (expectedPlaybackReady !== null && typeof expectedPlaybackReady !== 'boolean')
        || ((expectedUploadReady === null || expectedPlaybackReady === null)
            && expectedBridgeEnabled !== null)
        || (expectedUploadReady === true && expectedBridgeEnabled !== true)
        || (expectedPlaybackReady === true && expectedBridgeEnabled !== true)) {
        throw new Error('release_smoke_bridge_policy_invalid');
    }
    if ((expectedSponsoredUploadReady !== null
        && typeof expectedSponsoredUploadReady !== 'boolean')
        || (expectedSponsoredUploadReady === null && expectedBridgeEnabled !== null)
        || (expectedSponsoredUploadReady === true && expectedBridgeEnabled !== true)) {
        throw new Error('release_smoke_bridge_policy_invalid');
    }
    if (expectedPublicBetaRateLimitReady !== null
        && typeof expectedPublicBetaRateLimitReady !== 'boolean') {
        throw new Error('release_smoke_bridge_policy_invalid');
    }
    if (typeof bridgeBootstrap !== 'boolean' || (bridgeBootstrap && !expectedVersion)) {
        throw new Error('release_smoke_bridge_bootstrap_invalid');
    }

    const root = await request(webUrl, '/', {}, headers, fetchImpl);
    expectStatus(root.response, 200, 'web_root');
    const tr = await request(webUrl, '/tr', {}, headers, fetchImpl);
    expectStatus(tr.response, 200, 'web_tr');
    const rpc = await request(webUrl, '/api/near-rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'release-smoke', method: 'status', params: [] }),
    }, headers, fetchImpl);
    expectStatus(rpc.response, 200, 'near_rpc');
    expectJson(rpc.response, rpc.body, 'near_rpc');
    const browser = await browserRunner({ webUrl, headers });

    const healthJson = await bridgeHealth(
        bridgeUrl, headers, expectedVersion, expectedBridgeEnabled, expectedUploadReady,
        expectedPlaybackReady, expectedSponsoredUploadReady, expectedPublicBetaRateLimitReady,
        bridgeBootstrap, fetchImpl, sleepFn,
    );

    const mutationStatuses = {};
    const mutationRetryDelays = overrideVersion
        && expectedBridgeEnabled === false
        && healthJson.versionId === overrideVersion
        ? VERSION_IDENTITY_RETRY_DELAYS_MS.slice(1)
        : [];
    let mutationRetry = 0;
    for (const mutation of healthJson.stage === 'ENABLED' ? [] : DISABLED_BRIDGE_MUTATIONS) {
        if (!includePlaybackV2 && mutation.path === '/v2/playback-tokens') continue;
        if (!includeProviderAssetDelete
            && mutation.path === '/v1/operations/provider-assets/delete') continue;
        let result;
        while (true) {
            result = await request(bridgeUrl, mutation.path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
                body: '{}',
            }, headers, fetchImpl);
            if (result.response.status === 503) break;
            if (result.response.status !== 403 || mutationRetry >= mutationRetryDelays.length) {
                throw new Error(
                    `release_smoke_bridge_mutation_status_${result.response.status} path=${mutation.path}`,
                );
            }
            await sleepFn(mutationRetryDelays[mutationRetry]);
            mutationRetry += 1;
        }
        const resultJson = expectJson(result.response, result.body, 'bridge_mutation');
        const corsOrigin = result.response.headers.get('access-control-allow-origin');
        if (resultJson.error !== 'control_plane_disabled'
            || corsOrigin !== (mutation.cors ? allowedOrigin : null)) {
            throw new Error('release_smoke_bridge_mutation_contract_invalid');
        }
        mutationStatuses[mutation.path] = 503;
    }

    const preflightHeaders = {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Youtick-Signature',
    };
    const allowed = await request(bridgeUrl, '/v1/upload-intents', {
        method: 'OPTIONS', headers: preflightHeaders,
    }, headers, fetchImpl);
    expectStatus(allowed.response, 204, 'bridge_allowed_preflight');
    if (allowed.response.headers.get('access-control-allow-origin') !== allowedOrigin) {
        throw new Error('release_smoke_bridge_allowed_origin_invalid');
    }
    const denied = await request(bridgeUrl, '/v1/upload-intents', {
        method: 'OPTIONS', headers: { ...preflightHeaders, Origin: deniedOrigin },
    }, headers, fetchImpl);
    expectStatus(denied.response, 403, 'bridge_denied_preflight');
    if (denied.response.headers.has('access-control-allow-origin')) {
        throw new Error('release_smoke_bridge_denied_origin_reflected');
    }

    return {
        schema: 'youtick.release-smoke.v1',
        web: { root_status: 200, tr_status: 200, near_rpc_status: 200, browser },
        bridge: {
            health_status: 200,
            stage: healthJson.stage,
            version_id: healthJson.versionId,
            mutation_statuses: mutationStatuses,
            allowed_preflight_status: 204,
            denied_preflight_status: 403,
        },
    };
}

async function main(args = process.argv.slice(2)) {
    const [command, ...values] = args;
    if (command === 'fingerprint' && values.length === 1) {
        process.stdout.write(canonicalJson(await fingerprintUrl(values[0])));
        return;
    }
    if (command === 'compare' && values.length === 2) {
        const [before, after] = await Promise.all(values.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
        process.stdout.write(canonicalJson(compareFingerprints(before, after)));
        return;
    }
    if (command === 'run' && [4, 6].includes(values.length)) {
        const [webUrl, bridgeUrl, allowedOrigin, deniedOrigin, overrideWorker, overrideVersion] = values;
        process.stdout.write(canonicalJson(await runReleaseSmoke({
            webUrl,
            bridgeUrl,
            allowedOrigin,
            deniedOrigin,
            overrideWorker,
            overrideVersion,
        })));
        return;
    }
    throw new Error('usage: release-smoke.mjs fingerprint <url> | compare <before.json> <after.json> | run <web-url> <bridge-url> <allowed-origin> <denied-origin> [override-worker override-version]');
}

if (import.meta.main) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : 'release_smoke_failed'}\n`);
        process.exitCode = 1;
    });
}
