'use client';

import { useState } from 'react';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TicketKey } from '@/lib/ticket-keys/keys';
import type { V2Config } from '@/lib/v2/config';
import type { DeviceKey } from '@/lib/v2/device-key';
import { DeviceLinkError, deviceLinkErrorMessage, linkDevice, MAX_TICKET_DEVICES, type DevicePlan } from '@/lib/v2/devices';
import type { MarketTicket, ViewContract } from '@/lib/v2/tickets';

export type DeviceLinkPhase = 'idle' | 'confirm' | 'linking' | 'error';

export const DEVICE_LINK_HINT = `No payment and nothing to approve. A ticket plays on up to ${MAX_TICKET_DEVICES} devices; `
    + 'each stays linked for 30 days and is renewed when you watch on it.';

/** The confirmation shown before a link that replaces the device linked or renewed longest ago. */
export function evictionNotice(authorizedAtMs: string): string {
    return `This ticket already plays on ${MAX_TICKET_DEVICES} devices. Linking this device unlinks the one linked or renewed `
        + `longest ago (on ${new Date(Number(authorizedAtMs)).toLocaleDateString()}).`;
}

/**
 * "Watch on this device" for a ticket this browser's device key is not linked to. The ticket key
 * signs in the browser; the relayer submits the link. A fourth device asks first, because the
 * contract then unlinks the oldest one.
 */
export function DeviceLink(props: {
    config: V2Config;
    view: ViewContract;
    ticketKey: TicketKey;
    device: DeviceKey;
    plan: Extract<DevicePlan, { kind: 'link' }>;
    onLinked: (ticket: MarketTicket) => void | Promise<void>;
    /** Reloads the ticket when its devices changed after the page read them, so the next try asks again. */
    onStale?: () => void | Promise<void>;
    /** Only for rendering a later step in tests. */
    initialPhase?: DeviceLinkPhase;
}) {
    const [phase, setPhase] = useState<DeviceLinkPhase>(props.initialPhase ?? 'idle');
    const [error, setError] = useState('');

    async function link() {
        setPhase('linking');
        setError('');
        try {
            // Only the device shown in the confirmation may be replaced.
            const ticket = await linkDevice({
                config: props.config, ticketKey: props.ticketKey, device: props.device, deps: { view: props.view },
                allowEvict: props.plan.evicts?.session_public_key ?? null,
            });
            await props.onLinked(ticket);
        } catch (failure) {
            const code = failure instanceof DeviceLinkError ? failure.message : '';
            setPhase('error');
            setError(deviceLinkErrorMessage(code));
            if (code === 'eviction_not_confirmed' || code === 'device_epoch_stale') await props.onStale?.();
        }
    }

    if (phase === 'confirm' && props.plan.evicts) {
        return <div className="space-y-3 rounded-lg border border-amber-200/30 p-4" role="alertdialog" aria-label="Link this device">
            <p className="text-sm text-amber-100">{evictionNotice(props.plan.evicts.authorized_at_ms)}</p>
            <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" onClick={() => void link()}>Link this device</Button>
                <Button className="min-h-11" variant="outline" onClick={() => setPhase('idle')}>Cancel</Button>
            </div>
        </div>;
    }

    return <div className="space-y-2">
        <Button className="min-h-11 gap-2" disabled={phase === 'linking'}
            onClick={() => (props.plan.evicts ? setPhase('confirm') : void link())}>
            {phase === 'linking'
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />}
            {phase === 'linking' ? 'Linking this device…' : 'Watch on this device'}
        </Button>
        <p className="text-sm text-white/60">{DEVICE_LINK_HINT}</p>
        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </div>;
}
