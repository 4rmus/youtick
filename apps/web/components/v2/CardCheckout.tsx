'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    CLEENG_WIDGET_SCRIPT, openCardOrder, refreshCardCheckout, waitForCardTicket,
    type CardCheckoutDeps, type CardCheckoutSession, type CardOrder, type CardRail,
} from '@/lib/v2/card-checkout';
import type { V2Config } from '@/lib/v2/config';
import type { DeviceKey } from '@/lib/v2/device-key';
import { CheckoutError } from '@/lib/v2/purchase';

declare global {
    interface Window {
        cleeng?: { setAuthTokens(tokens: { jwt: string; refreshToken: string }): Promise<void> | void };
    }
}

const SCRIPT_ID = 'cleeng-widgets';

/** Loads Cleeng's widget script once (CSP: lib/csp.ts) and resolves when `window.cleeng` exists. */
function loadCleeng(rail: CardRail): Promise<NonNullable<Window['cleeng']>> {
    return new Promise((resolve, reject) => {
        if (window.cleeng) return resolve(window.cleeng);
        let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (!script) {
            script = document.createElement('script');
            script.id = SCRIPT_ID;
            script.type = 'module';
            script.src = CLEENG_WIDGET_SCRIPT[rail];
            document.head.appendChild(script);
        }
        let waited = 0;
        const timer = window.setInterval(() => {
            waited += 100;
            if (window.cleeng) {
                window.clearInterval(timer);
                resolve(window.cleeng);
            } else if (waited >= 15_000) {
                window.clearInterval(timer);
                reject(new CheckoutError('checkout_unavailable'));
            }
        }, 100);
    });
}

/** The card provider's hosted checkout for one order: Cleeng renders it in its own iframe. */
function CleengWidget({ session, rail }: { session: CardCheckoutSession; rail: CardRail }) {
    // The session whose tokens Cleeng holds; a new session waits for its own tokens.
    const [readyFor, setReadyFor] = useState<CardCheckoutSession | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let active = true;
        // Tokens are set before the widget mounts, as Cleeng documents.
        void loadCleeng(rail)
            .then((cleeng) => cleeng.setAuthTokens({ jwt: session.jwt, refreshToken: session.refreshToken }))
            .then(() => { if (active) setReadyFor(session); }, () => { if (active) setFailed(true); });
        return () => { active = false; };
    }, [session, rail]);
    const ready = readyFor === session;
    if (failed) return <p className="text-sm text-red-300" role="alert">The payment form could not be loaded. Please reload the page and try again.</p>;
    if (!ready) return <p className="text-sm text-white/70" role="status">Loading the payment form…</p>;
    return <div className="min-h-[480px] rounded-md bg-white" data-cleeng-widget="checkout" data-cleeng-publisher-id={session.publisherId}
        data-cleeng-offer-id={session.offerId} data-cleeng-props={JSON.stringify({ checkout: { mode: 'standard' } })} />;
}

export function CardCheckout(props: {
    config: V2Config;
    paymentServiceUrl: string;
    rail: CardRail;
    ckdKey: Uint8Array;
    device: DeviceKey | null;
    publicationId: string;
    priceLabel: string;
    /** The first unused ticket index for this purchase (recovery scan plus this page's reservations). */
    reserveIndex: () => Promise<number>;
    deps: CardCheckoutDeps;
    onDone: () => void;
    onFailure: (code: string) => void;
    onStep: (step: 'approval_started' | 'purchase_submitted') => void;
}) {
    const [phase, setPhase] = useState<'idle' | 'opening' | 'paying'>('idle');
    const [session, setSession] = useState<CardCheckoutSession | null>(null);
    const [order, setOrder] = useState<CardOrder | null>(null);
    const [status, setStatus] = useState<CardOrder['status'] | null>(null);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => () => abort.current?.abort(), []);
    const { onDone, onFailure, onStep } = props;

    async function start() {
        if (!props.device) return;
        setPhase('opening');
        onStep('approval_started');
        try {
            const opened = await openCardOrder({
                config: props.config, paymentServiceUrl: props.paymentServiceUrl, rail: props.rail, ckdKey: props.ckdKey,
                startIndex: await props.reserveIndex(), publicationId: props.publicationId, device: props.device, deps: props.deps,
            });
            setOrder(opened.order);
            setSession(opened.checkout);
            setPhase('paying');
            onStep('purchase_submitted');
            abort.current = new AbortController();
            await waitForCardTicket({
                config: props.config, paymentServiceUrl: props.paymentServiceUrl, order: opened.order, ticket: opened.ticket, device: props.device,
                deps: props.deps, signal: abort.current.signal, onStatus: setStatus,
            });
            onDone();
        } catch (failure) {
            const code = failure instanceof Error ? failure.message : '';
            if (code === 'checkout_left') return;
            setPhase('idle');
            setSession(null);
            onFailure(code);
        }
    }

    async function reload() {
        if (!order) return;
        try {
            setSession(await refreshCardCheckout({ paymentServiceUrl: props.paymentServiceUrl, rail: props.rail, orderId: order.orderId, deps: props.deps }));
        } catch (failure) {
            onFailure(failure instanceof Error ? failure.message : '');
        }
    }

    if (phase === 'paying' && session) {
        const confirming = status === 'paid' || status === 'issued';
        return <div className="space-y-3">
            <p className="text-sm text-white/70" role="status">
                {confirming ? 'Payment received. Your ticket is being issued…' : 'Pay in the form below. Your ticket appears here once the payment is confirmed.'}
            </p>
            {!confirming && <CleengWidget session={session} rail={props.rail} />}
            {!confirming && <Button variant="outline" className="min-h-11" onClick={() => void reload()}>Reload the payment form</Button>}
        </div>;
    }

    return <Button className="min-h-11 gap-2" variant="outline" disabled={phase === 'opening' || !props.device} onClick={() => void start()}>
        {phase === 'opening' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
        {phase === 'opening' ? 'Preparing the payment…' : `Pay ${props.priceLabel} by card`}
    </Button>;
}
