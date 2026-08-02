import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isTerminalBrowserCanaryState,
    runLivepeerHlsBrowserCanary,
} from './livepeer-hls-browser-canary.mjs';

test('browser canary does not treat an unset state as terminal', () => {
    assert.equal(isTerminalBrowserCanaryState(undefined), false);
    assert.equal(isTerminalBrowserCanaryState('running'), false);
    assert.equal(isTerminalBrowserCanaryState('pass'), true);
    assert.equal(isTerminalBrowserCanaryState('fail'), true);
});

test('browser canary only binds its token endpoint to loopback', async () => {
    await assert.rejects(
        runLivepeerHlsBrowserCanary({
            hlsUrl: 'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8',
            issueToken: () => 'header.payload.signature',
            host: '0.0.0.0',
        }),
        /browser_canary_host_invalid/,
    );
});

test('browser canary rejects noncanonical HLS URLs before issuing a JWT', async () => {
    for (const hlsUrl of [
        'https://example.test/asset/hls/playback-123/index.m3u8',
        'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8?jwt=token',
        'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8#fragment',
        'https://playback.livepeer.studio:8443/asset/hls/playback-123/index.m3u8',
        'https://user:password@playback.livepeer.studio/asset/hls/playback-123/index.m3u8',
    ]) {
        let issued = false;
        await assert.rejects(
            runLivepeerHlsBrowserCanary({
                hlsUrl,
                issueToken: () => {
                    issued = true;
                    return 'header.payload.signature';
                },
            }),
            /browser_canary_hls_url_invalid/,
        );
        assert.equal(issued, false);
    }
});

test('browser canary serves no-store inputs only to its launched browser challenges', async () => {
    const startedAt = Date.now();
    let resolveReady;
    let releaseBrowsers;
    const ready = new Promise((resolve) => { resolveReady = resolve; });
    const release = new Promise((resolve) => { releaseBrowsers = resolve; });
    const browserInputs = [];
    let tokenNumber = 0;
    const result = runLivepeerHlsBrowserCanary({
        hlsUrl: 'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8',
        issueToken: () => `header.payload.signature-${tokenNumber += 1}`,
        timeoutMs: 5_000,
        onReady: resolveReady,
        browserRunner: async (input) => {
            browserInputs.push(input);
            await release;
            const pageUrl = new URL(input.url);
            const query = pageUrl.search;
            const config = await fetch(`${pageUrl.origin}/config${query}`);
            assert.equal(config.headers.get('Cache-Control'), 'no-store');
            assert.deepEqual(await config.json(), {
                hls_url: 'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8',
            });
            const first = await fetch(`${pageUrl.origin}/token${query}`, { method: 'POST' });
            const second = await fetch(`${pageUrl.origin}/token${query}`, { method: 'POST' });
            assert.equal(first.headers.get('Cache-Control'), 'no-store');
            assert.notEqual((await first.json()).token, (await second.json()).token);
            return {
                browser: input.browser,
                initial_played: true,
                refreshed_played: true,
                initial_hls_header_requests: 1,
                refreshed_hls_header_requests: 1,
                persistent_storage_empty: true,
                ignored: 'not-retained',
            };
        },
    });
    const baseUrl = await ready;

    const anonymousConfig = await fetch(`${baseUrl}/config`);
    const anonymousToken = await fetch(`${baseUrl}/token`, { method: 'POST' });
    assert.equal(anonymousConfig.status, 404);
    assert.equal(anonymousToken.status, 404);
    releaseBrowsers();

    assert.deepEqual(await result, {
        matrix_proven: true,
        chrome: {
            initial_played: true,
            refreshed_played: true,
            initial_hls_header_requests: 1,
            refreshed_hls_header_requests: 1,
            persistent_storage_empty: true,
        },
        edge: {
            initial_played: true,
            refreshed_played: true,
            initial_hls_header_requests: 1,
            refreshed_hls_header_requests: 1,
            persistent_storage_empty: true,
        },
    });
    assert.deepEqual(browserInputs.map(({ browser, url }) => ({
        browser,
        path: new URL(url).pathname,
        challengeLength: new URL(url).searchParams.get('challenge')?.length,
    })), [
        { browser: 'chrome', path: '/', challengeLength: 43 },
        { browser: 'edge', path: '/', challengeLength: 43 },
    ]);
    assert.ok(Date.now() - startedAt < 1_000);
});

test('browser canary requires a JWT header request in both playback rounds', async () => {
    await assert.rejects(
        runLivepeerHlsBrowserCanary({
            hlsUrl: 'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8',
            issueToken: () => 'header.payload.signature',
            browserRunner: async ({ browser }) => ({
                browser,
                initial_played: true,
                refreshed_played: true,
                initial_hls_header_requests: 0,
                refreshed_hls_header_requests: 2,
                persistent_storage_empty: true,
            }),
        }),
        /browser_canary_matrix_failed/,
    );
});
