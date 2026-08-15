import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REQUIRED_EVENTS = [
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
    'bridge_rotated',
    'bridge_unfrozen',
    'quote_key_rotated',
];
const PILOT_EXTENSIONS = [
    'bridge_rotation_cancelled',
    'new_purchases_paused',
    'new_purchases_unpaused',
];
const NOT_APPLICABLE_TO_FRESH_ID = ['contract_migrated'];

function sorted(values) {
    return [...new Set(values)].sort();
}

function emittedEvents(source) {
    return sorted([...source.matchAll(
        /emit_(?:market|governance)_event\(\s*"([a-z][a-z0-9_]*)"/g,
    )].map((match) => match[1]));
}

function setValues(source, name) {
    const match = source.match(new RegExp(
        `const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`,
    ));
    assert.ok(match, `${name} declaration missing`);
    return sorted([...match[1].matchAll(/'([a-z][a-z0-9_]*)'/g)]
        .map((value) => value[1]));
}

test('Market producer and final-event consumers share the EVENT-001 catalog', async () => {
    const [contract, neardata, rebuild] = await Promise.all([
        readFile(new URL('../contracts/nft-ticket/src/lib.rs', import.meta.url), 'utf8'),
        readFile(new URL('./fetch-neardata-market-block.mjs', import.meta.url), 'utf8'),
        readFile(new URL('./rebuild-market-read-model.mjs', import.meta.url), 'utf8'),
    ]);
    const expectedEmitted = sorted([...REQUIRED_EVENTS, ...PILOT_EXTENSIONS]);
    const expectedAccepted = sorted([
        ...expectedEmitted,
        ...NOT_APPLICABLE_TO_FRESH_ID,
    ]);

    assert.deepEqual(emittedEvents(contract), expectedEmitted);
    assert.deepEqual(setValues(neardata, 'EVENT_CATALOG'), expectedAccepted);
    assert.deepEqual(setValues(rebuild, 'CATALOG'), expectedAccepted);
});
