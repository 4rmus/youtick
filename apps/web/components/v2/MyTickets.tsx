'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, LogOut, Ticket } from 'lucide-react';
import { ScreenState } from '@/components/ScreenState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatUsdc } from '@/lib/livepeer-publication';
import type { TicketKey } from '@/lib/ticket-keys/keys';
import { loadDeviceKey, type DeviceKey } from '@/lib/v2/device-key';
import { DEVICE_LINK_ENABLED, devicePlan, linkDevice, type DevicePlan } from '@/lib/v2/devices';
import { findOwnedTickets, playableStatus, refundRequestable, takenDownPublications, type TicketStatus } from '@/lib/v2/tickets';
import { DeviceLink } from './DeviceLink';
import { useNearAuthV2 } from './NearAuthV2Provider';
import { RefundRequest } from './RefundRequest';
import { SignInPanel } from './SignInPanel';
import { TicketPlayer } from './TicketPlayer';

const STATUS_LABELS: Record<TicketStatus, string> = {
    purchased: 'Not watched yet',
    watched: 'Watched',
    watched_in_escrow: 'Watched',
    refunded: 'Refunded',
    released: 'Watch window closed, still playable',
    voided: 'Cancelled',
};

/** Shown instead of "Watch on this device" while device links are off (NEXT_PUBLIC_V2_DEVICE_LINK_ENABLED). */
export const UNLINKED_DEVICE_NOTICE = 'This device is not linked to this ticket. Watch on a device where you bought or watched it, '
    + 'or write to contact@youtick.net.';

/** How long a linked device stays linked, and how watching renews it. */
export function linkedUntilNotice(expiresAtMs: number): string {
    return `This device is linked until ${new Date(expiresAtMs).toLocaleDateString()}. Watching here in its last week renews it for 30 days.`;
}

/**
 * Watching controls for one playable ticket on this device. `linkEnabled` is
 * NEXT_PUBLIC_V2_DEVICE_LINK_ENABLED: while it is off, an unlinked device gets a notice instead of a
 * link button, and nothing is renewed.
 */
export function TicketDeviceArea(props: {
    linkEnabled: boolean;
    plan: DevicePlan;
    open: boolean;
    renewing: boolean;
    renewFailed: boolean;
    onWatch: () => void;
    player: () => ReactNode;
    link: (plan: Extract<DevicePlan, { kind: 'link' }>) => ReactNode;
}) {
    const { plan } = props;
    if (plan.kind === 'link') {
        return props.linkEnabled ? props.link(plan) : <p className="text-sm text-white/60">{UNLINKED_DEVICE_NOTICE}</p>;
    }
    return <>
        {props.open ? props.player() : <Button className="gap-2" disabled={props.renewing} onClick={props.onWatch}>
            {props.renewing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Watch
        </Button>}
        {props.linkEnabled && <p className="text-xs text-white/50">{linkedUntilNotice(plan.expiresAtMs)}</p>}
        {props.renewFailed && <p className="text-sm text-amber-200" role="status">
            This device&apos;s link could not be renewed just now. It still plays until the date above; watching again later retries.
        </p>}
    </>;
}

export function MyTickets() {
    const { config, session, view, pendingGates, unlockGate, signOut } = useNearAuthV2();
    const [device, setDevice] = useState<DeviceKey | null>(null);
    const [deviceError, setDeviceError] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const [renewing, setRenewing] = useState<string | null>(null);
    const [renewFailed, setRenewFailed] = useState<string | null>(null);
    const signedIn = session.status === 'signed_in';

    useEffect(() => {
        if (!signedIn) return;
        let active = true;
        loadDeviceKey({ network: config.auth.network, contractId: config.marketContractId, origin: window.location.origin })
            .then((key) => { if (active) setDevice(key); }, () => { if (active) setDeviceError(true); });
        return () => { active = false; };
    }, [signedIn, config]);

    const tickets = useQuery({
        // The gates (never the secrets) are part of the key, so unlocking a retired gate rescans.
        queryKey: ['v2Tickets', signedIn ? session.accountId : null, config.marketContractId,
            signedIn ? session.gateKeys.map((key) => key.gateAccountId).join(',') : ''],
        queryFn: async () => {
            const found = await findOwnedTickets(view, config.marketContractId, signedIn ? session.gateKeys : []);
            const takenDown = await takenDownPublications(view, config.marketContractId, found.tickets.map(({ ticket }) => ticket.publication_id));
            return { ...found, takenDown };
        },
        enabled: signedIn,
        staleTime: 30_000,
        // The CKD key must not leave memory through the query cache's persistence or devtools.
        gcTime: 0,
    });

    /**
     * Watch. A device in its last seven days is renewed first, silently: no confirmation, because a
     * renewal never unlinks another device. If the renewal fails the device still plays until it expires.
     */
    async function watch(ticketId: string, key: TicketKey, plan: DevicePlan) {
        if (!DEVICE_LINK_ENABLED || plan.kind !== 'renew' || !device) {
            setOpen(ticketId);
            return;
        }
        setRenewing(ticketId);
        setRenewFailed(null);
        try {
            await linkDevice({ config, ticketKey: key, device, deps: { view } });
            await tickets.refetch();
        } catch {
            setRenewFailed(ticketId);
        } finally {
            setRenewing(null);
            setOpen(ticketId);
        }
    }

    if (!signedIn) {
        return <ScreenState icon={<Ticket className="h-7 w-7" />} title="My tickets"
            description="Sign in to see the tickets you bought. Your tickets are found again on any device you sign in on.">
            <div className="mt-6 flex justify-center"><SignInPanel /></div>
        </ScreenState>;
    }

    return <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">My tickets</h1>
            <Button variant="outline" className="gap-2" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</Button>
        </div>
        {tickets.isLoading && <p className="flex items-center gap-2 text-white/70" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Looking for your tickets…</p>}
        {tickets.isError && <p className="text-red-300" role="alert">Your tickets could not be loaded. Please try again.</p>}
        {deviceError && <p className="text-red-300" role="alert">This browser cannot create a playback key, so tickets cannot be played here.</p>}
        {tickets.data && tickets.data.tickets.length === 0 && <p className="text-white/70">You have no tickets yet.</p>}
        {pendingGates.length > 0 && <Card className="space-y-3 p-5">
            <p className="text-sm text-white/80">
                Tickets bought before a security update of our sign-in may need one more sign-in to show up here. It opens the same
                sign-in window and uses the same account.
            </p>
            {pendingGates.map((gate) => <div key={gate.gateAccountId} className="space-y-1">
                <Button variant="outline" className="min-h-11 gap-2" disabled={gate.state === 'signing_in'} onClick={() => unlockGate(gate.gateAccountId)}>
                    {gate.state === 'signing_in' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Find earlier tickets{pendingGates.length > 1 ? ` (${gate.gateAccountId})` : ''}
                </Button>
                {gate.state === 'error' && <p className="text-sm text-red-300" role="alert">
                    {gate.error === 'ckd_account_changed'
                        ? 'That sign-in belongs to a different account. Sign in with the account you used here.'
                        : gate.error === 'popup_blocked' ? 'Your browser blocked the sign-in window. Allow pop-ups and try again.'
                            : 'The sign-in did not complete. Please try again.'}
                </p>}
            </div>)}
        </Card>}
        {tickets.data?.tickets.map(({ key, ticket }) => {
            const plan = device ? devicePlan(ticket, device.sessionPublicKey, tickets.dataUpdatedAt) : null;
            const takenDown = tickets.data.takenDown.has(ticket.publication_id);
            // A taken-down video cannot be played; the Bridge refuses it too.
            const playable = playableStatus(ticket.status) && !takenDown;
            return <Card key={ticket.ticket_id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p className="font-medium">{ticket.publication_id}</p>
                        <p className="text-sm text-white/60">
                            {formatUsdc(ticket.gross_usdc_micro)} USDC · {new Date(Number(ticket.purchased_at_ms)).toLocaleDateString()}
                        </p>
                    </div>
                    <span className="rounded border border-white/15 px-2 py-1 text-xs text-white/80">{STATUS_LABELS[ticket.status]}</span>
                </div>
                {playable && plan && device && <TicketDeviceArea linkEnabled={DEVICE_LINK_ENABLED} plan={plan}
                    open={open === ticket.ticket_id} renewing={renewing === ticket.ticket_id} renewFailed={renewFailed === ticket.ticket_id}
                    onWatch={() => void watch(ticket.ticket_id, key, plan)}
                    player={() => <TicketPlayer bridgeUrl={config.bridgeUrl} network={config.auth.network} contractId={config.marketContractId}
                        ticketId={ticket.ticket_id} device={device} firstPlay={ticket.status === 'purchased'} />}
                    link={(linkPlan) => <DeviceLink config={config} view={view} ticketKey={key} device={device} plan={linkPlan}
                        onLinked={async () => { await tickets.refetch(); setOpen(ticket.ticket_id); }}
                        onStale={async () => { await tickets.refetch(); }} />} />}
                {takenDown && <p className="text-sm text-amber-200">This video was removed and can no longer be watched.</p>}
                {session.status === 'signed_in' && refundRequestable(ticket, tickets.dataUpdatedAt, takenDown) && <RefundRequest
                    binding={{ network: config.auth.network, contractId: config.marketContractId }}
                    ticket={key} accountId={session.accountId} paymentServiceUrl={config.paymentServiceUrl} takenDown={takenDown} />}
            </Card>;
        })}
    </div>;
}
