'use client';

import React from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Messages } from '@/lib/i18n/messages';

export function ShareScreening({ jobId, t }: { jobId: string; t: Messages['wizard'] }) {
    const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(new URL(`/s/${encodeURIComponent(jobId)}`, window.location.origin).toString());
            setState('copied');
        } catch {
            setState('failed');
        }
    };
    return (
        <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => void copy()}><Link2 aria-hidden="true" />{t.shareLink}</Button>
            <span role="status" className={state === 'failed' ? 'text-sm text-alert' : 'text-sm text-light-3'}>
                {state === 'copied' ? t.shared : state === 'failed' ? t.shareFailed : ''}
            </span>
        </div>
    );
}
