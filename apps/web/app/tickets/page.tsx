import type { Metadata } from 'next';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { TicketsView } from '@/components/tickets/TicketsView';
import { FEATURE_FLAGS } from '@/lib/constants';

export const metadata: Metadata = { title: 'My tickets', robots: { index: false, follow: false } };

export default function TicketsPage() {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel) return <RuntimeClosed />;
    return <TicketsView />;
}
