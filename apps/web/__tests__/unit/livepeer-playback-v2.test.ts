import { KeyPair } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    ensureDeviceSession: vi.fn(),
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
    ensureDeviceSession: state.ensureDeviceSession,
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
        const keyPair = KeyPair.fromRandom('ed25519');
        const now = Date.now();
        state.ensureDeviceSession.mockReset().mockResolvedValue({
            certificate: {
                domain: 'youtick.device-session',
                version: '1',
                network: 'testnet',
                account_id: INPUT.accountId,
                session_public_key: keyPair.getPublicKey().toString(),
                origin_hash: await sha256('https://app.youtick.net'),
                scopes: ['play'],
                issued_at_ms: String(now),
                expires_at_ms: String(now + 8 * 60 * 60 * 1000),
            },
            certificate_proof: {
                public_key: 'ed25519:11111111111111111111111111111111',
                signature: btoa(String.fromCharCode(...new Uint8Array(64).fill(7))),
                nonce: 'A'.repeat(43),
            },
            secret_key: keyPair.toString(),
        });
        state.getCachedSessionGrant.mockReset();
        state.isSessionGrantVisible.mockReset();
        state.featureFlags.enablePlaybackAuthorizerV2 = true;
        state.featureFlags.enablePlaybackShadowV2 = false;
    });

    it('uses the wallet-certified session key without issuing or reading a legacy grant', async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json(tokenResponse()));
        vi.stubGlobal('fetch', fetchMock);
        const wallet = { signMessage: vi.fn() };

        await requestLivepeerPlaybackToken(INPUT, undefined, wallet);

        expect(state.ensureDeviceSession).toHaveBeenCalledWith(wallet, INPUT.accountId);
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
            account_id: INPUT.accountId,
        });
        expect(request.request_signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    });

    it('starts and refreshes without waiting for a legacy grant', async () => {
        vi.spyOn(globalThis, 'setTimeout').mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(tokenResponse())));
        const wallet = { signMessage: vi.fn() };

        const session = await startLivepeerPlaybackSession(INPUT, { onAccess: vi.fn() }, wallet);

        expect(state.isSessionGrantVisible).not.toHaveBeenCalled();
        expect(state.getCachedSessionGrant).not.toHaveBeenCalled();
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
            certificate: { account_id: INPUT.accountId },
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
