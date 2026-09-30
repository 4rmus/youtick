import type { Metadata } from 'next';
import { StudioView } from '@/components/studio/StudioView';

export const metadata: Metadata = {
    title: 'Studio',
    description: 'View and withdraw your YouTick creator USDC balance.',
    robots: { index: false, follow: false },
};

export default function StudioPage() {
    return <StudioView />;
}
