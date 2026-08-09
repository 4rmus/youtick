import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { marketReadApi } from '../read-model/api.mjs';

async function environment(enabled = true) {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(await readFile(new URL('../read-model/d1/0001_initial.sql', import.meta.url), 'utf8'));
    sqlite.prepare('INSERT INTO finality_watermarks VALUES (?, ?, ?, ?, ?)')
        .run('testnet', 'market.testnet', 103,
            'block_hash_000000000000000000000103', 1_785_600_000_000);
    for (const row of [
        ['pub-c', 'creator.testnet', 'Release C', 'playback_c', 'ACTIVE', 1_785_600_000_103, 103],
        ['pub-b', 'other.testnet', 'Release B', 'playback_b', 'ACTIVE', 1_785_600_000_102, 102],
        ['pub-a', 'creator.testnet', 'Release A', 'playback_a', 'SALES_SUSPENDED', 1_785_600_000_101, 101],
    ]) {
        sqlite.prepare('INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run('testnet', 'market.testnet', row[0], row[1], row[2], 1,
                '2000000', row[3], row[4], row[5], row[6]);
    }
    sqlite.prepare('INSERT INTO sale_ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run('testnet', 'market.testnet', 'sale-1', 'buyer.testnet', 'creator.testnet',
            'pub-c', 'USDC', '2000000', '1960000', '40000', 103);
    const database = {
        prepare(sql) {
            return { bind: (...values) => ({ sql, values }) };
        },
        async batch(statements) {
            return statements.map(({ sql, values }) => ({
                success: true,
                results: [...sqlite.prepare(sql).all(...values)],
            }));
        },
    };
    return {
        sqlite,
        env: {
            READ_MODEL_ENABLED: enabled ? 'true' : 'false',
            READ_MODEL_NETWORK: 'testnet',
            READ_MODEL_CONTRACT_ID: 'market.testnet',
            READ_MODEL_WEB_ORIGIN: 'https://app.test',
            MARKET_READ_MODEL: database,
        },
    };
}

test('read API stays closed by default and accepts only GET', async () => {
    const { sqlite, env } = await environment(false);
    assert.equal((await marketReadApi(new Request('https://read.test/v1/publications'), env)).status, 503);
    env.READ_MODEL_ENABLED = 'true';
    assert.equal((await marketReadApi(new Request('https://read.test/v1/publications', {
        method: 'POST',
    }), env)).status, 405);
    sqlite.close();
});

test('publications paginate active rows and bind cache identity to watermark', async () => {
    const { sqlite, env } = await environment();
    const first = await marketReadApi(new Request('https://read.test/v1/publications?limit=1'), env);
    const firstValue = await first.json();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('Access-Control-Allow-Origin'), 'https://app.test');
    assert.equal(firstValue.schema, 'youtick.publications.v1');
    assert.deepEqual(firstValue.items.map((item) => item.publication_id), ['pub-c']);
    assert.deepEqual(firstValue.items[0], {
        publication_id: 'pub-c', creator_id: 'creator.testnet', title: 'Release C',
        generation: 1, price_usdc: '2000000', playback_id: 'playback_c',
        availability: 'ACTIVE', published_at_ms: 1_785_600_000_103,
        source_block_height: 103,
    });
    assert.ok(firstValue.next_cursor);
    assert.match(first.headers.get('ETag'),
        /^"103:block_hash_000000000000000000000103:[a-f0-9]{16}"$/);

    const second = await marketReadApi(new Request(
        `https://read.test/v1/publications?limit=1&cursor=${firstValue.next_cursor}`,
    ), env);
    assert.deepEqual((await second.json()).items.map((item) => item.publication_id), ['pub-b']);
    const cached = await marketReadApi(new Request('https://read.test/v1/publications?limit=1', {
        headers: { 'If-None-Match': first.headers.get('ETag') },
    }), env);
    assert.equal(cached.status, 304);
    const differentResource = await marketReadApi(new Request(
        'https://read.test/v1/publications/pub-c',
        { headers: { 'If-None-Match': first.headers.get('ETag') } },
    ), env);
    assert.equal(differentResource.status, 200);
    sqlite.close();
});

test('creator projections include suspended work and expose aggregate sales only', async () => {
    const { sqlite, env } = await environment();
    sqlite.prepare('INSERT INTO sale_ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run('testnet', 'market.testnet', 'sale-2', 'buyer-2.testnet', 'creator.testnet',
            'pub-c', 'USDC', '9007199254740993', '9007199254740993', '0', 103);
    const publications = await marketReadApi(new Request(
        'https://read.test/v1/creators/creator.testnet/publications',
    ), env);
    const publicationValue = await publications.json();
    assert.deepEqual(
        publicationValue.items.map((item) => [item.publication_id, item.availability]),
        [['pub-c', 'ACTIVE'], ['pub-a', 'SALES_SUSPENDED']],
    );

    const summary = await marketReadApi(new Request(
        'https://read.test/v1/creators/creator.testnet/sales-summary',
    ), env);
    assert.deepEqual(await summary.json(), {
        schema: 'youtick.creator-sales-summary.v1',
        watermark: {
            block_height: 103,
            block_hash: 'block_hash_000000000000000000000103',
        },
        creator_id: 'creator.testnet',
        sale_count: 2,
        gross_usdc: '9007199256740993',
        creator_usdc: '9007199256700993',
    });
    sqlite.close();
});

test('invalid cursor and account input fail before a database query', async () => {
    const { sqlite, env } = await environment();
    assert.equal((await marketReadApi(new Request(
        'https://read.test/v1/publications?cursor=bad!',
    ), env)).status, 400);
    assert.equal((await marketReadApi(new Request(
        'https://read.test/v1/creators/INVALID/publications',
    ), env)).status, 400);
    assert.equal((await marketReadApi(new Request(
        'https://read.test/v1/creators/%E0%A4%A/publications',
    ), env)).status, 400);
    sqlite.close();
});

test('read API emits bounded route latency without creator or publication IDs', async () => {
    const { sqlite, env } = await environment();
    const logs = [];
    const originalInfo = console.info;
    console.info = (value) => logs.push(JSON.parse(String(value)));
    try {
        const response = await marketReadApi(new Request(
            'https://read.test/v1/creators/creator.testnet/publications?limit=1',
        ), env);
        assert.equal(response.status, 200);
    } finally {
        console.info = originalInfo;
        sqlite.close();
    }
    assert.deepEqual(logs, [{
        schema: 'youtick.market-read-api.v1',
        event: 'read_model_request_completed',
        route: 'creator_publications',
        http_code: 200,
        latency_ms: logs[0].latency_ms,
    }]);
    assert.ok(Number.isSafeInteger(logs[0].latency_ms));
    assert.doesNotMatch(JSON.stringify(logs), /creator\.testnet|pub-c/);
});

test('temporary D1 failure returns a bounded 503 without leaking its error', async () => {
    const { sqlite, env } = await environment();
    env.MARKET_READ_MODEL.batch = async () => {
        throw new Error('token_secret_value');
    };
    const logs = [];
    const originalInfo = console.info;
    console.info = (value) => logs.push(JSON.parse(String(value)));
    try {
        const response = await marketReadApi(new Request(
            'https://read.test/v1/publications',
        ), env);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'read_model_unavailable' });
    } finally {
        console.info = originalInfo;
        sqlite.close();
    }
    assert.deepEqual(logs, [{
        schema: 'youtick.market-read-api.v1',
        event: 'read_model_request_completed',
        route: 'publications',
        http_code: 503,
        latency_ms: logs[0].latency_ms,
    }]);
    assert.doesNotMatch(JSON.stringify(logs), /token_secret_value/);
});
