'use client';

import Link from 'next/link';
import { INSTANT_ACCESS_CONSENT_TEXT } from './instant-access-consent';

/** The instant-access consent checkbox; the caller keeps it unticked until the buyer ticks it. */
export function InstantAccessConsent({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
    return <div className="space-y-1">
        <label className="flex items-start gap-3 text-sm text-white/80">
            <input type="checkbox" name="instant-access-consent" className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
                checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
            <span>{INSTANT_ACCESS_CONSENT_TEXT}</span>
        </label>
        <p className="pl-7 text-xs text-white/50">
            See the <Link className="underline" href="/terms">terms</Link> and the <Link className="underline" href="/refund-policy">refund policy</Link>.
        </p>
    </div>;
}
