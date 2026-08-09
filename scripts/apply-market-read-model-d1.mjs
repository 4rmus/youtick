import {
    canonicalMarketEventJson,
    normalizeFinalMarketEvents,
} from './rebuild-market-read-model.mjs';

export const MAX_FINAL_EVENTS_PER_BATCH = 16;

export async function applyFinalMarketEventBatch(db, rawRecords) {
    const records = normalizeFinalMarketEvents(rawRecords);
    if (records.length < 1) {
        throw new Error('invalid_d1_event_batch_size');
    }
    const first = records[0];
    const contractId = first.event.data[0].contract_id;
    if (records.some((record) => record.network !== first.network
        || record.block_height !== first.block_height
        || record.block_hash !== first.block_hash
        || record.event.data[0].contract_id !== contractId)) {
        throw new Error('mixed_d1_final_block_batch');
    }
    return applyFinalMarketBlock(db, {
        network: first.network,
        contract_id: contractId,
        finality: 'final',
        block_height: first.block_height,
        block_hash: first.block_hash,
        events: records,
    });
}

export async function applyFinalMarketBlock(db, rawBlock) {
    const block = normalizeFinalMarketBlock(rawBlock);
    const records = block.events;

    const statements = [];
    for (const record of records) {
        const data = record.event.data[0];
        statements.push(bound(db, `
            INSERT INTO chain_events (
                network, contract_id, block_height, block_hash, receipt_id,
                event_index, event_name, event_version, idempotency_key,
                block_timestamp_ms, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT DO UPDATE SET payload_json = CASE
                WHEN chain_events.network = excluded.network
                 AND chain_events.contract_id = excluded.contract_id
                 AND chain_events.block_height = excluded.block_height
                 AND chain_events.block_hash = excluded.block_hash
                 AND chain_events.receipt_id = excluded.receipt_id
                 AND chain_events.event_index = excluded.event_index
                 AND chain_events.event_name = excluded.event_name
                 AND chain_events.event_version = excluded.event_version
                 AND chain_events.idempotency_key = excluded.idempotency_key
                 AND chain_events.payload_json = excluded.payload_json
                THEN chain_events.payload_json ELSE NULL END
        `, [
            record.network, block.contract_id, record.block_height, record.block_hash,
            record.receipt_id, record.event_index, record.event.event,
            record.event.version, data.idempotency_key, Number(data.block_timestamp_ms),
            canonicalMarketEventJson(record.event),
        ]));
        statements.push(...projectionStatements(db, record, data));
    }
    statements.push(bound(db, `
        INSERT INTO finality_watermarks (
            network, contract_id, block_height, block_hash, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (network, contract_id) DO UPDATE SET
            block_height = excluded.block_height,
            block_hash = excluded.block_hash,
            updated_at_ms = MAX(finality_watermarks.updated_at_ms, excluded.updated_at_ms)
    `, [block.network, block.contract_id, block.block_height, block.block_hash, Date.now()]));
    return db.batch(statements);
}

function normalizeFinalMarketBlock(value) {
    if (Array.isArray(value?.events)
        && value.events.length > MAX_FINAL_EVENTS_PER_BATCH) {
        throw new Error('d1_final_block_event_limit_exceeded');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !['testnet', 'mainnet'].includes(value.network)
        || value.finality !== 'final'
        || typeof value.contract_id !== 'string'
        || !/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(value.contract_id)
        || !Number.isSafeInteger(value.block_height)
        || value.block_height < 1
        || typeof value.block_hash !== 'string'
        || !/^[A-Za-z0-9_-]{32,128}$/.test(value.block_hash)
        || !Array.isArray(value.events)) {
        throw new Error('invalid_d1_final_block');
    }
    const events = normalizeFinalMarketEvents(value.events);
    if (events.some((record) => record.network !== value.network
        || record.block_height !== value.block_height
        || record.block_hash !== value.block_hash
        || record.event.data[0].contract_id !== value.contract_id)) {
        throw new Error('mixed_d1_final_block_batch');
    }
    return { ...value, events };
}

function projectionStatements(db, record, data) {
    const scope = [record.network, data.contract_id];
    const height = record.block_height;
    switch (record.event.event) {
    case 'media_job_authorized':
        return [bound(db, `
            INSERT INTO media_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            ON CONFLICT (network, contract_id, job_id) DO UPDATE SET
                creator_id=excluded.creator_id, generation=excluded.generation,
                expected_source_bytes=excluded.expected_source_bytes,
                fee_asset=excluded.fee_asset, fee_amount=excluded.fee_amount,
                source_block_height=excluded.source_block_height
            WHERE media_jobs.source_block_height < excluded.source_block_height
        `, [...scope, data.job_id, data.account_id, data.generation,
            data.expected_source_bytes, data.asset, data.amount, height])];
    case 'media_job_upload_key_replaced':
        return [bound(db, `
            UPDATE media_jobs SET upload_public_key_sha256=?, source_block_height=?
            WHERE network=? AND contract_id=? AND job_id=? AND generation=?
              AND source_block_height <= ?
        `, [data.upload_public_key_sha256, height, ...scope, data.job_id, data.generation, height])];
    case 'publication_finalized':
        return [bound(db, `
            INSERT INTO publications (
                network, contract_id, publication_id, creator_id, title,
                generation, price_usdc, playback_id, availability,
                published_at_ms, source_block_height
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (network, contract_id, publication_id) DO UPDATE SET
                creator_id=excluded.creator_id, title=excluded.title,
                generation=excluded.generation, price_usdc=excluded.price_usdc,
                playback_id=excluded.playback_id,
                availability=excluded.availability,
                published_at_ms=excluded.published_at_ms,
                source_block_height=excluded.source_block_height
            WHERE publications.source_block_height < excluded.source_block_height
        `, [...scope, data.publication_id, data.account_id, data.title,
            data.generation, data.amount, data.playback_id, data.availability,
            data.published_at_ms, height])];
    case 'publication_sales_suspended':
    case 'publication_takedown':
        return [bound(db, `
            UPDATE publications SET availability=?, source_block_height=?
            WHERE network=? AND contract_id=? AND publication_id=?
              AND source_block_height <= ?
        `, [data.availability, height, ...scope, data.publication_id, height])];
    case 'entitlement_purchased':
        return [
            bound(db, `INSERT OR IGNORE INTO viewer_entitlements VALUES (?, ?, ?, ?, ?)`,
                [...scope, data.account_id, data.publication_id, height]),
            bound(db, `
                INSERT INTO sale_ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (network, contract_id, idempotency_key) DO NOTHING
            `, [...scope, data.idempotency_key, data.account_id, data.creator_id,
                data.publication_id, data.asset, data.amount, data.creator_amount,
                data.platform_amount, height]),
        ];
    case 'creator_balance_withdrawal_started':
    case 'creator_balance_withdrawal_succeeded':
    case 'creator_balance_withdrawal_failed':
    case 'platform_withdrawal_started':
        return [bound(db, `
            INSERT INTO withdrawal_history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (network, contract_id, withdrawal_id) DO UPDATE SET
                status=excluded.status, reason_code=excluded.reason_code,
                source_block_height=excluded.source_block_height
            WHERE withdrawal_history.source_block_height <= excluded.source_block_height
        `, [...scope, data.withdrawal_id, data.account_id, data.asset, data.amount,
            record.event.event, data.reason_code || null, height])];
    default:
        return [bound(db, `
            INSERT INTO governance_audit VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (network, contract_id, event_name, idempotency_key) DO NOTHING
        `, [...scope, record.event.event, data.idempotency_key,
            canonicalMarketEventJson(data), height])];
    }
}

function bound(db, sql, values) {
    return db.prepare(sql).bind(...values);
}
