'use client';

import { Loader2, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNearAuthV2 } from './NearAuthV2Provider';

const ERRORS: Record<string, string> = {
    popup_blocked: 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    near_auth_login_cancelled: 'Sign-in was cancelled.',
    near_auth_access_denied: 'Sign-in was declined.',
    daily_limit_reached: 'Sign-up is paused for today. Please try again tomorrow.',
    identity_limit_reached: 'Too many sign-ins for this account today. Please try again tomorrow.',
    rate_limited: 'Too many attempts. Please wait a minute and try again.',
};

export function signInErrorMessage(code: string): string {
    return ERRORS[code] ?? 'Sign-in did not complete. Please try again.';
}

export function SignInPanel({ label = 'Sign in with Google or a passkey', inviteCode }: { label?: string; inviteCode?: string }) {
    const { session, signIn } = useNearAuthV2();
    const busy = session.status === 'signing_in';
    return <div className="space-y-3">
        <Button className="min-h-11 gap-2" disabled={busy} onClick={() => signIn({ inviteCode })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Signing in…' : label}
        </Button>
        {busy && <p className="text-sm text-white/60" role="status">This can take up to a minute the first time while your account is set up.</p>}
        {session.status === 'error' && <p className="text-sm text-red-300" role="alert">{signInErrorMessage(session.error)}</p>}
    </div>;
}

/** Shortens a 64-hex implicit account for display; named accounts stay as they are. */
export function shortAccountId(accountId: string): string {
    return /^[0-9a-f]{64}$/.test(accountId) ? `${accountId.slice(0, 8)}…${accountId.slice(-4)}` : accountId;
}

/** The signed-in account and a way out. The session lives in memory only, so signing out forgets it. */
export function SignedInBar({ busy = false }: { busy?: boolean }) {
    const { session, signOut } = useNearAuthV2();
    if (session.status !== 'signed_in') return null;
    return <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/60">
        <span>Signed in as <code className="text-white/80" title={session.accountId}>{shortAccountId(session.accountId)}</code></span>
        <Button variant="outline" size="sm" className="gap-2" disabled={busy} onClick={signOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />Sign out
        </Button>
    </div>;
}
