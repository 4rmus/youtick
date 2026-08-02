import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    requireDesktopBrowserExecutables,
    runLivepeerHlsBrowserCanary,
} from '../../../apps/web/scripts/livepeer-hls-browser-canary.mjs';
import { runPlaybackCanary } from './playback-canary.mjs';

const LIVEPEER_API_BASE = 'https://livepeer.studio/api';

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function requireApiKey(value) {
    if (typeof value !== 'string' || value.length < 16 || /[\r\n]/.test(value)) {
        throw new Error('live_playback_canary_api_key_invalid');
    }
}

async function providerJson(apiKey, path, init = {}, fetchImpl = fetch) {
    const response = await fetchImpl(`${LIVEPEER_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            ...init.headers,
        },
        signal: AbortSignal.timeout(20_000),
    });
    let body = null;
    if (response.status !== 204) {
        try {
            body = await response.json();
        } catch {
            throw new Error(`live_playback_canary_provider_json_${response.status}`);
        }
    }
    if (!response.ok) throw new Error(`live_playback_canary_provider_${response.status}`);
    return { status: response.status, body };
}

async function createSigningKey(apiKey, fetchImpl) {
    const response = await providerJson(apiKey, '/access-control/signing-key', { method: 'POST' }, fetchImpl);
    if (typeof response.body?.id !== 'string') {
        throw new Error('live_playback_canary_signing_key_response_invalid');
    }
    return {
        id: response.body.id,
        publicKey: response.body.publicKey,
        privateKey: response.body.privateKey,
        createStatus: response.status,
        valid: [200, 201].includes(response.status)
            && typeof response.body.publicKey === 'string'
            && typeof response.body.privateKey === 'string',
    };
}

async function deleteSigningKey(apiKey, keyId, fetchImpl) {
    const response = await providerJson(
        apiKey,
        `/access-control/signing-key/${encodeURIComponent(keyId)}`,
        { method: 'DELETE' },
        fetchImpl,
    );
    if (response.status !== 204) throw new Error(`live_playback_canary_signing_key_delete_${response.status}`);
    return response.status;
}

async function signingKeyIds(apiKey, fetchImpl) {
    const response = await providerJson(apiKey, '/access-control/signing-key', {}, fetchImpl);
    const keys = Array.isArray(response.body) ? response.body : response.body?.signingKeys;
    if (!Array.isArray(keys)) throw new Error('live_playback_canary_signing_key_inventory_invalid');
    return keys.map((key) => {
        if (typeof key?.id !== 'string') {
            throw new Error('live_playback_canary_signing_key_inventory_invalid');
        }
        return key.id;
    });
}

async function signingKeyAbsent(apiKey, keyId, fetchImpl) {
    return !(await signingKeyIds(apiKey, fetchImpl)).includes(keyId);
}

function signingKeyCreateRecovery(beforeIds, afterIds) {
    const before = new Set(beforeIds);
    const created = afterIds.filter((id) => !before.has(id));
    if (created.length === 0) return null;
    return {
        cleanup: 'manual_required',
        new_key_count: created.length,
        new_key_ids_sha256: created.map(sha256).sort(),
    };
}

function withRecovery(error, recovery) {
    if (!recovery) return error;
    const failure = new AggregateError([error], 'live_playback_canary_signing_key_create_ambiguous');
    failure.recovery = { signing_key: recovery };
    return failure;
}

async function runLivePlaybackCanary({
    apiKey,
    mutationsEnabled,
    signingKeyMutationsEnabled,
    issuer = 'https://youtick.net',
    fileBytes,
    browserPort = 0,
    browserTimeoutMs,
    fetchImpl = fetch,
    runPlayback = runPlaybackCanary,
    browserCanary = runLivepeerHlsBrowserCanary,
    browserPreflight = requireDesktopBrowserExecutables,
}) {
    requireApiKey(apiKey);
    if (!mutationsEnabled) throw new Error('playback_canary_mutations_disabled');
    if (!signingKeyMutationsEnabled) throw new Error('playback_canary_signing_key_mutations_disabled');

    await browserPreflight();
    const signingKeyIdsBefore = await signingKeyIds(apiKey, fetchImpl);
    let signingKey;
    let receipt;
    let runError;
    try {
        try {
            signingKey = await createSigningKey(apiKey, fetchImpl);
        } catch (error) {
            let signingKeyIdsAfter;
            try {
                signingKeyIdsAfter = await signingKeyIds(apiKey, fetchImpl);
            } catch (recoveryError) {
                throw new AggregateError(
                    [error, recoveryError],
                    'live_playback_canary_signing_key_create_recovery_failed',
                );
            }
            throw withRecovery(error, signingKeyCreateRecovery(signingKeyIdsBefore, signingKeyIdsAfter));
        }
        if (!signingKey.valid) throw new Error('live_playback_canary_signing_key_response_invalid');
        receipt = await runPlayback({
            apiKey,
            mutationsEnabled,
            privateKey: signingKey.privateKey,
            publicKey: signingKey.publicKey,
            issuer,
            fileBytes,
            fetchImpl,
            browserProbe: (input) => browserCanary({
                ...input,
                port: browserPort,
                timeoutMs: browserTimeoutMs,
            }),
        });
    } catch (error) {
        runError = error;
    }

    const signingKeyReceipt = {};
    const cleanupErrors = [];
    if (signingKey) {
        signingKeyReceipt.id_sha256 = sha256(signingKey.id);
        signingKeyReceipt.create_status = signingKey.createStatus;
        try {
            signingKeyReceipt.delete_status = await deleteSigningKey(apiKey, signingKey.id, fetchImpl);
        } catch (error) {
            cleanupErrors.push(error);
        }
        try {
            signingKeyReceipt.post_delete_absent = await signingKeyAbsent(apiKey, signingKey.id, fetchImpl);
            if (!signingKeyReceipt.post_delete_absent) {
                cleanupErrors.push(new Error('live_playback_canary_signing_key_still_live'));
            }
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    if (runError && cleanupErrors.length > 0) {
        throw new AggregateError([runError, ...cleanupErrors], 'live_playback_canary_failed_with_cleanup_failure');
    }
    if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'live_playback_canary_cleanup_failure');
    }
    if (runError) throw runError;
    return { ...receipt, signing_key: signingKeyReceipt };
}

if (import.meta.main) {
    try {
        const filePath = process.argv[2];
        if (!filePath) {
            throw new Error('usage: npm run canary:playback:live -- /path/to/short-valid.mp4');
        }
        const receipt = await runLivePlaybackCanary({
            apiKey: process.env.LIVEPEER_API_KEY,
            mutationsEnabled: process.env.LIVEPEER_PLAYBACK_CANARY_MUTATIONS === 'true',
            signingKeyMutationsEnabled: process.env.LIVEPEER_PLAYBACK_CANARY_SIGNING_KEY_MUTATIONS === 'true',
            issuer: process.env.LIVEPEER_PLAYBACK_CANARY_ISSUER || 'https://youtick.net',
            fileBytes: new Uint8Array(await readFile(filePath)),
            browserPort: Number(process.env.LIVEPEER_PLAYBACK_CANARY_PORT || 0),
            browserTimeoutMs: Number(process.env.LIVEPEER_PLAYBACK_CANARY_BROWSER_TIMEOUT_MS || 180_000),
        });
        process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } catch (error) {
        const recovery = error && typeof error === 'object' ? error.recovery : undefined;
        if (recovery) process.stderr.write(`${JSON.stringify({ recovery })}\n`);
        throw error;
    }
}

export { runLivePlaybackCanary };
