'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/I18nProvider';
import { StateScreen } from './StateScreen';

export function EmptyState({ title, body, action }: { title?: string; body?: string; action?: ReactNode }) {
    const t = useMessages().states;
    return <StateScreen glyph="0" title={title ?? t.emptyTitle} body={body ?? t.emptyBody} actions={action} />;
}

export function LoadErrorState({ onRetry, title, body }: { onRetry(): void; title?: string; body?: string }) {
    const t = useMessages().states;
    return (
        <StateScreen
            tone="alert"
            glyph="!"
            title={title ?? t.loadErrorTitle}
            body={body ?? t.loadErrorBody}
            safe={t.loadErrorSafe}
            actions={<Button onClick={onRetry}>{t.retry}</Button>}
        />
    );
}

export function NotFoundState({ backHref = '/discover' }: { backHref?: string }) {
    const t = useMessages().states;
    return (
        <StateScreen
            tone="alert"
            glyph="?"
            title={t.notFoundTitle}
            body={t.notFoundBody}
            actions={<Button asChild variant="outline"><Link href={backHref}>{t.backToDiscover}</Link></Button>}
        />
    );
}

export function StorageUnavailableState({ onCheckAgain }: { onCheckAgain(): void }) {
    const t = useMessages().states;
    return (
        <StateScreen
            tone="alert"
            glyph="!"
            title={t.storageTitle}
            body={t.storageBody}
            actions={<Button variant="outline" onClick={onCheckAgain}>{t.checkAgain}</Button>}
        />
    );
}
