'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { readLivepeerUploadProgress } from '@/lib/livepeer-publication';
import { readRememberedLivepeerUploadJob } from '@/lib/livepeer-upload';
import type { Messages } from '@/lib/i18n/messages';

/** The last paid upload remembered on this device, until it is published. */
export function ResumeUploadStrip({ accountId, t }: { accountId: string; t: Messages['studio'] }) {
    const progress = useQuery({
        queryKey: ['studioResumeUpload', accountId],
        queryFn: async () => {
            const jobId = readRememberedLivepeerUploadJob(accountId);
            if (!jobId) return null;
            return { jobId, ...(await readLivepeerUploadProgress(jobId, accountId)) };
        },
        staleTime: 30_000,
        retry: false,
    });
    const data = progress.data;
    if (!data || data.publication) return null;
    return (
        <section aria-labelledby="resume-title" className="flex flex-col gap-3 border border-line bg-panel p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
                <h2 id="resume-title" className="label-caps text-ice">{t.resumeTitle}</h2>
                <p className="text-sm text-light-2">{data.expired ? t.resumeExpired : t.resumeBody}</p>
            </div>
            {!data.expired && (
                <Button asChild><Link href={`/studio/new?job=${encodeURIComponent(data.jobId)}`}>{t.resumeAction}</Link></Button>
            )}
        </section>
    );
}
