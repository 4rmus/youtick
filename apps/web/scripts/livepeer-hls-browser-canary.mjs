import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const DEFAULT_TIMEOUT_MS = 180_000;
const BROWSER_EXECUTABLES = {
    chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
};
const TERMINAL_BROWSER_STATES = ['pass', 'fail'];

const CLIENT_SOURCE = `import Hls from '/hls.mjs';

const browser = new URL(location.href).searchParams.get('browser');
const challenge = new URL(location.href).searchParams.get('challenge');
const state = document.querySelector('#state');
const video = document.querySelector('video');

function failureCode(error) {
    const message = error instanceof Error ? error.message : '';
    if (/^canary_hls_(network|media|other)_(401_403|4xx|5xx|other|none)$/.test(message)) return message;
    if (message === 'canary_playback_timeout') return 'canary_timeout';
    if (/^canary_playback_timeout_canary_hls_(network|media|other)_(401_403|4xx|5xx|other|none)$/.test(message)) return message;
    if (message === 'canary_negative_playable') return 'canary_negative_playable';
    if (message === 'canary_negative_timeout') return 'canary_negative_timeout';
    if (message === 'canary_playback_url_invalid') return 'canary_invalid_provider_url';
    if (message === 'canary_autoplay_blocked') return 'canary_autoplay_blocked';
    if (/^canary_playback_start_[A-Za-z]+$/.test(message)) return message;
    if (message === 'canary_request_failed') return 'canary_local_control';
    return 'canary_unknown';
}

function hlsFailureCode(data) {
    const reason = data?.type === 'networkError'
        ? 'network'
        : data?.type === 'mediaError'
            ? 'media'
            : 'other';
    const status = data?.response?.code;
    const response = status === 401 || status === 403
        ? '401_403'
        : Number.isSafeInteger(status) && status >= 400 && status < 500
            ? '4xx'
            : Number.isSafeInteger(status) && status >= 500 && status < 600
                ? '5xx'
                : Number.isSafeInteger(status)
                    ? 'other'
                    : 'none';
    return 'canary_hls_' + reason + '_' + response;
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validProviderPlaybackUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && !url.port
            && !url.username
            && !url.password
            && (url.hostname === 'playback.livepeer.studio'
                || url.hostname === 'livepeercdn.com'
                || url.hostname === 'livepeercdn.studio'
                || url.hostname === 'asset-cdn.lp-playback.com'
                || url.hostname.endsWith('.lp-playback.studio'));
    } catch {
        return false;
    }
}

function validCanonicalHlsUrl(value) {
    try {
        const url = new URL(value);
        const match = /^\\/asset\\/hls\\/([^/]+)\\/index\\.m3u8$/.exec(url.pathname);
        return url.origin === 'https://playback.livepeer.studio'
            && !url.username
            && !url.password
            && !url.search
            && !url.hash
            && match
            && encodeURIComponent(decodeURIComponent(match[1])) === match[1];
    } catch {
        return false;
    }
}

async function json(path, init) {
    const url = new URL(path, location.origin);
    url.searchParams.set('browser', browser || '');
    url.searchParams.set('challenge', challenge || '');
    const response = await fetch(url, { cache: 'no-store', ...init });
    if (!response.ok) throw new Error('canary_request_failed');
    return response.json();
}

async function playOnce(hlsUrl, token) {
    return new Promise((resolve, reject) => {
        let headerRequests = 0;
        let completed = false;
        let hls;
        let lastHlsFailure = 'canary_hls_other_none';
        const stop = (error) => {
            if (completed) return;
            completed = true;
            clearTimeout(timeout);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('canplay', onCanPlay);
            hls?.destroy();
            video.pause();
            video.removeAttribute('src');
            video.load();
            if (error) reject(error);
            else resolve({ headerRequests, played: true });
        };
        const onTimeUpdate = () => {
            if (video.currentTime >= 1) stop();
        };
        const onCanPlay = () => {
            video.muted = true;
            void video.play().catch((error) => stop(new Error(
                error?.name === 'NotAllowedError'
                    ? 'canary_autoplay_blocked'
                    : 'canary_playback_start_' + (error?.name || 'UnknownError'),
            )));
        };
        const timeout = setTimeout(() => stop(new Error(
            'canary_playback_timeout_' + lastHlsFailure,
        )), 75_000);
        hls = new Hls({
            xhrSetup: (xhr, url) => {
                if (!validProviderPlaybackUrl(url)) throw new Error('canary_playback_url_invalid');
                xhr.setRequestHeader('Livepeer-Jwt', token);
                headerRequests += 1;
            },
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
            lastHlsFailure = hlsFailureCode(data);
            if (data.fatal) stop(new Error(lastHlsFailure));
        });
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('canplay', onCanPlay, { once: true });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
    });
}

async function denyOnce(hlsUrl, token) {
    return new Promise((resolve, reject) => {
        let headerRequests = 0;
        let completed = false;
        let hls;
        const stop = (error) => {
            if (completed) return;
            completed = true;
            clearTimeout(timeout);
            video.removeEventListener('playing', onPlaying);
            hls?.destroy();
            video.pause();
            video.removeAttribute('src');
            video.load();
            if (error) reject(error);
            else resolve({ denied: true, headerRequests });
        };
        const onPlaying = () => stop(new Error('canary_negative_playable'));
        const timeout = setTimeout(() => stop(new Error('canary_negative_timeout')), 30_000);
        hls = new Hls({
            xhrSetup: (xhr, url) => {
                if (!validProviderPlaybackUrl(url)) throw new Error('canary_playback_url_invalid');
                if (token !== null) {
                    xhr.setRequestHeader('Livepeer-Jwt', token);
                    headerRequests += 1;
                }
            },
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) stop();
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void video.play().catch((error) => {
                if (error?.name === 'NotAllowedError') stop(new Error('canary_autoplay_blocked'));
                else stop();
            });
        });
        video.addEventListener('playing', onPlaying);
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
    });
}

async function run() {
    if (!['chrome', 'edge'].includes(browser)
        || !/^[A-Za-z0-9_-]{32,}$/.test(challenge || '')
        || !Hls.isSupported()) {
        throw new Error('canary_browser_invalid');
    }
    const config = await json('/config');
    if (!validCanonicalHlsUrl(config.hls_url)) throw new Error('canary_hls_url_invalid');
    const anonymous = await denyOnce(config.hls_url, null);
    const malformed = await json('/token?kind=malformed', { method: 'POST' });
    const malformedPlayback = await denyOnce(config.hls_url, malformed.token);
    const wrong = await json('/token?kind=wrong_key', { method: 'POST' });
    const wrongPlayback = await denyOnce(config.hls_url, wrong.token);
    const wrongSubject = await json('/token?kind=wrong_subject', { method: 'POST' });
    const wrongSubjectPlayback = await denyOnce(config.hls_url, wrongSubject.token);
    const expired = await json('/token?kind=expired', { method: 'POST' });
    const expiredPlayback = await denyOnce(config.hls_url, expired.token);
    const first = await json('/token', { method: 'POST' });
    const firstPlayback = await playOnce(config.hls_url, first.token);
    await delay(1_100);
    const refreshed = await json('/token', { method: 'POST' });
    if (refreshed.token === first.token) throw new Error('canary_refresh_not_rotated');
    const refreshedPlayback = await playOnce(config.hls_url, refreshed.token);
    return {
        browser,
        initial_played: firstPlayback.played,
        refreshed_played: refreshedPlayback.played,
        initial_hls_header_requests: firstPlayback.headerRequests,
        refreshed_hls_header_requests: refreshedPlayback.headerRequests,
        anonymous_denied: anonymous.denied,
        anonymous_hls_header_requests: anonymous.headerRequests,
        malformed_denied: malformedPlayback.denied,
        malformed_hls_header_requests: malformedPlayback.headerRequests,
        wrong_key_denied: wrongPlayback.denied,
        wrong_key_hls_header_requests: wrongPlayback.headerRequests,
        wrong_subject_denied: wrongSubjectPlayback.denied,
        wrong_subject_hls_header_requests: wrongSubjectPlayback.headerRequests,
        expired_denied: expiredPlayback.denied,
        expired_hls_header_requests: expiredPlayback.headerRequests,
        persistent_storage_empty: localStorage.length === 0 && sessionStorage.length === 0,
    };
}

run().then((result) => {
    window.__livepeerCanaryResult = result;
    window.__livepeerCanaryFailure = null;
    state.textContent = 'pass';
    document.body.dataset.state = 'pass';
}).catch((error) => {
    window.__livepeerCanaryResult = null;
    window.__livepeerCanaryFailure = failureCode(error);
    state.textContent = 'fail';
    document.body.dataset.state = 'fail';
});`;

const HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>Livepeer browser playback canary</title>
<body data-state="running">
<video muted playsinline preload="auto"></video>
<p id="state">running</p>
<script type="module" src="/client.mjs"></script>
</body>`;

function json(response, status, value) {
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify(value));
}

function page(response, contentType, body) {
    response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self' https:; media-src https: blob:; script-src 'self'; style-src 'self'",
        'Content-Type': contentType,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    });
    response.end(body);
}

function validCanonicalHlsUrl(value) {
    try {
        const url = new URL(value);
        const match = /^\/asset\/hls\/([^/]+)\/index\.m3u8$/.exec(url.pathname);
        return url.origin === 'https://playback.livepeer.studio'
            && !url.username
            && !url.password
            && !url.search
            && !url.hash
            && match
            && encodeURIComponent(decodeURIComponent(match[1])) === match[1];
    } catch {
        return false;
    }
}

function validReport(value) {
    return value
        && typeof value === 'object'
        && ['chrome', 'edge'].includes(value.browser)
        && typeof value.initial_played === 'boolean'
        && typeof value.refreshed_played === 'boolean'
        && Number.isSafeInteger(value.initial_hls_header_requests)
        && value.initial_hls_header_requests >= 0
        && Number.isSafeInteger(value.refreshed_hls_header_requests)
        && value.refreshed_hls_header_requests >= 0
        && value.anonymous_denied === true
        && value.anonymous_hls_header_requests === 0
        && value.malformed_denied === true
        && Number.isSafeInteger(value.malformed_hls_header_requests)
        && value.malformed_hls_header_requests >= 1
        && value.wrong_key_denied === true
        && Number.isSafeInteger(value.wrong_key_hls_header_requests)
        && value.wrong_key_hls_header_requests >= 1
        && value.wrong_subject_denied === true
        && Number.isSafeInteger(value.wrong_subject_hls_header_requests)
        && value.wrong_subject_hls_header_requests >= 1
        && value.expired_denied === true
        && Number.isSafeInteger(value.expired_hls_header_requests)
        && value.expired_hls_header_requests >= 1
        && typeof value.persistent_storage_empty === 'boolean';
}

export function isTerminalBrowserCanaryState(value) {
    return TERMINAL_BROWSER_STATES.includes(value);
}

function validFailureCode(value) {
    return typeof value === 'string' && /^canary_[A-Za-z0-9_]{1,160}$/.test(value);
}

function compactReport(value) {
    return {
        initial_played: value.initial_played,
        refreshed_played: value.refreshed_played,
        initial_hls_header_requests: value.initial_hls_header_requests,
        refreshed_hls_header_requests: value.refreshed_hls_header_requests,
        anonymous_denied: value.anonymous_denied,
        anonymous_hls_header_requests: value.anonymous_hls_header_requests,
        malformed_denied: value.malformed_denied,
        malformed_hls_header_requests: value.malformed_hls_header_requests,
        wrong_key_denied: value.wrong_key_denied,
        wrong_key_hls_header_requests: value.wrong_key_hls_header_requests,
        wrong_subject_denied: value.wrong_subject_denied,
        wrong_subject_hls_header_requests: value.wrong_subject_hls_header_requests,
        expired_denied: value.expired_denied,
        expired_hls_header_requests: value.expired_hls_header_requests,
        persistent_storage_empty: value.persistent_storage_empty,
    };
}

function validBrowserRequest(url, challenges) {
    const browser = url.searchParams.get('browser');
    return ['chrome', 'edge'].includes(browser)
        && url.searchParams.get('challenge') === challenges.get(browser);
}

function listen(server, host, port) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });
}

function close(server) {
    server.closeAllConnections?.();
    return new Promise((resolve) => server.close(resolve));
}

async function runDesktopBrowser({ browser, url, timeoutMs }) {
    let instance;
    try {
        const { chromium } = await import('@playwright/test');
        instance = await chromium.launch({
            executablePath: BROWSER_EXECUTABLES[browser],
            headless: false,
            args: ['--autoplay-policy=no-user-gesture-required'],
        });
        const page = await instance.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForFunction(
            (states) => states.includes(document.body.dataset.state || ''),
            TERMINAL_BROWSER_STATES,
            { timeout: timeoutMs },
        );
        const evidence = await page.evaluate(() => ({
            result: window.__livepeerCanaryResult,
            failure: window.__livepeerCanaryFailure,
        }));
        if (!validReport(evidence.result) || evidence.result.browser !== browser) {
            const suffix = validFailureCode(evidence.failure) ? `_${evidence.failure}` : '';
            throw new Error(`browser_canary_playback_failed${suffix}`);
        }
        return evidence.result;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('browser_canary_')) throw error;
        throw new Error(`browser_canary_${browser}_unavailable`);
    } finally {
        await instance?.close();
    }
}

export async function requireDesktopBrowserExecutables() {
    for (const browser of ['chrome', 'edge']) {
        try {
            await access(BROWSER_EXECUTABLES[browser], constants.X_OK);
        } catch {
            throw new Error(`browser_canary_${browser}_unavailable`);
        }
    }
}

export async function runLivepeerHlsBrowserCanary({
    hlsUrl,
    issueToken,
    host = '127.0.0.1',
    port = 0,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onReady,
    browserRunner = runDesktopBrowser,
}) {
    if (typeof issueToken !== 'function') throw new Error('browser_canary_input_invalid');
    if (!validCanonicalHlsUrl(hlsUrl)) throw new Error('browser_canary_hls_url_invalid');
    if (host !== '127.0.0.1') throw new Error('browser_canary_host_invalid');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('browser_canary_timeout_invalid');

    const hlsSource = await readFile(new URL('../node_modules/hls.js/dist/hls.mjs', import.meta.url));
    const challenges = new Map([
        ['chrome', randomBytes(32).toString('base64url')],
        ['edge', randomBytes(32).toString('base64url')],
    ]);
    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url || '/', `http://${host}`);
            const authorized = validBrowserRequest(url, challenges);
            if (request.method === 'GET' && url.pathname === '/' && authorized) {
                page(response, 'text/html; charset=utf-8', HTML);
                return;
            }
            if (request.method === 'GET' && url.pathname === '/client.mjs') {
                page(response, 'text/javascript; charset=utf-8', CLIENT_SOURCE);
                return;
            }
            if (request.method === 'GET' && url.pathname === '/hls.mjs') {
                page(response, 'text/javascript; charset=utf-8', hlsSource);
                return;
            }
            if (request.method === 'GET' && url.pathname === '/config' && authorized) {
                json(response, 200, { hls_url: hlsUrl });
                return;
            }
            if (request.method === 'POST' && url.pathname === '/token' && authorized) {
                const kind = url.searchParams.get('kind') || 'correct';
                if (!['correct', 'malformed', 'wrong_key', 'wrong_subject', 'expired'].includes(kind)) {
                    throw new Error('browser_canary_token_kind_invalid');
                }
                const token = issueToken(kind);
                const valid = kind === 'malformed'
                    ? typeof token === 'string' && token.length > 0 && !/[\r\n]/.test(token)
                    : typeof token === 'string'
                        && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
                if (!valid) {
                    throw new Error('browser_canary_token_invalid');
                }
                json(response, 200, { token });
                return;
            }
            json(response, 404, { error: 'not_found' });
        } catch {
            json(response, 500, { error: 'browser_canary_failed' });
        }
    });

    await listen(server, host, port);
    const address = server.address();
    if (!address || typeof address === 'string') {
        await close(server);
        throw new Error('browser_canary_listen_failed');
    }
    const baseUrl = `http://${host}:${address.port}`;
    process.stdout.write(`Livepeer browser playback canary ready at ${baseUrl}\n`);
    onReady?.(baseUrl);

    try {
        const reports = {};
        for (const browser of ['chrome', 'edge']) {
            const challenge = challenges.get(browser);
            const result = await browserRunner({
                browser,
                url: `${baseUrl}/?browser=${browser}&challenge=${challenge}`,
                timeoutMs,
            });
            if (!validReport(result) || result.browser !== browser) {
                throw new Error('browser_canary_matrix_failed');
            }
            reports[browser] = compactReport(result);
        }
        const chrome = reports.chrome;
        const edge = reports.edge;
        if (!chrome || !edge
            || !chrome.initial_played || !chrome.refreshed_played
            || chrome.initial_hls_header_requests < 1 || chrome.refreshed_hls_header_requests < 1
            || !chrome.anonymous_denied || chrome.anonymous_hls_header_requests !== 0
            || !chrome.malformed_denied || chrome.malformed_hls_header_requests < 1
            || !chrome.wrong_key_denied || chrome.wrong_key_hls_header_requests < 1
            || !chrome.wrong_subject_denied || chrome.wrong_subject_hls_header_requests < 1
            || !chrome.expired_denied || chrome.expired_hls_header_requests < 1
            || !chrome.persistent_storage_empty
            || !edge.initial_played || !edge.refreshed_played
            || edge.initial_hls_header_requests < 1 || edge.refreshed_hls_header_requests < 1
            || !edge.anonymous_denied || edge.anonymous_hls_header_requests !== 0
            || !edge.malformed_denied || edge.malformed_hls_header_requests < 1
            || !edge.wrong_key_denied || edge.wrong_key_hls_header_requests < 1
            || !edge.wrong_subject_denied || edge.wrong_subject_hls_header_requests < 1
            || !edge.expired_denied || edge.expired_hls_header_requests < 1
            || !edge.persistent_storage_empty) {
            throw new Error('browser_canary_matrix_failed');
        }
        return { matrix_proven: true, chrome, edge };
    } finally {
        await close(server);
    }
}
