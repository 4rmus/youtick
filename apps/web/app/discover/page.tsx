import { DiscoverView } from '@/components/discover/DiscoverView';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { FEATURE_FLAGS } from '@/lib/constants';

export default function DiscoverPage() {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;
    return <DiscoverView />;
}
