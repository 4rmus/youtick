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
    'public_testnet_beta_started',
    'public_testnet_beta_closed',
    'quote_key_rotated',
    'role_rotation_proposed',
    'role_rotation_cancelled',
    'role_rotated',
    'bridge_unfreeze_requested',
    'bridge_unfreeze_cancelled',
    'new_purchases_unpause_requested',
    'new_purchases_unpause_cancelled',
    'code_upgrade_proposed',
    'code_upgrade_cancelled',
    'code_upgraded',
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
    'public_testnet_beta_started',
    'public_testnet_beta_closed',
    'quote_key_rotated',
    'role_rotation_proposed',
    'role_rotation_cancelled',
    'role_rotated',
    'bridge_unfreeze_requested',
    'bridge_unfreeze_cancelled',
    'new_purchases_unpause_requested',
    'new_purchases_unpause_cancelled',
    'code_upgrade_proposed',
    'code_upgrade_cancelled',
    'code_upgraded',
    'contract_migrated',
]);
// V2 Market ticket events (envelope 2.0.0) and V2-only events kept on the 1.0.0 envelope.
const MARKET_V2_CATALOG = new Set([
    'ticket_purchased',
    'card_ticket_issued',
    'device_added',
    'device_revoked',
    'ticket_watched',
    'ticket_refunded',
    'ticket_released',
    'card_ticket_voided',
    'creator_payout_credited',
]);
const MARKET_V2_V1_ENVELOPE_EVENTS = new Set([
    'vat_key_revoked',
]);
const TICKET_STATUS_EVENTS = {
    ticket_watched: 'watched',
    ticket_released: 'released',
    ticket_refunded: 'refunded',
    card_ticket_voided: 'voided',
};
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
    const tickets = new Map();
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
        applyProjection(record, data, { jobs, publications, entitlements, sales, withdrawals, governance, tickets });

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
        ...(tickets.size ? { market_v2_tickets: sortedValues(tickets) } : {}),
    };
}

export function normalizeFinalMarketEvents(rawRecords) {
    const records = rawRecords.map(parseRecord);
    if (records.some(record => record.execution_index !== undefined)
        && records.some(record => record.execution_index === undefined)) {
        throw new Error('mixed_execution_order_evidence');
    }
    return records.sort(compareRecords);
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
    case 'ticket_purchased':
        if (stores.tickets.has(key(requiredTicketId(data.ticket_id)))) break;
        stores.tickets.set(key(data.ticket_id), {
            ...base,
            ticket_id: requiredTicketId(data.ticket_id),
            publication_id: requiredId(data.publication_id),
            creator_id: requiredAccount(data.creator_id),
            rail: 'crypto',
            status: 'purchased',
            gross_amount: requiredDecimal(data.gross_usdc_micro),
            currency: 'USDC',
            vat_usdc_micro: requiredDecimal(data.vat_usdc_micro),
            platform_usdc_micro: requiredDecimal(data.platform_usdc_micro),
            creator_usdc_micro: requiredDecimal(data.creator_usdc_micro),
            purchased_at_ms: Number(requiredDecimal(data.block_timestamp_ms)),
            settled_at_ms: null,
            payout_credited_to_balance: 0,
        });
        break;
    case 'card_ticket_issued':
        if (stores.tickets.has(key(requiredTicketId(data.ticket_id)))) break;
        stores.tickets.set(key(data.ticket_id), {
            ...base,
            ticket_id: requiredTicketId(data.ticket_id),
            publication_id: requiredId(data.publication_id),
            creator_id: requiredAccount(data.creator_id),
            rail: 'card',
            status: 'purchased',
            gross_amount: requiredDecimal(data.gross_minor),
            currency: requiredCurrency(data.currency),
            vat_usdc_micro: '0',
            platform_usdc_micro: '0',
            creator_usdc_micro: '0',
            purchased_at_ms: Number(requiredDecimal(data.block_timestamp_ms)),
            settled_at_ms: null,
            payout_credited_to_balance: 0,
        });
        break;
    case 'ticket_watched':
    case 'ticket_released':
    case 'ticket_refunded':
    case 'card_ticket_voided': {
        const ticket = stores.tickets.get(key(requiredTicketId(data.ticket_id)));
        // Same as D1: a ticket purchased before indexing started is skipped.
        if (!ticket) break;
        const status = TICKET_STATUS_EVENTS[record.event.event];
        stores.tickets.set(key(data.ticket_id), {
            ...ticket,
            status,
            settled_at_ms: ['watched', 'released'].includes(status)
                ? Number(requiredDecimal(data.block_timestamp_ms)) : ticket.settled_at_ms,
            source_block_height: record.block_height,
        });
        break;
    }
    case 'creator_payout_credited': {
        const ticket = stores.tickets.get(key(requiredTicketId(data.ticket_id)));
        if (!ticket) break;
        stores.tickets.set(key(data.ticket_id), { ...ticket, payout_credited_to_balance: 1, source_block_height: record.block_height });
        break;
    }
    case 'device_added':
    case 'device_revoked':
        // Devices are authoritative only through get_ticket; the raw event stays in chain_events.
        requiredTicketId(data.ticket_id);
        break;
    default:
        if (GOVERNANCE_EVENTS.has(record.event.event) || MARKET_V2_V1_ENVELOPE_EVENTS.has(record.event.event)) {
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
        || !Number.isSafeInteger(value.event_index) || value.event_index < 0
        || (value.execution_index !== undefined
            && (!Number.isSafeInteger(value.execution_index) || value.execution_index < 0))) {
        throw new Error('invalid_final_event_envelope');
    }
    const event = value.event;
    const marketV2 = event?.version === '2.0.0';
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || event.standard !== 'youtick_market'
        || !(marketV2
            ? MARKET_V2_CATALOG.has(event.event)
            : event.version === '1.0.0' && (CATALOG.has(event.event) || MARKET_V2_V1_ENVELOPE_EVENTS.has(event.event)))
        || !Array.isArray(event.data) || event.data.length !== 1
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
        || (left.execution_index !== undefined && right.execution_index !== undefined
            ? left.execution_index - right.execution_index : 0)
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

function requiredTicketId(value) {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('invalid_event_data');
    return value;
}

function requiredCurrency(value) {
    if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw new Error('invalid_event_data');
    return value;
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
