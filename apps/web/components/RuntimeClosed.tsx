'use client';

import { useMessages } from '@/lib/i18n/I18nProvider';
import { PageShell } from './PageShell';
import { StateScreen } from './states/StateScreen';

export function RuntimeClosed() {
    const t = useMessages().runtime;
    return (
        <PageShell>
            <StateScreen glyph="—" title={t.title} body={t.description} safe={t.safe} />
        </PageShell>
    );
}
