// M0 Cloudflare Stream proof round (owner-run only, never from CI).
//
// Each subcommand is one proof from the migration plan (M0-P1..P9). Credentials
// come only from STREAM_ACCOUNT_ID and STREAM_API_TOKEN in the process
// environment. The API token, account id, customer code, webhook secrets,
// private keys and minted tokens are scrubbed from every file and log line.
// Every video, key and webhook a subcommand creates is deleted at the end
// unless --keep is given. --dry-run prints the request plan without network.
import {
    createHash,
    createHmac,
    createPrivateKey,
    sign as cryptoSign,
    timingSafeEqual,
} from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFile, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const API_BASE = 'https://api.cloudflare.com/client/v4';
export const TUS_VERSION = '1.0.0';
export const HLS_JS_VERSION = '1.6.16';
export const HLS_JS_URL = `https://cdn.jsdelivr.net/npm/hls.js@${HLS_JS_VERSION}/dist/hls.min.js`;
// sha384 of dist/hls.min.js from the hls.js@1.6.16 npm tarball (apps/web pins the
// same version); jsDelivr /npm/ serves the published file unmodified.
export const HLS_JS_INTEGRITY = 'sha384-5E8B0pTlZZJMabWpC0fyYf6OUpe15jJij34BqBAh4NXoHAlLNOjCPRrwtOXOQFAn';
export const MUTATION_GATE = 'STREAM_PROBE_MUTATIONS';
const FILETYPES = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    wmv: 'video/x-ms-wmv',
    mkv: 'video/x-matroska',
    flv: 'video/x-flv',
};
export const CONTAINERS = ['mp4', 'mov', 'avi', 'webm', 'wmv', 'mkv', 'flv'];
export const CHUNK_BYTES = 32 * 1024 * 1024; // multiple of 256 KiB, inside 5 MiB..200 MiB
export const MID_UPLOAD_BYTES = 5 * 1024 * 1024; // smallest legal non-final tus chunk
export const DEFAULT_MAX_DURATION_SECONDS = 7200; // OD3 provisional cap
export const DEFAULT_TOKEN_TTL_SECONDS = 180; // OD4 viewer token lifetime
export const MAX_RESERVATION_SECONDS = 36000; // documented maxDurationSeconds ceiling
export const VERIFICATION_CYCLE_MS = 10 * 60 * 1000; // provider-verification.ts pending cycle
export const ROUTING_CANDIDATE_KEYS = ['jobId', 'jobid', 'job_id', 'generation', 'meta.jobId', 'meta-jobId'];
export const P2_CHECKPOINTS = ['2h', '12h', 'expiry', '25h'];
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');

const PEM_RE = /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/g;
const CUSTOMER_HOST_RE = /customer-[A-Za-z0-9]+\.cloudflarestream\.com/g;
const SEGMENT_P_RE = /([?&](?:amp;)?)p=[^&\s"'<>#\\]+/g;
const SEGMENT_S_RE = /([?&](?:amp;)?)s=[^&\s"'<>#\\]+/g;

const iso = (ms) => new Date(ms).toISOString();
const b64url = (value) => Buffer.from(value).toString('base64url');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// ---------------------------------------------------------------- scrubbing

export function createScrubber() {
    const secrets = new Map();
    function register(value, placeholder) {
        if (typeof value !== 'string' || value.length < 6) return;
        secrets.set(value, placeholder);
    }
    function scrubString(input, { keep = [] } = {}) {
        let text = String(input);
        // Registered values first: the PEM regex would otherwise eat the markers
        // and leave the base64 body of a key that was stored encoded.
        const ordered = [...secrets].sort((left, right) => right[0].length - left[0].length);
        for (const [value, placeholder] of ordered) {
            if (!keep.includes(placeholder)) text = text.split(value).join(placeholder);
        }
        return text
            .replace(PEM_RE, '<PEM>')
            .replace(JWT_RE, '<JWT>')
            .replace(CUSTOMER_HOST_RE, 'customer-<CUSTOMER_CODE>.cloudflarestream.com')
            .replace(SEGMENT_P_RE, '$1p=<P>')
            .replace(SEGMENT_S_RE, '$1s=<S>');
    }
    function leaks(text, { allow = [] } = {}) {
        const found = [];
        for (const [value, placeholder] of secrets) {
            if (!allow.includes(placeholder) && text.includes(value)) found.push(placeholder);
        }
        if (new RegExp(PEM_RE.source).test(text)) found.push('<PEM>');
        if (new RegExp(JWT_RE.source).test(text)) found.push('<JWT>');
        return found;
    }
    function reveal(text, placeholder) {
        for (const [value, label] of secrets) {
            if (label === placeholder) return text.split(placeholder).join(value);
        }
        return text;
    }
    return { register, scrubString, leaks, reveal };
}

export function createOutput(dir, scrubber) {
    async function place(relPath, text) {
        const target = join(dir, relPath);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, text, { mode: 0o600 });
        return target;
    }
    async function write(relPath, content) {
        const text = scrubber.scrubString(content);
        if (scrubber.leaks(text).length) throw new Error(`scrub_failed_${relPath}`);
        return place(relPath, text);
    }
    async function json(relPath, value) {
        return write(relPath, `${JSON.stringify(value, null, 2)}\n`);
    }
    async function append(relPath, line) {
        const text = scrubber.scrubString(line);
        if (scrubber.leaks(text).length) throw new Error(`scrub_failed_${relPath}`);
        const target = join(dir, relPath);
        await mkdir(dirname(target), { recursive: true });
        await appendFile(target, `${text}\n`, { mode: 0o600 });
    }
    // Resume state keeps the tus upload URL (needed for the later HEAD); the
    // account id and every other secret are still replaced by placeholders.
    async function writeState(relPath, value) {
        const text = scrubber.scrubString(`${JSON.stringify(value, null, 2)}\n`, { keep: ['<TUS_URL>'] });
        if (scrubber.leaks(text, { allow: ['<TUS_URL>'] }).length) throw new Error(`scrub_failed_${relPath}`);
        return place(relPath, text);
    }
    return { dir, write, json, append, writeState };
}

// ---------------------------------------------------------------- parsing

function parseHlsAttributes(text) {
    const attributes = {};
    const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
    let match;
    while ((match = pattern.exec(text))) {
        attributes[match[1]] = match[2].startsWith('"') ? match[2].slice(1, -1) : match[2];
    }
    return attributes;
}

function playlistLines(text) {
    return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function parseMasterPlaylist(text) {
    const lines = playlistLines(text);
    const tags = new Set();
    const media = [];
    const streams = [];
    const iframes = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.startsWith('#')) tags.add(line.split(':')[0]);
        if (line.startsWith('#EXT-X-MEDIA:')) media.push(parseHlsAttributes(line.slice(13)));
        else if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const attributes = parseHlsAttributes(line.slice(18));
            let uri = null;
            for (let next = index + 1; next < lines.length; next += 1) {
                if (!lines[next].startsWith('#')) {
                    uri = lines[next];
                    index = next;
                    break;
                }
            }
            streams.push({ attributes, uri });
        } else if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
            iframes.push(parseHlsAttributes(line.slice(26)));
        }
    }
    return { is_extm3u: lines[0] === '#EXTM3U', tags: [...tags].sort(), media, streams, iframes };
}

export function parseMediaPlaylist(text) {
    const lines = playlistLines(text);
    const tags = new Set();
    const result = {
        is_extm3u: lines[0] === '#EXTM3U',
        target_duration: null,
        version: null,
        playlist_type: null,
        map_uri: null,
        endlist: false,
        segments: [],
    };
    for (const line of lines) {
        if (line.startsWith('#')) tags.add(line.split(':')[0]);
        if (line.startsWith('#EXT-X-TARGETDURATION:')) result.target_duration = Number(line.slice(22));
        else if (line.startsWith('#EXT-X-VERSION:')) result.version = Number(line.slice(15));
        else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) result.playlist_type = line.slice(21);
        else if (line.startsWith('#EXT-X-MAP:')) result.map_uri = parseHlsAttributes(line.slice(11)).URI ?? null;
        else if (line === '#EXT-X-ENDLIST') result.endlist = true;
        else if (!line.startsWith('#')) result.segments.push(line);
    }
    return { ...result, tags: [...tags].sort(), segment_count: result.segments.length };
}

function parseXmlAttributes(text) {
    const attributes = {};
    const pattern = /([\w:.-]+)="([^"]*)"/g;
    let match;
    while ((match = pattern.exec(text))) attributes[match[1]] = match[2];
    return attributes;
}

export function parseDash(text) {
    const source = String(text ?? '');
    const mpd = source.match(/<MPD\b([^>]*)>/);
    const adaptationSets = [];
    const setPattern = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g;
    let match;
    while ((match = setPattern.exec(source))) {
        const attributes = parseXmlAttributes(match[1]);
        const representations = [];
        const repPattern = /<Representation\b([^>]*?)\/?>/g;
        let rep;
        while ((rep = repPattern.exec(match[2]))) {
            const repAttributes = parseXmlAttributes(rep[1]);
            representations.push({
                id: repAttributes.id ?? null,
                width: repAttributes.width ? Number(repAttributes.width) : null,
                height: repAttributes.height ? Number(repAttributes.height) : null,
                bandwidth: repAttributes.bandwidth ? Number(repAttributes.bandwidth) : null,
                codecs: repAttributes.codecs ?? null,
            });
        }
        const template = match[2].match(/<SegmentTemplate\b([^>]*)/);
        adaptationSets.push({
            mime_type: attributes.mimeType ?? null,
            content_type: attributes.contentType ?? null,
            representations,
            segment_template: template ? parseXmlAttributes(template[1]) : null,
            has_segment_timeline: /<SegmentTimeline\b/.test(match[2]),
            has_base_url: /<BaseURL\b/.test(match[2]),
        });
    }
    return {
        is_mpd: Boolean(mpd),
        mpd_attributes: mpd ? parseXmlAttributes(mpd[1]) : null,
        period_count: (source.match(/<Period\b/g) || []).length,
        adaptation_sets: adaptationSets,
    };
}

export function describeMediaUri(uri, baseUrl, uid) {
    const resolved = new URL(uri, baseUrl);
    let pKeys = null;
    let pSubMatchesUid = null;
    const p = resolved.searchParams.get('p');
    if (p) {
        try {
            const decoded = JSON.parse(Buffer.from(p, /[-_]/.test(p) ? 'base64url' : 'base64').toString('utf8'));
            pKeys = Object.keys(decoded).sort();
            pSubMatchesUid = decoded.sub === uid;
        } catch {
            pKeys = 'undecodable';
        }
    }
    return {
        relative: !/^[a-z]+:/i.test(uri),
        host: resolved.host,
        path_shape: resolved.pathname.split(uid).join('<UID>').replace(/seg_\d+/, 'seg_N'),
        path_label: resolved.pathname.match(/\/video\/([^/]+)\//)?.[1] ?? null,
        query_params: [...new Set(resolved.searchParams.keys())].sort(),
        p_keys: pKeys,
        p_sub_matches_uid: pSubMatchesUid,
    };
}

export function jpegDimensions(bytes) {
    const buffer = Buffer.from(bytes);
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    let index = 2;
    while (index + 9 < buffer.length) {
        if (buffer[index] !== 0xff) {
            index += 1;
            continue;
        }
        const marker = buffer[index + 1];
        if (marker === 0xff) {
            index += 1;
            continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            index += 2;
            continue;
        }
        const length = buffer.readUInt16BE(index + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { height: buffer.readUInt16BE(index + 5), width: buffer.readUInt16BE(index + 7) };
        }
        index += 2 + length;
    }
    return null;
}

export function pctComplete(video) {
    const value = Number(video?.status?.pctComplete);
    return video?.status?.pctComplete !== undefined && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------- tokens

export function pemFormat(pemText) {
    if (pemText.includes('BEGIN RSA PRIVATE KEY')) return 'pkcs1';
    if (pemText.includes('BEGIN PRIVATE KEY')) return 'pkcs8';
    return 'unknown';
}

export function loadSigningKey({ id, pem }, scrubber) {
    if (typeof id !== 'string' || !id || typeof pem !== 'string' || !pem) throw new Error('signing_key_invalid');
    const pemText = pem.includes('-----BEGIN') ? pem : Buffer.from(pem, 'base64').toString('utf8');
    if (scrubber) {
        scrubber.register(pem, '<PRIVATE_KEY>');
        scrubber.register(pemText, '<PRIVATE_KEY>');
    }
    let keyObject;
    try {
        keyObject = createPrivateKey(pemText);
    } catch {
        throw new Error('signing_key_unparseable');
    }
    return { id, keyObject, format: pemFormat(pemText) };
}

export function mintToken(key, { uid, ttlSeconds, nowMs, claims = {}, header = {}, omit = [] }) {
    const issuedAt = Math.floor(nowMs / 1000);
    const jwtHeader = { alg: 'RS256', kid: key.id, ...header };
    // Default claims match the planned production token: nbf = iat - 60.
    const payload = { sub: uid, kid: key.id, exp: issuedAt + ttlSeconds, nbf: issuedAt - 60, ...claims };
    for (const name of omit) delete payload[name];
    const input = `${b64url(JSON.stringify(jwtHeader))}.${b64url(JSON.stringify(payload))}`;
    const signature = cryptoSign('sha256', Buffer.from(input), key.keyObject);
    return { token: `${input}.${b64url(signature)}`, exp: payload.exp ?? null };
}

export function credentialUrl(url, uid, token) {
    const parsed = new URL(url);
    if (!parsed.pathname.includes(`/${uid}/`)) throw new Error('playback_url_without_uid');
    parsed.pathname = parsed.pathname.replace(`/${uid}/`, `/${token}/`);
    return parsed.toString();
}

// ---------------------------------------------------------------- webhooks

export function parseSignatureHeader(header) {
    const fields = Object.fromEntries(String(header ?? '').split(',').map((part) => {
        const at = part.indexOf('=');
        return at < 0 ? [part.trim(), ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
    }));
    const time = /^[0-9]{1,12}$/.test(fields.time ?? '') ? Number(fields.time) : null;
    const sig1 = /^[0-9a-f]{64}$/i.test(fields.sig1 ?? '') ? fields.sig1.toLowerCase() : null;
    return { time, sig1 };
}

export function signWebhook(rawBody, secret, timeSeconds) {
    const sig1 = createHmac('sha256', secret).update(`${timeSeconds}.${rawBody}`).digest('hex');
    return `time=${timeSeconds},sig1=${sig1}`;
}

export function verifyWebhookSignature(rawBody, header, secret) {
    const { time, sig1 } = parseSignatureHeader(header);
    if (time === null || sig1 === null || !secret) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(`${time}.${rawBody}`).digest('hex'));
    const actual = Buffer.from(sig1);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createWebhookReceiver({ now, sleep, onDelivery = async () => {} }) {
    const secrets = [];
    const deliveries = [];
    const bodies = new Map();
    const rejected = { non_post: 0, unsigned: 0 };
    let responder = () => 200;
    // Only signed POST deliveries are recorded; anything else on the tunnel is
    // counted, never parsed into the evidence or logged.
    async function handle({ method, path, headers = {}, body = '' }) {
        if (method !== 'POST') {
            rejected.non_post += 1;
            return { status: 405 };
        }
        const receivedMs = now();
        const header = headers['webhook-signature'] ?? '';
        const { time } = parseSignatureHeader(header);
        const verifiedWith = secrets
            .filter((entry) => verifyWebhookSignature(body, header, entry.value))
            .map((entry) => entry.label);
        if (verifiedWith.length === 0) {
            rejected.unsigned += 1;
            return { status: 401 };
        }
        let parsed = null;
        try {
            parsed = JSON.parse(body);
        } catch {
            parsed = null;
        }
        const record = {
            n: deliveries.length + 1,
            received_at: iso(receivedMs),
            received_ms: receivedMs,
            path,
            header_time: time,
            skew_s: time === null ? null : Math.round(receivedMs / 1000 - time),
            verified_with: verifiedWith,
            body_sha256: sha256(body),
            uid: parsed?.uid ?? null,
            state: parsed?.status?.state ?? null,
            pct_complete: parsed?.status?.pctComplete ?? null,
            ready_to_stream: parsed?.readyToStream ?? null,
            error_reason_code: parsed?.status?.errorReasonCode ?? null,
            user_agent: headers['user-agent'] ?? null,
        };
        record.answered = responder(record);
        deliveries.push(record);
        bodies.set(record.n, parsed);
        await onDelivery(record, parsed);
        return { status: record.answered };
    }
    async function waitFor(predicate, { timeoutMs, label = 'webhook' }) {
        const started = now();
        for (;;) {
            const found = deliveries.find(predicate);
            if (found) return found;
            if (now() - started > timeoutMs) throw new Error(`${label}_wait_timeout`);
            await sleep(1000);
        }
    }
    return {
        handle,
        waitFor,
        deliveries,
        rejected,
        body: (n) => bodies.get(n) ?? null,
        addSecret: (label, value) => secrets.push({ label, value }),
        setResponder: (fn) => {
            responder = fn;
        },
    };
}

export function listenHttp(port, handler) {
    return new Promise((resolvePromise, reject) => {
        const server = createServer(async (request, response) => {
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
                size += chunk.length;
                if (size > 5 * 1024 * 1024) {
                    response.writeHead(413).end();
                    return;
                }
                chunks.push(chunk);
            }
            let result;
            try {
                result = await handler({
                    method: request.method,
                    path: request.url,
                    headers: request.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            } catch {
                result = { status: 500 };
            }
            response.writeHead(result.status, result.headers ?? {});
            response.end(result.body ?? '');
        });
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolvePromise({
            port: server.address().port,
            close: () => new Promise((done) => {
                server.closeAllConnections?.();
                server.close(() => done());
            }),
        }));
    });
}

// ---------------------------------------------------------------- API client

function withTimeout(signal, milliseconds) {
    const timeout = AbortSignal.timeout(milliseconds);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBody(response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { non_json_excerpt: text.slice(0, 400) };
    }
}

export function registerCustomerCode(scrubber, url) {
    const match = String(url ?? '').match(/customer-([A-Za-z0-9]+)\.cloudflarestream\.com/);
    if (match) scrubber.register(match[1], '<CUSTOMER_CODE>');
}

function isCloudflareHost(url) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === 'https:'
            && (hostname.endsWith('.cloudflarestream.com') || hostname === 'api.cloudflare.com');
    } catch {
        return false;
    }
}

export function createStreamApi({ accountId, apiToken, fetchImpl, scrubber, getSignal = () => undefined }) {
    const base = `${API_BASE}/accounts/${encodeURIComponent(accountId)}/stream`;
    const auth = { Authorization: `Bearer ${apiToken}` };
    async function call(path, { method = 'GET', headers = {}, body, timeoutMs = 30_000 } = {}) {
        const response = await fetchImpl(`${base}${path}`, {
            method,
            headers: { ...auth, ...headers },
            body,
            redirect: 'manual',
            signal: withTimeout(getSignal(), timeoutMs),
        });
        const parsed = await readBody(response);
        registerCustomerCode(scrubber, parsed?.result?.playback?.hls);
        return { status: response.status, headers: response.headers, body: parsed };
    }
    return {
        createUpload: (length, metadata) => call('?direct_user=true', {
            method: 'POST',
            headers: {
                'Tus-Resumable': TUS_VERSION,
                'Upload-Length': String(length),
                'Upload-Metadata': metadata,
            },
        }),
        getVideo: (uid) => call(`/${encodeURIComponent(uid)}`),
        deleteVideo: (uid) => call(`/${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        storageUsage: () => call('/storage-usage'),
        getWebhook: () => call('/webhook'),
        putWebhook: (notificationUrl) => call('/webhook', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationUrl }),
        }),
        deleteWebhook: () => call('/webhook', { method: 'DELETE' }),
        createKey: () => call('/keys', { method: 'POST' }),
        listKeys: () => call('/keys'),
        deleteKey: (id) => call(`/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        async tus(url, { method, headers = {}, body, timeoutMs = 30_000, withAuth = false }) {
            if (withAuth && !isCloudflareHost(url)) throw new Error('tus_auth_host_refused');
            const response = await fetchImpl(url, {
                method,
                headers: { 'Tus-Resumable': TUS_VERSION, ...(withAuth ? auth : {}), ...headers },
                body,
                signal: withTimeout(getSignal(), timeoutMs),
            });
            await response.arrayBuffer().catch(() => null);
            return { status: response.status, headers: response.headers };
        },
        async playback(url, { headers = {}, binary = false, timeoutMs = 30_000 } = {}) {
            const response = await fetchImpl(url, { headers, signal: withTimeout(getSignal(), timeoutMs) });
            const bytes = Buffer.from(await response.arrayBuffer());
            return {
                status: response.status,
                headers: response.headers,
                content_type: response.headers.get('content-type'),
                bytes,
                text: binary ? null : bytes.toString('utf8'),
            };
        },
    };
}

// ---------------------------------------------------------------- helpers

function intOption(value, fallback, name) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`option_${name}_invalid`);
    return parsed;
}

function minutesOption(ctx, name, fallback) {
    return intOption(ctx.opts[name], fallback, name) * 60_000;
}

function requirePath(ctx, name) {
    const value = ctx.opts[name];
    if (!value) throw new Error(`option_${name}_required`);
    return resolve(value);
}

// realpath of the longest existing prefix, so a symlinked or not yet created
// --out cannot hide a path inside the repository.
export function realpathExisting(path) {
    let current = resolve(path);
    const rest = [];
    for (;;) {
        try {
            return join(realpathSync(current), ...rest);
        } catch {
            const parent = dirname(current);
            if (parent === current) return resolve(path);
            rest.unshift(basename(current));
            current = parent;
        }
    }
}

export function isInside(child, parent) {
    const rel = relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function hostOf(url) {
    try {
        return new URL(url).host;
    } catch {
        return null;
    }
}

function diffsSeconds(records) {
    return records.slice(1).map((record, index) => Math.round((record.received_ms - records[index].received_ms) / 1000));
}

export function encodeUploadMetadata(entries) {
    return entries
        .map(([key, value]) => (value === null ? key : `${key} ${Buffer.from(String(value)).toString('base64')}`))
        .join(',');
}

function rfc3339(ms) {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildMetadata({ maxDuration, name, expiry, file, extra = [] }) {
    const extension = file ? basename(file).split('.').pop().toLowerCase() : null;
    return [
        ['maxDurationSeconds', String(maxDuration)],
        ['requiresignedurls', null],
        ['name', name],
        // filename/filetype as the M2-G2 web uploader sends them.
        ...(file ? [['filename', basename(file)], ['filetype', FILETYPES[extension] ?? 'application/octet-stream']] : []),
        ...(expiry ? [['expiry', expiry]] : []),
        ...extra,
    ];
}

export function summarizeVideo(video) {
    if (!video || typeof video !== 'object') return null;
    return {
        field_names: Object.keys(video).sort(),
        uid: video.uid ?? null,
        ready_to_stream: video.readyToStream ?? null,
        state: video.status?.state ?? null,
        pct_complete: video.status?.pctComplete ?? null,
        error_reason_code: video.status?.errorReasonCode ?? null,
        error_reason_text: video.status?.errorReasonText ?? null,
        duration: video.duration ?? null,
        size: video.size ?? null,
        input: video.input ?? null,
        max_duration_seconds: video.maxDurationSeconds ?? null,
        max_size_bytes: video.maxSizeBytes ?? null,
        upload_expiry: video.uploadExpiry ?? null,
        require_signed_urls: video.requireSignedURLs ?? null,
        meta: video.meta ?? null,
        creator: video.creator ?? null,
        playback: video.playback ?? null,
        thumbnail: video.thumbnail ?? null,
        preview: video.preview ?? null,
        created: video.created ?? null,
        uploaded: video.uploaded ?? null,
        modified: video.modified ?? null,
        scheduled_deletion: video.scheduledDeletion ?? null,
    };
}

function baseReceipt(ctx, proof, unlocks) {
    return {
        schema: `youtick.stream-probe.${proof.toLowerCase()}.v1`,
        proof,
        unlocks,
        evidence_class: 'PROVIDER (sandbox, second Cloudflare account)',
        script: 'workers/livepeer-bridge/scripts/stream-probe.mjs',
        started_at: iso(ctx.now()),
        max_duration_seconds: ctx.maxDuration,
        token_ttl_seconds: ctx.tokenTtl,
    };
}

// The receipt is registered on the context as soon as a proof starts, so a
// failure still leaves everything gathered so far with status "aborted".
function startReceipt(ctx, proof, unlocks) {
    ctx.receipt = { ...baseReceipt(ctx, proof, unlocks), status: 'running' };
    return ctx.receipt;
}

async function finish(ctx, receipt) {
    receipt.status = 'completed';
    receipt.finished_at = iso(ctx.now());
    const path = await ctx.out.json(`${ctx.proofDir}/receipt.json`, receipt);
    ctx.log(`receipt: ${path}`);
    return receipt;
}

async function writeAbortedReceipt(ctx, error) {
    if (!ctx.receipt || ctx.receipt.status === 'completed') return;
    ctx.receipt.status = 'aborted';
    ctx.receipt.error = error?.message ?? String(error);
    ctx.receipt.finished_at = iso(ctx.now());
    await ctx.out.json(`${ctx.proofDir}/receipt.json`, ctx.receipt);
}

// ---------------------------------------------------------------- ledger

async function loadLedger(out) {
    let text;
    try {
        text = await readFile(join(out.dir, 'ledger.json'), 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') return { videos: new Set(), keys: new Set(), ownerKeys: new Set(), webhook: false };
        throw error;
    }
    const raw = JSON.parse(text);
    return {
        videos: new Set(raw.videos ?? []),
        keys: new Set(raw.keys ?? []),
        ownerKeys: new Set(raw.owner_keys ?? []),
        webhook: raw.webhook === true,
    };
}

async function saveLedger(ctx) {
    await ctx.out.json('ledger.json', {
        note: 'Provider resources created by stream-probe and not yet deleted. `stream-probe cleanup --out <dir>` deletes videos, keys and the webhook; owner_keys are deleted only by `signing-key --delete`.',
        videos: [...ctx.ledger.videos],
        keys: [...ctx.ledger.keys],
        owner_keys: [...ctx.ledger.ownerKeys],
        webhook: ctx.ledger.webhook,
    });
}

async function trackCreate(ctx, kind, id) {
    ctx.created[kind].add(id);
    ctx.ledger[kind].add(id);
    await saveLedger(ctx);
}

async function trackDelete(ctx, kind, id) {
    ctx.created[kind].delete(id);
    ctx.ledger[kind].delete(id);
    await saveLedger(ctx);
}

async function deleteVideo(ctx, uid) {
    const response = await ctx.api.deleteVideo(uid);
    if ([200, 204, 404].includes(response.status)) await trackDelete(ctx, 'videos', uid);
    ctx.log(`delete video ${uid}: ${response.status}`);
    return response.status;
}

async function cleanupCreated(ctx) {
    const keep = Boolean(ctx.opts.keep);
    const report = { keep, videos: [], keys: [], webhook: null, failures: [] };
    const attempt = async (kind, id, action) => {
        try {
            return await action();
        } catch (error) {
            report.failures.push({ kind, id, error: error?.message ?? String(error) });
            return null;
        }
    };
    for (const uid of [...ctx.created.videos]) {
        if (keep || ctx.retained.has(uid)) report.videos.push({ uid, action: 'kept' });
        else report.videos.push({ uid, status: await attempt('video', uid, () => deleteVideo(ctx, uid)) });
    }
    for (const id of [...ctx.created.keys]) {
        if (keep || ctx.retained.has(id)) {
            report.keys.push({ id, action: 'kept' });
            continue;
        }
        const status = await attempt('key', id, async () => {
            const response = await ctx.api.deleteKey(id);
            if ([200, 204, 404].includes(response.status)) await trackDelete(ctx, 'keys', id);
            return response.status;
        });
        report.keys.push({ id, status });
    }
    if (ctx.created.webhook) {
        if (keep) report.webhook = { action: 'kept' };
        else {
            report.webhook = {
                status: await attempt('webhook', 'account', async () => {
                    const response = await ctx.api.deleteWebhook();
                    if ([200, 204, 404].includes(response.status)) {
                        ctx.created.webhook = false;
                        ctx.ledger.webhook = false;
                        await saveLedger(ctx);
                    }
                    return response.status;
                }),
            };
        }
    }
    report.left_on_provider = {
        videos: [...ctx.ledger.videos],
        keys: [...ctx.ledger.keys],
        owner_keys: [...ctx.ledger.ownerKeys],
        webhook: ctx.ledger.webhook,
    };
    return report;
}

// ---------------------------------------------------------------- uploads

async function createUpload(ctx, { length, metadata, allowConcurrent = false }) {
    if (!allowConcurrent) {
        if (ctx.created.videos.size > 0) throw new Error('one_video_at_a_time');
        if (ctx.ledger.videos.size > 0 && !ctx.opts['allow-existing-video']) {
            throw new Error('ledger_has_live_video_run_cleanup_or_pass_allow_existing_video');
        }
    }
    const response = await ctx.api.createUpload(length, encodeUploadMetadata(metadata));
    const result = {
        status: response.status,
        header_names: [...response.headers.keys()].sort(),
        sent_metadata_keys: metadata.map(([key]) => key),
        body: response.body,
    };
    if (response.status < 200 || response.status > 299) return result;
    // Track the reservation before anything else can fail, so cleanup deletes it.
    const uid = response.headers.get('stream-media-id');
    if (!uid || !/^[0-9a-f]{32}$/.test(uid)) throw new Error('stream_upload_create_without_uid_check_dashboard');
    await trackCreate(ctx, 'videos', uid);
    if (response.status !== 201) throw new Error(`stream_upload_create_unexpected_${response.status}`);
    const location = response.headers.get('location');
    if (!location) throw new Error('stream_upload_create_without_location');
    const uploadUrl = new URL(location, API_BASE).toString();
    ctx.scrubber.register(location, '<TUS_URL>');
    ctx.scrubber.register(uploadUrl, '<TUS_URL>');
    if (!isCloudflareHost(uploadUrl)) throw new Error('stream_upload_location_unexpected_host');
    ctx.log(`created upload ${uid} (${metadata.find(([key]) => key === 'name')?.[1] ?? ''})`);
    return { ...result, uid, upload_url: uploadUrl, upload_host: new URL(uploadUrl).host, created_ms: ctx.now() };
}

async function uploadFile(ctx, { file, name, maxDuration, expiry, extraMetadata = [], bytesLimit }) {
    const { size } = await stat(file);
    const created = await createUpload(ctx, {
        length: size,
        metadata: buildMetadata({ maxDuration: maxDuration ?? ctx.maxDuration, name, expiry, file, extra: extraMetadata }),
    });
    if (created.status !== 201) throw new Error(`stream_upload_create_failed_${created.status}`);
    const limit = Math.min(size, bytesLimit ?? size);
    const handle = await open(file, 'r');
    let offset = 0;
    let patches = 0;
    let resumes = 0;
    try {
        while (offset < limit) {
            const length = Math.min(CHUNK_BYTES, limit - offset);
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buffer, 0, length, offset);
            const result = await patchChunk(ctx, created.upload_url, offset, buffer.subarray(0, bytesRead));
            if (result.resumed) resumes += 1;
            offset = result.offset;
            patches += 1;
        }
    } finally {
        await handle.close();
    }
    ctx.log(`uploaded ${offset}/${size} bytes to ${created.uid} in ${patches} PATCH (${resumes} HEAD resume)`);
    return { ...created, file_bytes: size, sent_bytes: offset, patches, head_resumes: resumes, last_patch_ms: ctx.now() };
}

async function sendPatch(ctx, uploadUrl, offset, bytes) {
    return ctx.api.tus(uploadUrl, {
        method: 'PATCH',
        headers: {
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
        },
        body: bytes,
        timeoutMs: 15 * 60_000,
    });
}

// One PATCH; on a transport error or a 5xx/409, read the offset with HEAD and
// resend the rest of the chunk once from there.
async function patchChunk(ctx, uploadUrl, offset, bytes) {
    let response = null;
    let transportError = null;
    try {
        response = await sendPatch(ctx, uploadUrl, offset, bytes);
    } catch (error) {
        if (ctx.signal.aborted) throw error;
        transportError = error;
    }
    const retryable = transportError || response.status >= 500 || response.status === 409;
    if (!retryable) {
        if (response.status !== 204) throw new Error(`tus_patch_failed_${response.status}`);
        const next = Number(response.headers.get('upload-offset'));
        if (!Number.isSafeInteger(next) || next <= offset) throw new Error('tus_patch_offset_invalid');
        return { offset: next, resumed: false };
    }
    const head = await tusHead(ctx, uploadUrl);
    const serverOffset = Number(head.upload_offset);
    if (head.status !== 200 || !Number.isSafeInteger(serverOffset) || serverOffset < offset || serverOffset > offset + bytes.length) {
        throw new Error(`tus_patch_failed_${response?.status ?? 'transport'}_resume_impossible`);
    }
    if (serverOffset === offset + bytes.length) return { offset: serverOffset, resumed: true };
    const retry = await sendPatch(ctx, uploadUrl, serverOffset, bytes.subarray(serverOffset - offset));
    if (retry.status !== 204) throw new Error(`tus_patch_failed_${retry.status}_after_resume`);
    const next = Number(retry.headers.get('upload-offset'));
    if (!Number.isSafeInteger(next) || next <= serverOffset) throw new Error('tus_patch_offset_invalid');
    return { offset: next, resumed: true };
}

async function tusHead(ctx, uploadUrl) {
    let response = await ctx.api.tus(uploadUrl, { method: 'HEAD' });
    let authRetried = false;
    if (response.status === 401 || response.status === 403) {
        response = await ctx.api.tus(uploadUrl, { method: 'HEAD', withAuth: true });
        authRetried = true;
    }
    return {
        at: iso(ctx.now()),
        status: response.status,
        auth_retry_used: authRetried,
        upload_offset: response.headers.get('upload-offset'),
        upload_length: response.headers.get('upload-length'),
        tus_resumable: response.headers.get('tus-resumable'),
        upload_expires: response.headers.get('upload-expires'),
        header_names: [...response.headers.keys()].sort(),
    };
}

async function waitVideo(ctx, uid, predicate, { timeoutMs, intervalMs = 5000, label = 'video' }) {
    const started = ctx.now();
    let last = null;
    for (;;) {
        const response = await ctx.api.getVideo(uid);
        if (response.status === 200) {
            last = response.body?.result ?? null;
            if (predicate(last)) return { video: last, at_ms: ctx.now() };
        }
        if (ctx.now() - started > timeoutMs) {
            const error = new Error(`${label}_timeout`);
            error.lastVideo = last;
            throw error;
        }
        await ctx.sleep(intervalMs);
    }
}

const isReadyOrError = (video) => video?.readyToStream === true
    || video?.status?.state === 'ready'
    || video?.status?.state === 'error';

async function resolveTestVideo(ctx, { name, waitForPct100 = false }) {
    let uid = ctx.opts.uid;
    let source = 'existing (--uid, not deleted by this run)';
    if (uid) {
        if (!/^[0-9a-f]{32}$/.test(uid)) throw new Error('option_uid_invalid');
    } else {
        const upload = await uploadFile(ctx, { file: requirePath(ctx, 'sample'), name });
        uid = upload.uid;
        source = 'uploaded by this run';
    }
    const done = await waitVideo(
        ctx,
        uid,
        (video) => video?.status?.state === 'error' || (waitForPct100 ? (pctComplete(video) ?? 0) >= 100 : isReadyOrError(video)),
        { timeoutMs: minutesOption(ctx, 'ready-timeout-minutes', 30), label: 'ready' },
    );
    if (done.video?.status?.state === 'error') throw new Error(`sample_failed_${done.video.status.errorReasonCode ?? 'unknown'}`);
    return { uid, video: done.video, source };
}

// ---------------------------------------------------------------- signing keys

function keyShape(response, key) {
    const result = response.body?.result ?? {};
    let jwk = null;
    if (typeof result.jwk === 'string') {
        try {
            const decoded = JSON.parse(Buffer.from(result.jwk, 'base64').toString('utf8'));
            jwk = {
                encoding: 'base64-json',
                fields: Object.keys(decoded).sort(),
                kty: decoded.kty ?? null,
                alg: decoded.alg ?? null,
                kid_matches_id: decoded.kid === result.id,
                has_private_exponent: 'd' in decoded,
            };
        } catch {
            jwk = { encoding: 'string-not-base64-json' };
        }
    } else if (result.jwk && typeof result.jwk === 'object') {
        jwk = { encoding: 'object', fields: Object.keys(result.jwk).sort() };
    }
    return {
        status: response.status,
        field_names: Object.keys(result).sort(),
        pem_encoding: String(result.pem).includes('-----BEGIN') ? 'pem-text' : 'base64-of-pem',
        pem_format: key.format,
        jwk,
    };
}

async function createSigningKey(ctx) {
    const response = await ctx.api.createKey();
    const result = response.body?.result;
    if (typeof result?.pem === 'string') ctx.scrubber.register(result.pem, '<PRIVATE_KEY>');
    if (typeof result?.jwk === 'string') ctx.scrubber.register(result.jwk, '<JWK>');
    // Track the key as soon as the provider reports an id, before validating the rest.
    if (response.status >= 200 && response.status <= 299 && typeof result?.id === 'string') await trackCreate(ctx, 'keys', result.id);
    if (response.status !== 200 || typeof result?.id !== 'string' || typeof result?.pem !== 'string') {
        throw new Error(`stream_key_create_failed_${response.status}`);
    }
    const key = loadSigningKey(result, ctx.scrubber);
    return { ...key, shape: keyShape(response, key) };
}

async function ensureSigningKey(ctx) {
    if (ctx.opts['signing-key-file']) {
        const raw = JSON.parse(await readFile(resolve(ctx.opts['signing-key-file']), 'utf8'));
        return { key: loadSigningKey(raw, ctx.scrubber), source: 'owner key file' };
    }
    return { key: await createSigningKey(ctx), source: 'ephemeral key created and deleted by this run' };
}

// ---------------------------------------------------------------- webhook setup

function webhookShape(response) {
    const result = response.body?.result;
    return {
        status: response.status,
        field_names: result && typeof result === 'object' ? Object.keys(result).sort() : null,
        secret_present: typeof result?.secret === 'string',
        notification_url_present: typeof result?.notificationUrl === 'string',
        errors: response.body?.errors ?? null,
    };
}

async function startWebhook(ctx) {
    const raw = ctx.opts['webhook-url'];
    if (!raw) throw new Error('webhook_url_required_start_cloudflared_tunnel_first');
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('webhook_url_invalid');
    }
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new Error('webhook_url_must_be_public_https');
    }
    if (url.pathname === '/') url.pathname = '/stream-webhook';
    const notificationUrl = url.toString();
    const receiver = createWebhookReceiver({
        now: ctx.now,
        sleep: ctx.sleep,
        onDelivery: async (record, body) => {
            await ctx.out.json(`${ctx.proofDir}/webhooks/${String(record.n).padStart(3, '0')}.json`, { record, body });
            ctx.log(`webhook #${record.n} ${record.uid ?? '?'} state=${record.state} pct=${record.pct_complete} answered=${record.answered}`);
        },
    });
    const server = await ctx.listen(intOption(ctx.opts['listen-port'], 8788, 'listen-port'), receiver.handle);
    ctx.servers.push(server);
    ctx.log(`webhook listener on 127.0.0.1:${server.port}; tunnel must forward ${notificationUrl} to it`);
    const before = await ctx.api.getWebhook();
    const existing = before.body?.result?.notificationUrl ?? null;
    if (before.status === 200 && existing && existing !== notificationUrl && !ctx.opts['replace-webhook']) {
        throw new Error('webhook_slot_in_use_pass_replace_webhook');
    }
    const put = await ctx.api.putWebhook(notificationUrl);
    const secret = put.body?.result?.secret;
    if (typeof secret === 'string') ctx.scrubber.register(secret, '<WEBHOOK_SECRET_A>');
    // Any 2xx means the slot is now ours: track it before validating the body.
    if (put.status >= 200 && put.status <= 299) {
        ctx.created.webhook = true;
        ctx.ledger.webhook = true;
        await saveLedger(ctx);
    }
    if (put.status !== 200 || typeof secret !== 'string') throw new Error(`stream_webhook_put_failed_${put.status}`);
    receiver.addSecret('A', secret);
    return {
        receiver,
        notificationUrl,
        secret,
        before: { ...webhookShape(before), slot_had_other_url: Boolean(existing && existing !== notificationUrl) },
        put: webhookShape(put),
    };
}

// ---------------------------------------------------------------- manifests

function variantKey(variant) {
    return `${variant.kind}:${variant.resolution ?? variant.name ?? variant.index}`;
}

async function snapshotManifests(ctx, { video, uid, key, dir, write = true }) {
    const fetchedMs = ctx.now();
    const { token } = mintToken(key, { uid, ttlSeconds: ctx.tokenTtl, nowMs: fetchedMs });
    const hlsUrl = credentialUrl(video.playback.hls, uid, token);
    const master = await ctx.api.playback(hlsUrl);
    if (write) await ctx.out.write(`${dir}/master.m3u8`, master.text ?? '');
    const summary = {
        fetched_at: iso(fetchedMs),
        playback_hosts: { hls: hostOf(video.playback?.hls), dash: hostOf(video.playback?.dash) },
        master: { status: master.status, content_type: master.content_type },
        variants: [],
        dash: null,
    };
    if (master.status === 200) {
        const parsed = parseMasterPlaylist(master.text);
        Object.assign(summary.master, {
            is_extm3u: parsed.is_extm3u,
            tags: parsed.tags,
            ext_x_media: parsed.media.map((media) => ({
                type: media.TYPE ?? null,
                group_id: media['GROUP-ID'] ?? null,
                name: media.NAME ?? null,
                language: media.LANGUAGE ?? null,
                default: media.DEFAULT ?? null,
                has_uri: Boolean(media.URI),
                uri: media.URI ? describeMediaUri(media.URI, hlsUrl, uid) : null,
            })),
            stream_inf: parsed.streams.map((stream) => ({
                bandwidth: stream.attributes.BANDWIDTH ? Number(stream.attributes.BANDWIDTH) : null,
                average_bandwidth: stream.attributes['AVERAGE-BANDWIDTH'] ? Number(stream.attributes['AVERAGE-BANDWIDTH']) : null,
                resolution: stream.attributes.RESOLUTION ?? null,
                codecs: stream.attributes.CODECS ?? null,
                frame_rate: stream.attributes['FRAME-RATE'] ?? null,
                audio_group: stream.attributes.AUDIO ?? null,
                uri: stream.uri ? describeMediaUri(stream.uri, hlsUrl, uid) : null,
            })),
            iframe_streams: parsed.iframes.length,
        });
        const entries = [
            ...parsed.media.filter((media) => media.URI).map((media) => ({
                kind: `media-${String(media.TYPE ?? 'unknown').toLowerCase()}`,
                uri: media.URI,
                resolution: null,
                name: media.NAME ?? null,
            })),
            ...parsed.streams.filter((stream) => stream.uri).map((stream) => ({
                kind: 'video',
                uri: stream.uri,
                resolution: stream.attributes.RESOLUTION ?? null,
                name: null,
            })),
        ];
        for (const [index, entry] of entries.entries()) {
            const variantUrl = new URL(entry.uri, hlsUrl).toString();
            const response = await ctx.api.playback(variantUrl);
            const file = `variant-${index}-${entry.kind}${entry.resolution ? `-${entry.resolution}` : ''}.m3u8`;
            if (write) await ctx.out.write(`${dir}/${file}`, response.text ?? '');
            const item = { index, kind: entry.kind, resolution: entry.resolution, name: entry.name, file: write ? file : null, status: response.status };
            if (response.status === 200) {
                const media = parseMediaPlaylist(response.text);
                Object.assign(item, {
                    classification: media.endlist ? 'listed-with-endlist' : 'listed-without-endlist',
                    tags: media.tags,
                    target_duration: media.target_duration,
                    version: media.version,
                    playlist_type: media.playlist_type,
                    endlist: media.endlist,
                    segment_count: media.segment_count,
                    map: media.map_uri ? describeMediaUri(media.map_uri, variantUrl, uid) : null,
                    first_segment: media.segments[0] ? describeMediaUri(media.segments[0], variantUrl, uid) : null,
                });
            } else {
                item.classification = `listed-${response.status}`;
            }
            summary.variants.push(item);
        }
    }
    if (video.playback?.dash) {
        const dash = await ctx.api.playback(credentialUrl(video.playback.dash, uid, token));
        if (write) await ctx.out.write(`${dir}/manifest.mpd`, dash.text ?? '');
        summary.dash = { status: dash.status, content_type: dash.content_type, ...(dash.status === 200 ? parseDash(dash.text) : {}) };
    }
    summary.all_variants_complete = summary.variants.length > 0
        && summary.variants.every((variant) => variant.classification === 'listed-with-endlist');
    return summary;
}

export function compareSnapshots(atReady, later) {
    if (!atReady || !later) return null;
    const readyKeys = new Set(atReady.variants.map(variantKey));
    return {
        classification_at_ready: Object.fromEntries(atReady.variants.map((variant) => [variantKey(variant), variant.classification])),
        classification_later: Object.fromEntries(later.variants.map((variant) => [variantKey(variant), variant.classification])),
        absent_at_ready: later.variants.map(variantKey).filter((key) => !readyKeys.has(key)),
    };
}

function renditionSet(video, snapshot) {
    if (!snapshot) return null;
    return {
        source: video?.input ?? null,
        stream_inf_resolutions: (snapshot.master.stream_inf ?? []).map((stream) => stream.resolution),
        path_labels: snapshot.variants
            .filter((variant) => variant.kind === 'video')
            .map((variant) => ({ resolution: variant.resolution, path_label: variant.first_segment?.path_label ?? null })),
    };
}

async function observeProcessing(ctx, { receiver, key, upload, dir, timeoutMs }) {
    const uid = upload.uid;
    const timeline = {
        upload_created_at: iso(upload.created_ms),
        last_patch_at: iso(upload.last_patch_ms),
    };
    const ready = await receiver.waitFor(
        (delivery) => delivery.uid === uid
            && delivery.answered === 200
            && (delivery.ready_to_stream === true || delivery.state === 'ready' || delivery.state === 'error'),
        { timeoutMs, label: 'ready_webhook' },
    );
    timeline.ready_webhook_at = ready.received_at;
    timeline.ready_webhook_after_last_patch_ms = ready.received_ms - upload.last_patch_ms;
    timeline.ready_webhook_pct_complete = ready.pct_complete;
    if (ready.state === 'error') return { outcome: 'error', uid, error_reason_code: ready.error_reason_code, timeline };

    // The webhook body carries the full video object; fall back to a GET only
    // if it lacks playback URLs, so the snapshot is taken as close as possible.
    const webhookVideo = receiver.body(ready.n);
    const readyVideo = webhookVideo?.playback?.hls ? webhookVideo : (await ctx.api.getVideo(uid)).body?.result;
    timeline.ready_snapshot_source = webhookVideo?.playback?.hls ? 'webhook body' : 'GET after webhook';
    const atReady = await snapshotManifests(ctx, { video: readyVideo, uid, key, dir: `${dir}/at-ready-webhook` });
    const readyGet = await ctx.api.getVideo(uid);
    let atPct = null;
    let videoAtPct = null;
    let complete = atReady.all_variants_complete ? { at_ms: ready.received_ms, snapshot: atReady } : null;
    let lastProbe = ctx.now();
    const started = ctx.now();
    while (!(atPct && complete)) {
        if (ctx.now() - started > timeoutMs) {
            timeline.timed_out = true;
            break;
        }
        await ctx.sleep(5000);
        if (!atPct) {
            const response = await ctx.api.getVideo(uid);
            const video = response.body?.result;
            if ((pctComplete(video) ?? 0) >= 100) {
                videoAtPct = video;
                timeline.pct100_at = iso(ctx.now());
                timeline.pct100_after_last_patch_ms = ctx.now() - upload.last_patch_ms;
                atPct = await snapshotManifests(ctx, { video, uid, key, dir: `${dir}/at-pct-100` });
                if (!complete && atPct.all_variants_complete) complete = { at_ms: ctx.now(), snapshot: atPct };
            }
        }
        if (!complete && ctx.now() - lastProbe >= 15_000) {
            lastProbe = ctx.now();
            const probe = await snapshotManifests(ctx, { video: readyVideo, uid, key, dir: null, write: false });
            if (probe.all_variants_complete) {
                complete = {
                    at_ms: ctx.now(),
                    snapshot: await snapshotManifests(ctx, { video: readyVideo, uid, key, dir: `${dir}/all-renditions-complete` }),
                };
            }
        }
    }
    if (complete) {
        timeline.all_renditions_complete_at = iso(complete.at_ms);
        timeline.all_renditions_complete_after_last_patch_ms = complete.at_ms - upload.last_patch_ms;
    }
    const later = atPct ?? complete?.snapshot ?? null;
    return {
        outcome: 'ready',
        uid,
        timeline,
        video_at_ready_webhook: summarizeVideo(readyVideo),
        video_get_after_ready: summarizeVideo(readyGet.body?.result),
        video_at_pct100: summarizeVideo(videoAtPct),
        manifests: { at_ready_webhook: atReady, at_pct_100: atPct, all_renditions_complete: complete?.snapshot ?? null },
        comparison: compareSnapshots(atReady, later),
        rendition_set: renditionSet(videoAtPct ?? readyVideo, later),
    };
}

function collectHosts(samples) {
    const hosts = new Set();
    for (const sample of samples) {
        for (const snapshot of Object.values(sample.manifests ?? {})) {
            if (!snapshot) continue;
            Object.values(snapshot.playback_hosts).forEach((host) => host && hosts.add(host));
            (snapshot.master.ext_x_media ?? []).forEach((media) => media.uri && hosts.add(media.uri.host));
            snapshot.variants.forEach((variant) => {
                if (variant.map) hosts.add(variant.map.host);
                if (variant.first_segment) hosts.add(variant.first_segment.host);
            });
        }
    }
    return [...hosts].sort();
}

// ---------------------------------------------------------------- P1 manifests

async function cmdManifests(ctx) {
    const files = [['landscape', requirePath(ctx, 'landscape')], ['portrait', requirePath(ctx, 'portrait')]];
    for (const [, file] of files) await stat(file);
    const receipt = startReceipt(ctx, 'M0-P1', ['M1-G2', 'M2-G3']);
    receipt.samples = [];
    const webhook = await startWebhook(ctx);
    receipt.webhook = { before: webhook.before, put: webhook.put };
    const { key, source } = await ensureSigningKey(ctx);
    receipt.signing_key_source = source;
    for (const [label, file] of files) {
        const upload = await uploadFile(ctx, { file, name: `youtick-m0-p1-${label}` });
        const observed = await observeProcessing(ctx, {
            receiver: webhook.receiver,
            key,
            upload,
            dir: `p1/${label}`,
            timeoutMs: minutesOption(ctx, 'ready-timeout-minutes', 30),
        });
        receipt.samples.push({ label, file_bytes: upload.file_bytes, ...observed });
        // One video at a time: the sample is always deleted before the next upload.
        observed.delete_status = await deleteVideo(ctx, upload.uid);
    }
    receipt.hosts = collectHosts(receipt.samples);
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- P2 HEAD lifetime

function checkpointDueMs(state, checkpoint) {
    const hour = 3_600_000;
    if (checkpoint === '2h') return state.ready_ms + 2 * hour;
    if (checkpoint === '12h') return state.ready_ms + 12 * hour;
    if (checkpoint === '25h') return state.ready_ms + 25 * hour;
    const expiry = Date.parse(state.upload_expiry ?? '');
    return (Number.isFinite(expiry) ? expiry : state.created_ms + 24 * hour) + 2 * 60_000;
}

async function readP2State(ctx) {
    let text;
    try {
        text = await readFile(join(ctx.out.dir, 'p2/state.json'), 'utf8');
    } catch {
        throw new Error('p2_state_missing_run_head_lifetime_without_resume_at_first');
    }
    const state = JSON.parse(ctx.scrubber.reveal(text, '<ACCOUNT_ID>'));
    ctx.scrubber.register(state.upload_url, '<TUS_URL>');
    return state;
}

async function writeP2(ctx, state) {
    await ctx.out.writeState('p2/state.json', state);
    const { upload_url: _uploadUrl, ...publicState } = state;
    await ctx.out.json('p2/receipt.json', {
        ...baseReceipt(ctx, 'M0-P2', ['M2-G3', 'M2-G4']),
        ...publicState,
        ready_at: iso(state.ready_ms),
        checkpoint_due: Object.fromEntries(P2_CHECKPOINTS.map((checkpoint) => [checkpoint, iso(checkpointDueMs(state, checkpoint))])),
    });
}

async function runP2Checkpoint(ctx, state, checkpoint) {
    const due = checkpointDueMs(state, checkpoint);
    if (ctx.now() < due && !ctx.opts['force-early']) throw new Error(`p2_checkpoint_${checkpoint}_not_due_until_${iso(due)}`);
    const head = await tusHead(ctx, state.upload_url);
    const video = await ctx.api.getVideo(state.uid);
    const entry = {
        due_at: iso(due),
        ran_at: iso(ctx.now()),
        hours_after_ready: Number(((ctx.now() - state.ready_ms) / 3_600_000).toFixed(2)),
        after_upload_expiry: state.upload_expiry ? ctx.now() > Date.parse(state.upload_expiry) : null,
        head,
        video_status: video.status,
        video_state: video.body?.result?.status?.state ?? null,
    };
    if (checkpoint === '25h') {
        if (ctx.opts.keep) entry.delete = 'kept (--keep)';
        else entry.delete_status = await deleteVideo(ctx, state.uid);
    }
    state.checkpoints[checkpoint] = entry;
    await writeP2(ctx, state);
    ctx.log(`P2 ${checkpoint}: HEAD ${head.status} offset=${head.upload_offset} length=${head.upload_length}`);
}

async function cmdHeadLifetime(ctx) {
    const resumeAt = ctx.opts['resume-at'];
    if (resumeAt) {
        if (!P2_CHECKPOINTS.includes(resumeAt)) throw new Error(`resume_at_must_be_one_of_${P2_CHECKPOINTS.join('_')}`);
        const state = await readP2State(ctx);
        await runP2Checkpoint(ctx, state, resumeAt);
        return;
    }
    const upload = await uploadFile(ctx, { file: requirePath(ctx, 'sample'), name: 'youtick-m0-p2-head' });
    const ready = await waitVideo(ctx, upload.uid, isReadyOrError, {
        timeoutMs: minutesOption(ctx, 'ready-timeout-minutes', 30),
        label: 'ready',
    });
    if (ready.video?.status?.state === 'error') throw new Error(`sample_failed_${ready.video.status.errorReasonCode}`);
    ctx.retained.add(upload.uid); // the 25 h checkpoint deletes it
    const state = {
        uid: upload.uid,
        upload_url: upload.upload_url,
        created_ms: upload.created_ms,
        ready_ms: ready.at_ms,
        ready_detected_by: 'GET poll every 5 s',
        upload_expiry: ready.video.uploadExpiry ?? null,
        upload_bytes: upload.file_bytes,
        checkpoints: { 'at-ready': { ran_at: iso(ctx.now()), head: await tusHead(ctx, upload.upload_url) } },
    };
    await writeP2(ctx, state);
    if (!ctx.opts.wait) {
        for (const checkpoint of P2_CHECKPOINTS) {
            ctx.log(`P2 next: at ${iso(checkpointDueMs(state, checkpoint))} run: npm run probe:stream -- head-lifetime --out ${ctx.out.dir} --resume-at ${checkpoint}`);
        }
        return;
    }
    for (const checkpoint of P2_CHECKPOINTS) {
        const wait = checkpointDueMs(state, checkpoint) - ctx.now();
        if (wait > 0) await ctx.sleep(wait);
        await runP2Checkpoint(ctx, state, checkpoint);
    }
}

// ---------------------------------------------------------------- P3 storage

async function storageUsage(ctx) {
    const response = await ctx.api.storageUsage();
    const result = response.body?.result ?? null;
    return {
        status: response.status,
        field_names: result && typeof result === 'object' ? Object.keys(result).sort() : null,
        result,
        minutes: Number.isFinite(result?.totalStorageMinutes) ? result.totalStorageMinutes : null,
        limit: Number.isFinite(result?.totalStorageMinutesLimit) ? result.totalStorageMinutesLimit : null,
        video_count: Number.isFinite(result?.videoCount) ? result.videoCount : null,
    };
}

async function pollStorage(ctx, predicate, { timeoutMs, intervalMs }) {
    const started = ctx.now();
    const samples = [];
    for (;;) {
        const usage = await storageUsage(ctx);
        samples.push({ elapsed_ms: ctx.now() - started, minutes: usage.minutes });
        if (predicate(usage)) return { reached: true, elapsed_ms: ctx.now() - started, samples };
        if (ctx.now() - started > timeoutMs) return { reached: false, elapsed_ms: ctx.now() - started, samples };
        await ctx.sleep(intervalMs);
    }
}

const RESERVATION_BYTES = 10 * 1024 * 1024;
const STARTER_TIER_MINUTES = 1000;
const P3_RESERVATION_SECONDS = 600;

async function cmdStorage(ctx) {
    if (!ctx.opts['allow-quota-fill']) {
        throw new Error('storage_probe_fills_prepaid_quota_pass_allow_quota_fill');
    }
    if (ctx.ledger.videos.size > 0 && !ctx.opts['allow-existing-video']) {
        throw new Error('ledger_has_live_video_run_cleanup_or_pass_allow_existing_video');
    }
    const receipt = startReceipt(ctx, 'M0-P3', ['M2-G4', 'OD3']);
    const baseline = await storageUsage(ctx);
    receipt.baseline = baseline;
    if (baseline.minutes === null || baseline.limit === null) throw new Error('storage_usage_shape_unknown');
    if ((baseline.video_count ?? 0) > 0 && !ctx.opts['allow-existing-video']) throw new Error('library_not_empty');
    const reservedMinutes = P3_RESERVATION_SECONDS / 60;
    // A reservation only counts as "released" or "dropped" after it was seen.
    const visible = () => pollStorage(ctx, (usage) => usage.minutes !== null && usage.minutes >= baseline.minutes + reservedMinutes / 2, { timeoutMs: 60_000, intervalMs: 5000 });
    const released = (usage) => usage.minutes !== null && usage.minutes <= baseline.minutes + 0.5;
    const pollRelease = (minutes) => pollStorage(ctx, released, { timeoutMs: minutes * 60_000, intervalMs: 5000 });

    // A. Reservation booked at creation, released by DELETE.
    const reservation = await createUpload(ctx, {
        length: RESERVATION_BYTES,
        metadata: buildMetadata({ maxDuration: P3_RESERVATION_SECONDS, name: 'youtick-m0-p3-release' }),
    });
    if (reservation.status !== 201) throw new Error(`stream_upload_create_failed_${reservation.status}`);
    const seenA = await visible();
    const deleteStatus = await deleteVideo(ctx, reservation.uid);
    receipt.delete_release = {
        reserved_seconds: P3_RESERVATION_SECONDS,
        reservation_visible: seenA.reached,
        visible_samples: seenA.samples,
        delete_status: deleteStatus,
        release: seenA.reached ? await pollRelease(15) : null,
    };

    // B. DELETE of a mid-upload UID (needs a sample larger than one 5 MiB chunk).
    if (ctx.opts.sample) {
        const file = requirePath(ctx, 'sample');
        const { size } = await stat(file);
        if (size > MID_UPLOAD_BYTES) {
            const partial = await uploadFile(ctx, { file, name: 'youtick-m0-p3-mid-upload', maxDuration: P3_RESERVATION_SECONDS, bytesLimit: MID_UPLOAD_BYTES });
            const head = await tusHead(ctx, partial.upload_url);
            const status = await deleteVideo(ctx, partial.uid);
            receipt.mid_upload_delete = { sent_bytes: partial.sent_bytes, head, delete_status: status, release: await pollRelease(15) };
        } else {
            receipt.mid_upload_delete = { skipped: 'sample not larger than 5 MiB' };
        }
    } else {
        receipt.mid_upload_delete = { skipped: 'no --sample given' };
    }

    // C. Reservation with tus `expiry`, never deleted until the drop is observed.
    const expiryMinutes = intOption(ctx.opts['expiry-minutes'], 10, 'expiry-minutes');
    const expiry = rfc3339(ctx.now() + expiryMinutes * 60_000);
    const expiring = await createUpload(ctx, {
        length: RESERVATION_BYTES,
        metadata: buildMetadata({ maxDuration: P3_RESERVATION_SECONDS, name: 'youtick-m0-p3-expiry', expiry }),
    });
    if (expiring.status !== 201) throw new Error(`stream_upload_create_failed_${expiring.status}`);
    const createdMs = ctx.now();
    const expiringVideo = await ctx.api.getVideo(expiring.uid);
    const seenC = await visible();
    receipt.expiry_without_delete = {
        sent_expiry: expiry,
        upload_expiry_echoed: expiringVideo.body?.result?.uploadExpiry ?? null,
        max_duration_echoed: expiringVideo.body?.result?.maxDurationSeconds ?? null,
        reservation_visible: seenC.reached,
        visible_samples: seenC.samples,
    };
    if (seenC.reached) {
        const drop = await pollStorage(ctx, released, { timeoutMs: (expiryMinutes + 20) * 60_000, intervalMs: 30_000 });
        Object.assign(receipt.expiry_without_delete, {
            dropped_without_delete: drop.reached,
            drop_after_create_ms: drop.reached ? ctx.now() - createdMs : null,
            drop_relative_to_expiry_ms: drop.reached ? ctx.now() - Date.parse(expiry) : null,
            samples: drop.samples,
        });
    } else {
        receipt.expiry_without_delete.dropped_without_delete = null;
    }
    const afterExpiry = await ctx.api.getVideo(expiring.uid);
    receipt.expiry_without_delete.get_after_window = { status: afterExpiry.status, video: summarizeVideo(afterExpiry.body?.result) };
    receipt.expiry_without_delete.cleanup_delete_status = await deleteVideo(ctx, expiring.uid);

    // D. Exhaustion: fill only up to the tier, then one reservation past it.
    const tier = await storageUsage(ctx);
    if (tier.limit === null || tier.limit > STARTER_TIER_MINUTES) {
        receipt.exhaustion = { skipped: `limit ${tier.limit} is not the ${STARTER_TIER_MINUTES}-minute Starter tier; fill refused` };
        receipt.final_usage = tier;
        return finish(ctx, receipt);
    }
    const fill = [];
    receipt.exhaustion = { attempts: fill };
    let exhaustion = null;
    try {
        for (let attempt = 0; attempt < 6 && !exhaustion; attempt += 1) {
            const usage = await storageUsage(ctx);
            const remainingSeconds = Math.floor((usage.limit - usage.minutes) * 60);
            const overshoot = remainingSeconds < MAX_RESERVATION_SECONDS;
            const seconds = overshoot ? Math.max(60, remainingSeconds + 60) : MAX_RESERVATION_SECONDS;
            const created = await createUpload(ctx, {
                length: RESERVATION_BYTES,
                metadata: buildMetadata({ maxDuration: seconds, name: `youtick-m0-p3-fill-${attempt}` }),
                allowConcurrent: true,
            });
            const entry = {
                attempt,
                requested_seconds: seconds,
                minutes_before: usage.minutes,
                limit: usage.limit,
                exceeds_tier: overshoot,
                status: created.status,
                body: created.status === 201 ? null : created.body,
                uid: created.uid ?? null,
            };
            fill.push(entry);
            if (created.status !== 201) {
                exhaustion = entry;
            } else if (overshoot) {
                // The API accepted the over-tier reservation: does the upload itself fail?
                const patch = await sendPatch(ctx, created.upload_url, 0, Buffer.alloc(MID_UPLOAD_BYTES));
                entry.over_tier_patch = { status: patch.status, upload_offset: patch.headers.get('upload-offset') };
                if (patch.status !== 204) exhaustion = { ...entry, refused_at: 'patch' };
                const extra = await createUpload(ctx, {
                    length: RESERVATION_BYTES,
                    metadata: buildMetadata({ maxDuration: 60, name: 'youtick-m0-p3-fill-extra' }),
                    allowConcurrent: true,
                });
                const extraEntry = {
                    attempt: `${attempt}-extra`,
                    requested_seconds: 60,
                    exceeds_tier: true,
                    status: extra.status,
                    body: extra.status === 201 ? null : extra.body,
                    uid: extra.uid ?? null,
                };
                fill.push(extraEntry);
                if (!exhaustion && extra.status !== 201) exhaustion = extraEntry;
                break;
            }
        }
    } finally {
        for (const entry of fill) if (entry.uid) entry.delete_status = await deleteVideo(ctx, entry.uid);
    }
    Object.assign(receipt.exhaustion, {
        observed: Boolean(exhaustion),
        refused_at: exhaustion ? (exhaustion.refused_at ?? 'create') : null,
        response: exhaustion ? { status: exhaustion.refused_at === 'patch' ? exhaustion.over_tier_patch.status : exhaustion.status, body: exhaustion.body } : null,
        over_tier_reservation_accepted_at_creation: fill.some((entry) => entry.exceeds_tier && entry.status === 201),
        release_after_delete: await pollRelease(15),
    });
    receipt.final_usage = await storageUsage(ctx);
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- P4 webhooks

function findMetaKey(meta, value) {
    if (!meta || typeof meta !== 'object') return null;
    for (const [key, entry] of Object.entries(meta)) {
        if (entry === value) return key;
        if (entry && typeof entry === 'object') {
            const nested = findMetaKey(entry, value);
            if (nested) return `${key}.${nested}`;
        }
    }
    return null;
}

const isReadyDelivery = (delivery) => delivery.ready_to_stream === true || delivery.state === 'ready' || delivery.state === 'error';

function deliveryEvidence(delivery) {
    return {
        n: delivery.n,
        received_at: delivery.received_at,
        header_time: delivery.header_time,
        state: delivery.state,
        pct_complete: delivery.pct_complete,
        body_sha256: delivery.body_sha256,
        verified_with: delivery.verified_with,
        answered: delivery.answered,
    };
}

async function readBackSecret(ctx, receiver, known, label) {
    const response = await ctx.api.getWebhook();
    const value = response.body?.result?.secret;
    const shape = { ...webhookShape(response), equals: null };
    if (typeof value === 'string') {
        const match = Object.entries(known).find(([, secret]) => secret === value);
        shape.equals = match ? match[0] : 'neither';
        if (!match) {
            // A GET secret that differs from every PUT secret may be the signing one.
            ctx.scrubber.register(value, `<WEBHOOK_SECRET_${label}>`);
            receiver.addSecret(label, value);
            known[label] = value;
        }
    }
    return shape;
}

async function cmdWebhooks(ctx) {
    const file = requirePath(ctx, 'sample');
    await stat(file);
    const failFirst = intOption(ctx.opts['fail-first'], 2, 'fail-first');
    const windowMs = minutesOption(ctx, 'retry-window-minutes', 30);
    const readyTimeout = minutesOption(ctx, 'ready-timeout-minutes', 30);
    const receipt = startReceipt(ctx, 'M0-P4', ['M2-G2', 'M2-G6']);
    const webhook = await startWebhook(ctx);
    const receiver = webhook.receiver;
    const known = { A: webhook.secret };
    receipt.get_before = webhook.before;
    receipt.put_first = webhook.put;
    receipt.get_after_put = await readBackSecret(ctx, receiver, known, 'GET1');

    let rotationUid = null;
    let rotationFailed = false;
    let targetUid = null;
    let failed = 0;
    receiver.setResponder((delivery) => {
        if (delivery.uid === rotationUid && !rotationFailed) {
            rotationFailed = true;
            return 503;
        }
        if (delivery.uid === targetUid && isReadyDelivery(delivery) && failed < failFirst) {
            failed += 1;
            return 503;
        }
        return 200;
    });

    // 1. Rotation while a retry is pending: a tiny non-video upload produces a
    //    quick delivery, which is answered 503; the secret is rotated by a PUT
    //    with the same URL before the retry arrives.
    const nonVideo = join(ctx.out.dir, 'p4', 'non-video.bin');
    await mkdir(dirname(nonVideo), { recursive: true });
    await writeFile(nonVideo, Buffer.alloc(64 * 1024, 0x5a));
    const rotationUpload = await uploadFile(ctx, { file: nonVideo, name: 'youtick-m0-p4-rotation', maxDuration: 60 });
    rotationUid = rotationUpload.uid;
    receipt.rotation = { upload_uid: rotationUid };
    try {
        const first = await receiver.waitFor((delivery) => delivery.uid === rotationUid, { timeoutMs: readyTimeout, label: 'rotation_first_delivery' });
        receipt.rotation.first_delivery = deliveryEvidence(first);
        const second = await ctx.api.putWebhook(webhook.notificationUrl);
        const secretB = second.body?.result?.secret;
        receipt.rotation.second_put = webhookShape(second);
        receipt.rotation.same_url_put_rotates_secret = typeof secretB === 'string' ? secretB !== webhook.secret : null;
        if (typeof secretB === 'string' && secretB !== webhook.secret) {
            ctx.scrubber.register(secretB, '<WEBHOOK_SECRET_B>');
            receiver.addSecret('B', secretB);
            known.B = secretB;
        }
        receipt.rotation.get_after_rotate = await readBackSecret(ctx, receiver, known, 'GET2');
        // A retry resends the same body; a later distinct event (e.g. error after
        // inprogress) is not a retry and stays only in `deliveries`.
        const retry = await receiver.waitFor(
            (delivery) => delivery.uid === rotationUid && delivery.n > first.n && delivery.body_sha256 === first.body_sha256,
            { timeoutMs: windowMs, label: 'rotation_retry' },
        );
        receipt.rotation.retry_delivery = deliveryEvidence(retry);
        receipt.rotation.retry_same_body = retry.body_sha256 === first.body_sha256;
        receipt.rotation.retry_after_s = Math.round((retry.received_ms - first.received_ms) / 1000);
        receipt.rotation.old_secret_verifies_retry = retry.verified_with.includes('A');
        receipt.rotation.new_secret_verifies_retry = retry.verified_with.includes('B');
    } catch (error) {
        receipt.rotation.wait_result = error.message;
    }
    receipt.rotation.deliveries = receiver.deliveries.filter((delivery) => delivery.uid === rotationUid).map(deliveryEvidence);
    receipt.rotation.delete_status = await deleteVideo(ctx, rotationUid);

    // 2. Retry schedule, inprogress cadence, skew and meta routing on a real video.
    const expiry = rfc3339(ctx.now() + (5 * 60 + 55) * 60_000);
    const routing = ROUTING_CANDIDATE_KEYS.map((key) => [key, `probe-${key}`]);
    const upload = await uploadFile(ctx, { file, name: 'youtick-m0-p4-webhooks', expiry, extraMetadata: routing });
    targetUid = upload.uid;
    const created = (await ctx.api.getVideo(upload.uid)).body?.result;
    receipt.upload = {
        create_status: upload.status,
        create_header_names: upload.header_names,
        sent_metadata_keys: upload.sent_metadata_keys,
        sent_expiry: expiry,
        echoed_max_duration_seconds: created?.maxDurationSeconds ?? null,
        echoed_upload_expiry: created?.uploadExpiry ?? null,
        echoed_require_signed_urls: created?.requireSignedURLs ?? null,
        meta_after_create: created?.meta ?? null,
    };
    let firstReady = null;
    try {
        firstReady = await receiver.waitFor(
            (delivery) => delivery.uid === upload.uid && isReadyDelivery(delivery),
            { timeoutMs: readyTimeout, label: 'ready_webhook' },
        );
        await receiver.waitFor(
            (delivery) => delivery.uid === upload.uid && isReadyDelivery(delivery) && delivery.answered === 200,
            { timeoutMs: windowMs, label: 'retry' },
        );
    } catch (error) {
        receipt.wait_result = error.message;
    }
    const mine = receiver.deliveries.filter((delivery) => delivery.uid === upload.uid);
    const readyDeliveries = mine.filter(isReadyDelivery);
    const inprogress = mine.filter((delivery) => delivery.state === 'inprogress');
    const firstReadyBody = firstReady ? receiver.body(firstReady.n) : null;
    const skews = receiver.deliveries.map((delivery) => delivery.skew_s).filter((value) => value !== null);
    receipt.retry = {
        fail_first: failFirst,
        window_minutes: windowMs / 60_000,
        ready_deliveries: readyDeliveries.map((delivery) => ({
            ...deliveryEvidence(delivery),
            same_body_as_first: firstReady ? delivery.body_sha256 === firstReady.body_sha256 : null,
        })),
        intervals_s: diffsSeconds(readyDeliveries),
        outcome: readyDeliveries.length === 0
            ? 'no_ready_delivery'
            : readyDeliveries.length > failed ? 'retried_until_200' : `no_retry_within_${windowMs / 60_000}_min`,
    };
    receipt.inprogress = {
        count: inprogress.length,
        pct_values: inprogress.map((delivery) => delivery.pct_complete),
        intervals_s: diffsSeconds(inprogress),
    };
    receipt.skew_s = { min: skews.length ? Math.min(...skews) : null, max: skews.length ? Math.max(...skews) : null, values: skews };
    receipt.signature = {
        signed_deliveries: receiver.deliveries.length,
        rejected: receiver.rejected,
        verified_with: receiver.deliveries.reduce((counts, delivery) => {
            const key = delivery.verified_with.join('+');
            return { ...counts, [key]: (counts[key] ?? 0) + 1 };
        }, {}),
    };
    const after = (await ctx.api.getVideo(upload.uid)).body?.result;
    receipt.meta_routing = {
        sent: Object.fromEntries(routing),
        meta_in_get: after?.meta ?? null,
        meta_in_ready_webhook: firstReadyBody?.meta ?? null,
        landed: Object.fromEntries(ROUTING_CANDIDATE_KEYS.map((key) => [key, {
            in_get_meta_as: findMetaKey(after?.meta, `probe-${key}`),
            in_webhook_meta_as: findMetaKey(firstReadyBody?.meta, `probe-${key}`),
        }])),
    };
    receipt.video_after = summarizeVideo(after);
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- P5 renewal page

export function renderRenewalPage({ ttlSeconds, renewBeforeSeconds }) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stream renewal probe</title>
<script src="${HLS_JS_URL}" integrity="${HLS_JS_INTEGRITY}" crossorigin="anonymous"></script>
<style>
:root { color-scheme: light dark; }
body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; }
video { width: 100%; max-width: 720px; background: #000; }
pre { white-space: pre-wrap; font-size: 12px; }
button { font-size: 14px; margin: 0 8px 8px 0; }
</style>
</head>
<body>
<h1>Stream renewal probe (M0-P5)</h1>
<p>Player: <b id="mode"></b>. Token lifetime ${ttlSeconds} s, renewal ${renewBeforeSeconds} s before exp. Add <code>?mode=native</code> or <code>?mode=hlsjs</code> to force a player.</p>
<p><button id="start">Start</button><button id="renew">Renew now</button></p>
<video id="video" controls playsinline muted loop></video>
<pre id="log"></pre>
<script>
(() => {
  const RENEW_BEFORE = ${renewBeforeSeconds};
  const forced = new URLSearchParams(location.search).get('mode');
  const video = document.getElementById('video');
  video.loop = true; // short clips keep playing across several renewals
  const hlsSupported = typeof window.Hls !== 'undefined' && window.Hls.isSupported();
  const mode = forced === 'native' ? 'native' : forced === 'hlsjs' ? 'hlsjs' : hlsSupported ? 'hlsjs' : 'native';
  document.getElementById('mode').textContent = mode + (window.Hls ? ' (hls.js ' + window.Hls.version + ')' : ' (hls.js not loaded)');
  const started0 = performance.now();
  const logElement = document.getElementById('log');
  let hls = null;
  let current = null;
  let renewals = 0;
  let renewTimer = null;
  let lastFragUrl = null;
  let waitingAt = null;
  let pendingRenewal = null;
  function send(type, data) {
    const entry = Object.assign({ type, mode, t_ms: Math.round(performance.now() - started0), position: Number(video.currentTime.toFixed(3)), user_agent: navigator.userAgent }, data || {});
    logElement.textContent = JSON.stringify(entry) + '\\n' + logElement.textContent;
    fetch('/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {});
  }
  async function token() {
    const response = await fetch('/token', { cache: 'no-store' });
    if (!response.ok) throw new Error('token ' + response.status);
    return response.json();
  }
  function schedule() {
    clearTimeout(renewTimer);
    const ms = Math.max(1000, (current.exp - RENEW_BEFORE) * 1000 - Date.now());
    renewTimer = setTimeout(() => renew('scheduled').catch((error) => send('renew_failed', { error: String(error) })), ms);
    send('renewal_scheduled', { in_ms: ms, exp: current.exp });
  }
  function stripQuery(url) {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  }
  async function probeSegment(kind, url) {
    try {
      const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
      send(kind, { status: response.status });
    } catch (error) {
      send(kind, { status: null, error: String(error) });
    }
  }
  ['waiting', 'stalled', 'playing', 'seeking', 'seeked', 'ended', 'pause', 'loadedmetadata'].forEach((name) => video.addEventListener(name, () => {
    if (name === 'waiting') waitingAt = performance.now();
    if (name === 'playing' && waitingAt !== null) {
      send('stall_end', { stall_ms: Math.round(performance.now() - waitingAt) });
      waitingAt = null;
    }
    if (name === 'playing' && pendingRenewal) {
      send('renewal_playing', { renewal: pendingRenewal.n, since_renewal_ms: Math.round(performance.now() - pendingRenewal.started), position_before: pendingRenewal.position });
      pendingRenewal = null;
    }
    if (name !== 'playing' && name !== 'waiting') send('media_' + name);
  }));
  video.addEventListener('error', () => send('media_error', { code: video.error && video.error.code, message: video.error && video.error.message }));
  async function start() {
    current = await token();
    send('token', { n: current.n, exp: current.exp });
    if (mode === 'hlsjs') {
      hls = new window.Hls({});
      hls.on(window.Hls.Events.ERROR, (event, data) => send('hls_error', { error_type: data.type, details: data.details, fatal: data.fatal, response_code: data.response ? data.response.code : null }));
      hls.on(window.Hls.Events.FRAG_LOADED, (event, data) => { lastFragUrl = data.frag.url; });
      hls.on(window.Hls.Events.MANIFEST_PARSED, (event, data) => send('manifest_parsed', { levels: data.levels.length }));
      hls.loadSource(current.url);
      hls.attachMedia(video);
    } else {
      video.src = current.url;
    }
    await video.play().catch((error) => send('play_rejected', { error: String(error) }));
    schedule();
  }
  async function renew(reason) {
    const position = video.currentTime;
    const old = current;
    const oldFrag = lastFragUrl;
    renewals += 1;
    const started = performance.now();
    pendingRenewal = { n: renewals, started, position };
    current = await token();
    send('renewal_start', { renewal: renewals, reason, old_exp: old.exp, new_exp: current.exp, position_before: position });
    if (mode === 'hlsjs') {
      hls.once(window.Hls.Events.MANIFEST_PARSED, () => {
        video.currentTime = position;
        video.play().catch((error) => send('play_rejected', { renewal: renewals, error: String(error) }));
        send('renewal_manifest_parsed', { renewal: renewals, since_renewal_ms: Math.round(performance.now() - started) });
      });
      hls.loadSource(current.url);
    } else {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = position;
        video.play().catch(() => {});
        send('renewal_loadedmetadata', { renewal: renewals, since_renewal_ms: Math.round(performance.now() - started) });
      }, { once: true });
      video.src = current.url;
    }
    if (oldFrag) {
      const afterExpiryMs = Math.max(0, (old.exp + 5) * 1000 - Date.now());
      setTimeout(() => {
        probeSegment('old_segment_after_old_exp', oldFrag);
        probeSegment('segment_query_stripped', stripQuery(oldFrag));
      }, afterExpiryMs);
    }
    schedule();
  }
  document.getElementById('start').addEventListener('click', () => start().catch((error) => send('start_failed', { error: String(error) })));
  document.getElementById('renew').addEventListener('click', () => renew('manual').catch((error) => send('renew_failed', { error: String(error) })));
})();
</script>
</body>
</html>
`;
}

export function summarizeBrowserLog(entries) {
    const byType = (type) => entries.filter((entry) => entry.type === type);
    const renewals = byType('renewal_start').map((start) => {
        const match = (type) => entries.find((entry) => entry.type === type && entry.renewal === start.renewal);
        return {
            renewal: start.renewal,
            mode: start.mode ?? null,
            reason: start.reason ?? null,
            position_before: start.position_before ?? null,
            manifest_or_metadata_ms: (match('renewal_manifest_parsed') ?? match('renewal_loadedmetadata'))?.since_renewal_ms ?? null,
            playing_after_ms: match('renewal_playing')?.since_renewal_ms ?? null,
        };
    });
    const stalls = byType('stall_end').map((entry) => entry.stall_ms).filter((value) => Number.isFinite(value));
    const hlsErrors = {};
    for (const entry of byType('hls_error')) {
        const key = `${entry.error_type}/${entry.details}/fatal=${entry.fatal}/http=${entry.response_code}`;
        hlsErrors[key] = (hlsErrors[key] ?? 0) + 1;
    }
    const statuses = (type) => byType(type).map((entry) => entry.status);
    return {
        modes: [...new Set(entries.map((entry) => entry.mode).filter(Boolean))],
        user_agents: [...new Set(entries.map((entry) => entry.user_agent).filter(Boolean))],
        renewals,
        stall_ms: { count: stalls.length, max: stalls.length ? Math.max(...stalls) : null, values: stalls },
        hls_errors: hlsErrors,
        media_errors: byType('media_error').map((entry) => entry.code),
        play_rejected: byType('play_rejected').length,
        old_segment_after_old_exp: statuses('old_segment_after_old_exp'),
        segment_query_stripped: statuses('segment_query_stripped'),
    };
}

async function cmdRenewalPage(ctx) {
    const renewBefore = intOption(ctx.opts['renew-before'], 30, 'renew-before');
    if (renewBefore >= ctx.tokenTtl) throw new Error('renew_before_must_be_shorter_than_token_ttl');
    const receipt = startReceipt(ctx, 'M0-P5', ['M3-G2', 'OD4']);
    const { key, source: keySource } = await ensureSigningKey(ctx);
    const { uid, video, source } = await resolveTestVideo(ctx, { name: 'youtick-m0-p5-renewal', waitForPct100: true });
    Object.assign(receipt, { hls_js: HLS_JS_URL, hls_js_integrity: HLS_JS_INTEGRITY, signing_key_source: keySource, video_source: source, uid, renew_before_seconds: renewBefore });
    const html = renderRenewalPage({ ttlSeconds: ctx.tokenTtl, renewBeforeSeconds: renewBefore });
    await ctx.out.write('p5/renewal.html', html);
    // The listener binds 127.0.0.1; the Host check also refuses DNS-rebinding
    // style requests. A tunnel host must be named with --allow-host.
    const allowedHosts = new Set(['localhost', '127.0.0.1', ...(ctx.opts['allow-host'] ? [ctx.opts['allow-host'].toLowerCase()] : [])]);
    const entries = [];
    let minted = 0;
    let refused = 0;
    const handler = async ({ method, path, headers = {}, body }) => {
        const host = String(headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
        if (!allowedHosts.has(host)) {
            refused += 1;
            return { status: 403 };
        }
        const pathname = new URL(path, 'http://127.0.0.1').pathname;
        if (method === 'GET' && (pathname === '/' || pathname === '/renewal.html')) {
            return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body: html };
        }
        if (method === 'GET' && pathname === '/token') {
            const { token, exp } = mintToken(key, { uid, ttlSeconds: ctx.tokenTtl, nowMs: ctx.now() });
            minted += 1;
            return {
                status: 200,
                headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
                body: JSON.stringify({ url: credentialUrl(video.playback.hls, uid, token), exp, ttl: ctx.tokenTtl, n: minted }),
            };
        }
        if (method === 'POST' && pathname === '/log') {
            let entry;
            try {
                entry = JSON.parse(body);
            } catch {
                return { status: 400 };
            }
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { status: 400 };
            entries.push(entry);
            await ctx.out.append('p5/browser-log.jsonl', JSON.stringify({ received_at: iso(ctx.now()), ...entry }));
            return { status: 204 };
        }
        return { status: 404 };
    };
    const server = await ctx.listen(intOption(ctx.opts.port, 8790, 'port'), handler);
    ctx.servers.push(server);
    ctx.log(`P5 page: http://127.0.0.1:${server.port}/ (hls.js) and http://127.0.0.1:${server.port}/?mode=native (iOS Safari native)`);
    ctx.log(`iPhone: cloudflared tunnel --url http://127.0.0.1:${server.port} and re-run with --allow-host <tunnel host>; stop the tunnel when done (it mints tokens for this test video)`);
    try {
        await ctx.sleep(minutesOption(ctx, 'duration-minutes', 30));
    } catch (error) {
        if (!ctx.signal.aborted) throw error;
    }
    Object.assign(receipt, {
        tokens_minted: minted,
        refused_host_requests: refused,
        browser_log_entries: entries.length,
        summary: summarizeBrowserLog(entries),
        page: 'p5/renewal.html',
        browser_log: 'p5/browser-log.jsonl',
    });
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- P6 containers

// Poll GET and, when a webhook listener runs, accept a signed ready/error
// delivery as the outcome (the error webhook carries errorReasonCode while the
// API state can lag, see the 2026-10-21 follow-up spike F4).
async function waitOutcome(ctx, uid, receiver, timeoutMs) {
    const started = ctx.now();
    let last = null;
    for (;;) {
        const delivery = receiver?.deliveries.find((entry) => entry.uid === uid && isReadyDelivery(entry));
        if (delivery) {
            const body = receiver.body(delivery.n);
            return { source: 'webhook', at_ms: delivery.received_ms, state: delivery.state, video: body };
        }
        const response = await ctx.api.getVideo(uid);
        if (response.status === 200) {
            last = response.body?.result ?? null;
            if (isReadyOrError(last)) return { source: 'GET', at_ms: ctx.now(), state: last?.status?.state ?? null, video: last };
        }
        if (ctx.now() - started > timeoutMs) return { source: 'timeout', at_ms: ctx.now(), state: last?.status?.state ?? null, video: last };
        await ctx.sleep(5000);
    }
}

async function cmdContainers(ctx) {
    const dir = requirePath(ctx, 'samples-dir');
    const receipt = startReceipt(ctx, 'M0-P6', ['M3-G1']);
    receipt.results = [];
    const receiver = ctx.opts['webhook-url'] ? (await startWebhook(ctx)).receiver : null;
    receipt.webhook_listener = Boolean(receiver);
    for (const container of CONTAINERS) {
        const file = join(dir, `container-10s.${container}`);
        try {
            await stat(file);
        } catch {
            receipt.results.push({ container, outcome: 'sample_missing' });
            continue;
        }
        const entry = { container };
        receipt.results.push(entry);
        let uid = null;
        try {
            const upload = await uploadFile(ctx, { file, name: `youtick-m0-p6-${container}` });
            uid = upload.uid;
            entry.file_bytes = upload.file_bytes;
            const done = await waitOutcome(ctx, uid, receiver, minutesOption(ctx, 'ready-timeout-minutes', 15));
            entry.outcome = done.source === 'timeout' ? 'timeout' : done.state === 'error' ? 'error' : 'ready';
            entry.outcome_source = done.source;
            entry.elapsed_after_upload_ms = done.at_ms - upload.last_patch_ms;
            entry.video = summarizeVideo(done.video);
        } catch (error) {
            entry.outcome = 'upload_failed';
            entry.error = error?.message ?? String(error);
            uid = uid ?? [...ctx.created.videos].at(-1) ?? null;
        }
        // One video at a time: always deleted before the next container.
        if (uid && ctx.created.videos.has(uid)) entry.delete_status = await deleteVideo(ctx, uid);
        ctx.log(`P6 ${container}: ${entry.outcome} ${entry.video?.error_reason_code ?? entry.error ?? ''}`);
    }
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- P7 ready timing

async function cmdReadyTiming(ctx) {
    const file = requirePath(ctx, 'sample');
    await stat(file);
    const receipt = startReceipt(ctx, 'M0-P7', ['M2-G3', 'M3-G1']);
    const webhook = await startWebhook(ctx);
    const { key, source } = await ensureSigningKey(ctx);
    const upload = await uploadFile(ctx, { file, name: 'youtick-m0-p7-ready-timing' });
    Object.assign(receipt, { uid: upload.uid, file_bytes: upload.file_bytes, patches: upload.patches, last_patch_at: iso(upload.last_patch_ms) });
    const observed = await observeProcessing(ctx, {
        receiver: webhook.receiver,
        key,
        upload,
        dir: 'p7',
        timeoutMs: minutesOption(ctx, 'ready-timeout-minutes', 90),
    });
    const inprogress = webhook.receiver.deliveries.filter((delivery) => delivery.uid === upload.uid && delivery.state === 'inprogress');
    const slowest = Math.max(
        observed.timeline?.ready_webhook_after_last_patch_ms ?? 0,
        observed.timeline?.pct100_after_last_patch_ms ?? 0,
        observed.timeline?.all_renditions_complete_after_last_patch_ms ?? 0,
    );
    Object.assign(receipt, {
        signing_key_source: source,
        ...observed,
        inprogress_webhooks: inprogress.map((delivery) => ({ received_at: delivery.received_at, pct_complete: delivery.pct_complete })),
        exceeds_verification_cycle_10_min: slowest > VERIFICATION_CYCLE_MS,
    });
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- P8 keys

async function cmdKeys(ctx) {
    const receipt = startReceipt(ctx, 'M0-P8', ['M2-G6']);
    const { uid, video, source } = await resolveTestVideo(ctx, { name: 'youtick-m0-p8-keys' });
    receipt.video_source = source;
    const listBefore = await ctx.api.listKeys();
    receipt.list_before = { status: listBefore.status, count: Array.isArray(listBefore.body?.result) ? listBefore.body.result.length : null };
    const keyA = await createSigningKey(ctx);
    const keyB = await createSigningKey(ctx);
    receipt.create_response_shape = keyA.shape;
    receipt.second_key_same_shape = JSON.stringify(keyA.shape) === JSON.stringify(keyB.shape);
    const listAfter = await ctx.api.listKeys();
    const listed = Array.isArray(listAfter.body?.result) ? listAfter.body.result : [];
    receipt.list_after = {
        status: listAfter.status,
        count: listed.length,
        entry_field_names: listed[0] ? Object.keys(listed[0]).sort() : null,
        private_material_in_list: listed.some((entry) => 'pem' in entry || 'jwk' in entry),
    };
    const master = async (key, options = {}) => {
        const { token } = mintToken(key, { uid, ttlSeconds: 300, nowMs: ctx.now(), ...options });
        return (await ctx.api.playback(credentialUrl(video.playback.hls, uid, token))).status;
    };
    receipt.overlap = { key_a_master: await master(keyA), key_b_master: await master(keyB) };
    const nowSeconds = () => Math.floor(ctx.now() / 1000);
    receipt.claims_with_key_b = {
        default_sub_kid_exp_nbf_minus_60: await master(keyB),
        without_nbf: await master(keyB, { omit: ['nbf'] }),
        without_payload_kid: await master(keyB, { omit: ['kid'] }),
        header_typ_jwt: await master(keyB, { header: { typ: 'JWT' } }),
        nbf_in_future: await master(keyB, { claims: { nbf: nowSeconds() + 600 } }),
        without_exp: await master(keyB, { omit: ['exp'] }),
        exp_over_24h: await master(keyB, { ttlSeconds: 25 * 3600 }),
    };
    const deletedAt = ctx.now();
    const deleteA = await ctx.api.deleteKey(keyA.id);
    if ([200, 204, 404].includes(deleteA.status)) await trackDelete(ctx, 'keys', keyA.id);
    const samples = [];
    let revokedAfterMs = null;
    while (ctx.now() - deletedAt <= minutesOption(ctx, 'revoke-timeout-minutes', 10)) {
        const sample = { elapsed_ms: ctx.now() - deletedAt, key_a: await master(keyA), key_b: await master(keyB) };
        samples.push(sample);
        if (sample.key_a !== 200) {
            revokedAfterMs = sample.elapsed_ms;
            break;
        }
        await ctx.sleep(10_000);
    }
    receipt.revocation = {
        delete_key_a_status: deleteA.status,
        key_a_denied_after_ms: revokedAfterMs,
        final_key_a_status: samples.at(-1)?.key_a ?? null,
        key_b_stayed_200: samples.every((sample) => sample.key_b === 200),
        samples,
    };
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- P9 thumbnails and billing

const THUMBNAIL_QUERIES = [
    ['plain', ''],
    ['time', '?time=5s'],
    ['width', '?width=320'],
    ['time_width', '?time=5s&width=320'],
    ['height', '?height=180'],
    ['fit_crop', '?fit=crop&width=200&height=200'],
];

function tally(statuses) {
    return statuses.reduce((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {});
}

async function cmdThumbnails(ctx) {
    const phase = ctx.opts['billing-phase'] ?? 'none';
    if (!['none', 'thumbnails', 'range'].includes(phase)) throw new Error('billing_phase_must_be_none_thumbnails_or_range');
    const receipt = startReceipt(ctx, 'M0-P9', ['M2-G3']);
    const { key, source: keySource } = await ensureSigningKey(ctx);
    const { uid, video, source } = await resolveTestVideo(ctx, { name: 'youtick-m0-p9-thumbnails', waitForPct100: true });
    Object.assign(receipt, { signing_key_source: keySource, video_source: source, uid });
    const thumbnailBase = video.thumbnail ?? `${new URL(video.playback.hls).origin}/${uid}/thumbnails/thumbnail.jpg`;
    const signedThumbnail = (query) => {
        const { token } = mintToken(key, { uid, ttlSeconds: ctx.tokenTtl, nowMs: ctx.now() });
        return `${credentialUrl(thumbnailBase.split('?')[0], uid, token)}${query}`;
    };
    if (ctx.opts['skip-matrix']) {
        // Billing phases run alone so the dashboard delta holds only their requests.
        receipt.matrix = 'skipped (--skip-matrix)';
    } else {
        receipt.matrix = [];
        for (const [name, query] of THUMBNAIL_QUERIES) {
            const response = await ctx.api.playback(signedThumbnail(query), { binary: true });
            receipt.matrix.push({
                name,
                query,
                status: response.status,
                content_type: response.content_type,
                bytes: response.bytes.length,
                jpeg_dimensions: jpegDimensions(response.bytes),
            });
        }
        const unsigned = await ctx.api.playback(`${thumbnailBase.split('?')[0]}?time=5s`, { binary: true });
        receipt.unsigned_with_query = { status: unsigned.status };
    }

    if (phase !== 'none') {
        const repeats = intOption(ctx.opts.repeats, 50, 'repeats');
        const windowStart = ctx.now();
        const statuses = [];
        if (phase === 'thumbnails') {
            for (let index = 0; index < repeats; index += 1) {
                statuses.push((await ctx.api.playback(signedThumbnail('?time=5s&width=320'), { binary: true })).status);
            }
        } else {
            const { token } = mintToken(key, { uid, ttlSeconds: 600, nowMs: ctx.now() });
            const hlsUrl = credentialUrl(video.playback.hls, uid, token);
            const master = parseMasterPlaylist((await ctx.api.playback(hlsUrl)).text);
            const variantUrl = new URL(master.streams[0]?.uri ?? '', hlsUrl).toString();
            const media = parseMediaPlaylist((await ctx.api.playback(variantUrl)).text);
            if (media.segments.length === 0) throw new Error('range_phase_no_segments');
            for (let index = 0; index < repeats; index += 1) {
                const segmentUrl = new URL(media.segments[index % media.segments.length], variantUrl).toString();
                const response = await ctx.api.playback(segmentUrl, { binary: true, headers: { Range: 'bytes=0-0' } });
                statuses.push(response.status);
                if (index === 0) receipt.range_first_response = { status: response.status, content_range: response.headers.get('content-range'), bytes: response.bytes.length };
            }
        }
        const windowEnd = ctx.now();
        receipt.billing = {
            phase,
            requests: repeats,
            statuses: tally(statuses),
            window_start: iso(windowStart),
            window_end: iso(windowEnd),
            compare: 'Dashboard → Stream → Analytics (minutes delivered) for this video: note the value before the run and again at least 15 minutes after window_end; the delta is attributable to this phase only if nothing else played the video.',
        };
        ctx.log(`P9 billing (${phase}): ${repeats} requests ${iso(windowStart)} → ${iso(windowEnd)}; read Stream Analytics delivered minutes for ${uid} before and after.`);
    }
    return finish(ctx, receipt);
}

// ---------------------------------------------------------------- utilities

async function cmdSigningKey(ctx) {
    const target = requirePath(ctx, 'signing-key-file');
    const realTarget = realpathExisting(target);
    if (isInside(realTarget, realpathExisting(REPO_ROOT)) || isInside(realTarget, realpathExisting(ctx.out.dir))) {
        throw new Error('signing_key_file_must_be_outside_the_repository_and_the_out_dir');
    }
    if (ctx.opts.delete) {
        const raw = JSON.parse(await readFile(target, 'utf8'));
        const response = await ctx.api.deleteKey(raw.id);
        if ([200, 204, 404].includes(response.status)) {
            ctx.ledger.ownerKeys.delete(raw.id);
            await saveLedger(ctx);
        }
        ctx.log(`deleted key ${raw.id}: ${response.status}; remove the file yourself: rm ${target}`);
        return;
    }
    // Refuse before creating anything on the provider.
    const exists = await stat(target).then(() => true, (error) => {
        if (error?.code === 'ENOENT') return false;
        throw error;
    });
    if (exists) throw new Error('signing_key_file_exists');
    await stat(dirname(target));
    const response = await ctx.api.createKey();
    const result = response.body?.result;
    if (typeof result?.pem === 'string') ctx.scrubber.register(result.pem, '<PRIVATE_KEY>');
    if (typeof result?.jwk === 'string') ctx.scrubber.register(result.jwk, '<JWK>');
    // An owner key is recorded apart from probe keys: `cleanup` never deletes it.
    if (response.status >= 200 && response.status <= 299 && typeof result?.id === 'string') {
        ctx.ledger.ownerKeys.add(result.id);
        await saveLedger(ctx);
    }
    if (response.status !== 200 || typeof result?.id !== 'string' || typeof result?.pem !== 'string') {
        throw new Error(`stream_key_create_failed_${response.status}`);
    }
    const key = loadSigningKey(result, ctx.scrubber);
    await writeFile(target, `${JSON.stringify({ id: result.id, pem: result.pem })}\n`, { mode: 0o600, flag: 'wx' });
    await ctx.out.json('keys-file/receipt.json', { ...baseReceipt(ctx, 'M0-P5-key', ['M3-G2']), key_id: result.id, shape: keyShape(response, key) });
    ctx.log(`signing key ${result.id} written to ${target} (0600). Delete later with: npm run probe:stream -- signing-key --out ${ctx.out.dir} --signing-key-file ${target} --delete`);
}

async function cmdCleanup(ctx) {
    ctx.opts.keep = false;
    for (const uid of ctx.ledger.videos) ctx.created.videos.add(uid);
    for (const id of ctx.ledger.keys) ctx.created.keys.add(id);
    ctx.created.webhook = ctx.ledger.webhook;
    ctx.log(`cleanup: ${ctx.created.videos.size} videos, ${ctx.created.keys.size} keys, webhook=${ctx.created.webhook}`);
}

export function sampleCommands() {
    const source = (size, seconds) => [
        '-hide_banner', '-y',
        '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`,
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-t', String(seconds),
    ];
    const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '128k'];
    return [
        { file: 'landscape-1080p-30s.mp4', proofs: 'P1 P2 P3 P4 P5 P8 P9', args: [...source('1920x1080', 30), ...h264, '-movflags', '+faststart'] },
        { file: 'portrait-1080x1920-30s.mp4', proofs: 'P1', args: [...source('1080x1920', 30), ...h264, '-movflags', '+faststart'] },
        { file: 'long-1080p-600s.mp4', proofs: 'P7', args: [...source('1920x1080', 600), ...h264, '-b:v', '6M', '-maxrate', '6M', '-bufsize', '12M', '-movflags', '+faststart'] },
        { file: 'container-10s.mp4', proofs: 'P6', args: [...source('1280x720', 10), ...h264, '-movflags', '+faststart'] },
        { file: 'container-10s.mov', proofs: 'P6', args: [...source('1280x720', 10), ...h264] },
        { file: 'container-10s.avi', proofs: 'P6', args: [...source('1280x720', 10), '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame', '-b:a', '128k'] },
        { file: 'container-10s.webm', proofs: 'P6', args: [...source('1280x720', 10), '-c:v', 'libvpx-vp9', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-b:a', '96k'] },
        { file: 'container-10s.wmv', proofs: 'P6', args: [...source('1280x720', 10), '-c:v', 'wmv2', '-b:v', '2M', '-c:a', 'wmav2', '-b:a', '128k'] },
        { file: 'container-10s.mkv', proofs: 'P6', args: [...source('1280x720', 10), ...h264] },
        { file: 'container-10s.flv', proofs: 'P6', args: [...source('1280x720', 10), ...h264.slice(0, -4), '-c:a', 'aac', '-ar', '44100', '-b:a', '128k'] },
    ];
}

function shellQuote(value) {
    return /^[A-Za-z0-9_./:=+,-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

async function cmdSamples(ctx) {
    const dir = join(ctx.out.dir, 'samples');
    await mkdir(dir, { recursive: true });
    for (const sample of sampleCommands()) {
        const target = join(dir, sample.file);
        ctx.log(`# ${sample.proofs}\nffmpeg ${sample.args.map(shellQuote).join(' ')} ${shellQuote(target)}`);
        if (ctx.opts.generate) {
            await new Promise((resolvePromise, reject) => {
                // Minimal environment: ffmpeg never sees the Stream credentials.
                const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' };
                const child = ctx.spawnImpl('ffmpeg', [...sample.args, target], { stdio: ['ignore', 'ignore', 'inherit'], env });
                child.on('error', reject);
                child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`ffmpeg_failed_${sample.file}_${code}`))));
            });
        }
    }
    if (!ctx.opts.generate) ctx.log('# add --generate to run these commands (writes into <out>/samples)');
}

// ---------------------------------------------------------------- CLI

const COMMANDS = {
    samples: { proofDir: 'samples', needsApi: false, run: cmdSamples, summary: 'print (or --generate) the ffmpeg sample commands' },
    manifests: { proofDir: 'p1', needsApi: true, run: cmdManifests, summary: 'P1 master/variant/DASH shape at the ready webhook and at pctComplete 100' },
    'head-lifetime': { proofDir: 'p2', needsApi: true, run: cmdHeadLifetime, summary: 'P2 tus HEAD at ready, +2 h, +12 h, after uploadExpiry, +25 h (--resume-at)' },
    storage: { proofDir: 'p3', needsApi: true, run: cmdStorage, summary: 'P3 storage-usage shape, reservation release, expiry drop, exhaustion (--allow-quota-fill)' },
    webhooks: { proofDir: 'p4', needsApi: true, run: cmdWebhooks, summary: 'P4 webhook GET/secret, rotation by PUT, retries after 503, inprogress, skew, meta keys' },
    'renewal-page': { proofDir: 'p5', needsApi: true, run: cmdRenewalPage, summary: 'P5 local page: hls.js 1.6.16 and native renewal at the token lifetime' },
    containers: { proofDir: 'p6', needsApi: true, run: cmdContainers, summary: 'P6 mp4 mov avi webm wmv mkv flv ingest, one at a time' },
    'ready-timing': { proofDir: 'p7', needsApi: true, run: cmdReadyTiming, summary: 'P7 last PATCH → ready webhook → pctComplete 100 → all renditions complete' },
    keys: { proofDir: 'p8', needsApi: true, run: cmdKeys, summary: 'P8 key response shape, two-key overlap, claim variants, revocation of key A' },
    thumbnails: { proofDir: 'p9', needsApi: true, run: cmdThumbnails, summary: 'P9 thumbnail.jpg time/width under a path token; billing phases' },
    'signing-key': { proofDir: 'keys-file', needsApi: true, run: cmdSigningKey, summary: 'create (or --delete) an owner key file outside the repository for P5' },
    cleanup: { proofDir: 'cleanup', needsApi: true, run: cmdCleanup, summary: 'delete every video, key and webhook still listed in <out>/ledger.json' },
};

const OPTIONS = {
    out: { type: 'string' },
    'dry-run': { type: 'boolean' },
    keep: { type: 'boolean' },
    help: { type: 'boolean' },
    'webhook-url': { type: 'string' },
    'listen-port': { type: 'string' },
    'replace-webhook': { type: 'boolean' },
    landscape: { type: 'string' },
    portrait: { type: 'string' },
    sample: { type: 'string' },
    'samples-dir': { type: 'string' },
    uid: { type: 'string' },
    'signing-key-file': { type: 'string' },
    delete: { type: 'boolean' },
    'max-duration': { type: 'string' },
    'token-ttl': { type: 'string' },
    'renew-before': { type: 'string' },
    port: { type: 'string' },
    'duration-minutes': { type: 'string' },
    'resume-at': { type: 'string' },
    wait: { type: 'boolean' },
    'force-early': { type: 'boolean' },
    'allow-quota-fill': { type: 'boolean' },
    'allow-existing-video': { type: 'boolean' },
    'expiry-minutes': { type: 'string' },
    'fail-first': { type: 'string' },
    'retry-window-minutes': { type: 'string' },
    'ready-timeout-minutes': { type: 'string' },
    'revoke-timeout-minutes': { type: 'string' },
    'billing-phase': { type: 'string' },
    repeats: { type: 'string' },
    generate: { type: 'boolean' },
    'allow-host': { type: 'string' },
    'skip-matrix': { type: 'boolean' },
};

export const USAGE = `Usage: npm run probe:stream -- <subcommand> --out <dir> [options]

Owner-run M0 proof round against the second Cloudflare account. Every live
subcommand writes to the provider and needs ${MUTATION_GATE}=true plus
STREAM_ACCOUNT_ID and STREAM_API_TOKEN in this shell's environment (never read
from files). --dry-run and --help need none of them.

Subcommands:
${Object.entries(COMMANDS).map(([name, command]) => `  ${name.padEnd(14)} ${command.summary}`).join('\n')}

Common options:
  --out <dir>            required; receipts and verbatim (scrubbed) playlists go here
  --dry-run              print the request plan, no network calls
  --keep                 do not delete what this run created (multi-video proofs still delete between videos)
  --webhook-url <url>    public https URL of: cloudflared tunnel --url http://127.0.0.1:<listen-port>
  --listen-port <n>      local webhook listener port (default 8788)
  --signing-key-file <f> JSON {"id","pem"} outside the repository; otherwise an ephemeral key is created and deleted
  --max-duration <s>     maxDurationSeconds for uploads (default ${DEFAULT_MAX_DURATION_SECONDS})
  --token-ttl <s>        viewer token lifetime (default ${DEFAULT_TOKEN_TTL_SECONDS})
  --uid <uid>            reuse an existing video (renewal-page, keys, thumbnails); it is not deleted
  --allow-existing-video proceed although <out>/ledger.json lists a live video
  --allow-host <host>    renewal-page: also accept this Host header (the tunnel host for iOS)
  --skip-matrix          thumbnails: billing phase only, no status matrix
`;

// Options a live run would refuse without; the dry run checks them too.
export function missingOptions(sub, opts) {
    const missing = [];
    const need = (name) => {
        if (!opts[name]) missing.push(`--${name}`);
    };
    if (sub === 'manifests') ['landscape', 'portrait', 'webhook-url'].forEach(need);
    if (sub === 'head-lifetime' && !opts['resume-at']) need('sample');
    if (sub === 'head-lifetime' && opts['resume-at'] && !P2_CHECKPOINTS.includes(opts['resume-at'])) missing.push(`--resume-at ${P2_CHECKPOINTS.join('|')}`);
    if (sub === 'storage') need('allow-quota-fill');
    if (sub === 'webhooks') ['sample', 'webhook-url'].forEach(need);
    if (sub === 'ready-timing') ['sample', 'webhook-url'].forEach(need);
    if (sub === 'containers') need('samples-dir');
    if (['renewal-page', 'keys', 'thumbnails'].includes(sub) && !opts.uid) need('sample');
    if (sub === 'signing-key') need('signing-key-file');
    return missing;
}

const W = 'WRITE';

export function planFor(sub, opts) {
    const api = '/client/v4/accounts/<ACCOUNT_ID>/stream';
    const cap = opts['max-duration'] ?? DEFAULT_MAX_DURATION_SECONDS;
    const playback = 'customer-<CUSTOMER_CODE>.cloudflarestream.com/<JWT>';
    const upload = (name, extra = '') => [
        ['POST', `${api}?direct_user=true`, `tus create "${name}" maxDurationSeconds=${cap} requiresignedurls${extra}`, W],
        ['PATCH', 'upload.cloudflarestream.com/<TUS_URL>', '32 MiB chunks until Upload-Length', W],
    ];
    const deleteVideoStep = ['DELETE', `${api}/<UID>`, 'delete the video', W];
    const poll = (what) => ['GET', `${api}/<UID>`, `poll every 5 s until ${what}`];
    const webhook = [
        ['LISTEN', `127.0.0.1:${opts['listen-port'] ?? 8788}`, `local signed listener; owner runs cloudflared tunnel --url http://127.0.0.1:${opts['listen-port'] ?? 8788}`],
        ['GET', `${api}/webhook`, 'read the account webhook slot (refuses if another URL is set, unless --replace-webhook)'],
        ['PUT', `${api}/webhook`, '{notificationUrl: --webhook-url}', W],
    ];
    const webhookDelete = ['DELETE', `${api}/webhook`, 'remove the webhook (cleanup)', W];
    const key = opts['signing-key-file'] ? [] : [['POST', `${api}/keys`, 'ephemeral RS256 key, private half kept in memory only', W]];
    const keyDelete = opts['signing-key-file'] ? [] : [['DELETE', `${api}/keys/<KEY_ID>`, 'delete the ephemeral key (cleanup)', W]];
    const manifests = (phase) => [
        ['GET', `${playback}/manifest/video.m3u8`, `master at ${phase}`],
        ['GET', `${playback}/manifest/<variant>.m3u8`, `every listed variant and audio playlist at ${phase}`],
        ['GET', `${playback}/manifest/video.mpd`, `DASH at ${phase}`],
    ];
    const testVideo = (name) => (opts.uid ? [poll('ready (existing --uid)')] : [...upload(name), poll('ready')]);
    switch (sub) {
    case 'samples':
        return sampleCommands().map((sample) => ['LOCAL', `ffmpeg … ${sample.file}`, sample.proofs]);
    case 'manifests':
        return [...webhook, ...key, ...['landscape', 'portrait'].flatMap((label) => [
            ...upload(`youtick-m0-p1-${label}`),
            ['WAIT', 'ready webhook', 'signed delivery to the local listener'],
            ...manifests('the ready webhook'),
            poll('pctComplete 100'),
            ...manifests('pctComplete 100 (and every 15 s until every variant has #EXT-X-ENDLIST)'),
            deleteVideoStep,
        ]), ...keyDelete, webhookDelete];
    case 'head-lifetime':
        return opts['resume-at']
            ? [['HEAD', 'upload.cloudflarestream.com/<TUS_URL>', `checkpoint ${opts['resume-at']} (state from <out>/p2/state.json)`], ['GET', `${api}/<UID>`, 'video state'], ...(opts['resume-at'] === '25h' ? [deleteVideoStep] : [])]
            : [...upload('youtick-m0-p2-head'), poll('ready'), ['HEAD', 'upload.cloudflarestream.com/<TUS_URL>', 'at ready; later --resume-at 2h|12h|expiry|25h (25h deletes)']];
    case 'storage':
        return [
            ['CHECK', '--allow-quota-fill', 'refuses without it; refuses when the library or ledger is not empty'],
            ['GET', `${api}/storage-usage`, 'baseline'],
            ['POST', `${api}?direct_user=true`, 'reservation maxDurationSeconds=600, no bytes', W],
            ['DELETE', `${api}/<UID>`, 'then poll storage-usage every 5 s for release latency', W],
            ...(opts.sample ? [...upload('youtick-m0-p3-mid-upload', ' (one 5 MiB PATCH only)'), ['DELETE', `${api}/<UID>`, 'mid-upload delete', W]] : []),
            ['POST', `${api}?direct_user=true`, `reservation with tus expiry = now + ${opts['expiry-minutes'] ?? 10} min`, W],
            ['GET', `${api}/storage-usage`, 'every 30 s until the reservation drops or expiry + 20 min (no DELETE before that)'],
            ['DELETE', `${api}/<UID>`, 'the expiry reservation after the observation window', W],
            ['CHECK', `${api}/storage-usage`, 'refuses the fill when the limit is not the 1,000-minute Starter tier'],
            ['POST', `${api}?direct_user=true`, 'reservations of 36000 s up to the Starter tier, then one past it (records the exhaustion status/body)', W],
            ['PATCH', 'upload.cloudflarestream.com/<TUS_URL>', 'one 5 MiB chunk on an over-tier reservation the API accepted', W],
            ['DELETE', `${api}/<UID>`, 'every fill reservation immediately after the exhaustion response', W],
        ];
    case 'webhooks':
        return [
            ...webhook,
            ['GET', `${api}/webhook`, 'does it return the secret?'],
            ...upload('youtick-m0-p4-rotation', ' (64 KiB non-video, maxDurationSeconds=60)'),
            ['WAIT', 'first delivery for it', 'answered 503 so a retry is pending'],
            ['PUT', `${api}/webhook`, 'same URL again while the retry is pending: does the secret rotate?', W],
            ['GET', `${api}/webhook`, 'read back after rotation'],
            ['WAIT', 'retry delivery', 'which secret signs it (old, new)'],
            deleteVideoStep,
            ...upload('youtick-m0-p4-webhooks', ` expiry=now+5h55m + ${ROUTING_CANDIDATE_KEYS.join(' ')}`),
            ['WAIT', 'ready webhook', `answer 503 to the first ${opts['fail-first'] ?? 2} ready deliveries, then 200; wait up to ${opts['retry-window-minutes'] ?? 30} min for retries`],
            ['GET', `${api}/<UID>`, 'meta and echoed maxDurationSeconds/uploadExpiry'],
            deleteVideoStep,
            webhookDelete,
        ];
    case 'renewal-page':
        return [
            ...key,
            ...testVideo('youtick-m0-p5-renewal'),
            ['LISTEN', `127.0.0.1:${opts.port ?? 8790}`, `serves the page, /token (mints from the key in memory) and /log; Host must be localhost/127.0.0.1${opts['allow-host'] ? ` or ${opts['allow-host']}` : ''}`],
            ['BROWSER', `${playback}/manifest/video.m3u8`, 'played by hls.js or native HLS; renewal by loadSource(newUrl) + seek'],
            ...(opts.uid ? [] : [deleteVideoStep]),
            ...keyDelete,
        ];
    case 'containers':
        return [
            ...(opts['webhook-url'] ? webhook : []),
            ...CONTAINERS.flatMap((container) => [...upload(`youtick-m0-p6-${container}`), poll(`ready or error${opts['webhook-url'] ? ' (or the signed webhook)' : ''}`), deleteVideoStep]),
            ...(opts['webhook-url'] ? [webhookDelete] : []),
        ];
    case 'ready-timing':
        return [...webhook, ...key, ...upload('youtick-m0-p7-ready-timing'), ['WAIT', 'ready webhook', ''], ...manifests('the ready webhook'), poll('pctComplete 100'), ...manifests('pctComplete 100 and every 15 s'), deleteVideoStep, ...keyDelete, webhookDelete];
    case 'keys':
        return [
            ...testVideo('youtick-m0-p8-keys'),
            ['GET', `${api}/keys`, 'list shape'],
            ['POST', `${api}/keys`, 'key A', W],
            ['POST', `${api}/keys`, 'key B', W],
            ['GET', `${playback}/manifest/video.m3u8`, 'tokens of A and B, claim variants with B'],
            ['DELETE', `${api}/keys/<KEY_A>`, 'then every 10 s: A token and B token against the master', W],
            ['DELETE', `${api}/keys/<KEY_B>`, 'cleanup', W],
            ...(opts.uid ? [] : [deleteVideoStep]),
        ];
    case 'thumbnails':
        return [
            ...key,
            ...testVideo('youtick-m0-p9-thumbnails'),
            ...(opts['skip-matrix'] ? [] : [
                ['GET', `${playback}/thumbnails/thumbnail.jpg`, THUMBNAIL_QUERIES.map(([, query]) => query || '(plain)').join(' ')],
                ['GET', 'customer-<CUSTOMER_CODE>.cloudflarestream.com/<UID>/thumbnails/thumbnail.jpg?time=5s', 'unsigned (expect 401)'],
            ]),
            ...(opts['billing-phase'] === 'thumbnails' ? [['GET', `${playback}/thumbnails/thumbnail.jpg?time=5s&width=320`, `${opts.repeats ?? 50} times, fresh token each`]] : []),
            ...(opts['billing-phase'] === 'range' ? [['GET', '<segment URL as listed>', `Range: bytes=0-0, ${opts.repeats ?? 50} times`]] : []),
            ...(opts.uid ? [] : [deleteVideoStep]),
            ...keyDelete,
        ];
    case 'signing-key':
        return opts.delete
            ? [['DELETE', `${api}/keys/<KEY_ID>`, 'key named in the file', W]]
            : [['POST', `${api}/keys`, 'write {"id","pem"} to --signing-key-file (0600, outside the repository)', W]];
    case 'cleanup':
        return [['DELETE', `${api}/<UID>`, 'each video in <out>/ledger.json', W], ['DELETE', `${api}/keys/<KEY_ID>`, 'each key in the ledger', W], ['DELETE', `${api}/webhook`, 'if the ledger says this probe set it', W]];
    default:
        return [];
    }
}

function renderPlan(sub, opts) {
    const steps = planFor(sub, opts);
    const writes = steps.filter((step) => step[3] === W).length;
    const lines = steps.map(([method, target, note, write]) => `  ${write ? '[W]' : '   '} ${method.padEnd(7)} ${target}${note ? `  — ${note}` : ''}`);
    return `stream-probe ${sub} (dry run, no network)\n${lines.join('\n')}\n  ${writes} provider write step(s) marked [W].\n`;
}

function defaultSleep(milliseconds, signal) {
    return new Promise((resolvePromise, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
        }
        const timer = setTimeout(resolvePromise, milliseconds);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error('aborted'));
        }, { once: true });
    });
}

export async function runCli(argv, deps = {}) {
    const env = deps.env ?? process.env;
    const stdout = deps.stdout ?? process.stdout;
    const stderr = deps.stderr ?? process.stderr;
    const fail = (message) => {
        stderr.write(`stream-probe: ${message}\n`);
        return 2;
    };
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    } catch (error) {
        return fail(`${error.message}\n\n${USAGE}`);
    }
    const opts = { ...parsed.values };
    const [sub, ...rest] = parsed.positionals;
    if (opts.help) {
        stdout.write(USAGE);
        return 0;
    }
    const command = COMMANDS[sub];
    if (!command || rest.length) return fail(`unknown or missing subcommand\n\n${USAGE}`);
    if (!opts.out) return fail('--out <dir> is required (use a directory outside the repository)');
    const outDir = resolve(opts.out);
    const realOut = realpathExisting(outDir);
    const realRepo = realpathExisting(REPO_ROOT);
    if (isInside(realOut, realRepo) && !isInside(realOut, join(realRepo, 'claudedocs'))) {
        return fail('--out must be outside the repository (claudedocs/ is allowed)');
    }
    const missing = missingOptions(sub, opts);
    if (missing.length) return fail(`${sub} needs ${missing.join(', ')}`);
    if (opts['dry-run']) {
        stdout.write(renderPlan(sub, opts));
        return 0;
    }
    const accountId = env.STREAM_ACCOUNT_ID;
    const apiToken = env.STREAM_API_TOKEN;
    if (command.needsApi) {
        if (env[MUTATION_GATE] !== 'true') {
            return fail(`${sub} writes to Cloudflare Stream; set ${MUTATION_GATE}=true in this shell after the per-gate approval (or use --dry-run)`);
        }
        if (!accountId || !apiToken) {
            return fail('STREAM_ACCOUNT_ID and STREAM_API_TOKEN must be set in this shell\'s environment (the probe never reads them from files)');
        }
        if (!/^[0-9a-f]{32}$/.test(accountId)) return fail('STREAM_ACCOUNT_ID must be the 32-hex Cloudflare account id');
        if (apiToken.length < 20 || /\s/.test(apiToken)) return fail('STREAM_API_TOKEN looks malformed');
    }
    const scrubber = createScrubber();
    scrubber.register(accountId, '<ACCOUNT_ID>');
    scrubber.register(apiToken, '<API_TOKEN>');
    await mkdir(outDir, { recursive: true, mode: 0o700 });
    const out = createOutput(outDir, scrubber);
    const signal = deps.signal ?? new AbortController().signal;
    const signalState = { current: signal };
    let ctx;
    try {
        ctx = {
            opts,
            out,
            scrubber,
            signal,
            now: deps.now ?? Date.now,
            sleep: deps.sleep ?? ((milliseconds) => defaultSleep(milliseconds, signalState.current)),
            listen: deps.listen ?? listenHttp,
            spawnImpl: deps.spawn ?? spawn,
            servers: [],
            proofDir: command.proofDir,
            created: { videos: new Set(), keys: new Set(), webhook: false },
            retained: new Set(),
            maxDuration: intOption(opts['max-duration'], DEFAULT_MAX_DURATION_SECONDS, 'max-duration'),
            tokenTtl: intOption(opts['token-ttl'], DEFAULT_TOKEN_TTL_SECONDS, 'token-ttl'),
            log: (line) => stdout.write(`${scrubber.scrubString(line)}\n`),
            ledger: await loadLedger(out),
        };
    } catch (error) {
        return fail(error.message);
    }
    if (command.needsApi) {
        ctx.api = createStreamApi({
            accountId,
            apiToken,
            fetchImpl: deps.fetchImpl ?? fetch,
            scrubber,
            getSignal: () => signalState.current,
        });
    }
    deps.onContext?.(ctx);
    let code = 0;
    try {
        await command.run(ctx);
    } catch (error) {
        code = 1;
        stderr.write(`stream-probe: ${scrubber.scrubString(error?.message ?? String(error))}\n`);
        try {
            await writeAbortedReceipt(ctx, error);
        } catch (writeError) {
            stderr.write(`stream-probe: aborted_receipt_failed ${scrubber.scrubString(writeError?.message ?? String(writeError))}\n`);
        }
    } finally {
        signalState.current = undefined;
        for (const server of ctx.servers) await server.close().catch(() => {});
        if (command.needsApi) {
            try {
                const report = await cleanupCreated(ctx);
                await out.json(`${ctx.proofDir}/cleanup.json`, report);
                ctx.log(`cleanup: left on provider ${JSON.stringify(report.left_on_provider)}`);
            } catch (error) {
                code = 1;
                stderr.write(`stream-probe: cleanup_failed ${scrubber.scrubString(error?.message ?? String(error))}; run: npm run probe:stream -- cleanup --out ${outDir}\n`);
            }
        }
    }
    return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const controller = new AbortController();
    const stop = () => controller.abort(new Error('interrupted'));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.exitCode = await runCli(process.argv.slice(2), { signal: controller.signal });
}
