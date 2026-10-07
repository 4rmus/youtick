'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Ticket } from 'lucide-react';
import { ScreenState } from '@/components/ScreenState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NEAR_CONFIG } from '@/lib/constants';
import { formatUsdc } from '@/lib/livepeer-publication';
import { loadDeviceKey, type DeviceKey } from '@/lib/v2/device-key';
import { cryptoRailEnabled, fundingAvailable } from '@/lib/v2/funding';
import { readAccessKey } from '@/lib/v2/near-reads';
import { buyTicket, CheckoutError } from '@/lib/v2/purchase';
import { findOwnedTickets } from '@/lib/v2/tickets';
import { FundBalance } from './FundBalance';
import { useNearAuthV2 } from './NearAuthV2Provider';
import { SignInPanel } from './SignInPanel';

const ERRORS: Record<string, string> = {
    publication_not_available: 'This screening is not on sale right now.',
    price_below_minimum: 'This screening cannot be sold at its current price.',
    insufficient_balance: 'Your youtick balance is too low for this ticket.',
    near_auth_login_cancelled: 'The purchase was not approved.',
    near_auth_access_denied: 'The purchase was not approved.',
    delegate_stale: 'The approval expired. Please try again.',
    identity_limit_reached: 'You have reached today’s purchase limit.',
    daily_limit_reached: 'Purchases are paused for today. Please try again tomorrow.',
    rate_limited: 'Too many attempts. Please wait a minute and try again.',
    purchase_not_confirmed: 'The payment was returned, so no ticket was issued. Please try again.',
    publication_unavailable: 'This screening is not on sale right now.',
    price_mismatch: 'The price of this screening changed. Please reload the page.',
    ticket_exists: 'Something went wrong preparing your ticket. Please try again.',
    signature_expired: 'The purchase took too long. Please try again.',
    approval_rejected: 'The purchase was not approved. Please try again.',
    approval_expired: 'The approval expired. Please try again.',
    account_not_ready: 'Your youtick account is still being set up. Please try again in a minute.',
    purchase_pending: 'Your purchase is still being processed. Check My tickets in a few minutes before trying again.',
};

interface PublicationView {
    publication_id: string;
    creator_id: string;
    price_usdc: string;
    availability: string;
}

export function BuyTicket({ publicationId }: { publicationId: string | null }) {
    const { config, session, view } = useNearAuthV2();
    const signedIn = session.status === 'signed_in';
    const [device, setDevice] = useState<DeviceKey | null>(null);
    const [state, setState] = useState<'idle' | 'buying' | 'done' | 'error'>('idle');
    const [error, setError] = useState('');
    const reserved = useRef(new Set<number>());
    // Read from the browser after mount, so the server render never guesses the language.
    const [cryptoRail, setCryptoRail] = useState<boolean | null>(null);
    useEffect(() => {
        setCryptoRail(cryptoRailEnabled(navigator.languages?.length ? navigator.languages : [navigator.language]));
    }, []);
    const valid = Boolean(publicationId && /^[A-Za-z0-9._:-]{1,128}$/.test(publicationId));

    useEffect(() => {
        if (!signedIn) return;
        let active = true;
        void loadDeviceKey({ network: config.auth.network, contractId: config.marketContractId, origin: window.location.origin })
            .then((key) => { if (active) setDevice(key); }, () => undefined);
        return () => { active = false; };
    }, [signedIn, config]);

    const publication = useQuery({
        queryKey: ['v2Publication', config.marketContractId, publicationId],
        queryFn: () => view<PublicationView | null>(config.marketContractId, 'get_publication', { publication_id: publicationId }),
        enabled: valid,
    });
    const balance = useQuery({
        queryKey: ['v2UsdcBalance', signedIn ? session.accountId : null],
        queryFn: () => view<string>(NEAR_CONFIG.usdcContractId, 'ft_balance_of', { account_id: (session as { accountId: string }).accountId }),
        enabled: signedIn,
    });
    const refetchBalance = balance.refetch;
    const refreshBalance = useCallback(() => { void refetchBalance(); }, [refetchBalance]);

    if (!valid) return <ScreenState icon={<Ticket className="h-7 w-7" />} title="Screening not found" />;
    if (!config.paymentServiceUrl) return <ScreenState icon={<Ticket className="h-7 w-7" />} title="Ticket sales are not open yet" />;
    if (cryptoRail === null) return <p className="text-center text-white/70" role="status">Loading…</p>;
    if (!cryptoRail) {
        return <ScreenState icon={<Ticket className="h-7 w-7" />} title="Ticket sales are not available here yet"
            description="Paying with crypto is not offered in your language. Card payments are coming." />;
    }
    if (publication.isLoading) return <p className="text-center text-white/70" role="status">Loading…</p>;
    const item = publication.data;
    if (!item || item.availability !== 'ACTIVE') return <ScreenState icon={<Ticket className="h-7 w-7" />} title="This screening is not on sale" />;

    if (!signedIn) {
        return <ScreenState icon={<Ticket className="h-7 w-7" />} title={`Ticket: ${formatUsdc(item.price_usdc)} USDC`}
            description="Sign in to buy. You approve the payment once on the sign-in screen; no wallet is needed.">
            <div className="mt-6 flex justify-center"><SignInPanel /></div>
        </ScreenState>;
    }

    const enough = balance.data !== undefined && BigInt(balance.data) >= BigInt(item.price_usdc);

    async function buy() {
        if (!signedIn || !device || !item) return;
        // Opened in the click handler so the browser does not block the approval window.
        const popup = window.open('about:blank', 'youtick-near-auth', 'width=480,height=720');
        if (!popup) {
            setState('error');
            setError('Your browser blocked the approval window. Allow pop-ups for this site and try again.');
            return;
        }
        setState('buying');
        setError('');
        try {
            const scan = await findOwnedTickets(view, config.marketContractId, session.ckdKey);
            let index = scan.nextIndex;
            while (reserved.current.has(index)) index += 1;
            reserved.current.add(index);
            await buyTicket({
                config, paymentServiceUrl: config.paymentServiceUrl!, usdcContractId: NEAR_CONFIG.usdcContractId,
                session: { accountId: session.accountId, publicKey: session.publicKey, ckdKey: session.ckdKey },
                publicationId: item.publication_id, ticketIndex: index, device, popup, redirectUri: window.location.origin,
                deps: { view, accessKey: readAccessKey },
            });
            setState('done');
            void balance.refetch();
        } catch (failure) {
            setState('error');
            const code = failure instanceof CheckoutError || failure instanceof Error ? failure.message : '';
            setError(ERRORS[code] ?? 'The purchase did not complete. No ticket was issued; please try again.');
        }
    }

    if (state === 'done') {
        return <ScreenState tone="success" icon={<CheckCircle2 className="h-7 w-7" />} title="Your ticket is ready"
            description="It is linked to this device. You can refund it until you start watching.">
            <div className="mt-6 flex justify-center"><Button asChild><Link href="/tickets">Go to My tickets</Link></Button></div>
        </ScreenState>;
    }

    return <Card className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{item.publication_id}</h1>
        <p className="text-white/80">Ticket price: <strong>{formatUsdc(item.price_usdc)} USDC</strong> (VAT included)</p>
        <p className="text-sm text-white/60">
            Your youtick balance: {balance.data === undefined ? '…' : `${formatUsdc(balance.data)} USDC`}
        </p>
        {!enough && balance.data !== undefined && (fundingAvailable()
            ? <FundBalance accountId={session.accountId} publicationId={item.publication_id} balanceCoversPrice={enough} refreshBalance={refreshBalance} />
            : <p className="text-sm text-amber-200">
                Your balance is too low for this ticket. On testnet, send test USDC to your account <code className="break-all">{session.accountId}</code>.
            </p>)}
        <Button className="min-h-11 gap-2" disabled={state === 'buying' || !enough || !device} onClick={() => void buy()}>
            {state === 'buying' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {state === 'buying' ? 'Waiting for your approval…' : `Buy for ${formatUsdc(item.price_usdc)} USDC`}
        </Button>
        <p className="text-xs text-white/50">Unwatched tickets can be refunded for 30 days. Starting playback uses the ticket.</p>
        {state === 'error' && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </Card>;
}
