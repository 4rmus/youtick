import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyPair } from 'near-api-js';

const state = vi.hoisted(() => ({
    grant: null as null | {
        accountId: string;
        sessionPublicKey: string;
        secretKey: string;
        scope: 'Play';
        resourceId: string;
        expiresAt: number;
        originHash: string;
        deviceHash: string;
    },
    isSessionGrantVisible: vi.fn(),
}));

vi.mock('@/lib/access-grants', () => ({
    getCachedSessionGrant: () => state.grant,
    isSessionGrantVisible: state.isSessionGrantVisible,
}));

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: {
        publicAppUrl: 'https://app.youtick.net',
        livepeerBridgeUrl: 'https://bridge.youtick.net',
    },
    FEATURE_FLAGS: { enablePaidMediaLivepeerV1: true },
    NEAR_CONFIG: {
        marketContractId: 'paid-media-livepeer-v1.testnet',
    },
    NEAR_NETWORK: 'testnet',
}));

import {
    createLivepeerHlsConfig,
    requestLivepeerPlaybackToken,
    startLivepeerPlaybackSession,
} from '@/lib/livepeer-playback';

const INPUT = {
    accountId: 'buyer.testnet',
    jobId: 'job-001',
    generation: 1,
    playbackId: 'playback_001',
};

function tokenResponse(token = 'header.payload.signature', expiresAtMs = Date.now() + 180_000) {
    return {
        schema: 'youtick.livepeer-playback-token.v1',
        playback_id: INPUT.playbackId,
        token,
        expires_at_ms: String(expiresAtMs),
        hls_url: `https://playback.livepeer.studio/asset/hls/${INPUT.playbackId}/index.m3u8`,
    };
}

async function installGrant() {
    const keyPair = KeyPair.fromRandom('ed25519');
    state.grant = {
        accountId: INPUT.accountId,
        sessionPublicKey: keyPair.getPublicKey().toString(),
        secretKey: keyPair.toString(),
        scope: 'Play',
        resourceId: INPUT.jobId,
        expiresAt: Date.now() + 10 * 60 * 1000,
        originHash: await sha256('https://app.youtick.net'),
        deviceHash: 'a'.repeat(64),
    };
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function playbackTimers() {
    vi.useFakeTimers();
    // Keep real SHA-256 values, but settle in microtasks instead of a native crypto thread.
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (_algorithm, data) => (
        Uint8Array.from(createHash('sha256').update(new Uint8Array(data as ArrayBuffer)).digest()).buffer
    ));
}

describe('Livepeer browser playback', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        state.isSessionGrantVisible.mockReset().mockResolvedValue(true);
        await installGrant();
    });

    afterEach(() => vi.useRealTimers());

    it('enables measured timeline repair only for the diagnosed playback ID and keeps JWT headers', () => {
        const known = createLivepeerHlsConfig(() => 'current.jwt.signature', 'ef819lp2r3anecgq');
        expect(known.pLoader).toBeTypeOf('function');
        expect(createLivepeerHlsConfig(() => null, 'another_playback')).not.toHaveProperty('pLoader');
        expect(createLivepeerHlsConfig(() => null)).not.toHaveProperty('pLoader');
        const setRequestHeader = vi.fn();
        known.xhrSetup({ setRequestHeader } as never, 'https://playback.livepeer.studio/asset/hls/ef819lp2r3anecgq/index.m3u8');
        expect(setRequestHeader).toHaveBeenCalledWith('Livepeer-Jwt', 'current.jwt.signature');
    });

    it.each([
        [403, 'playback_denied', 4], [429, 'rate_limited', 1],
        [503, 'provider_unavailable', 1], [500, 'internal_error', 1],
    ])('measures initial HTTP %s without changing the retry count', async (status, code, attempts) => {
        playbackTimers();
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const fetchMock = vi.fn(async () => Response.json({ error: code }, { status: Number(status) }));
        vi.stubGlobal('fetch', fetchMock);
        const onAccess = vi.fn();
        const started = Date.now();
        const result = expect(startLivepeerPlaybackSession(INPUT, { onAccess })).rejects.toMatchObject({
            message: code, status,
        });
        await vi.runAllTimersAsync();
        await result;
        expect(fetchMock).toHaveBeenCalledTimes(Number(attempts));
        expect(Date.now() - started).toBe(Number(attempts) === 4 ? 7000 : 0);
        expect(onAccess).not.toHaveBeenCalled();
        const entries = log.mock.calls.map(([entry]) => JSON.parse(String(entry)));
        expect(entries).toHaveLength(2);
        expect(entries[1]).toMatchObject({ phase: 'playback_token_initial', outcome: 'failed', errorCode: code, httpStatus: status });
    });

    it('retains HTTP 200 on unusable V1 tokens and never grants access', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const fetchMock = vi.fn(async () => Response.json({ ...tokenResponse(), token: 'secret-invalid-token' }));
        vi.stubGlobal('fetch', fetchMock);
        const onAccess = vi.fn();
        await expect(startLivepeerPlaybackSession(INPUT, { onAccess })).rejects.toMatchObject({
            message: 'invalid_livepeer_playback_token', status: 200,
        });
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(onAccess).not.toHaveBeenCalled();
        expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
            outcome: 'failed', errorCode: 'invalid_livepeer_playback_token', httpStatus: 200,
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    });

    it('retains access through a temporary renewal failure and retries before expiry', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        playbackTimers();
        const now = Date.now();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json(tokenResponse('initial.token.signature', now + 35_000)))
            .mockRejectedValueOnce(new TypeError('offline'))
            .mockResolvedValueOnce(Response.json(tokenResponse('renewed.token.signature', now + 180_000)));
        vi.stubGlobal('fetch', fetchMock);
        const onAccess = vi.fn();
        const onError = vi.fn();
        const session = await startLivepeerPlaybackSession(INPUT, { onAccess, onError });
        await vi.advanceTimersByTimeAsync(5000);
        expect(onAccess).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(onAccess).toHaveBeenCalledTimes(2);
        expect(onAccess).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'renewed.token.signature' }));
        session.destroy();
        await vi.advanceTimersByTimeAsync(200_000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(onError).not.toHaveBeenCalled();
        expect(log.mock.calls.map(([entry]) => JSON.parse(String(entry)))).toEqual(expect.arrayContaining([
            expect.objectContaining({ phase: 'playback_token_renewal', outcome: 'failed', errorCode: 'type_error' }),
            expect.objectContaining({ phase: 'playback_token_renewal', outcome: 'completed' }),
        ]));
    });

    it.each([[401, 'provider_unavailable'], [403, 'provider_unavailable'], [503, 'control_plane_disabled']])(
        'stops immediately for authoritative denial %s/%s instead of treating it as a network retry', async (status, code) => {
            playbackTimers();
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(Response.json(tokenResponse('initial.token.signature', Date.now() + 31_000)))
                .mockResolvedValueOnce(Response.json({ error: code }, { status: Number(status) }));
            vi.stubGlobal('fetch', fetchMock);
            const onError = vi.fn();
            const session = await startLivepeerPlaybackSession(INPUT, { onAccess: vi.fn(), onError });
            await vi.advanceTimersByTimeAsync(1000);
            expect(onError).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(180_000);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(onError).toHaveBeenCalledOnce();
            session.destroy();
        },
    );

    it('expires even when renewal hangs and never restores access from a late response', async () => {
        playbackTimers();
        let respond!: (value: Response) => void;
        let signal: AbortSignal | undefined;
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(Response.json(tokenResponse('initial.token.signature', Date.now() + 31_000)))
            .mockImplementationOnce((_url, init) => {
                signal = init.signal;
                return new Promise<Response>((resolve) => { respond = resolve; });
            }));
        const onAccess = vi.fn();
        const onError = vi.fn();
        const session = await startLivepeerPlaybackSession(INPUT, { onAccess, onError });
        await vi.advanceTimersByTimeAsync(31_000);
        expect(signal?.aborted).toBe(true);
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'livepeer_playback_token_expired' }));
        respond(Response.json(tokenResponse('late.token.signature')));
        await vi.runAllTimersAsync();
        expect(onAccess).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledOnce();
        session.destroy();
    });

    it('does not start access requests after the owning component has cancelled', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(startLivepeerPlaybackSession(INPUT, { signal: controller.signal, onAccess: vi.fn() }))
            .rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requests tokens with the in-memory Play grant and never persists the JWT', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => Response.json(tokenResponse()));
        vi.stubGlobal('fetch', fetchMock);

        await requestLivepeerPlaybackToken(INPUT);
        await requestLivepeerPlaybackToken(INPUT);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://bridge.youtick.net/v1/playback-tokens');
        expect(init.cache).toBe('no-store');
        const request = JSON.parse(String(init.body)) as {
            body: Record<string, unknown>;
            envelope: Record<string, unknown>;
        };
        expect(request.body).toMatchObject({
            job_id: INPUT.jobId,
            playback_id: INPUT.playbackId,
            grant_id: `play:${INPUT.jobId}:${INPUT.accountId}`,
            origin_hash: state.grant?.originHash,
            device_hash: state.grant?.deviceHash,
        });
        expect(request.envelope).toMatchObject({
            route: '/v1/playback-tokens',
            account_id: INPUT.accountId,
            resource: `playback:${INPUT.jobId}:1:${INPUT.playbackId}`,
            session_public_key: state.grant?.sessionPublicKey,
        });
        expect(sessionStorage.setItem).not.toHaveBeenCalled();
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('signs the exact localhost origin used by the configured local runtime', async () => {
        const originalWindow = globalThis.window;
        globalThis.window = { location: { origin: 'http://localhost:3000' } } as Window & typeof globalThis;
        if (state.grant) state.grant.originHash = await sha256('http://localhost:3000');
        try {
            const fetchMock = vi.fn().mockResolvedValue(Response.json(tokenResponse()));
            vi.stubGlobal('fetch', fetchMock);

            await requestLivepeerPlaybackToken(INPUT);

            const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
            expect(request.envelope.origin).toBe('http://localhost:3000');
        } finally {
            globalThis.window = originalWindow;
            vi.unstubAllGlobals();
        }
    });

    it('adds the latest in-memory JWT only to allowlisted HLS requests', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        let refresh: (() => Promise<void>) | undefined;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
            refresh = callback as () => Promise<void>;
            return 1 as unknown as ReturnType<typeof setTimeout>;
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json(tokenResponse('first.token.signature', Date.now() + 31_000)))
            .mockResolvedValueOnce(Response.json(tokenResponse('second.token.signature', Date.now() + 180_000)));
        vi.stubGlobal('fetch', fetchMock);
        let token: string | null = null;
        let playbackId: string | null = null;
        let expiresAtMs = 0;
        const config = createLivepeerHlsConfig(() => token);
        const session = await startLivepeerPlaybackSession(INPUT, {
            onAccess: (access) => {
                token = access.token;
                playbackId = access.playbackId;
                expiresAtMs = access.expiresAtMs;
            },
        });
        const setRequestHeader = vi.fn();
        const xhr = { setRequestHeader } as unknown as XMLHttpRequest;

        expect(config.capLevelToPlayerSize).toBe(true);
        expect(playbackId).toBe(INPUT.playbackId);
        expect(expiresAtMs).toBeGreaterThan(Date.now());
        for (const url of [
            'https://livepeercdn.com:8443/segment.ts',
            'https://user:password@livepeercdn.com/segment.ts',
            'https://example.com/segment.ts',
        ]) {
            expect(() => config.xhrSetup(xhr, url)).toThrow('livepeer_playback_url_invalid');
        }
        config.xhrSetup(xhr, 'https://asset-cdn.lp-playback.studio/hls/playback_001/segment.ts');
        expect(setRequestHeader).toHaveBeenLastCalledWith('Livepeer-Jwt', 'first.token.signature');

        await refresh?.();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        config.xhrSetup(xhr, 'https://playback.livepeer.studio/asset/hls/playback_001/index.m3u8');
        expect(setRequestHeader).toHaveBeenLastCalledWith('Livepeer-Jwt', 'second.token.signature');
        const phases = log.mock.calls.map(([value]) => JSON.parse(String(value)))
            .filter((entry) => entry.outcome === 'completed').map((entry) => entry.phase);
        expect(phases).toEqual(['playback_token_initial', 'playback_token_renewal']);
        expect(JSON.stringify(log.mock.calls)).not.toContain('token.signature');
        session.destroy();
    });

    it('refuses an allowlisted request when the in-memory JWT is missing', () => {
        const config = createLivepeerHlsConfig(() => null);
        expect(() => config.xhrSetup(
            { setRequestHeader: vi.fn() } as unknown as XMLHttpRequest,
            'https://playback.livepeer.studio/asset/hls/playback_001/index.m3u8',
        )).toThrow('livepeer_playback_token_missing');
    });

    it('aborts requests and clears token refresh when playback is destroyed', async () => {
        vi.spyOn(globalThis, 'setTimeout').mockReturnValue(17 as unknown as ReturnType<typeof setTimeout>);
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
        let requestSignal: AbortSignal | undefined;
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init: RequestInit) => {
            requestSignal = init.signal as AbortSignal;
            return Response.json(tokenResponse());
        }));

        const session = await startLivepeerPlaybackSession(INPUT, { onAccess: vi.fn() });
        session.destroy();

        expect(requestSignal?.aborted).toBe(true);
        expect(clearTimeoutSpy).toHaveBeenCalledWith(17);
    });

    it('retries the same Play grant while finality catches up', async () => {
        const nativeSetTimeout = globalThis.setTimeout;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
            if (delay === 1_000) {
                queueMicrotask(() => callback(...args));
                return 1 as unknown as ReturnType<typeof setTimeout>;
            }
            return nativeSetTimeout(callback, delay, ...args);
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({ error: 'playback_denied' }, { status: 403 }))
            .mockResolvedValueOnce(Response.json(tokenResponse()));
        vi.stubGlobal('fetch', fetchMock);

        const session = await startLivepeerPlaybackSession(INPUT, { onAccess: vi.fn() });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
        expect(secondRequest.envelope.session_public_key)
            .toBe(firstRequest.envelope.session_public_key);
        session.destroy();
    });

    it('waits for the Play grant to become final before requesting a token', async () => {
        const nativeSetTimeout = globalThis.setTimeout;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
            if (delay === 1_000) {
                queueMicrotask(() => callback(...args));
                return 1 as unknown as ReturnType<typeof setTimeout>;
            }
            return nativeSetTimeout(callback, delay, ...args);
        });
        state.isSessionGrantVisible
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const fetchMock = vi.fn().mockResolvedValue(Response.json(tokenResponse()));
        vi.stubGlobal('fetch', fetchMock);

        const session = await startLivepeerPlaybackSession(INPUT, { onAccess: vi.fn() });

        expect(state.isSessionGrantVisible).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledOnce();
        session.destroy();
    });

    it('does not request a token when the Play grant never becomes final', async () => {
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, _delay, ...args) => {
            queueMicrotask(() => callback(...args));
            return 1 as unknown as ReturnType<typeof setTimeout>;
        });
        state.isSessionGrantVisible.mockResolvedValue(false);
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(startLivepeerPlaybackSession(INPUT, { onAccess: vi.fn() }))
            .rejects.toThrow('livepeer_play_grant_pending');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('renews only an expired local grant before rotating the token', async () => {
        let refresh: (() => Promise<void>) | undefined;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
            refresh = callback as () => Promise<void>;
            return 1 as unknown as ReturnType<typeof setTimeout>;
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json(tokenResponse('first.token.signature', Date.now() + 31_000)))
            .mockResolvedValueOnce(Response.json(tokenResponse('second.token.signature')));
        vi.stubGlobal('fetch', fetchMock);
        const onAccess = vi.fn();
        const renewGrant = vi.fn(async () => { await installGrant(); });
        const session = await startLivepeerPlaybackSession(INPUT, { onAccess, renewGrant });
        state.grant = null;

        await refresh?.();

        expect(renewGrant).toHaveBeenCalledOnce();
        expect(state.isSessionGrantVisible).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onAccess).toHaveBeenLastCalledWith(expect.objectContaining({
            playbackId: INPUT.playbackId,
            token: 'second.token.signature',
        }));
        session.destroy();
    });

    it('does not renew a grant when playback is denied', async () => {
        let refresh: (() => Promise<void>) | undefined;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
            refresh = callback as () => Promise<void>;
            return 1 as unknown as ReturnType<typeof setTimeout>;
        });
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(Response.json(tokenResponse('first.token.signature', Date.now() + 31_000)))
            .mockResolvedValueOnce(Response.json({ error: 'playback_denied' }, { status: 403 })));
        const renewGrant = vi.fn();
        const onError = vi.fn();
        const session = await startLivepeerPlaybackSession(INPUT, {
            onAccess: vi.fn(),
            onError,
            renewGrant,
        });

        await refresh?.();

        expect(renewGrant).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'playback_denied' }));
        session.destroy();
    });

    it('does not renew a mismatched grant', async () => {
        let refresh: (() => Promise<void>) | undefined;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
            refresh = callback as () => Promise<void>;
            return 1 as unknown as ReturnType<typeof setTimeout>;
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json(tokenResponse('first.token.signature', Date.now() + 31_000)));
        vi.stubGlobal('fetch', fetchMock);
        const renewGrant = vi.fn();
        const onError = vi.fn();
        const session = await startLivepeerPlaybackSession(INPUT, {
            onAccess: vi.fn(),
            onError,
            renewGrant,
        });
        if (state.grant) state.grant.originHash = 'b'.repeat(64);

        await refresh?.();

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(renewGrant).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'livepeer_play_grant_mismatch' }));
        session.destroy();
    });

    it('fails before bridge use when the Play grant binding is missing', async () => {
        state.grant = state.grant ? { ...state.grant, resourceId: 'other-job' } : null;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestLivepeerPlaybackToken(INPUT)).rejects.toThrow('livepeer_play_grant_missing');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a malformed bridge token', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(tokenResponse('malformed'))));

        await expect(requestLivepeerPlaybackToken(INPUT)).rejects.toThrow('invalid_livepeer_playback_token');
    });
});
