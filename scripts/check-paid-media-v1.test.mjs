import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    STREAM_LADDER, STREAM_PROFILE_PATH, checkStreamProfile, sortedJson, streamProfileHash, v1ProfileHashes,
} from './check-paid-media-v1.mjs';

const CHECKER = fileURLToPath(new URL('./check-paid-media-v1.mjs', import.meta.url));

/** The OD19 descriptor shape; the real file is written by the Bridge gate and must pass the same checks. */
function fixture(overrides = {}) {
    const entry = {
        provider: 'cloudflare-stream',
        container: 'fmp4',
        codec: 'h264',
        policy: { requireSignedURLs: true, tokenPlacement: 'path' },
        maxDurationSecondsCap: 7200,
        profiles: STREAM_LADDER.map((rung) => ({ ...rung })),
        ...overrides,
    };
    return { stream: { hash: streamProfileHash(entry), ...entry } };
}

test('a descriptor of the OD19 shape passes and its hash follows the V1 sortedJson rule', () => {
    const document = fixture();
    const hash = checkStreamProfile(document, { v1Hashes: v1ProfileHashes() });
    assert.match(hash, /^[0-9a-f]{64}$/);
    // Key order in the file does not matter: the hash covers the recursively sorted JSON.
    const { hash: _hash, ...entry } = document.stream;
    assert.equal(sortedJson(entry), '{"codec":"h264","container":"fmp4","maxDurationSecondsCap":7200,"policy":{"requireSignedURLs":true,"tokenPlacement":"path"},'
        + '"profiles":[{"height":240,"name":"240p","width":426},{"height":360,"name":"360p","width":640},{"height":480,"name":"480p","width":852},'
        + '{"height":720,"name":"720p","width":1280},{"height":1080,"name":"1080p","width":1920}],"provider":"cloudflare-stream"}');
    const reordered = { stream: Object.fromEntries(Object.entries(document.stream).reverse()) };
    assert.equal(checkStreamProfile(reordered), hash);
});

test('every drift from the descriptor shape is refused', () => {
    const base = fixture();
    const withHash = (stream) => ({ stream });
    const cases = [
        [{ ...base, extra: {} }, /exactly one entry/],
        [{}, /exactly one entry/],
        [withHash({ ...base.stream, note: 'x' }), /exactly the keys/],
        [fixture({ provider: 'livepeer' }), /provider/],
        [fixture({ container: 'ts' }), /container/],
        [fixture({ codec: 'h265' }), /codec/],
        [fixture({ policy: { requireSignedURLs: false, tokenPlacement: 'path' } }), /policy/],
        [fixture({ policy: { requireSignedURLs: true, tokenPlacement: 'query' } }), /policy/],
        [fixture({ policy: { requireSignedURLs: true, tokenPlacement: 'path', downloadable: false } }), /policy/],
        [fixture({ maxDurationSecondsCap: 0 }), /maxDurationSecondsCap/],
        [fixture({ maxDurationSecondsCap: 36001 }), /maxDurationSecondsCap/],
        [fixture({ maxDurationSecondsCap: '7200' }), /maxDurationSecondsCap/],
        [fixture({ profiles: STREAM_LADDER.slice(1) }), /5 renditions/],
        [fixture({ profiles: [...STREAM_LADDER].reverse() }), /ascending ladder/],
        [fixture({ profiles: STREAM_LADDER.map((rung, index) => (index === 2 ? { ...rung, width: 854 } : rung)) }), /ascending ladder/],
        [fixture({ profiles: STREAM_LADDER.map((rung, index) => (index === 0 ? { ...rung, name: '240' } : rung)) }), /height followed by p/],
        [fixture({ profiles: STREAM_LADDER.map((rung, index) => (index === 0 ? { ...rung, bitrate: 1 } : rung)) }), /exactly name, width, height/],
        [withHash({ ...base.stream, hash: base.stream.hash.toUpperCase() }), /64 lowercase hex/],
        [withHash({ ...base.stream, maxDurationSecondsCap: 3600 }), /hash drift/],
    ];
    for (const [document, pattern] of cases) assert.throws(() => checkStreamProfile(document), pattern, JSON.stringify(document).slice(0, 120));
    // A Stream hash may never collide with a V1 Studio profile hash.
    assert.throws(() => checkStreamProfile(base, { v1Hashes: [base.stream.hash] }), /differ from every V1/);
});

test('the CLI checks a path argument and fails with a message on drift', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paid-media-v1-'));
    const good = join(dir, 'stream-profile.json');
    await writeFile(good, `${JSON.stringify(fixture(), null, 2)}\n`);
    assert.match(execFileSync(process.execPath, [CHECKER, good], { encoding: 'utf8' }), /^paid-media-v1 stream profile OK \([0-9a-f]{64}\)\n$/);
    const bad = join(dir, 'drift.json');
    const drift = fixture();
    drift.stream.maxDurationSecondsCap = 60;
    await writeFile(bad, JSON.stringify(drift));
    assert.throws(() => execFileSync(process.execPath, [CHECKER, bad], { encoding: 'utf8', stdio: 'pipe' }), /hash drift/);
});

test('the committed descriptor, once it lands, passes the checker', { skip: !existsSync(STREAM_PROFILE_PATH) && 'protocol/paid-media-v1/stream-profile.json is written by the Bridge gate of M2' }, () => {
    assert.match(execFileSync(process.execPath, [CHECKER], { encoding: 'utf8' }), /^paid-media-v1 stream profile OK/);
});
