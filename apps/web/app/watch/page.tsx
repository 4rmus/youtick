'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Video } from 'lucide-react';
import { LivepeerWatch } from '@/components/LivepeerWatch';
import { PageShell } from '@/components/PageShell';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { ScreenState } from '@/components/ScreenState';
import { FEATURE_FLAGS } from '@/lib/constants';

export default function WatchPage() {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;
    return <Suspense><WatchContent /></Suspense>;
}

function WatchContent() {
    const jobId = useSearchParams().get('job');
    if (!jobId) {
        return (
            <PageShell className="flex items-center justify-center">
                <ScreenState
                    icon={<Video className="h-7 w-7" />}
                    title="Select a publication"
                    description="Playback requires a valid Livepeer job link."
                />
            </PageShell>
        );
    }
    return <LivepeerWatch jobId={jobId} />;
}
