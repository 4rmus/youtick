'use client';

import { CheckCircle2, Gift } from 'lucide-react';
import { ScreenState } from '@/components/ScreenState';
import { formatUsdc } from '@/lib/livepeer-publication';
import { useNearAuthV2 } from './NearAuthV2Provider';
import { SignInPanel } from './SignInPanel';

const INVITE_ERRORS: Record<string, string> = {
    invite_unavailable: 'This invite link is no longer valid. Ask youtick for a new one.',
    invite_already_used: 'This account has already used an invite.',
    relayer_pending: 'Your invite credit is still being sent. Check again in a few minutes.',
    tx_needs_review: 'Your invite credit is being checked by youtick. You do not need to do anything.',
};

export function InviteAccept({ code }: { code: string | null }) {
    const { session, invite } = useNearAuthV2();
    const valid = Boolean(code && /^yt_[A-Za-z0-9_-]{24}$/.test(code));
    if (!valid) {
        return <ScreenState icon={<Gift className="h-7 w-7" />} title="Invite link not recognised"
            description="Open the link exactly as you received it, or ask youtick for a new one." />;
    }
    if (session.status === 'signed_in' && invite) {
        if ('error' in invite) {
            return <ScreenState icon={<Gift className="h-7 w-7" />} title="Your account is ready"
                description={INVITE_ERRORS[invite.error] ?? 'The invite credit could not be added. Please contact youtick.'} />;
        }
        return <ScreenState tone="success" icon={<CheckCircle2 className="h-7 w-7" />} title="Welcome to youtick"
            description={`Your account is ready and ${formatUsdc(invite.amountMicro)} USDC of upload credit has been added.`} />;
    }
    return <ScreenState icon={<Gift className="h-7 w-7" />} title="You are invited to publish on youtick"
        description="Sign in to create your account. The invite adds upload credit to it; you do not need a wallet.">
        <div className="mt-6 flex justify-center"><SignInPanel label="Accept invite with Google or a passkey" inviteCode={code!} /></div>
    </ScreenState>;
}
