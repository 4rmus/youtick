import assert from 'node:assert/strict';
import test from 'node:test';
import {
    nextCheckpoint,
    pageHtml,
    readBrowserConfig,
} from './r2-ingest-browser-resume-canary.mjs';

test('30/70 checkpoints advance only after persisted provider parts', () => {
    assert.equal(nextCheckpoint(0), 3);
    assert.equal(nextCheckpoint(3), 7);
    assert.equal(nextCheckpoint(7), 10);
    assert.equal(nextCheckpoint(10), null);
    assert.throws(() => nextCheckpoint(11), /invalid_uploaded_part_count/);
});

test('browser canary keeps the private EU bucket scope explicit', () => {
    const config = readBrowserConfig({
        R2_BROWSER_CANARY_ACK: 'run-paid-media-v4-r2-browser-resume-canary',
        CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
        R2_BUCKET: 'youtick-paid-media-canary',
        R2_ACCESS_KEY_ID: 'access-key',
        R2_SECRET_ACCESS_KEY: 'secret-key',
    });
    assert.equal(config.endpoint, `https://${'a'.repeat(32)}.eu.r2.cloudflarestorage.com`);
    assert.throws(() => readBrowserConfig({}), /R2_BROWSER_CANARY_ACK/);
});

test('browser canary binds controls without relying on named window globals', () => {
    const html = pageHtml();
    assert.match(html, /const source=document\.getElementById\('source'\)/);
    assert.match(html, /const upload=document\.getElementById\('upload'\)/);
    assert.match(html, /const status=document\.getElementById\('status'\)/);
    assert.match(html, /source\.value=''/);
    assert.match(html, /if\(running\)return/);
    assert.match(html, /finally\{running=false\}/);
    assert.match(html, /status\.textContent='STARTING'/);
    assert.match(html, /status\.textContent='READY_BOUND'/);
});
