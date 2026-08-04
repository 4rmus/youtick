import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    hlsInstances: [] as Array<{
        config: { xhrSetup: (xhr: XMLHttpRequest, url: string) => void };
        source?: string;
        media?: HTMLVideoElement;
        destroyed: boolean;
    }>,
}));

vi.mock('@/lib/access-grants', () => ({
    getCachedSessionGrant: () => state.grant,
}));

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: {
        publicAppUrl: 'https://app.youtick.net',
        livepeerBridgeUrl: 'https://bridge.youtick.net',
    },
    FEATURE_FLAGS: { enablePaidMediaLivepeerV1: true },
    NEAR_CONFIG: {
        networkId: 'testnet',
        marketContractId: 'paid-media-livepeer-v1.testnet',
    },
}));

vi.mock('hls.js', () => ({
    default: class {
        static isSupported() {
            return true;
        }

        config: { xhrSetup: (xhr: XMLHttpRequest, url: string) => void };
        source?: string;
        media?: HTMLVideoElement;
        destroyed = false;

        constructor(config: { xhrSetup: (xhr: XMLHttpRequest, url: string) => void }) {
            this.config = config;
            state.hlsInstances.push(this);
        }

        loadSource(source: string) {
            this.source = source;
        }

        attachMedia(media: HTMLVideoElement) {
            this.media = media;
        }

        destroy() {
            this.destroyed = true;
        }
    },
}));

import {
    requestLivepeerPlaybackToken,
    startLivepeerPlayback,
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

describe('Livepeer browser playback', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        state.hlsInstances.length = 0;
        await installGrant();
    });

    it('refreshes with the in-memory Play grant and never persists the JWT', async () => {
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

    it('adds Livepeer-Jwt to HLS requests and rotates it before expiry', async () => {
        await installGrant();
        let refresh: (() => Promise<void>) | undefined;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
            refresh = callback as () => Promise<void>;
            return 1 as unknown as ReturnType<typeof setTimeout>;
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json(tokenResponse('first.token.signature', Date.now() + 31_000)))
            .mockResolvedValueOnce(Response.json(tokenResponse('second.token.signature', Date.now() + 180_000)));
        vi.stubGlobal('fetch', fetchMock);
        const video = {} as HTMLVideoElement;

        const session = await startLivepeerPlayback(video, INPUT);
        const hls = state.hlsInstances[0];
        const setRequestHeader = vi.fn();
        for (const url of [
            'https://livepeercdn.com:8443/segment.ts',
            'https://user:password@livepeercdn.com/segment.ts',
        ]) {
            expect(() => hls.config.xhrSetup(
                { setRequestHeader } as unknown as XMLHttpRequest,
                url,
            )).toThrow('livepeer_playback_url_invalid');
        }
        expect(setRequestHeader).not.toHaveBeenCalled();
        for (const url of [
            'https://asset-cdn.lp-playback.studio/hls/playback_001/segment.ts',
            'https://asset-cdn.lp-playback.com/hls/recording-001/segment.ts',
        ]) {
            hls.config.xhrSetup(
                { setRequestHeader } as unknown as XMLHttpRequest,
                url,
            );
        }
        expect(setRequestHeader).toHaveBeenCalledWith('Livepeer-Jwt', 'first.token.signature');
        expect(hls.source).toBe(tokenResponse().hls_url);
        expect(hls.media).toBe(video);

        expect(refresh).toBeTypeOf('function');
        await refresh?.();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        hls.config.xhrSetup(
            { setRequestHeader } as unknown as XMLHttpRequest,
            'https://playback.livepeer.studio/asset/hls/playback_001/index.m3u8',
        );
        expect(setRequestHeader).toHaveBeenLastCalledWith('Livepeer-Jwt', 'second.token.signature');
        session.destroy();
        expect(hls.destroyed).toBe(true);
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

        const session = await startLivepeerPlayback({} as HTMLVideoElement, INPUT);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
        expect(secondRequest.envelope.session_public_key)
            .toBe(firstRequest.envelope.session_public_key);
        session.destroy();
    });

    it('fails before bridge use when the Play grant binding is missing', async () => {
        state.grant = state.grant ? { ...state.grant, resourceId: 'other-job' } : null;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestLivepeerPlaybackToken(INPUT)).rejects.toThrow('livepeer_play_grant_missing');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a malformed bridge token instead of loading HLS', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(tokenResponse('malformed'))));

        await expect(requestLivepeerPlaybackToken(INPUT)).rejects.toThrow('invalid_livepeer_playback_token');
        expect(state.hlsInstances).toHaveLength(0);
    });
});
