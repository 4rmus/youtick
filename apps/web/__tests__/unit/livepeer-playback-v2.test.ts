import { KeyPair } from 'near-api-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    getDeviceSession: vi.fn(),
    cleared: undefined as undefined | (() => void),
    getCachedSessionGrant: vi.fn(),
    isSessionGrantVisible: vi.fn(),
    featureFlags: {
        enablePaidMediaLivepeerV1: true,
        enablePlaybackAuthorizerV2: true,
        enablePlaybackShadowV2: false,
    },
}));

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: {
        publicAppUrl: 'https://app.youtick.net',
        livepeerBridgeUrl: 'https://bridge.youtick.net',
    },
    FEATURE_FLAGS: state.featureFlags,
    NEAR_CONFIG: { marketContractId: 'market.testnet' },
    NEAR_NETWORK: 'testnet',
}));

vi.mock('@/lib/device-session', () => ({
    canonicalDeviceCertificate: (certificate: unknown) => canonicalJson(certificate),
    getDeviceSession: state.getDeviceSession,
    onDeviceSessionCleared: (listener: () => void) => { state.cleared = listener; return () => { state.cleared = undefined; }; },
}));

vi.mock('@/lib/access-grants', () => ({
    getCachedSessionGrant: state.getCachedSessionGrant,
    isSessionGrantVisible: state.isSessionGrantVisible,
}));

import {
    requestLivepeerPlaybackToken,
    startLivepeerPlaybackSession,
} from '@/lib/livepeer-playback';

const INPUT = {
    accountId: 'buyer.testnet',
    jobId: 'job-001',
    generation: 1,
    playbackId: 'playback_001',
};

function tokenResponse() {
    return {
        schema: 'youtick.livepeer-playback-token.v2',
        playback_id: INPUT.playbackId,
        token: 'header.payload.signature',
        expires_at_ms: String(Date.now() + 180_000),
        hls_url: `https://playback.livepeer.studio/asset/hls/${INPUT.playbackId}/index.m3u8`,
    };
}

describe('Livepeer stateless browser playback', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        const keyPair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair;
        const now = Date.now();
        state.getDeviceSession.mockReset().mockResolvedValue({
            certificate: {
                domain: 'youtick.device-session',
                version: '2',
                network: 'testnet',
                contract_id: 'market.testnet',
                session_public_key: 'ed25519:11111111111111111111111111111111',
                origin_hash: await sha256('https://app.youtick.net'),
                scopes: ['play'],
                issued_at_ms: String(now),
                expires_at_ms: String(now + 8 * 60 * 60 * 1000),
            },
            certificate_proof: {
                account_id: INPUT.accountId,
                public_key: 'ed25519:11111111111111111111111111111111',
                signature: btoa(String.fromCharCode(...new Uint8Array(64).fill(7))),
                nonce: 'A'.repeat(43),
            },
            privateKey: keyPair.privateKey,
        });
        state.getCachedSessionGrant.mockReset();
        state.isSessionGrantVisible.mockReset();
        state.featureFlags.enablePlaybackAuthorizerV2 = true;
        state.featureFlags.enablePlaybackShadowV2 = false;
    });

    it('renews a Market-backed device token twice without any wallet call', async () => {
        vi.useFakeTimers();
        const session = await state.getDeviceSession();
        delete session.certificate.issued_at_ms;
        delete session.certificate.expires_at_ms;
        Object.assign(session.certificate, { version: '3', account_id: INPUT.accountId, authorization_duration_ms: '2592000000' });
        session.certificate_proof = { account_id: INPUT.accountId, kind: 'market' };
        state.getDeviceSession.mockResolvedValue(session);
        const fetcher = vi.fn(async () => Response.json(tokenResponse()));
        vi.stubGlobal('fetch', fetcher);
        const wallet = { signMessage: vi.fn() };
        const onAccess = vi.fn();
        const playback = await startLivepeerPlaybackSession(INPUT, { onAccess }, wallet);
        await vi.advanceTimersByTimeAsync(150000);
        await vi.waitFor(() => expect(onAccess).toHaveBeenCalledTimes(2));
        await vi.advanceTimersByTimeAsync(150000);
        await vi.waitFor(() => expect(onAccess).toHaveBeenCalledTimes(3));
        expect(fetcher).toHaveBeenCalledTimes(3);
        for (const [, init] of fetcher.mock.calls as unknown as Array<[string, RequestInit]>) {
            const payload = JSON.parse(String(init.body));
            expect(payload.certificate.version).toBe('3');
            expect(payload.certificate_proof).toEqual({ account_id: INPUT.accountId, kind: 'market' });
            expect(payload.certificate).not.toHaveProperty('expires_at_ms');
        }
        expect(wallet.signMessage).not.toHaveBeenCalled();
        playback.destroy();
        vi.useRealTimers();
    });

    it('keeps an unexpired token through a temporary device-record RPC failure', async () => {
        vi.useFakeTimers();
        const fetcher = vi.fn(async () => Response.json(tokenResponse()));
        vi.stubGlobal('fetch', fetcher);
        const onAccess = vi.fn();
        const onError = vi.fn();
        const wallet = { signMessage: vi.fn() };
        const playback = await startLivepeerPlaybackSession(INPUT, { onAccess, onError }, wallet);
        state.getDeviceSession.mockRejectedValueOnce(new Error('playback_authorization_unavailable'));
        await vi.advanceTimersByTimeAsync(150000);
        expect(onAccess).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        await vi.waitFor(() => expect(onAccess).toHaveBeenCalledTimes(2));
        expect(onError).not.toHaveBeenCalled();
        expect(wallet.signMessage).not.toHaveBeenCalled();
        playback.destroy();
        vi.useRealTimers();
    });

    it('uses the wallet-certified session key without issuing or reading a legacy grant', async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json(tokenResponse()));
        vi.stubGlobal('fetch', fetchMock);
        const wallet = { signMessage: vi.fn() };

        await requestLivepeerPlaybackToken(INPUT, undefined, wallet);

        expect(state.getDeviceSession).toHaveBeenCalledWith(INPUT.accountId);
        expect(state.getCachedSessionGrant).not.toHaveBeenCalled();
        expect(state.isSessionGrantVisible).not.toHaveBeenCalled();
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://bridge.youtick.net/v2/playback-tokens');
        expect(init.cache).toBe('no-store');
        const request = JSON.parse(String(init.body)) as Record<string, Record<string, unknown> | string>;
        expect(request.body).toEqual({
            publication_id: INPUT.jobId,
            generation: INPUT.generation,
            playback_id: INPUT.playbackId,
        });
        expect(request.request).toMatchObject({
            domain: 'youtick.playback-request',
            account_id: INPUT.accountId,
            origin: 'https://app.youtick.net',
            contract_id: 'market.testnet',
        });
        expect(request.certificate).toMatchObject({
            domain: 'youtick.device-session',
            contract_id: 'market.testnet',
        });
        expect(request.request_signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    });

    afterEach(() => { vi.useRealTimers(); });

    it('actually renews twice using timers with zero wallet signatures', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(tokenResponse())));
        vi.stubGlobal('fetch', fetchMock);
        const wallet = { signMessage: vi.fn() };
        const onAccess = vi.fn();
        const session = await startLivepeerPlaybackSession(INPUT, { onAccess }, wallet);
        await vi.advanceTimersByTimeAsync(150_000);
        await vi.waitFor(() => expect(onAccess).toHaveBeenCalledTimes(2));
        await vi.advanceTimersByTimeAsync(150_000);
        await vi.waitFor(() => expect(onAccess).toHaveBeenCalledTimes(3));
        expect(state.getDeviceSession).toHaveBeenCalledTimes(3);
        expect(wallet.signMessage).not.toHaveBeenCalled();
        expect(state.isSessionGrantVisible).not.toHaveBeenCalled();
        session.destroy();
    });

    it('requires an explicit verification action when no session is stored', async () => {
        state.getDeviceSession.mockResolvedValue(null);
        const wallet = { signMessage: vi.fn() };
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(requestLivepeerPlaybackToken(INPUT, undefined, wallet)).rejects.toThrow('device_session_required');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(wallet.signMessage).not.toHaveBeenCalled();
    });

    it('stops on logout and discards a late initial token response', async () => {
        let reply!: (response: Response) => void;
        const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { reply = resolve; }));
        vi.stubGlobal('fetch', fetchMock);
        const onAccess = vi.fn();
        const onError = vi.fn();
        const starting = startLivepeerPlaybackSession(INPUT, { onAccess, onError });
        const rejected = expect(starting).rejects.toThrow();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        state.cleared?.();
        reply(Response.json(tokenResponse()));
        await rejected;
        expect(onAccess).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'device_session_required' }));
    });

    it.each(['logout', 'expired session'])('closes an active player on %s without renewing wallet authority', async (reason) => {
        vi.useFakeTimers();
        let reply!: (response: Response) => void;
        const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(tokenResponse()))
            .mockImplementation(() => new Promise<Response>((resolve) => { reply = resolve; }));
        vi.stubGlobal('fetch', fetchMock);
        const wallet = { signMessage: vi.fn() };
        const onAccess = vi.fn();
        const onError = vi.fn();
        const session = await startLivepeerPlaybackSession(INPUT, { onAccess, onError }, wallet);
        if (reason === 'expired session') state.getDeviceSession.mockResolvedValue(null);
        await vi.advanceTimersByTimeAsync(150_000);
        if (reason === 'logout') {
            await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
            state.cleared?.();
            reply(Response.json(tokenResponse()));
        }
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'device_session_required' })));
        await vi.advanceTimersByTimeAsync(180_000);
        expect(onAccess).toHaveBeenCalledOnce();
        expect(wallet.signMessage).not.toHaveBeenCalled();
        session.destroy();
    });

    it('embeds a signed v2 decision proof while returning only the legacy token', async () => {
        state.featureFlags.enablePlaybackAuthorizerV2 = false;
        state.featureFlags.enablePlaybackShadowV2 = true;
        const legacyKey = KeyPair.fromRandom('ed25519');
        state.getCachedSessionGrant.mockReturnValue({
            accountId: INPUT.accountId,
            sessionPublicKey: legacyKey.getPublicKey().toString(),
            secretKey: legacyKey.toString(),
            scope: 'Play',
            resourceId: INPUT.jobId,
            expiresAt: Date.now() + 300_000,
            originHash: await sha256('https://app.youtick.net'),
            deviceHash: 'a'.repeat(64),
        });
        const fetchMock = vi.fn().mockResolvedValue(Response.json({
            ...tokenResponse(),
            schema: 'youtick.livepeer-playback-token.v1',
        }));
        vi.stubGlobal('fetch', fetchMock);

        await requestLivepeerPlaybackToken(INPUT, undefined, { signMessage: vi.fn() });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const payload = JSON.parse(String(init.body));
        expect(url).toBe('https://bridge.youtick.net/v1/playback-tokens');
        expect(payload.shadow_v2).toMatchObject({
            body: {
                publication_id: INPUT.jobId,
                generation: INPUT.generation,
                playback_id: INPUT.playbackId,
            },
            certificate_proof: { account_id: INPUT.accountId },
            request: { account_id: INPUT.accountId },
            request_signature: expect.stringMatching(/^[A-Za-z0-9+/]+={0,2}$/),
        });
    });
});

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson(object[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
