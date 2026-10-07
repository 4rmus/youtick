'use client';

import { Loader2, LogIn } from 'lucide-react';
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
