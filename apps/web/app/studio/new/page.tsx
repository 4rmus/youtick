import type { Metadata } from 'next';
import { LivepeerPaidUploadForm } from '@/components/LivepeerPaidUploadForm';
import { PageShell } from '@/components/PageShell';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { FEATURE_FLAGS } from '@/lib/constants';

export const metadata: Metadata = {
    title: 'Publish Your Work',
    description: 'Publish your work on YouTick and offer it directly to your audience with digital tickets.',
    openGraph: {
        title: 'Publish Your Work | YouTick',
        description: 'Publish your work on YouTick and offer it directly to your audience with digital tickets.',
    },
    twitter: {
        title: 'Publish Your Work | YouTick',
        description: 'Publish your work on YouTick and offer it directly to your audience with digital tickets.',
    },
};

export default function StudioNewPage() {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;
    return <PageShell><LivepeerPaidUploadForm /></PageShell>;
}
