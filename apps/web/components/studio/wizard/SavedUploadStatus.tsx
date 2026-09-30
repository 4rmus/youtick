'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { StatusLine } from '@/components/ui/status-line';
import { publicationPollIntervalMs } from '@/lib/livepeer-upload-state';
import { readLivepeerUploadProgress } from '@/lib/livepeer-publication';
import { rememberLivepeerUploadJob } from '@/lib/livepeer-upload';
import { useMessages } from '@/lib/i18n/I18nProvider';

/** A creator-owned job read from NEAR after its tab was closed; never starts a payment or upload. */
export function SavedUploadStatus({ accountId, jobId }: { accountId: string; jobId: string }) {
    const upload = useMessages().upload;
    const t = upload.saved;
    const query = useQuery({
        queryKey: ['livepeerSavedUpload', accountId, jobId],
        queryFn: async () => {
            const progress = await readLivepeerUploadProgress(jobId, accountId);
            rememberLivepeerUploadJob(accountId, jobId);
            return progress;
        },
        retry: false,
        refetchInterval: (query) => query.state.status === 'success' && query.state.data?.publication
            ? false
            : publicationPollIntervalMs(query.state.dataUpdateCount + query.state.fetchFailureCount),
        refetchIntervalInBackground: false,
    });
    const progress = query.isError ? undefined : query.data;
    return (
        <section aria-labelledby="saved-upload-title" className="flex flex-col gap-3 border border-line bg-panel p-5">
            <h2 id="saved-upload-title" className="label-caps text-ice">{t.title}</h2>
            <StatusLine tone={query.isError ? 'error' : !progress ? 'progress' : progress.publication ? 'success' : 'neutral'}>
                {query.isError ? t.unverified
                    : !progress ? t.checking
                        : progress.publication ? t.ready
                            : progress.expired ? upload.publication.expiredMessage
                                : t.pending}
            </StatusLine>
            {progress?.publication ? (
                <Button asChild className="self-start"><Link href={`/s/${encodeURIComponent(jobId)}`}>{upload.openPublication}</Link></Button>
            ) : (
                <p className="text-sm text-light-3">
                    {progress && !progress.expired && t.detailsUnavailable}
                    {t.noNewPayment}
                </p>
            )}
            <Link className="self-start text-sm underline underline-offset-4 hover:text-ice" href={`/studio/new?job=${encodeURIComponent(jobId)}`}>
                {upload.statusLink}
            </Link>
        </section>
    );
}
