'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { ScreeningView } from '@/components/screening/ScreeningView';
import { StateScreen } from '@/components/states/StateScreen';
import { FEATURE_FLAGS } from '@/lib/constants';
import { useMessages } from '@/lib/i18n/I18nProvider';

export default function WatchPage() {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;
    return <Suspense><WatchContent /></Suspense>;
}

function WatchContent() {
    const jobId = useSearchParams().get('job');
    const t = useMessages().discover;
    if (!jobId) {
        return (
            <PageShell>
                <StateScreen glyph="→" title={t.chooseTitle} body={t.chooseDescription} />
            </PageShell>
        );
    }
    // Valid ids are redirected to /s/[id] by next.config.ts; this renders only what the redirect does not match.
    return <ScreeningView jobId={jobId} />;
}
