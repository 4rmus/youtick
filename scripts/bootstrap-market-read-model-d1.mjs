#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PLAYBACK_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const DECIMAL_PATTERN = /^[1-9][0-9]{0,38}$/;

export const MAX_BOOTSTRAP_PUBLICATIONS = 48;

export async function fetchMarketReadModelBootstrap(input, fetchImpl = fetch) {
    const request = normalizeRequest(input);
    const block = await nearRpc(request.rpcUrl, 'block', { finality: 'final' }, fetchImpl);
    const height = block?.header?.height;
    const hash = block?.header?.hash;
    if (!Number.isSafeInteger(height) || height < 1
        || typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
        throw new Error('invalid_near_final_block');
    }

    const count = await nearView(request, hash, 'get_publications_count', {}, fetchImpl);
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error('invalid_near_publication_count');
    }
    if (count > MAX_BOOTSTRAP_PUBLICATIONS) {
        throw new Error('d1_bootstrap_publication_limit_exceeded');
    }
    const publications = count === 0 ? [] : await nearView(
        request,
        hash,
        'get_publications',
        { from_index: '0', limit: count },
        fetchImpl,
    );
    if (!Array.isArray(publications) || publications.length !== count) {
        throw new Error('invalid_near_publication_page');
    }
    return normalizeBootstrap({
        schema: 'youtick.market-read-model-bootstrap.v1',
        network: request.network,
        contract_id: request.contractId,
        finality: 'final',
        block_height: height,
        block_hash: hash,
        publications,
    });
}

export async function applyMarketReadModelBootstrap(db, rawSnapshot) {
    const snapshot = normalizeBootstrap(rawSnapshot);
    const state = await db.prepare(`
        SELECT
            (SELECT count(*) FROM chain_events)
          + (SELECT count(*) FROM finality_watermarks)
          + (SELECT count(*) FROM media_jobs)
          + (SELECT count(*) FROM publications)
          + (SELECT count(*) FROM viewer_entitlements)
          + (SELECT count(*) FROM sale_ledger)
          + (SELECT count(*) FROM withdrawal_history)
          + (SELECT count(*) FROM governance_audit)
          + (SELECT count(*) FROM upload_job_archives)
          + (SELECT count(*) FROM operator_outbox_archives) AS row_count
    `).bind().first();
    if (state?.row_count !== 0) throw new Error('d1_bootstrap_not_empty');

    const statements = [db.prepare(`
        INSERT INTO finality_watermarks (
            network, contract_id, block_height, block_hash, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?)
    `).bind(
        snapshot.network,
        snapshot.contract_id,
        snapshot.block_height,
        snapshot.block_hash,
        Date.now(),
    )];
    for (const publication of snapshot.publications) {
        statements.push(db.prepare(`
            INSERT INTO publications (
                network, contract_id, publication_id, creator_id, title,
                generation, price_usdc, playback_id, availability,
                published_at_ms, source_block_height
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            snapshot.network,
            snapshot.contract_id,
            publication.publication_id,
            publication.creator_id,
            publication.title,
            publication.generation,
            publication.price_usdc,
            publication.playback_id,
            publication.availability,
            publication.published_at_ms,
            snapshot.block_height,
        ));
    }
    return db.batch(statements);
}

function normalizeBootstrap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.schema !== 'youtick.market-read-model-bootstrap.v1'
        || !['testnet', 'mainnet'].includes(value.network)
        || typeof value.contract_id !== 'string' || !ACCOUNT_PATTERN.test(value.contract_id)
        || value.finality !== 'final'
        || !Number.isSafeInteger(value.block_height) || value.block_height < 1
        || typeof value.block_hash !== 'string' || !HASH_PATTERN.test(value.block_hash)
        || !Array.isArray(value.publications)
        || value.publications.length > MAX_BOOTSTRAP_PUBLICATIONS) {
        throw new Error('invalid_d1_bootstrap');
    }
    const publications = value.publications.map(normalizePublication);
    const ids = new Set();
    const playbackIds = new Set();
    for (const publication of publications) {
        if (ids.has(publication.publication_id) || playbackIds.has(publication.playback_id)) {
            throw new Error('duplicate_d1_bootstrap_publication');
        }
        ids.add(publication.publication_id);
        playbackIds.add(publication.playback_id);
    }
    return { ...value, publications };
}

function normalizePublication(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || typeof value.publication_id !== 'string' || !ID_PATTERN.test(value.publication_id)
        || typeof value.creator_id !== 'string' || !ACCOUNT_PATTERN.test(value.creator_id)
        || typeof value.title !== 'string' || !value.title.trim()
        || new TextEncoder().encode(value.title).byteLength > 200
        || typeof value.price_usdc !== 'string' || !DECIMAL_PATTERN.test(value.price_usdc)
        || BigInt(value.price_usdc) < 2_000_000n
        || !Number.isSafeInteger(value.generation) || value.generation < 1
        || typeof value.playback_id !== 'string' || !PLAYBACK_PATTERN.test(value.playback_id)
        || !['ACTIVE', 'SALES_SUSPENDED', 'TAKEDOWN'].includes(value.availability)
        || !Number.isSafeInteger(value.published_at_ms) || value.published_at_ms < 1) {
        throw new Error('invalid_d1_bootstrap_publication');
    }
    return {
        publication_id: value.publication_id,
        creator_id: value.creator_id,
        title: value.title,
        price_usdc: value.price_usdc,
        generation: value.generation,
        playback_id: value.playback_id,
        availability: value.availability,
        published_at_ms: value.published_at_ms,
    };
}

function normalizeRequest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !['testnet', 'mainnet'].includes(value.network)
        || typeof value.contractId !== 'string' || !ACCOUNT_PATTERN.test(value.contractId)
        || !validHttpsUrl(value.rpcUrl)) {
        throw new Error('invalid_d1_bootstrap_request');
    }
    return value;
}

async function nearView(request, blockHash, methodName, args, fetchImpl) {
    const result = await nearRpc(request.rpcUrl, 'query', {
        request_type: 'call_function',
        block_id: blockHash,
        account_id: request.contractId,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    }, fetchImpl);
    if (result?.block_hash !== blockHash || !Array.isArray(result.result)
        || result.result.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
        throw new Error('invalid_near_view_result');
    }
    try {
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result)));
    } catch {
        throw new Error('invalid_near_view_result');
    }
}

async function nearRpc(url, method, params, fetchImpl) {
    let response;
    let payload;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: `read-model-bootstrap-${method}`, method, params }),
            signal: AbortSignal.timeout(10_000),
        });
        payload = await response.json();
    } catch {
        throw new Error('near_rpc_unavailable');
    }
    if (!response.ok || payload?.error || !payload?.result) {
        throw new Error('near_rpc_unavailable');
    }
    return payload.result;
}

function validHttpsUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
    } catch {
        return false;
    }
}

function cliArguments(values) {
    const args = Object.fromEntries(values.slice(2).map((value) => value.split('=', 2)));
    if (!args['--network'] || !args['--contract'] || !process.env.READ_MODEL_NEAR_RPC_URL) {
        throw new Error('usage: READ_MODEL_NEAR_RPC_URL=https://... --network=testnet --contract=account.testnet');
    }
    return {
        network: args['--network'],
        contractId: args['--contract'],
        rpcUrl: process.env.READ_MODEL_NEAR_RPC_URL,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    fetchMarketReadModelBootstrap(cliArguments(process.argv))
        .then((snapshot) => process.stdout.write(`${JSON.stringify(snapshot)}\n`))
        .catch((error) => {
            process.stderr.write(`${error instanceof Error ? error.message : 'd1_bootstrap_failed'}\n`);
            process.exitCode = 1;
        });
}
