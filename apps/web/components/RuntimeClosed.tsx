import { Lock } from 'lucide-react';
import { PageShell } from './PageShell';
import { ScreenState } from './ScreenState';

export function RuntimeClosed() {
    return (
        <PageShell className="flex items-center justify-center">
            <ScreenState
                icon={<Lock className="h-7 w-7" />}
                title="Publishing is not open yet"
                description="Video publishing, discovery and ticketed viewing will be available after launch."
            />
        </PageShell>
    );
}
