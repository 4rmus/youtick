'use client';

import { Lock } from 'lucide-react';
import { useMessages } from '@/lib/i18n/I18nProvider';
import { PageShell } from './PageShell';
import { ScreenState } from './ScreenState';

export function RuntimeClosed() {
    const t = useMessages().runtime;
    return (
        <PageShell className="flex items-center justify-center">
            <ScreenState
                icon={<Lock className="h-7 w-7" />}
                title={t.title}
                description={t.description}
            />
        </PageShell>
    );
}
