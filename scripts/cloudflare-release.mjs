#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    readlink,
    realpath,
    rename,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { runReleaseSmoke } from './release-smoke.mjs';

const WRANGLER_VERSION = '4.90.0';
const GIT_SHA_RE = /^[a-f0-9]{40}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const VERSION_RE = /^[A-Za-z0-9-]+$/;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const RPC_PLACEHOLDER_RE = /<[^>]+>|placeholder|replace|change[-_\s]?me|todo|dummy|generic|example/i;
const GENERIC_NEAR_RPC_HOSTS = new Set(['rpc.mainnet.near.org', 'rpc.testnet.near.org']);

const TARGETS = Object.freeze({
    preview: Object.freeze({
        web: Object.freeze({ worker: 'youtick-web-preview', domain: 'preview.youtick.net' }),
        bridge: Object.freeze({
            worker: 'youtick-livepeer-bridge-preview',
            domain: 'bridge-preview.youtick.net',
        }),
    }),
    production: Object.freeze({
        web: Object.freeze({ worker: 'youtick-web', domain: 'app.youtick.net' }),
        bridge: Object.freeze({ worker: 'youtick-livepeer-bridge', domain: 'bridge.youtick.net' }),
    }),
});

const ALL_TARGETS = Object.freeze({
    preview: TARGETS.preview,
    production: TARGETS.production,
});

const BRIDGE_PUBLIC_KEYS = Object.freeze([
    'ACCESS_CONTRACT_ID',
    'ALLOWED_ORIGINS',
    'CREATOR_FEE_QUOTE_KEY_VERSION',
    'LIVEPEER_API_TOKEN_NAME',
    'LIVEPEER_BRIDGE_ENABLED',
    'LIVEPEER_CREATOR_ALLOWLIST',
    'LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS',
    'LIVEPEER_JWT_ISSUER',
    'LIVEPEER_JWT_PUBLIC_KEY',
    'LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS',
    'LIVEPEER_NEAR_CREATOR_FEE_ENABLED',
    'MULTI_ASSET_PAYMENTS_MODE',
    'MULTI_ASSET_PAYMENT_ASSET_IDS',
    'LIVEPEER_PAID_MEDIA_OPERATOR_ID',
    'LIVEPEER_PROJECT_ID',
    'MARKET_CONTRACT_ID',
    'NEAR_NETWORK',
    'NEAR_OPERATOR_ACCOUNT_ID',
    'NEAR_OPERATOR_KEY_EPOCH',
]);

const FALSE_FLAGS = Object.freeze([
    ['web', 'NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1'],
    ['web', 'NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE'],
    ['bridge', 'LIVEPEER_BRIDGE_ENABLED'],
    ['bridge', 'LIVEPEER_NEAR_CREATOR_FEE_ENABLED'],
]);

const BRIDGE_ARTIFACT_WRANGLER = [
    'name = "youtick-livepeer-bridge"',
    'main = "src/index.ts"',
    'compatibility_date = "2024-09-23"',
    'compatibility_flags = ["nodejs_compat"]',
    '',
    '[vars]',
    'LIVEPEER_BRIDGE_ENABLED = "false"',
    'LIVEPEER_NEAR_CREATOR_FEE_ENABLED = "false"',
    'MULTI_ASSET_PAYMENTS_MODE = "off"',
    'MULTI_ASSET_PAYMENT_ASSET_IDS = ""',
    '',
    '[version_metadata]',
    'binding = "CF_VERSION_METADATA"',
    '',
    '[[durable_objects.bindings]]',
    'name = "LIVEPEER_CONTROL"',
    'class_name = "LivepeerControl"',
    '',
    '[[migrations]]',
    'tag = "v1"',
    'new_sqlite_classes = ["LivepeerControl"]',
    '',
].join('\n');

function fail(message) {
    throw new Error(`cloudflare_release_${message}`);
}

function validateNearRpcUrl(value) {
    if (typeof value !== 'string' || !value || value !== value.trim()
        || /\s/u.test(value) || /\p{Cc}/u.test(value) || RPC_PLACEHOLDER_RE.test(value)) {
        fail('near_rpc_url_invalid');
    }
    let url;
    try {
        url = new URL(value);
    } catch {
        fail('near_rpc_url_invalid');
    }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
        || hostname === 'localhost' || hostname.endsWith('.localhost')
        || hostname === '127.0.0.1' || hostname === '[::1]'
        || hostname === 'example.com' || hostname.endsWith('.example.com')
        || hostname.endsWith('.example') || hostname.endsWith('.invalid')
        || GENERIC_NEAR_RPC_HOSTS.has(hostname)) {
        fail('near_rpc_url_invalid');
    }
    return value;
}

function validateOneClickApiKey(value, required) {
    if (!value) {
        if (required) fail('oneclick_api_key_missing');
        return null;
    }
    if (typeof value !== 'string' || value.length < 16 || value.length > 4096 || value !== value.trim()
        || /\s/u.test(value) || /\p{Cc}/u.test(value) || RPC_PLACEHOLDER_RE.test(value)) {
        fail('oneclick_api_key_invalid');
    }
    return value;
}

function canonicalJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function directFile(root, value, expected, label) {
    if (typeof value !== 'string' || value !== expected) fail(`${label}_path_invalid`);
    const path = resolve(root, value);
    if (dirname(path) !== root || basename(path) !== expected) fail(`${label}_path_invalid`);
    return path;
}

async function assertRegularFile(path, label) {
    let entry;
    try {
        entry = await lstat(path);
    } catch {
        fail(`${label}_missing`);
    }
    if (!entry.isFile() || entry.isSymbolicLink()) fail(`${label}_not_regular`);
    return entry;
}

async function sha256File(path) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
}

function validateRecord(record, expectedPath, label) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail(`${label}_invalid`);
    if (record.path !== expectedPath || !HASH_RE.test(record.sha256 || '')) fail(`${label}_invalid`);
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 1) fail(`${label}_invalid`);
}

async function verifyRecord(root, record, expectedPath, label) {
    validateRecord(record, expectedPath, label);
    const path = directFile(root, record.path, expectedPath, label);
    const file = await assertRegularFile(path, label);
    if (file.size !== record.bytes || await sha256File(path) !== record.sha256) {
        fail(`${label}_checksum_mismatch`);
    }
    return path;
}

function forbiddenTargetString(value) {
    if (typeof value !== 'string') return false;
    if (value.includes('*') || value === 'youtick-livepeer-bridge-c3-4ea2011') return true;
    const candidates = value.split(',').map((entry) => entry.trim());
    return candidates.some((entry) => {
        if (['youtick.net', 'www.youtick.net'].includes(entry.toLowerCase())) return true;
        try {
            const hostname = new URL(entry).hostname.toLowerCase();
            return hostname === 'youtick.net' || hostname === 'www.youtick.net';
        } catch {
            return false;
        }
    });
}

function scanForbiddenTargets(value) {
    if (typeof value === 'string' && forbiddenTargetString(value)) fail('forbidden_target');
    if (Array.isArray(value)) value.forEach(scanForbiddenTargets);
    else if (value && typeof value === 'object') Object.values(value).forEach(scanForbiddenTargets);
}

function assertExactKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_invalid`);
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        fail(`${label}_fields_invalid`);
    }
}

async function readRelease(artifactDir, target, sha) {
    const manifestPath = directFile(artifactDir, 'manifest.json', 'manifest.json', 'manifest');
    await assertRegularFile(manifestPath, 'manifest');
    const manifestText = await readFile(manifestPath, 'utf8');
    let manifest;
    try {
        manifest = JSON.parse(manifestText);
    } catch {
        fail('manifest_json_invalid');
    }
    assertExactKeys(
        manifest,
        ['schemaVersion', 'sha', 'ci', 'targets', 'lockfiles', 'configs', 'bundles'],
        'manifest',
    );
    if (manifest.schemaVersion !== 1 || manifest.sha !== sha || !GIT_SHA_RE.test(manifest.sha || '')) {
        fail('manifest_sha_invalid');
    }
    if (!sameJson(manifest.targets, ALL_TARGETS)) fail('manifest_targets_invalid');
    scanForbiddenTargets(manifest.targets);

    const configRecord = manifest.configs?.[target];
    const configName = `${target}-config.json`;
    const configPath = await verifyRecord(artifactDir, configRecord, configName, `${target}_config`);
    const webKey = target === 'preview' ? 'webPreview' : 'webProduction';
    const webName = `web-${target}.tar.gz`;
    const webArchive = await verifyRecord(artifactDir, manifest.bundles?.[webKey], webName, 'web_bundle');
    const bridgeArchive = await verifyRecord(
        artifactDir,
        manifest.bundles?.bridge,
        'bridge.tar.gz',
        'bridge_bundle',
    );

    let config;
    try {
        config = JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
        fail('target_config_json_invalid');
    }
    assertExactKeys(config, ['schemaVersion', 'environment', 'targets', 'web', 'bridge'], 'target_config');
    if (config.schemaVersion !== 1 || config.environment !== target) fail('target_config_identity_invalid');
    if (!sameJson(config.targets, TARGETS[target])) fail('target_config_targets_invalid');
    scanForbiddenTargets(config);
    for (const [section, flag] of FALSE_FLAGS) {
        if (config[section]?.[flag] !== 'false') fail(`${flag.toLowerCase()}_not_false`);
    }
    const paymentMode = config.web?.NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE;
    if (paymentMode !== config.bridge?.MULTI_ASSET_PAYMENTS_MODE
        || !['off', 'preview'].includes(paymentMode)
        || (target === 'production' && paymentMode !== 'off')) {
        fail('multi_asset_payments_mode_invalid');
    }
    assertExactKeys(config.bridge, BRIDGE_PUBLIC_KEYS, 'bridge_public_config');
    for (const [key, value] of Object.entries(config.bridge)) {
        if (typeof value !== 'string' || /[\0\r\n]/.test(value)) fail(`bridge_var_${key.toLowerCase()}_invalid`);
    }

    return {
        manifest,
        manifestHash: createHash('sha256').update(manifestText).digest('hex'),
        config,
        webArchive,
        bridgeArchive,
    };
}

async function validateWebWrangler(configPath, extractedRoot, target) {
    let config;
    try {
        config = JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
        fail('web_wrangler_json_invalid');
    }
    scanForbiddenTargets(config);
    const expected = {
        $schema: 'node_modules/wrangler/config-schema.json',
        name: 'youtick-web',
        main: '.open-next/worker.js',
        compatibility_date: '2025-03-25',
        compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
        assets: { directory: '.open-next/assets', binding: 'ASSETS' },
        preview_urls: true,
        env: {
            preview: {
                name: TARGETS.preview.web.worker,
                routes: [{ pattern: TARGETS.preview.web.domain, custom_domain: true }],
            },
            production: {
                name: TARGETS.production.web.worker,
                routes: [{ pattern: TARGETS.production.web.domain, custom_domain: true }],
            },
        },
    };
    if (!sameJson(config, expected)) fail('web_wrangler_config_invalid');
    await Promise.all([
        assertRegularFile(join(extractedRoot, '.open-next', 'worker.js'), 'web_worker'),
        stat(join(extractedRoot, '.open-next', 'assets')).then((entry) => {
            if (!entry.isDirectory()) fail('web_assets_missing');
        }),
    ]);
}

async function validateBridgeWrangler(configPath, extractedRoot) {
    const text = await readFile(configPath, 'utf8');
    if (text !== BRIDGE_ARTIFACT_WRANGLER) fail('bridge_wrangler_config_invalid');
    await assertRegularFile(join(extractedRoot, 'index.js'), 'bridge_worker');
}

export async function writeBridgeArtifactWrangler(outputPath) {
    await writeFile(resolve(outputPath), BRIDGE_ARTIFACT_WRANGLER, { flag: 'wx', mode: 0o600 });
}

async function writeSanitizedConfigs(extracted, target) {
    const expected = TARGETS[target];
    const webBootstrap = join(extracted.web, 'wrangler.bootstrap.json');
    const bridgeBootstrap = join(extracted.bridge, 'wrangler.bootstrap.toml');
    await writeFile(webBootstrap, canonicalJson({
        name: expected.web.worker,
        main: '.open-next/worker.js',
        compatibility_date: '2025-03-25',
        compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
        assets: { directory: '.open-next/assets', binding: 'ASSETS' },
        workers_dev: true,
        preview_urls: true,
    }), { mode: 0o600 });
    await writeFile(bridgeBootstrap, [
        `name = "${expected.bridge.worker}"`,
        'main = "index.js"',
        'compatibility_date = "2024-09-23"',
        'compatibility_flags = ["nodejs_compat"]',
        'workers_dev = true',
        'preview_urls = false',
        '',
        '[vars]',
        'LIVEPEER_BRIDGE_ENABLED = "false"',
        'LIVEPEER_NEAR_CREATOR_FEE_ENABLED = "false"',
        'MULTI_ASSET_PAYMENTS_MODE = "off"',
        'MULTI_ASSET_PAYMENT_ASSET_IDS = ""',
        '',
        '[version_metadata]',
        'binding = "CF_VERSION_METADATA"',
        '',
        '[[durable_objects.bindings]]',
        'name = "LIVEPEER_CONTROL"',
        'class_name = "LivepeerControl"',
        '',
        '[[migrations]]',
        'tag = "v1"',
        'new_sqlite_classes = ["LivepeerControl"]',
        '',
    ].join('\n'), { mode: 0o600 });
    return { webBootstrap, bridgeBootstrap };
}

function runProcess(command, args, { cwd, env = process.env, echo = false } = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let outputBytes = 0;
        const collect = (chunk, stream) => {
            outputBytes += chunk.length;
            if (outputBytes > MAX_OUTPUT_BYTES) {
                child.kill('SIGKILL');
                return;
            }
            if (stream === 'stdout') stdout += chunk;
            else stderr += chunk;
            if (echo) (stream === 'stdout' ? process.stdout : process.stderr).write(chunk);
        };
        child.stdout.on('data', (chunk) => collect(chunk, 'stdout'));
        child.stderr.on('data', (chunk) => collect(chunk, 'stderr'));
        child.once('error', rejectPromise);
        child.once('close', (code, signal) => {
            if (outputBytes > MAX_OUTPUT_BYTES) {
                rejectPromise(new Error(`command_output_too_large: ${basename(command)}`));
                return;
            }
            resolvePromise({ code, signal, stdout, stderr });
        });
    });
}

function successful(result, label) {
    if (result.code !== 0) {
        const detail = result.stderr.trim().split('\n').at(-1) || `exit_${result.code}`;
        fail(`${label}_failed: ${detail}`);
    }
    return result;
}

function safeArchivePath(value) {
    if (!value || /[\0\r\n\\]/.test(value) || value.startsWith('/')) return false;
    let path = value;
    while (path.startsWith('./')) path = path.slice(2);
    path = path.replace(/\/$/, '');
    if (!path) return true;
    if (posix.isAbsolute(path) || path.split('/').some((part) => !part || part === '..')) return false;
    return posix.normalize(path) === path;
}

function safeArchiveSymlink(entry, target) {
    if (!target || /[\0\r\n\\]/.test(target) || posix.isAbsolute(target)) return false;
    let path = entry;
    while (path.startsWith('./')) path = path.slice(2);
    path = path.replace(/\/$/, '');
    const resolved = posix.normalize(posix.join(posix.dirname(path), target));
    return resolved !== '..' && !resolved.startsWith('../') && !posix.isAbsolute(resolved);
}

async function inspectExtracted(root) {
    const visit = async (directory) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            const fromRoot = relative(root, path);
            if (!fromRoot || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) fail('archive_path_escape');
            const metadata = await lstat(path);
            if (metadata.isSymbolicLink()) {
                const target = await readlink(path);
                const resolved = resolve(dirname(path), target);
                const targetRelative = relative(root, resolved);
                if (isAbsolute(target) || targetRelative === '..' || targetRelative.startsWith(`..${sep}`)) {
                    fail('archive_symlink_escape');
                }
            } else if (metadata.isDirectory()) await visit(path);
            else if (!metadata.isFile()) fail('archive_special_file');
        }
    };
    await visit(root);
}

async function extractArchive(archive, destination) {
    const list = successful(await runProcess('tar', ['-tzf', archive]), 'archive_list').stdout;
    const entries = list.split('\n').filter(Boolean);
    if (!entries.length || entries.some((entry) => !safeArchivePath(entry))) fail('archive_path_invalid');
    const verbose = successful(await runProcess('tar', ['-tvzf', archive]), 'archive_verbose_list').stdout;
    const verboseEntries = verbose.split('\n').filter(Boolean);
    if (verboseEntries.length !== entries.length
        || verboseEntries.some((entry) => !['-', 'd', 'l'].includes(entry[0]))) {
        fail('archive_entry_type_invalid');
    }
    for (let index = 0; index < verboseEntries.length; index += 1) {
        if (verboseEntries[index][0] !== 'l') continue;
        const marker = verboseEntries[index].lastIndexOf(' -> ');
        if (marker < 0 || !safeArchiveSymlink(entries[index], verboseEntries[index].slice(marker + 4))) {
            fail('archive_symlink_escape');
        }
    }
    await mkdir(destination, { recursive: true });
    successful(await runProcess(
        'tar',
        ['--no-same-owner', '--no-same-permissions', '-xzf', archive, '-C', destination],
    ), 'archive_extract');
    await inspectExtracted(destination);
}

function parseEvents(text, label) {
    if (!text.trim()) return [];
    return text.trimEnd().split('\n').map((line) => {
        try {
            const event = JSON.parse(line);
            if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error();
            return event;
        } catch {
            fail(`${label}_wrangler_output_invalid`);
        }
    });
}

async function makeWranglerRunner(binary, tempRoot, { echo, label }) {
    await assertRegularFile(await realpath(binary), 'wrangler_binary');
    const version = successful(await runProcess(binary, ['--version']), 'wrangler_version').stdout;
    if (!new RegExp(`(^|\\s)${WRANGLER_VERSION.replaceAll('.', '\\.')}($|\\s)`).test(version)) {
        fail('wrangler_version_invalid');
    }
    let call = 0;
    return async (args, { cwd, allowFailure = false } = {}) => {
        call += 1;
        const outputPath = join(tempRoot, `wrangler-${label}-${call}.ndjson`);
        const childEnvironment = {
            ...process.env,
            CI: 'true',
            WRANGLER_OUTPUT_FILE_PATH: outputPath,
            WRANGLER_SEND_METRICS: 'false',
        };
        delete childEnvironment.NEAR_RPC_URL;
        delete childEnvironment.ONECLICK_API_KEY;
        const result = await runProcess(binary, args, {
            cwd,
            echo,
            env: childEnvironment,
        });
        let output = '';
        try {
            output = await readFile(outputPath, 'utf8');
        } catch {
            // Read-only commands do not emit structured output.
        }
        const response = { ...result, events: parseEvents(output, `call_${call}`), args };
        if (!allowFailure && result.code !== 0) {
            const detail = result.stderr.trim().split('\n').at(-1) || `exit_${result.code}`;
            fail(`wrangler_command_failed: ${detail}`);
        }
        return response;
    };
}

function exactBootstrapFailure(result) {
    const failures = result.events.filter((event) => event.type === 'command-failed');
    return result.code !== 0 && failures.length === 1 && failures[0].code === 10007;
}

function outputEvent(result, type) {
    const events = result.events.filter((event) => event.type === type);
    if (result.code !== 0 || events.length !== 1) fail(`${type.replaceAll('-', '_')}_output_invalid`);
    return events[0];
}

function versionId(value, label) {
    if (typeof value !== 'string' || !VERSION_RE.test(value)) fail(`${label}_version_invalid`);
    return value;
}

function parseDeployment(stdout, label) {
    let deployment;
    try {
        deployment = JSON.parse(stdout);
    } catch {
        fail(`${label}_deployment_json_invalid`);
    }
    if (!deployment || !Array.isArray(deployment.versions) || !deployment.versions.length) {
        fail(`${label}_deployment_invalid`);
    }
    return deployment.versions.map((entry) => ({
        version: versionId(entry?.version_id, label),
        percentage: entry?.percentage,
    }));
}

function assertTraffic(actual, expected, label) {
    const normalize = (traffic) => [...traffic]
        .map(({ version, percentage }) => ({ version, percentage }))
        .sort((left, right) => left.version.localeCompare(right.version));
    if (!sameJson(normalize(actual), normalize(expected))) fail(`${label}_traffic_invalid`);
}

function componentArgs(component, target, extracted, releaseConfig, sanitized, bridgeSecretsFile) {
    const expected = TARGETS[target][component];
    const config = join(extracted, component === 'web' ? 'wrangler.jsonc' : 'wrangler.toml');
    const entry = join(extracted, component === 'web' ? '.open-next/worker.js' : 'index.js');
    const base = ['--config', config, '--name', expected.worker];
    if (component === 'web') base.push('--env', target);
    const bootstrapConfig = component === 'web' ? sanitized.webBootstrap : sanitized.bridgeBootstrap;
    const bootstrapBase = ['--config', bootstrapConfig, '--name', expected.worker];
    const vars = component === 'bridge'
        ? BRIDGE_PUBLIC_KEYS.flatMap((key) => ['--var', `${key}:${releaseConfig.bridge[key]}`])
        : [];
    const uploadMode = component === 'bridge' ? ['--no-bundle'] : [];
    const secrets = component === 'bridge' ? ['--secrets-file', bridgeSecretsFile] : [];
    return {
        expected,
        config,
        entry,
        base,
        bootstrapBase,
        vars,
        uploadMode,
        secrets,
    };
}

async function currentTraffic(run, args, label, { allowFailure = false } = {}) {
    const result = await run(
        ['deployments', 'status', '--json', ...args.base],
        { cwd: dirname(args.config), allowFailure },
    );
    if (result.code !== 0) return { result, traffic: null };
    return { result, traffic: parseDeployment(result.stdout, label) };
}

async function requireTraffic(run, args, expected, label) {
    const { traffic } = await currentTraffic(run, args, label);
    assertTraffic(traffic, expected, label);
}

async function prepareComponent({ component, target, sha, run, args, bootstrapAllowed }) {
    const before = await currentTraffic(run, args, `${component}_before`, { allowFailure: true });
    if (before.traffic) {
        if (before.traffic.length !== 1 || before.traffic[0].percentage !== 100) {
            fail(`${component}_existing_deployment_not_stable`);
        }
    }

    const uploadVersion = (message, allowFailure) => run([
        'versions', 'upload', args.entry, ...args.uploadMode, ...args.base, ...args.vars, ...args.secrets,
        '--tag', sha, '--message', message,
    ], { cwd: dirname(args.config), allowFailure });
    const upload = await uploadVersion(`YouTick ${target} ${sha}`, true);

    if (upload.code === 0) {
        if (!before.traffic) fail(`${component}_previous_deployment_unverified`);
        const event = outputEvent(upload, 'version-upload');
        if (event.worker_name !== args.expected.worker) fail(`${component}_uploaded_worker_invalid`);
        return {
            component,
            previous: before.traffic[0].version,
            candidate: versionId(event.version_id, component),
            previewUrl: event.preview_url,
            bootstrap: false,
        };
    }

    if (!exactBootstrapFailure(upload) || before.traffic || !bootstrapAllowed) {
        const code = upload.events.find((event) => event.type === 'command-failed')?.code ?? 'unknown';
        fail(`${component}_upload_failed_${code}`);
    }
    const deployed = await run([
        'deploy',
        args.entry,
        ...args.uploadMode,
        ...args.bootstrapBase,
        ...args.vars,
        ...args.secrets,
        '--tag',
        sha,
        '--message',
        `YouTick ${target} bootstrap ${sha}`,
    ], { cwd: dirname(args.config) });
    const event = outputEvent(deployed, 'deploy');
    if (event.worker_name !== args.expected.worker) fail(`${component}_bootstrapped_worker_invalid`);
    const bootstrapVersion = versionId(event.version_id, component);
    const bootstrapUrl = bootstrapWorkersDevUrl(event.targets, args.expected.worker, component);
    await requireTraffic(
        run,
        args,
        [{ version: bootstrapVersion, percentage: 100 }],
        `${component}_bootstrap`,
    );
    const candidateUpload = await uploadVersion(`YouTick ${target} candidate ${sha}`, false);
    const candidateEvent = outputEvent(candidateUpload, 'version-upload');
    if (candidateEvent.worker_name !== args.expected.worker) {
        fail(`${component}_uploaded_worker_invalid`);
    }
    return {
        component,
        previous: bootstrapVersion,
        candidate: versionId(candidateEvent.version_id, component),
        previewUrl: candidateEvent.preview_url,
        bootstrapUrl,
        bootstrap: true,
    };
}

function bootstrapWorkersDevUrl(targets, worker, label) {
    if (!Array.isArray(targets) || targets.length !== 1 || typeof targets[0] !== 'string') {
        fail(`${label}_bootstrap_targets_invalid`);
    }
    let url;
    try {
        url = new URL(targets[0]);
    } catch {
        fail(`${label}_bootstrap_targets_invalid`);
    }
    const prefix = `${worker}.`;
    const suffix = '.workers.dev';
    const accountSubdomain = url.hostname.slice(prefix.length, -suffix.length);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
        || url.search || url.hash || !url.hostname.startsWith(prefix)
        || !url.hostname.endsWith(suffix) || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(accountSubdomain)) {
        fail(`${label}_bootstrap_targets_invalid`);
    }
    return url.origin;
}

function webPreviewUrl(value, worker, accountSubdomain, version) {
    let url;
    try {
        url = new URL(value);
    } catch {
        fail('web_preview_url_invalid');
    }
    const expectedHostname = `${version.slice(0, 8)}-${worker}.${accountSubdomain}.workers.dev`;
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
        || url.search || url.hash || url.hostname !== expectedHostname) {
        fail('web_preview_url_invalid');
    }
    return url.origin;
}

async function deployTraffic(run, args, traffic, message) {
    const specs = traffic.map(({ version, percentage }) => `${version}@${percentage}`);
    outputEvent(await run([
        'versions', 'deploy', ...specs, '--yes', ...args.base, '--message', message,
    ], { cwd: dirname(args.config) }), 'version-deploy');
    await requireTraffic(run, args, traffic, args.expected.worker);
}

function smokeInput(target, webUrl, override = {}) {
    const expected = TARGETS[target];
    return {
        webUrl,
        bridgeUrl: `https://${expected.bridge.domain}`,
        allowedOrigin: `https://${expected.web.domain}`,
        deniedOrigin: 'https://release-smoke.invalid',
        ...override,
    };
}

function createCloudflareApi(fetchImpl, accountId, apiToken) {
    if (typeof fetchImpl !== 'function') fail('cloudflare_fetch_invalid');
    if (!/^[a-f0-9]{32}$/.test(accountId || '') || typeof apiToken !== 'string' || !apiToken.trim()) {
        fail('cloudflare_api_credentials_invalid');
    }
    return async (path, { method = 'GET', body } = {}) => {
        let response;
        try {
            response = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        } catch {
            fail('cloudflare_api_unreachable');
        }
        let payload;
        try {
            payload = await response.json();
        } catch {
            fail('cloudflare_api_json_invalid');
        }
        if (!response.ok || payload?.success !== true || payload.result === undefined) {
            fail(`cloudflare_api_status_${response.status}`);
        }
        return payload.result;
    };
}

function validDomainRecord(record) {
    return record && typeof record.id === 'string' && VERSION_RE.test(record.id)
        && typeof record.hostname === 'string'
        && record.hostname === record.hostname.toLowerCase()
        && typeof record.service === 'string'
        && (record.environment === undefined || record.environment === 'production')
        && /^[a-f0-9]{32}$/.test(record.zone_id || '');
}

async function listDomains(api, accountId, filter, value) {
    const query = new URLSearchParams({ [filter]: value });
    const records = await api(`/accounts/${accountId}/workers/domains?${query}`);
    if (!Array.isArray(records) || records.some((record) => !validDomainRecord(record))) {
        fail('worker_domain_record_invalid');
    }
    if (records.some((record) => record[filter] !== value)) fail('worker_domain_filter_invalid');
    return records;
}

async function inspectDomainBindings(api, accountId, zoneId, target, phase) {
    const expected = TARGETS[target];
    const targetWorkers = new Set([expected.web.worker, expected.bridge.worker]);
    for (const root of ['youtick.net', 'www.youtick.net']) {
        const records = await listDomains(api, accountId, 'hostname', root);
        if (records.some((record) => targetWorkers.has(record.service)
            || record.service === 'youtick-livepeer-bridge-c3-4ea2011')) {
            fail('worker_domain_root_or_legacy_forbidden');
        }
    }

    const states = {};
    const zoneIds = new Set();
    for (const component of ['web', 'bridge']) {
        const wanted = expected[component];
        const [byHostname, byWorker] = await Promise.all([
            listDomains(api, accountId, 'hostname', wanted.domain),
            listDomains(api, accountId, 'service', wanted.worker),
        ]);
        if (!byHostname.length && !byWorker.length) {
            states[component] = 'missing';
        } else {
            if (byHostname.length !== 1 || byWorker.length !== 1
                || byHostname[0].hostname !== wanted.domain
                || byHostname[0].service !== wanted.worker
                || byWorker[0].hostname !== wanted.domain
                || byWorker[0].service !== wanted.worker
                || byHostname[0].zone_id !== zoneId
                || byWorker[0].zone_id !== zoneId) {
                fail(`${component}_worker_domain_drift`);
            }
            states[component] = 'attached';
            zoneIds.add(byHostname[0].zone_id);
        }
        if (phase === 'after' && states[component] !== 'attached') {
            fail(`${component}_worker_domain_missing`);
        }
    }
    return { states, zoneIds: [...zoneIds] };
}

async function exactTargetDomain(api, accountId, zoneId, wanted) {
    const [byHostname, byWorker] = await Promise.all([
        listDomains(api, accountId, 'hostname', wanted.domain),
        listDomains(api, accountId, 'service', wanted.worker),
    ]);
    if (!byHostname.length && !byWorker.length) return null;
    if (byHostname.length !== 1 || byWorker.length !== 1
        || byHostname[0].id !== byWorker[0].id
        || byHostname[0].hostname !== wanted.domain
        || byHostname[0].service !== wanted.worker
        || byHostname[0].zone_id !== zoneId) {
        return null;
    }
    return {
        id: byHostname[0].id,
        hostname: wanted.domain,
        service: wanted.worker,
        zone_id: zoneId,
    };
}

async function reconcileCreatedDomains(
    api, accountId, zoneId, target, beforeStates, attempted, created,
) {
    const known = new Set(created.map((domain) => domain.id));
    for (const component of ['bridge', 'web']) {
        if (beforeStates[component] !== 'missing' || !attempted.has(component)) continue;
        const domain = await exactTargetDomain(api, accountId, zoneId, TARGETS[target][component]);
        if (domain && !known.has(domain.id)) {
            created.push(domain);
            known.add(domain.id);
        }
    }
}

async function attachDomains(api, accountId, zoneId, target, states, attempted, created) {
    const expected = TARGETS[target];
    for (const component of ['bridge', 'web']) {
        if (states[component] === 'attached') continue;
        const wanted = expected[component];
        const [byHostname, byWorker] = await Promise.all([
            listDomains(api, accountId, 'hostname', wanted.domain),
            listDomains(api, accountId, 'service', wanted.worker),
        ]);
        if (byHostname.length || byWorker.length) fail(`${component}_worker_domain_attach_race`);
        attempted.add(component);
        let result;
        try {
            result = await api(`/accounts/${accountId}/workers/domains`, {
                method: 'PUT',
                body: {
                    environment: 'production',
                    hostname: wanted.domain,
                    service: wanted.worker,
                    zone_id: zoneId,
                },
            });
        } catch (error) {
            const reconciled = await exactTargetDomain(api, accountId, zoneId, wanted);
            if (!reconciled) throw error;
            result = reconciled;
        }
        if (!validDomainRecord(result)
            || result.hostname !== wanted.domain
            || result.service !== wanted.worker
            || result.zone_id !== zoneId) {
            fail(`${component}_worker_domain_attach_invalid`);
        }
        created.push({ id: result.id, hostname: result.hostname, service: result.service });
    }
}

async function accountWorkersDevSubdomain(api, accountId) {
    const account = await api(`/accounts/${accountId}/workers/subdomain`);
    if (!account || typeof account.subdomain !== 'string'
        || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(account.subdomain)) {
        fail('workers_dev_account_subdomain_invalid');
    }
    return account.subdomain;
}

async function workersDevUrls(api, accountId, accountSubdomain, target, prepared, bridgeRequired) {
    const urls = {};
    for (const component of bridgeRequired ? ['web', 'bridge'] : ['web']) {
        const worker = TARGETS[target][component].worker;
        const settings = await api(
            `/accounts/${accountId}/workers/scripts/${encodeURIComponent(worker)}/subdomain`,
        );
        if (!settings || settings.enabled !== true
            || typeof settings.previews_enabled !== 'boolean'
            || (component === 'web' && settings.previews_enabled !== true)) {
            fail(`${component}_workers_dev_disabled`);
        }
        urls[component] = `https://${worker}.${accountSubdomain}.workers.dev`;
        if (prepared[component].bootstrap && prepared[component].bootstrapUrl !== urls[component]) {
            fail(`${component}_bootstrap_target_mismatch`);
        }
    }
    return urls;
}

async function detachCreatedDomains(api, accountId, created) {
    const errors = [];
    for (const domain of [...created].reverse()) {
        try {
            const [byHostname, byWorker] = await Promise.all([
                listDomains(api, accountId, 'hostname', domain.hostname),
                listDomains(api, accountId, 'service', domain.service),
            ]);
            if (byHostname.length !== 1 || byWorker.length !== 1
                || byHostname[0].id !== domain.id || byWorker[0].id !== domain.id) {
                fail('created_domain_identity_changed');
            }
            await api(`/accounts/${accountId}/workers/domains/${domain.id}`, { method: 'DELETE' });
            const [remainingHostname, remainingWorker] = await Promise.all([
                listDomains(api, accountId, 'hostname', domain.hostname),
                listDomains(api, accountId, 'service', domain.service),
            ]);
            if (remainingHostname.length || remainingWorker.length) fail('created_domain_detach_unverified');
        } catch (error) {
            errors.push(error);
        }
    }
    if (errors.length) throw new AggregateError(errors, 'cloudflare_release_domain_cleanup_failed');
}

function routeHostname(pattern) {
    if (typeof pattern !== 'string') return null;
    const match = /^(?:https?:\/\/)?([^/*]+)(?:\/.*)?$/.exec(pattern.trim());
    return match?.[1]?.toLowerCase() ?? null;
}

async function verifyClassicRoutes(api, zoneIds, target) {
    const expected = TARGETS[target];
    const targetWorkers = new Set([expected.web.worker, expected.bridge.worker]);
    for (const zoneId of zoneIds) {
        const routes = await api(`/zones/${zoneId}/workers/routes`);
        for (const route of routes) {
            if (!route || typeof route.pattern !== 'string'
                || (route.script !== null && typeof route.script !== 'string')) {
                fail('worker_route_record_invalid');
            }
            const hostname = routeHostname(route.pattern);
            if (targetWorkers.has(route.script)
                || [expected.web.domain, expected.bridge.domain].includes(hostname)
                || (['youtick.net', 'www.youtick.net'].includes(hostname)
                    && route.script === 'youtick-livepeer-bridge-c3-4ea2011')) {
                fail('worker_classic_route_forbidden');
            }
        }
    }
}

async function restorePrevious(runByComponent, argsByComponent, prepared, reason) {
    const errors = [];
    const restore = async (component) => {
        const state = prepared[component];
        if (!state.previous) return;
        try {
            await deployTraffic(
                runByComponent[component],
                argsByComponent[component],
                [{ version: state.previous, percentage: 100 }],
                `YouTick rollback ${reason}`,
            );
        } catch (error) {
            errors.push(`${component}: ${error instanceof Error ? error.message : 'rollback_failed'}`);
        }
    };
    await restore('bridge');
    await restore('web');
    if (errors.length) fail(`rollback_failed: ${errors.join('; ')}`);
}

async function runProductionRollbackTest({ runByComponent, argsByComponent, prepared, smokeFn, target }) {
    if (!prepared.web.previous || !prepared.bridge.previous) {
        fail('production_rollback_test_not_possible');
    }
    let testError;
    try {
        await deployTraffic(
            runByComponent.bridge,
            argsByComponent.bridge,
            [{ version: prepared.bridge.previous, percentage: 100 }],
            'YouTick dark production rollback test (bridge old)',
        );
        await deployTraffic(
            runByComponent.web,
            argsByComponent.web,
            [{ version: prepared.web.previous, percentage: 100 }],
            'YouTick dark production rollback test (web old)',
        );
        await smokeFn(smokeInput(target, `https://${TARGETS[target].web.domain}`, {
            expectedBridgeVersion: prepared.bridge.previous,
        }));
    } catch (error) {
        testError = error;
    }

    let restoreError;
    try {
        await deployTraffic(
            runByComponent.bridge,
            argsByComponent.bridge,
            [{ version: prepared.bridge.candidate, percentage: 100 }],
            'YouTick dark production rollback test (bridge restore)',
        );
        await deployTraffic(
            runByComponent.web,
            argsByComponent.web,
            [{ version: prepared.web.candidate, percentage: 100 }],
            'YouTick dark production rollback test (web restore)',
        );
        await smokeFn(smokeInput(target, `https://${TARGETS[target].web.domain}`, {
            expectedBridgeVersion: prepared.bridge.candidate,
        }));
    } catch (error) {
        restoreError = error;
    }
    if (restoreError) throw restoreError;
    if (testError) throw testError;
    return true;
}

export async function deployRelease({
    target,
    sha,
    artifactDir: artifactValue,
    receiptOutput: receiptValue,
    repoRoot: repoValue = resolve(import.meta.dirname, '..'),
    wranglerPaths,
    smokeFn = runReleaseSmoke,
    echoWrangler = true,
    rollbackTest = process.env.RELEASE_ROLLBACK_TEST,
    cloudflareFetch = fetch,
    cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN,
    cloudflareZoneId = process.env.CLOUDFLARE_ZONE_ID,
    nearRpcUrl: nearRpcUrlValue = process.env.NEAR_RPC_URL,
    oneClickApiKey: oneClickApiKeyValue = process.env.ONECLICK_API_KEY,
} = {}) {
    if (!Object.hasOwn(TARGETS, target)) fail('target_invalid');
    if (!GIT_SHA_RE.test(sha || '')) fail('sha_invalid');
    if (rollbackTest && !['true', 'false'].includes(rollbackTest)) fail('rollback_test_flag_invalid');
    const nearRpcUrl = validateNearRpcUrl(nearRpcUrlValue);
    const artifactDir = resolve(artifactValue || '');
    const receiptOutput = resolve(receiptValue || '');
    const repoRoot = await realpath(resolve(repoValue));
    const release = await readRelease(artifactDir, target, sha);
    const oneClickApiKey = validateOneClickApiKey(oneClickApiKeyValue, true);

    const tempRoot = await mkdtemp(join(tmpdir(), 'youtick-cloudflare-release-'));
    try {
        const bridgeSecretsFile = join(tempRoot, 'bridge-secrets.json');
        await writeFile(
            bridgeSecretsFile,
            canonicalJson({
                NEAR_RPC_URL: nearRpcUrl,
                ...(oneClickApiKey ? { ONECLICK_API_KEY: oneClickApiKey } : {}),
            }),
            { flag: 'wx', mode: 0o600 },
        );
        if (((await stat(bridgeSecretsFile)).mode & 0o777) !== 0o600) {
            fail('near_rpc_secrets_file_mode_invalid');
        }
        const extracted = {
            web: join(tempRoot, 'web'),
            bridge: join(tempRoot, 'bridge'),
        };
        await extractArchive(release.webArchive, extracted.web);
        await extractArchive(release.bridgeArchive, extracted.bridge);
        await validateWebWrangler(join(extracted.web, 'wrangler.jsonc'), extracted.web, target);
        await validateBridgeWrangler(join(extracted.bridge, 'wrangler.toml'), extracted.bridge);
        const sanitized = await writeSanitizedConfigs(extracted, target);
        if (!/^[a-f0-9]{32}$/.test(cloudflareZoneId || '')) fail('cloudflare_zone_id_invalid');
        const api = createCloudflareApi(cloudflareFetch, cloudflareAccountId, cloudflareApiToken);
        const beforeDomains = await inspectDomainBindings(
            api,
            cloudflareAccountId,
            cloudflareZoneId,
            target,
            'before',
        );
        await verifyClassicRoutes(api, [cloudflareZoneId], target);
        const accountSubdomain = await accountWorkersDevSubdomain(api, cloudflareAccountId);

        const defaultWrangler = join(repoRoot, 'apps', 'web', 'node_modules', '.bin', 'wrangler');
        const binaries = wranglerPaths || { web: defaultWrangler, bridge: defaultWrangler };
        const runByComponent = {
            web: await makeWranglerRunner(binaries.web, tempRoot, { echo: echoWrangler, label: 'web' }),
            bridge: await makeWranglerRunner(binaries.bridge, tempRoot, { echo: echoWrangler, label: 'bridge' }),
        };
        const argsByComponent = {
            web: componentArgs(
                'web', target, extracted.web, release.config, sanitized, bridgeSecretsFile,
            ),
            bridge: componentArgs(
                'bridge', target, extracted.bridge, release.config, sanitized, bridgeSecretsFile,
            ),
        };
        const prepared = {
            web: await prepareComponent({
                component: 'web', target, sha, run: runByComponent.web, args: argsByComponent.web,
                bootstrapAllowed: beforeDomains.states.web === 'missing',
            }),
            bridge: await prepareComponent({
                component: 'bridge', target, sha, run: runByComponent.bridge, args: argsByComponent.bridge,
                bootstrapAllowed: beforeDomains.states.bridge === 'missing',
            }),
        };
        const workersDev = await workersDevUrls(
            api,
            cloudflareAccountId,
            accountSubdomain,
            target,
            prepared,
            beforeDomains.states.bridge === 'missing',
        );

        const candidateWebUrl = webPreviewUrl(
            prepared.web.previewUrl,
            TARGETS[target].web.worker,
            accountSubdomain,
            prepared.web.candidate,
        );
        const candidateBridgeUrl = beforeDomains.states.bridge === 'missing'
            ? workersDev.bridge
            : `https://${TARGETS[target].bridge.domain}`;

        let stagedBridge = false;
        let promotionStarted = false;
        let rollbackPerformed = false;
        const createdDomains = [];
        const attemptedDomains = new Set();
        try {
            await deployTraffic(
                runByComponent.bridge,
                argsByComponent.bridge,
                [
                    { version: prepared.bridge.previous, percentage: 100 },
                    { version: prepared.bridge.candidate, percentage: 0 },
                ],
                `YouTick ${target} candidate ${sha}`,
            );
            stagedBridge = true;

            await smokeFn(smokeInput(target, candidateWebUrl, {
                bridgeUrl: candidateBridgeUrl,
                expectedBridgeVersion: prepared.bridge.previous,
            }));
            await smokeFn(smokeInput(target, candidateWebUrl, {
                bridgeUrl: candidateBridgeUrl,
                overrideWorker: TARGETS[target].bridge.worker,
                overrideVersion: prepared.bridge.candidate,
                expectedBridgeVersion: prepared.bridge.candidate,
            }));

            promotionStarted = true;
            await deployTraffic(
                runByComponent.bridge,
                argsByComponent.bridge,
                [{ version: prepared.bridge.candidate, percentage: 100 }],
                `YouTick ${target} ${sha}`,
            );
            await deployTraffic(
                runByComponent.web,
                argsByComponent.web,
                [{ version: prepared.web.candidate, percentage: 100 }],
                `YouTick ${target} ${sha}`,
            );
            await attachDomains(
                api,
                cloudflareAccountId,
                cloudflareZoneId,
                target,
                beforeDomains.states,
                attemptedDomains,
                createdDomains,
            );
            const afterDomains = await inspectDomainBindings(
                api,
                cloudflareAccountId,
                cloudflareZoneId,
                target,
                'after',
            );
            await verifyClassicRoutes(api, [cloudflareZoneId], target);
            await requireTraffic(
                runByComponent.bridge,
                argsByComponent.bridge,
                [{ version: prepared.bridge.candidate, percentage: 100 }],
                'bridge_promoted',
            );
            await requireTraffic(
                runByComponent.web,
                argsByComponent.web,
                [{ version: prepared.web.candidate, percentage: 100 }],
                'web_promoted',
            );
            await smokeFn(smokeInput(target, `https://${TARGETS[target].web.domain}`, {
                expectedBridgeVersion: prepared.bridge.candidate,
            }));
            rollbackPerformed = target === 'production' && rollbackTest === 'true'
                ? await runProductionRollbackTest({
                    runByComponent, argsByComponent, prepared, smokeFn, target,
                })
                : false;
        } catch (error) {
            const recoveryErrors = [];
            try {
                await reconcileCreatedDomains(
                    api,
                    cloudflareAccountId,
                    cloudflareZoneId,
                    target,
                    beforeDomains.states,
                    attemptedDomains,
                    createdDomains,
                );
            } catch (reconcileError) {
                recoveryErrors.push(reconcileError);
            }
            if (createdDomains.length) {
                try {
                    await detachCreatedDomains(api, cloudflareAccountId, createdDomains);
                } catch (cleanupError) {
                    recoveryErrors.push(cleanupError);
                }
            }
            if (stagedBridge || promotionStarted) {
                try {
                    await restorePrevious(runByComponent, argsByComponent, prepared, sha);
                } catch (rollbackError) {
                    recoveryErrors.push(rollbackError);
                }
            }
            if (recoveryErrors.length) {
                throw new AggregateError([error, ...recoveryErrors], 'cloudflare_release_and_rollback_failed');
            }
            throw error;
        }

        const receipt = {
            schemaVersion: 1,
            sha,
            environment: target,
            manifestSha256: release.manifestHash,
            web: {
                worker: TARGETS[target].web.worker,
                domain: TARGETS[target].web.domain,
                previousVersionId: prepared.web.previous,
                versionId: prepared.web.candidate,
                bootstrap: prepared.web.bootstrap,
            },
            bridge: {
                worker: TARGETS[target].bridge.worker,
                domain: TARGETS[target].bridge.domain,
                previousVersionId: prepared.bridge.previous,
                versionId: prepared.bridge.candidate,
                bootstrap: prepared.bridge.bootstrap,
            },
            rollbackTest: {
                requested: target === 'production' && rollbackTest === 'true',
                performed: rollbackPerformed,
            },
        };
        await mkdir(dirname(receiptOutput), { recursive: true });
        const temporaryReceipt = `${receiptOutput}.tmp-${process.pid}`;
        await writeFile(temporaryReceipt, canonicalJson(receipt), { flag: 'wx', mode: 0o600 });
        await rename(temporaryReceipt, receiptOutput);
        return receipt;
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

async function main(args = process.argv.slice(2)) {
    if (args.length === 2 && args[0] === 'write-bridge-wrangler') {
        await writeBridgeArtifactWrangler(args[1]);
        return;
    }
    if (args.length !== 5 || args[0] !== 'deploy') {
        throw new Error('usage: cloudflare-release.mjs <write-bridge-wrangler <output>|deploy <preview|production> <sha> <artifact-dir> <receipt-output>>');
    }
    await deployRelease({
        target: args[1],
        sha: args[2],
        artifactDir: args[3],
        receiptOutput: args[4],
    });
}

if (import.meta.main) {
    main().catch((error) => {
        if (error instanceof AggregateError) {
            process.stderr.write(`${error.message}\n${error.errors.map((entry) => entry.message).join('\n')}\n`);
        } else {
            process.stderr.write(`${error instanceof Error ? error.message : 'cloudflare_release_failed'}\n`);
        }
        process.exitCode = 1;
    });
}
