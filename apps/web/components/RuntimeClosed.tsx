import { Lock } from 'lucide-react';
import { PageShell } from './PageShell';
import { ScreenState } from './ScreenState';

export function RuntimeClosed() {
    return (
        <PageShell className="flex items-center justify-center">
            <ScreenState
                icon={<Lock className="h-7 w-7" />}
                title="Opening February 2027"
                description="youtick opens in February 2027. Artists can apply to show their work at youtick.net/apply."
            />
        </PageShell>
    );
}
