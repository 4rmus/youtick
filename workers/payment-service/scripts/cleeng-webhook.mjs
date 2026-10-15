#!/usr/bin/env node
// Registers the payment service's card webhook with Cleeng's Webhooks API (roadmap E8.3). Run on the
// owner's machine: the publisher token is read from a file and the endpoint's signing secret, which
// Cleeng returns only once, is written to a new file (mode 0600). Neither value is ever printed.
//
//   node scripts/cleeng-webhook.mjs register --token-file <file> --secret-out <new file> [--url <https url>]
//
// Sandbox only (https://webhook.api.sandbox.cleeng.com/endpoints, read 2026-10-15). A provider write:
// run it only with the owner's approval.
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

export const SANDBOX_WEBHOOK_API = 'https://webhook.api.sandbox.cleeng.com';
export const DEFAULT_URL = 'https://pay-v2-testnet.youtick.net/webhooks/card';
/** The two topics the Cleeng adapter maps (src/cleeng.ts); every other topic is ignored there. */
export const EVENTS = Object.freeze(['transactionCreated', 'paymentRefunded']);

function fail(code) {
    throw new Error(`cleeng_webhook_${code}`);
}

export function parseArgs(argv) {
    const [command, ...rest] = argv;
    if (command !== 'register') fail('usage');
    const options = { url: DEFAULT_URL };
    for (let i = 0; i < rest.length; i += 2) {
        const [flag, value] = [rest[i], rest[i + 1]];
        if (value === undefined) fail('usage');
        if (flag === '--token-file') options.tokenFile = value;
        else if (flag === '--secret-out') options.secretOut = value;
        else if (flag === '--url') options.url = value;
        else fail('usage');
    }
    if (!options.tokenFile || !options.secretOut) fail('usage');
    const url = new URL(options.url);
    if (url.protocol !== 'https:' || url.pathname !== '/webhooks/card' || url.search || url.hash) fail('url_invalid');
    return options;
}

export async function register({ tokenFile, secretOut, url }, fetchImpl = fetch) {
    const token = (await readFile(tokenFile, 'utf8')).trim();
    if (!/^[\x21-\x7e]{16,4096}$/.test(token)) fail('token_invalid');
    let response;
    try {
        response = await fetchImpl(`${SANDBOX_WEBHOOK_API}/endpoints`, {
            method: 'POST', signal: AbortSignal.timeout(20_000),
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Publisher-Token': token },
            body: JSON.stringify({ url, events: EVENTS, name: 'youtick payment service v2 testnet', retry: { maxAttempts: 4 } }),
        });
    } catch {
        fail('unreachable');
    }
    const body = await response.json().catch(() => null);
    if (response.status !== 201) {
        // Only Cleeng's error code: a message may echo request fields.
        const code = typeof body?.error?.code === 'string' && /^[a-z_]{1,64}$/.test(body.error.code) ? body.error.code : 'unknown';
        fail(`http_${response.status}_${code}`);
    }
    const secret = body?.signing?.secret;
    if (typeof secret !== 'string' || !/^whsec_[A-Za-z0-9+/=_-]{16,200}$/.test(secret)) fail('secret_missing');
    // `wx`: never overwrite an earlier secret file.
    await writeFile(secretOut, `${secret}\n`, { flag: 'wx', mode: 0o600 });
    return {
        id: body.id, status: body.status, url: body.url, events: body.events,
        secret_prefix: body.signing.secretPrefix, secret_file: secretOut,
    };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    register(parseArgs(process.argv.slice(2)))
        .then((result) => console.log(JSON.stringify(result, null, 2)))
        .catch((error) => {
            console.error(error instanceof Error ? error.message : 'cleeng_webhook_failed');
            process.exitCode = 1;
        });
}
