import { Lock } from 'lucide-react';
import { PageShell } from './PageShell';
import { ScreenState } from './ScreenState';

export function RuntimeClosed() {
    return (
        <PageShell className="flex items-center justify-center">
            <ScreenState
                icon={<Lock className="h-7 w-7" />}
                title="Livepeer runtime is closed"
                description="Publishing, discovery and playback stay disabled until the Livepeer release gates are approved."
            />
        </PageShell>
    );
}
