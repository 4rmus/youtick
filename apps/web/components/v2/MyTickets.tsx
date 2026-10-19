'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, LogOut, Ticket } from 'lucide-react';
import { ScreenState } from '@/components/ScreenState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatUsdc } from '@/lib/livepeer-publication';
import { cardPriceLabel } from '@/lib/v2/card-checkout';
import { loadDeviceKey, type DeviceKey } from '@/lib/v2/device-key';
import { deviceIsListed, findOwnedTickets, playableStatus, refundRequestable, takenDownPublications, type TicketStatus } from '@/lib/v2/tickets';
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

/** A card ticket shows the dollar price the buyer paid; a crypto ticket keeps its USDC amount. */
function ticketPrice(rail: 'crypto' | 'card', grossUsdcMicro: string): string {
    return (rail === 'card' ? cardPriceLabel(grossUsdcMicro) : null) ?? `${formatUsdc(grossUsdcMicro)} USDC`;
}

export function MyTickets() {
    const { config, session, view, pendingGates, unlockGate, signOut } = useNearAuthV2();
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
            const listed = Boolean(device && deviceIsListed(ticket, device.sessionPublicKey, tickets.dataUpdatedAt));
            const takenDown = tickets.data.takenDown.has(ticket.publication_id);
            // A taken-down video cannot be played; the Bridge refuses it too.
            const playable = playableStatus(ticket.status) && !takenDown;
            return <Card key={ticket.ticket_id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p className="font-medium">{ticket.publication_id}</p>
                        <p className="text-sm text-white/60">
                            {ticketPrice(ticket.rail, ticket.gross_usdc_micro)} · {new Date(Number(ticket.purchased_at_ms)).toLocaleDateString()}
                        </p>
                    </div>
                    <span className="rounded border border-white/15 px-2 py-1 text-xs text-white/80">{STATUS_LABELS[ticket.status]}</span>
                </div>
                {playable && listed && device && (open === ticket.ticket_id
                    ? <TicketPlayer bridgeUrl={config.bridgeUrl} network={config.auth.network} contractId={config.marketContractId}
                        ticketId={ticket.ticket_id} device={device} firstPlay={ticket.status === 'purchased'} />
                    : <Button onClick={() => setOpen(ticket.ticket_id)}>Watch</Button>)}
                {playable && !listed && device && <p className="text-sm text-white/60">
                    This device is not linked to this ticket. Watch on a device where you bought or watched it, or write to contact@youtick.net.
                </p>}
                {takenDown && <p className="text-sm text-amber-200">This video was removed and can no longer be watched.</p>}
                {session.status === 'signed_in' && refundRequestable(ticket, tickets.dataUpdatedAt, takenDown) && <RefundRequest
                    binding={{ network: config.auth.network, contractId: config.marketContractId }}
                    ticket={key} accountId={session.accountId} paymentServiceUrl={config.paymentServiceUrl} takenDown={takenDown} />}
            </Card>;
        })}
    </div>;
}
