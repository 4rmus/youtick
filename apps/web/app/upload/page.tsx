'use client';

import { UploadForm } from '@/components/UploadForm';
import { PaidUploadForm } from '@/components/PaidUploadForm';
import { PageShell } from '@/components/PageShell';
import { FEATURE_FLAGS } from '@/lib/constants';

export default function UploadPage() {
    return (
        <PageShell>
            {FEATURE_FLAGS.enablePaidMediaV4Ingest ? <PaidUploadForm /> : <UploadForm />}
        </PageShell>
    );
}
