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
        config: { xhrSetup: (xhr: XMLHttpRequest) => void };
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

        config: { xhrSetup: (xhr: XMLHttpRequest) => void };
        source?: string;
        media?: HTMLVideoElement;
        destroyed = false;

        constructor(config: { xhrSetup: (xhr: XMLHttpRequest) => void }) {
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
        hls.config.xhrSetup({ setRequestHeader } as unknown as XMLHttpRequest);
        expect(setRequestHeader).toHaveBeenCalledWith('Livepeer-Jwt', 'first.token.signature');
        expect(hls.source).toBe(tokenResponse().hls_url);
        expect(hls.media).toBe(video);

        expect(refresh).toBeTypeOf('function');
        await refresh?.();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        hls.config.xhrSetup({ setRequestHeader } as unknown as XMLHttpRequest);
        expect(setRequestHeader).toHaveBeenLastCalledWith('Livepeer-Jwt', 'second.token.signature');
        session.destroy();
        expect(hls.destroyed).toBe(true);
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
