import { LivepeerPaidUploadForm } from '@/components/LivepeerPaidUploadForm';
import { PageShell } from '@/components/PageShell';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { FEATURE_FLAGS } from '@/lib/constants';

export default function UploadPage() {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;
    return <PageShell><LivepeerPaidUploadForm /></PageShell>;
}
