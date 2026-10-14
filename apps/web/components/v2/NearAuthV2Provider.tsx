'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { getProvider, viewContract } from '@/lib/near';
import { signInWithCkd } from '@/lib/near-auth/ckd-sign-in';
import { ckdGates } from '@/lib/ticket-keys/ckd';
import { v2Config, type V2Config } from '@/lib/v2/config';
import { addGateKey, canUnlock, pendingGates as pendingGatesOf, type PendingGate, type UnlockState } from '@/lib/v2/gates';
import { createRelayerClient, relayerSubmitter, type InviteResult } from '@/lib/v2/relayer-client';
import type { GateKey, ViewContract } from '@/lib/v2/tickets';

export type V2Session =
    | { status: 'signed_out' }
    | { status: 'signing_in' }
    | {
        status: 'signed_in'; accountId: string; publicKey: string;
        /** The current gate's secret: new purchases use it. */
        ckdKey: Uint8Array;
        /** Every secret this session holds, current gate first; retired gates are added by `unlockGate`. */
        gateKeys: GateKey[];
    }
    | { status: 'error'; error: string };

export type { PendingGate } from '@/lib/v2/gates';

interface V2AuthContext {
    config: V2Config;
    session: V2Session;
    invite: InviteResult | { error: string } | null;
    view: ViewContract;
    /** Retired gates not unlocked yet; empty while only one gate is trusted. */
    pendingGates: PendingGate[];
    signIn: (options?: { inviteCode?: string }) => void;
    /** One more NEAR Auth sign-in, bound to a retired gate, to find tickets bought with its secret. */
    unlockGate: (gateAccountId: string) => void;
    signOut: () => void;
}

function errorCode(error: unknown): string {
    return error instanceof Error && /^[a-z_]{1,64}$/.test(error.message) ? error.message : 'sign_in_failed';
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
    const [unlocking, setUnlocking] = useState<UnlockState>({});
    const generation = useRef(0);
    const gates = useMemo(() => (config ? ckdGates(config.auth.network) : { current: null, retired: [] }), [config]);

    const signIn = useCallback((options: { inviteCode?: string } = {}) => {
        if (!config) return;
        // Opened in the click handler so the browser does not block it; the URL is set later.
        const popup = window.open('about:blank', 'youtick-near-auth', 'width=480,height=720');
        if (!popup) {
            setSession({ status: 'error', error: 'popup_blocked' });
            return;
        }
        // Sign-in and purchases use the current gate only; the configured gate must be that one.
        if (gates.current?.gateAccountId !== config.gateAccountId) {
            popup.close();
            setSession({ status: 'error', error: 'ckd_gate_not_current' });
            return;
        }
        const current = ++generation.current;
        setSession({ status: 'signing_in' });
        setInvite(null);
        setUnlocking({});
        const client = createRelayerClient({ relayerUrl: config.relayerUrl });
        void signInWithCkd({
            config: config.auth, gateAccountId: config.gateAccountId, popup, redirectUri: window.location.origin, view,
            submit: relayerSubmitter(client, { inviteCode: options.inviteCode, onInvite: setInvite }),
        }).then((result) => {
            if (current === generation.current) {
                setSession({
                    status: 'signed_in', accountId: result.accountId, publicKey: result.publicKey, ckdKey: result.ckdKey,
                    gateKeys: [{ gateAccountId: result.gateAccountId, ckdKey: result.ckdKey }],
                });
            }
        }, (error: unknown) => {
            if (current === generation.current) setSession({ status: 'error', error: errorCode(error) });
        });
    }, [config, gates]);

    const unlockGate = useCallback((gateAccountId: string) => {
        if (!config || session.status !== 'signed_in') return;
        if (!canUnlock(gates.retired, session.gateKeys, gateAccountId)) return;
        const popup = window.open('about:blank', 'youtick-near-auth', 'width=480,height=720');
        if (!popup) {
            setUnlocking((value) => ({ ...value, [gateAccountId]: { state: 'error', error: 'popup_blocked' } }));
            return;
        }
        const current = generation.current;
        const accountId = session.accountId;
        setUnlocking((value) => ({ ...value, [gateAccountId]: { state: 'signing_in' } }));
        void signInWithCkd({
            config: config.auth, gateAccountId, popup, redirectUri: window.location.origin, view,
            submit: relayerSubmitter(createRelayerClient({ relayerUrl: config.relayerUrl }), {}),
        }).then((result) => {
            if (current !== generation.current) return;
            // The extra sign-in must be the same person: a different account never joins this session.
            if (result.accountId !== accountId) {
                setUnlocking((value) => ({ ...value, [gateAccountId]: { state: 'error', error: 'ckd_account_changed' } }));
                return;
            }
            setSession((value) => value.status === 'signed_in' && value.accountId === accountId
                ? { ...value, gateKeys: addGateKey(value.gateKeys, accountId, result) }
                : value);
            setUnlocking((value) => {
                const next = { ...value };
                delete next[gateAccountId];
                return next;
            });
        }, (error: unknown) => {
            if (current === generation.current) {
                setUnlocking((value) => ({ ...value, [gateAccountId]: { state: 'error', error: errorCode(error) } }));
            }
        });
    }, [config, gates, session]);

    const signOut = useCallback(() => {
        generation.current += 1;
        setSession({ status: 'signed_out' });
        setInvite(null);
        setUnlocking({});
    }, []);

    const pendingGates = useMemo<PendingGate[]>(() => {
        return session.status === 'signed_in' ? pendingGatesOf(gates.retired, session.gateKeys, unlocking) : [];
    }, [gates, session, unlocking]);

    if (!config) return null;
    return <Context.Provider value={{ config, session, invite, view, pendingGates, signIn, unlockGate, signOut }}>{children}</Context.Provider>;
}

export function useNearAuthV2(): V2AuthContext {
    const value = useContext(Context);
    if (!value) throw new Error('near_auth_v2_unavailable');
    return value;
}
