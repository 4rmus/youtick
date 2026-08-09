#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const CATALOG = new Set([
    'media_job_authorized',
    'media_job_upload_key_replaced',
    'publication_finalized',
    'publication_sales_suspended',
    'publication_takedown',
    'entitlement_purchased',
    'creator_balance_withdrawal_started',
    'creator_balance_withdrawal_succeeded',
    'creator_balance_withdrawal_failed',
    'platform_withdrawal_started',
    'bridge_frozen',
    'bridge_rotation_proposed',
    'bridge_rotation_cancelled',
    'bridge_rotated',
    'bridge_unfrozen',
    'new_purchases_paused',
    'new_purchases_unpaused',
    'quote_key_rotated',
    'contract_migrated',
]);
const GOVERNANCE_EVENTS = new Set([
    'bridge_frozen',
    'bridge_rotation_proposed',
    'bridge_rotation_cancelled',
    'bridge_rotated',
    'bridge_unfrozen',
    'new_purchases_paused',
    'new_purchases_unpaused',
    'quote_key_rotated',
    'contract_migrated',
]);
const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]{0,39})$/;

export function rebuildMarketReadModel(rawRecords) {
    const records = normalizeFinalMarketEvents(rawRecords);
    const blockHashes = new Map();
    const physicalEvents = new Map();
    const businessEvents = new Map();
    const jobs = new Map();
    const publications = new Map();
    const entitlements = new Map();
    const sales = new Map();
    const withdrawals = new Map();
    const governance = new Map();
    const watermarks = new Map();

    for (const record of records) {
        const blockKey = `${record.network}:${record.block_height}`;
        const observedHash = blockHashes.get(blockKey);
        if (observedHash && observedHash !== record.block_hash) throw new Error('final_block_hash_conflict');
        blockHashes.set(blockKey, record.block_hash);

        const data = record.event.data[0];
        const physicalKey = [record.network, data.contract_id, record.block_height,
            record.receipt_id, record.event_index].join(':');
        const businessKey = [record.network, data.contract_id, record.event.event,
            data.idempotency_key].join(':');
        const encoded = canonicalJson(record.event);
        if (physicalEvents.has(physicalKey)) {
            if (physicalEvents.get(physicalKey) !== encoded) throw new Error('event_position_conflict');
            continue;
        }
        if (businessEvents.has(businessKey)) {
            if (businessEvents.get(businessKey) !== encoded) throw new Error('event_idempotency_conflict');
            continue;
        }
        physicalEvents.set(physicalKey, encoded);
        businessEvents.set(businessKey, encoded);
        applyProjection(record, data, { jobs, publications, entitlements, sales, withdrawals, governance });

        const watermarkKey = `${record.network}:${data.contract_id}`;
        watermarks.set(watermarkKey, {
            network: record.network,
            contract_id: data.contract_id,
            block_height: record.block_height,
            block_hash: record.block_hash,
        });
    }

    return {
        schema: 'youtick.market-read-model.v1',
        events_applied: physicalEvents.size,
        watermarks: sortedValues(watermarks),
        media_jobs: sortedValues(jobs),
        publications: sortedValues(publications),
        viewer_entitlements: sortedValues(entitlements),
        sale_ledger: sortedValues(sales),
        withdrawal_history: sortedValues(withdrawals),
        governance_audit: sortedValues(governance),
    };
}

export function normalizeFinalMarketEvents(rawRecords) {
    return rawRecords.map(parseRecord).sort(compareRecords);
}

export function canonicalMarketEventJson(value) {
    return canonicalJson(value);
}

function applyProjection(record, data, stores) {
    const base = {
        network: record.network,
        contract_id: data.contract_id,
        source_block_height: record.block_height,
    };
    const key = (value) => `${record.network}:${data.contract_id}:${value}`;
    switch (record.event.event) {
    case 'media_job_authorized':
        stores.jobs.set(key(data.job_id), {
            ...base,
            job_id: requiredId(data.job_id),
            creator_id: requiredAccount(data.account_id),
            generation: requiredPositiveInteger(data.generation),
            expected_source_bytes: requiredDecimal(data.expected_source_bytes),
            fee_asset: requiredAsset(data.asset),
            fee_amount: requiredDecimal(data.amount),
            upload_public_key_sha256: null,
        });
        break;
    case 'media_job_upload_key_replaced': {
        const job = stores.jobs.get(key(data.job_id));
        if (!job || job.generation !== data.generation) throw new Error('projection_job_missing');
        if (!/^[0-9a-f]{64}$/.test(String(data.upload_public_key_sha256))) throw new Error('invalid_event_data');
        stores.jobs.set(key(data.job_id), {
            ...job,
            upload_public_key_sha256: data.upload_public_key_sha256,
            source_block_height: record.block_height,
        });
        break;
    }
    case 'publication_finalized':
        stores.publications.set(key(data.publication_id), {
            ...base,
            publication_id: requiredId(data.publication_id),
            creator_id: requiredAccount(data.account_id),
            title: requiredTitle(data.title),
            generation: requiredPositiveInteger(data.generation),
            price_usdc: requiredDecimal(data.amount),
            playback_id: requiredPlaybackId(data.playback_id),
            availability: requiredAvailability(data.availability),
            published_at_ms: requiredPositiveInteger(data.published_at_ms),
        });
        break;
    case 'publication_sales_suspended':
    case 'publication_takedown': {
        const publication = stores.publications.get(key(data.publication_id));
        if (!publication) throw new Error('projection_publication_missing');
        stores.publications.set(key(data.publication_id), {
            ...publication,
            availability: requiredAvailability(data.availability),
            source_block_height: record.block_height,
        });
        break;
    }
    case 'entitlement_purchased':
        stores.entitlements.set(key(`${data.account_id}:${data.publication_id}`), {
            ...base,
            account_id: requiredAccount(data.account_id),
            publication_id: requiredId(data.publication_id),
        });
        stores.sales.set(key(data.idempotency_key), {
            ...base,
            idempotency_key: data.idempotency_key,
            account_id: requiredAccount(data.account_id),
            creator_id: requiredAccount(data.creator_id),
            publication_id: requiredId(data.publication_id),
            asset: requiredAsset(data.asset),
            amount: requiredDecimal(data.amount),
            creator_amount: requiredDecimal(data.creator_amount),
            platform_amount: requiredDecimal(data.platform_amount),
        });
        break;
    case 'creator_balance_withdrawal_started':
    case 'creator_balance_withdrawal_succeeded':
    case 'creator_balance_withdrawal_failed':
    case 'platform_withdrawal_started':
        stores.withdrawals.set(key(data.withdrawal_id), {
            ...base,
            withdrawal_id: requiredId(data.withdrawal_id),
            account_id: requiredAccount(data.account_id),
            asset: requiredAsset(data.asset),
            amount: requiredDecimal(data.amount),
            status: record.event.event,
            reason_code: data.reason_code || null,
        });
        break;
    default:
        if (GOVERNANCE_EVENTS.has(record.event.event)) {
            stores.governance.set(key(`${record.event.event}:${data.idempotency_key}`), {
                ...base,
                event_name: record.event.event,
                idempotency_key: data.idempotency_key,
                payload: data,
            });
        }
    }
}

function parseRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !['testnet', 'mainnet'].includes(value.network)
        || value.finality !== 'final'
        || !Number.isSafeInteger(value.block_height) || value.block_height < 1
        || typeof value.block_hash !== 'string' || !HASH_PATTERN.test(value.block_hash)
        || typeof value.receipt_id !== 'string' || !HASH_PATTERN.test(value.receipt_id)
        || !Number.isSafeInteger(value.event_index) || value.event_index < 0) {
        throw new Error('invalid_final_event_envelope');
    }
    const event = value.event;
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || event.standard !== 'youtick_market' || event.version !== '1.0.0'
        || !CATALOG.has(event.event) || !Array.isArray(event.data) || event.data.length !== 1
        || !event.data[0] || typeof event.data[0] !== 'object' || Array.isArray(event.data[0])) {
        throw new Error('invalid_market_event');
    }
    const data = event.data[0];
    requiredAccount(data.contract_id);
    requiredId(data.idempotency_key);
    requiredDecimal(data.block_height);
    requiredDecimal(data.block_timestamp_ms);
    if (data.block_height !== String(value.block_height)) throw new Error('event_block_mismatch');
    return value;
}

function compareRecords(left, right) {
    return left.block_height - right.block_height
        || left.receipt_id.localeCompare(right.receipt_id)
        || left.event_index - right.event_index;
}

function sortedValues(map) {
    return [...map.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

function requiredAccount(value) {
    if (typeof value !== 'string' || !ACCOUNT_PATTERN.test(value)) throw new Error('invalid_event_data');
    return value;
}

function requiredId(value) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('invalid_event_data');
    return value;
}

function requiredDecimal(value) {
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    if (typeof text !== 'string' || !DECIMAL_PATTERN.test(text)) throw new Error('invalid_event_data');
    return text;
}

function requiredPositiveInteger(value) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('invalid_event_data');
    return value;
}

function requiredAsset(value) {
    if (!['USDC', 'NEAR'].includes(value)) throw new Error('invalid_event_data');
    return value;
}

function requiredAvailability(value) {
    if (!['ACTIVE', 'SALES_SUSPENDED', 'TAKEDOWN'].includes(value)) throw new Error('invalid_event_data');
    return value;
}

function requiredTitle(value) {
    if (typeof value !== 'string' || !value.trim()
        || new TextEncoder().encode(value).byteLength > 200) throw new Error('invalid_event_data');
    return value;
}

function requiredPlaybackId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(value)) {
        throw new Error('invalid_event_data');
    }
    return value;
}

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function main() {
    const inputIndex = process.argv.indexOf('--input');
    const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
    if (!inputPath) throw new Error('usage: rebuild-market-read-model --input <final-events.jsonl>');
    const lines = (await readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean);
    process.stdout.write(`${JSON.stringify(rebuildMarketReadModel(lines.map((line) => JSON.parse(line))), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : 'rebuild_failed'}\n`);
        process.exitCode = 1;
    });
}
