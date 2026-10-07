'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, LogOut, Ticket } from 'lucide-react';
import { ScreenState } from '@/components/ScreenState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatUsdc } from '@/lib/livepeer-publication';
import { loadDeviceKey, type DeviceKey } from '@/lib/v2/device-key';
import { deviceIsListed, findOwnedTickets, playableStatus, type TicketStatus } from '@/lib/v2/tickets';
import { useNearAuthV2 } from './NearAuthV2Provider';
import { SignInPanel } from './SignInPanel';
import { TicketPlayer } from './TicketPlayer';

const STATUS_LABELS: Record<TicketStatus, string> = {
    purchased: 'Not watched yet',
    watched: 'Watched',
    refunded: 'Refunded',
    released: 'Watch window closed, still playable',
    voided: 'Cancelled',
};

export function MyTickets() {
    const { config, session, view, signOut } = useNearAuthV2();
    const [device, setDevice] = useState<DeviceKey | null>(null);
    const [deviceError, setDeviceError] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const signedIn = session.status === 'signed_in';

    useEffect(() => {
        if (!signedIn) return;
        let active = true;
        loadDeviceKey({ network: config.auth.network, contractId: config.marketContractId, origin: window.location.origin })
            .then((key) => { if (active) setDevice(key); }, () => { if (active) setDeviceError(true); });
        return () => { active = false; };
    }, [signedIn, config]);

    const tickets = useQuery({
        queryKey: ['v2Tickets', signedIn ? session.accountId : null, config.marketContractId],
        queryFn: () => findOwnedTickets(view, config.marketContractId, (session as { ckdKey: Uint8Array }).ckdKey),
        enabled: signedIn,
        staleTime: 30_000,
        // The CKD key must not leave memory through the query cache's persistence or devtools.
        gcTime: 0,
    });

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
        {tickets.data?.tickets.map(({ ticket }) => {
            const listed = Boolean(device && deviceIsListed(ticket, device.sessionPublicKey, tickets.dataUpdatedAt));
            const playable = playableStatus(ticket.status);
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
                {playable && listed && device && (open === ticket.ticket_id
                    ? <TicketPlayer bridgeUrl={config.bridgeUrl} network={config.auth.network} contractId={config.marketContractId}
                        ticketId={ticket.ticket_id} device={device} firstPlay={ticket.status === 'purchased'} />
                    : <Button onClick={() => setOpen(ticket.ticket_id)}>Watch</Button>)}
                {playable && !listed && device && <p className="text-sm text-white/60">
                    This device is not linked to this ticket yet. Watching on a new device will be available soon.
                </p>}
            </Card>;
        })}
    </div>;
}
