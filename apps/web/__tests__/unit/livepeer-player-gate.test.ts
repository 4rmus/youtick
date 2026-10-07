import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    language: 'en' as 'en' | 'tr',
    startSession: vi.fn(),
    playbackMode: vi.fn(),
    getWallet: vi.fn(),
}));

vi.mock('@livepeer/react/player', () => ({ Root: () => null }));
vi.mock('@livepeer/react/external', () => ({ getSrc: vi.fn() }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('lucide-react', () => ({ Loader2: () => null, Play: () => null }));
vi.mock('@/components/ui/button', () => ({
    Button: ({ children }: { children?: React.ReactNode }) => React.createElement('button', null, children),
}));
vi.mock('@/components/providers/WalletProvider', () => ({ useWallet: () => ({ getWallet: state.getWallet }) }));
vi.mock('@/components/LivepeerPlayerSurface', () => ({ LivepeerPlayerSurface: () => null }));
vi.mock('@/lib/access-grants', () => ({ ensureSessionGrant: vi.fn() }));
vi.mock('@/lib/device-session', () => ({ ensureDeviceSession: vi.fn() }));
vi.mock('@/lib/playback-device-activation', () => ({ activatePlaybackDevice: vi.fn() }));
vi.mock('@/lib/constants', () => ({ FEATURE_FLAGS: { enablePlaybackAuthorizerV2: true, publicTestnetVideoV1: true } }));
vi.mock('@/lib/video-measurements', () => ({ recordVideoPlaybackEvents: vi.fn(), startVideoMeasurement: vi.fn(() => vi.fn()) }));
vi.mock('@/lib/livepeer-playback', () => ({ startLivepeerPlaybackSession: state.startSession }));
vi.mock('@/lib/livepeer-player-media', () => ({ playbackMode: state.playbackMode }));
vi.mock('@/lib/player-copy', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/player-copy')>();
    return { ...original, playerLanguage: () => state.language, subscribePlayerLanguage: () => () => undefined };
});

import { LivepeerPlayer } from '@/components/LivepeerPlayer';

const PROPS = { accountId: 'buyer.testnet', jobId: 'job-001', generation: 1, playbackId: 'playback-001', title: 'Paid video' };

describe('LivepeerPlayer play gate', () => {
    beforeEach(() => {
        state.language = 'en';
        vi.clearAllMocks();
    });

    it('shows a play button and does not start a playback session when the page opens', () => {
        const markup = renderToStaticMarkup(React.createElement(LivepeerPlayer, PROPS));
        expect(markup).toContain('<button>Play</button>');
        expect(markup).not.toContain('Confirming viewing access');
        expect(state.playbackMode).not.toHaveBeenCalled();
        expect(state.startSession).not.toHaveBeenCalled();
        expect(state.getWallet).not.toHaveBeenCalled();
    });
});
