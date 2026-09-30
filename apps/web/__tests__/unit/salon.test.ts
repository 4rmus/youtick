import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
    flags: { publicTestnetVideoV1: true, enablePlaybackAuthorizerV2: true },
    device: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
    queries: [] as Array<{ queryKey: unknown[]; enabled?: boolean }>,
    handlers: new Map<string, () => unknown>(),
    activate: vi.fn(),
    wallet: { id: 'wallet' },
}));

vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    const FEATURE_FLAGS = { ...actual.FEATURE_FLAGS };
    for (const key of Object.keys(s.flags) as Array<keyof typeof s.flags>) {
        Object.defineProperty(FEATURE_FLAGS, key, { get: () => s.flags[key], enumerable: true });
    }
    return { ...actual, FEATURE_FLAGS };
});
vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryKey: unknown[]; enabled?: boolean }) => { s.queries.push(options); return s.device; },
}));
vi.mock('@/lib/playback-device-activation', () => ({ activatePlaybackDevice: s.activate }));
vi.mock('@/components/providers/WalletProvider', () => ({ useWallet: () => ({ getWallet: async () => s.wallet }) }));

function textOf(node: React.ReactNode): string {
    return React.Children.toArray(node).map((child) => typeof child === 'string' ? child
        : React.isValidElement<{ children?: React.ReactNode }>(child) ? textOf(child.props.children) : '').join('');
}
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => unknown }) => {
        if (onClick) s.handlers.set(textOf(children), onClick);
        return React.createElement('button', null, children);
    },
}));

import { salonEntry, usesDeviceActivation } from '@/components/salon/salon-model';
import { useDeviceStatus } from '@/components/salon/useDeviceStatus';
import { DeviceDialog } from '@/components/salon/DeviceDialog';
import { SalonView } from '@/components/salon/SalonView';
import { playbackErrorMessage } from '@/components/salon/playback-errors';
import { playerCopy } from '@/lib/player-copy';

const INPUT = { accountId: 'buyer.testnet', jobId: 'job-001', generation: 1, playbackId: 'playback_1' };

describe('salon entry', () => {
    afterEach(() => {
        Object.assign(s.flags, { publicTestnetVideoV1: true, enablePlaybackAuthorizerV2: true });
        s.device = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
        s.queries = [];
        s.handlers.clear();
        s.activate.mockReset();
    });

    it.each([
        [true, true, 'needed', 'activate'],
        [true, true, 'ready', 'enter'],
        [true, true, 'unknown', 'enter'],
        [true, true, 'checking', 'enter'],
        [true, true, null, 'enter'],
        [false, true, 'needed', 'enter'],
        [true, false, 'needed', 'enter'],
    ] as const)('public=%s authorizerV2=%s status=%s → %s', (publicVideo, v2, status, entry) => {
        Object.assign(s.flags, { publicTestnetVideoV1: publicVideo, enablePlaybackAuthorizerV2: v2 });
        expect(usesDeviceActivation()).toBe(publicVideo && v2);
        expect(salonEntry(status)).toBe(entry);
    });

    function status(account: string | null) {
        function Probe() { return React.createElement('output', null, String(useDeviceStatus(account).status)); }
        const value = renderToStaticMarkup(React.createElement(Probe)).replace(/<\/?output>/g, '');
        return { status: value === 'null' ? null : value };
    }

    it.each([
        [{ isLoading: true }, 'checking'],
        [{ isError: true, error: new Error('playback_authorization_unavailable') }, 'unknown'],
        [{ data: 'ready' }, 'ready'],
        [{ data: 'needed' }, 'needed'],
    ])('maps the device read %j to %s', (query, expected) => {
        s.device = { ...s.device, ...query };
        expect(status('buyer.testnet').status).toBe(expected);
        expect(s.queries[0]).toMatchObject({ queryKey: ['playbackDevice', 'buyer.testnet'], enabled: true });
    });

    it('does not read the device without an owner or outside the public authorizer', () => {
        expect(status(null).status).toBeNull();
        s.flags.enablePlaybackAuthorizerV2 = false;
        expect(status('buyer.testnet').status).toBeNull();
        expect(s.queries.every((query) => query.enabled === false)).toBe(true);
    });

    it('activates this device with one explicit wallet call and the exact playback input', async () => {
        const onActivated = vi.fn();
        s.activate.mockResolvedValue(undefined);
        const html = renderToStaticMarkup(React.createElement(DeviceDialog, { open: true, locale: 'en', input: INPUT, onClose: vi.fn(), onActivated }));
        expect(html).toContain(playerCopy.en.activationInfo);
        expect(s.activate).not.toHaveBeenCalled();
        s.handlers.get(playerCopy.en.activate)!();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(s.activate).toHaveBeenCalledOnce();
        expect(s.activate.mock.calls[0][0]).toBe(s.wallet);
        expect(s.activate.mock.calls[0][1]).toEqual(INPUT);
        expect(s.activate.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
        expect(onActivated).toHaveBeenCalledOnce();
    });

    it('does not enter the room when activation fails', async () => {
        const onActivated = vi.fn();
        s.activate.mockRejectedValue(new Error('device_activation_pending'));
        renderToStaticMarkup(React.createElement(DeviceDialog, { open: true, locale: 'tr', input: INPUT, onClose: vi.fn(), onActivated }));
        s.handlers.get(playerCopy.tr.activate)!();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(s.activate).toHaveBeenCalledOnce();
        expect(onActivated).not.toHaveBeenCalled();
    });

    it.each([
        ['device_activation_pending', 'activationPending'],
        ['device_activation_account_changed', 'accountChanged'],
        ['device_activation_unavailable', 'activationUnavailable'],
        ['device_session_storage_unavailable', 'storage'],
        ['device_session_expired', 'session'],
        ['livepeer_playback_unsupported', 'unsupported'],
        ['device_verification_failed', 'verificationFailed'],
        ['playback_denied', 'denied'],
        ['something_else', 'unavailable'],
    ] as const)('keeps the playback error mapping for %s', (code, key) => {
        for (const language of ['en', 'tr'] as const) {
            expect(playbackErrorMessage(new Error(code), language)).toBe(playerCopy[language][key]);
        }
        expect(playbackErrorMessage(new TypeError('fetch failed'), 'en')).toBe(playerCopy.en.network);
    });

    it('renders the room as a labelled modal with a Lights on exit and no player until opened', () => {
        const closed = renderToStaticMarkup(React.createElement(SalonView, { open: false, locale: 'tr', input: INPUT, title: 'Gece', onClose: vi.fn() }));
        expect(closed).toContain('<dialog');
        expect(closed).toContain('aria-label="Salon: Gece"');
        expect(closed).toContain('Işıkları aç');
        expect(closed).not.toContain('aspect-video');
        const open = renderToStaticMarkup(React.createElement(SalonView, { open: true, locale: 'en', input: INPUT, title: 'Gece', onClose: vi.fn() }));
        expect(open).toContain('Lights on');
    });

    it('loads the player bundle only through the room', () => {
        const sources = ['components/screening/ScreeningView.tsx', 'components/screening/GiseBar.tsx', 'components/salon/DeviceDialog.tsx']
            .map((file) => readFileSync(file, 'utf8'));
        for (const source of sources) expect(source).not.toMatch(/from '@\/components\/LivepeerPlayer'/);
        const room = readFileSync('components/salon/SalonView.tsx', 'utf8');
        expect(room).toContain("dynamic(() => import('@/components/LivepeerPlayer')");
        expect(room).toContain('ssr: false');
    });
});
