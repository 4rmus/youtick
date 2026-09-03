#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MAX_BLOCK_BYTES = 16 * 1024 * 1024;
const EVENT_PREFIX = 'EVENT_JSON:';
const EVENT_CATALOG = new Set([
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
    'contract_migrated',
]);
const LEGACY_GOVERNANCE_EVENTS = new Set([
    'bridge_frozen',
    'bridge_rotation_proposed',
    'bridge_rotation_cancelled',
    'bridge_rotated',
    'bridge_unfrozen',
    'quote_key_rotated',
]);

export async function fetchNeardataMarketBlock(input, fetchImpl = fetch) {
    const network = input?.network;
    const contractId = input?.contractId;
    const blockHeight = input?.blockHeight;
    if (!['testnet', 'mainnet'].includes(network)
        || typeof contractId !== 'string'
        || !ACCOUNT_PATTERN.test(contractId)
        || !Number.isSafeInteger(blockHeight)
        || blockHeight < 1) {
        throw new Error('invalid_neardata_request');
    }
    const response = await fetchImpl(
        `https://${network}.neardata.xyz/v0/block/${blockHeight}`,
        { signal: AbortSignal.timeout(10_000) },
    );
    const contentLength = Number(response.headers.get('Content-Length') || '0');
    if (!response.ok
        || (contentLength > 0 && contentLength > MAX_BLOCK_BYTES)) {
        throw new Error('neardata_unavailable');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_BLOCK_BYTES) {
        throw new Error('invalid_neardata_block');
    }
    let value;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new Error('invalid_neardata_block');
    }
    return parseNeardataMarketBlock(value, { network, contractId, blockHeight });
}

export function parseNeardataMarketBlock(value, expected) {
    const header = value?.block?.header;
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !header || typeof header !== 'object' || Array.isArray(header)
        || header.height !== expected.blockHeight
        || typeof header.hash !== 'string' || !HASH_PATTERN.test(header.hash)
        || typeof header.timestamp_nanosec !== 'string'
        || !/^[1-9][0-9]{15,24}$/.test(header.timestamp_nanosec)
        || !Array.isArray(value.shards)) {
        throw new Error('invalid_neardata_block');
    }
    const blockTimestampMs = String(BigInt(header.timestamp_nanosec) / 1_000_000n);
    const events = [];
    for (const shard of value.shards) {
        if (!shard || typeof shard !== 'object'
            || !Array.isArray(shard.receipt_execution_outcomes)) {
            throw new Error('invalid_neardata_block');
        }
        for (const item of shard.receipt_execution_outcomes) {
            const outcome = item?.execution_outcome;
            const receipt = item?.receipt;
            if (outcome?.outcome?.executor_id !== expected.contractId) continue;
            if (!receipt
                || receipt.receiver_id !== expected.contractId
                || typeof receipt.receipt_id !== 'string'
                || !HASH_PATTERN.test(receipt.receipt_id)
                || receipt.receipt_id !== outcome.id
                || outcome.block_hash !== header.hash
                || typeof receipt.predecessor_id !== 'string'
                || !ACCOUNT_PATTERN.test(receipt.predecessor_id)
                || !Array.isArray(outcome.outcome.logs)) {
                throw new Error('invalid_neardata_outcome');
            }
            if (!successfulOutcome(outcome.outcome.status)) continue;
            outcome.outcome.logs.forEach((log, eventIndex) => {
                if (typeof log !== 'string') throw new Error('invalid_neardata_outcome');
                if (!log.startsWith(EVENT_PREFIX)) return;
                let event;
                try {
                    event = JSON.parse(log.slice(EVENT_PREFIX.length));
                } catch {
                    throw new Error('invalid_neardata_event');
                }
                const data = event?.data?.[0];
                if (event?.standard !== 'youtick_market'
                    || event?.version !== '1.0.0'
                    || !EVENT_CATALOG.has(event?.event)
                    || !Array.isArray(event?.data) || event.data.length !== 1
                    || !data || typeof data !== 'object' || Array.isArray(data)) {
                    throw new Error('invalid_neardata_event');
                }
                const missingCommonContext = [
                    'contract_id',
                    'predecessor_account_id',
                    'block_height',
                    'block_timestamp_ms',
                    'idempotency_key',
                ].some((key) => data[key] === undefined);
                if (missingCommonContext && !LEGACY_GOVERNANCE_EVENTS.has(event.event)) {
                    throw new Error('invalid_neardata_event');
                }
                const common = {
                    contract_id: expected.contractId,
                    predecessor_account_id: receipt.predecessor_id,
                    block_height: String(header.height),
                    block_timestamp_ms: blockTimestampMs,
                    idempotency_key: data.idempotency_key
                        ?? `legacy:${receipt.receipt_id}:${eventIndex}`,
                };
                for (const [key, expectedValue] of Object.entries(common)
                    .filter(([key]) => key !== 'idempotency_key')) {
                    if (data[key] !== undefined && data[key] !== expectedValue) {
                        throw new Error('invalid_neardata_event');
                    }
                }
                if (typeof common.idempotency_key !== 'string'
                    || !/^[A-Za-z0-9._:-]{1,192}$/.test(common.idempotency_key)) {
                    throw new Error('invalid_neardata_event');
                }
                if (data.actor_id !== undefined && data.actor_id !== receipt.predecessor_id) {
                    throw new Error('invalid_neardata_event');
                }
                event = { ...event, data: [{ ...common, ...data }] };
                events.push({
                    network: expected.network,
                    finality: 'final',
                    block_height: header.height,
                    block_hash: header.hash,
                    receipt_id: receipt.receipt_id,
                    event_index: eventIndex,
                    event,
                });
            });
        }
    }
    return {
        schema: 'youtick.market-final-block.v1',
        network: expected.network,
        contract_id: expected.contractId,
        finality: 'final',
        block_height: header.height,
        block_hash: header.hash,
        events,
    };
}

function successfulOutcome(status) {
    return status && typeof status === 'object' && !Array.isArray(status)
        && (Object.hasOwn(status, 'SuccessValue') || Object.hasOwn(status, 'SuccessReceiptId'));
}

function cliArguments(values) {
    const args = Object.fromEntries(values.slice(2).map((value) => value.split('=', 2)));
    const blockHeight = Number(args['--height']);
    if (!args['--network'] || !args['--contract'] || !Number.isSafeInteger(blockHeight)) {
        throw new Error('usage: --network=testnet --contract=account.testnet --height=123');
    }
    return { network: args['--network'], contractId: args['--contract'], blockHeight };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    fetchNeardataMarketBlock(cliArguments(process.argv))
        .then((block) => process.stdout.write(`${JSON.stringify(block)}\n`))
        .catch((error) => {
            process.stderr.write(`${error instanceof Error ? error.message : 'neardata_failed'}\n`);
            process.exitCode = 1;
        });
}
