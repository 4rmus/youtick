'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { getProvider, viewContract } from '@/lib/near';
import { signInWithCkd } from '@/lib/near-auth/ckd-sign-in';
import { v2Config, type V2Config } from '@/lib/v2/config';
import { createRelayerClient, relayerSubmitter, type InviteResult } from '@/lib/v2/relayer-client';
import type { ViewContract } from '@/lib/v2/tickets';

export type V2Session =
    | { status: 'signed_out' }
    | { status: 'signing_in' }
    | { status: 'signed_in'; accountId: string; ckdKey: Uint8Array }
    | { status: 'error'; error: string };

interface V2AuthContext {
    config: V2Config;
    session: V2Session;
    invite: InviteResult | { error: string } | null;
    view: ViewContract;
    signIn: (options?: { inviteCode?: string }) => void;
    signOut: () => void;
}

const Context = createContext<V2AuthContext | null>(null);

// Reads go through the app's own RPC endpoints, never the relayer, so a relayer cannot also
// choose the account the CKD result is checked against.
const view: ViewContract = (contractId, method, args) => viewContract(getProvider(), contractId, method, args);

/** Holds the V2 sign-in in memory only: a reload signs out, and nothing is written to storage. */
export function NearAuthV2Provider({ children }: { children: ReactNode }) {
    const config = useMemo(() => v2Config(), []);
    const [session, setSession] = useState<V2Session>({ status: 'signed_out' });
    const [invite, setInvite] = useState<InviteResult | { error: string } | null>(null);
    const generation = useRef(0);

    const signIn = useCallback((options: { inviteCode?: string } = {}) => {
        if (!config) return;
        // Opened in the click handler so the browser does not block it; the URL is set later.
        const popup = window.open('about:blank', 'youtick-near-auth', 'width=480,height=720');
        if (!popup) {
            setSession({ status: 'error', error: 'popup_blocked' });
            return;
        }
        const current = ++generation.current;
        setSession({ status: 'signing_in' });
        setInvite(null);
        const client = createRelayerClient({ relayerUrl: config.relayerUrl });
        void signInWithCkd({
            config: config.auth, gateAccountId: config.gateAccountId, popup, redirectUri: window.location.origin, view,
            submit: relayerSubmitter(client, { inviteCode: options.inviteCode, onInvite: setInvite }),
        }).then((result) => {
            if (current === generation.current) setSession({ status: 'signed_in', accountId: result.accountId, ckdKey: result.ckdKey });
        }, (error: unknown) => {
            if (current === generation.current) {
                setSession({ status: 'error', error: error instanceof Error && /^[a-z_]{1,64}$/.test(error.message) ? error.message : 'sign_in_failed' });
            }
        });
    }, [config]);

    const signOut = useCallback(() => {
        generation.current += 1;
        setSession({ status: 'signed_out' });
        setInvite(null);
    }, []);

    if (!config) return null;
    return <Context.Provider value={{ config, session, invite, view, signIn, signOut }}>{children}</Context.Provider>;
}

export function useNearAuthV2(): V2AuthContext {
    const value = useContext(Context);
    if (!value) throw new Error('near_auth_v2_unavailable');
    return value;
}
