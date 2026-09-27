import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ status: vi.fn(), prepare: vi.fn(), approve: vi.fn(), next: vi.fn(), session: vi.fn(), effects: [] as Array<() => void | (() => void)>,
    values: [] as unknown[], cursor: 0, cleanups: [] as Array<() => void> }));
vi.mock('react', async load => {
    const actual = await load<typeof import('react')>();
    const hooks = {
        useState: (initial: unknown) => [mocks.cursor < mocks.values.length ? mocks.values[mocks.cursor++] : initial, vi.fn()],
        useRef: (initial: unknown) => ({ current: initial }), useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
    };
    return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('@/lib/near-auth-device-client', () => ({ deviceStatus: mocks.status, prepareDeviceRecovery: mocks.prepare,
    approveDeviceRecovery: mocks.approve, continueDeviceRecovery: mocks.next }));
vi.mock('@/lib/device-session', () => ({ getDeviceSession: mocks.session, onDeviceSessionCleared: () => () => {} }));
import { NearAuthDeviceRecovery } from '@/components/NearAuthDeviceRecovery';
const input = { accountId: 'a'.repeat(64), jobId: 'video-1', generation: 1, playbackId: 'playback-1' };
type Element = React.ReactElement<{ children?: React.ReactNode; onClick?: () => void; disabled?: boolean }>;
function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as Element; return [element, ...elements(element.props.children)];
}
function render(values: unknown[] = [true, false, null, null, '', false]) {
    mocks.values = values;
    const authorize = vi.fn(), onActivated = vi.fn();
    const tree = NearAuthDeviceRecovery({ input, authorize, onActivated, language: 'en' });
    for (const effect of mocks.effects) { const cleanup = effect(); if (cleanup) mocks.cleanups.push(cleanup); }
    const button = (label: string) => elements(tree).find(item => item.props.children === label && item.props.onClick)!;
    return { tree, button, authorize, onActivated };
}
beforeEach(() => { vi.clearAllMocks(); mocks.effects = []; mocks.cleanups = []; mocks.cursor = 0;
    mocks.status.mockResolvedValue({ enabled: true, payment: null }); mocks.session.mockResolvedValue(null); mocks.prepare.mockResolvedValue({}); });
afterEach(() => { for (const cleanup of mocks.cleanups) cleanup(); });
it('mount/reload only reads status; repeated explicit preparation clicks are coalesced and never authorize', async () => {
    let resolve!: (value: object) => void; mocks.prepare.mockReturnValue(new Promise(r => { resolve = r; }));
    const ui = render(); await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledOnce());
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(ui.authorize).not.toHaveBeenCalled(); expect(mocks.next).not.toHaveBeenCalled();
    ui.button('Verify this device').props.onClick!(); ui.button('Verify this device').props.onClick!();
    expect(mocks.prepare).toHaveBeenCalledOnce(); resolve({});
    expect(ui.authorize).not.toHaveBeenCalled();
});
it('pending device reload exposes explicit continuation; checking status never executes it', async () => {
    const payment = { purpose: 'device', accountId: input.accountId, resourceId: input.jobId, state: 'MPC_VERIFIED' };
    mocks.status.mockResolvedValue({ enabled: true, payment });
    const ui = render([true, false, payment, null, '', false]);
    expect(ui.button('Complete approved device verification')).toBeTruthy();
    ui.button('Check status').props.onClick!();
    await vi.waitFor(() => expect(mocks.session).toHaveBeenCalledOnce());
    expect(mocks.next).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled(); expect(ui.authorize).not.toHaveBeenCalled();
});
it('a pending ticket has no device continuation and an ambiguous submit keeps new preparation disabled', () => {
    let ui = render([true, false, { purpose: 'ticket', state: 'MPC_VERIFIED' }, null, '', false]);
    expect(ui.button('Complete approved device verification')).toBeUndefined(); expect(ui.button('Verify this device')).toBeUndefined();
    mocks.cursor = 0; mocks.effects = [];
    ui = render([true, false, null, null, '', true]);
    expect(ui.button('Verify this device').props.disabled).toBe(true);
});
