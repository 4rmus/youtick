'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VideoCard } from '@/components/VideoCard';
import { useAllVideos } from '@/hooks/useAllVideos';

export function DiscoverView() {
    const query = useAllVideos();
    return (
        <div className="container mx-auto min-h-[calc(100vh-4rem)] px-4 py-10">
            <div className="mb-8">
                <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">Ticketed releases</p>
                <h1 className="mt-3 text-3xl font-bold">Discover</h1>
                <p className="mt-3 text-sm text-zinc-400">Films and concert recordings, available directly from their creators.</p>
            </div>

            {query.loading ? (
                <div role="status" className="flex items-center gap-3 text-zinc-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading releases…</div>
            ) : query.error ? (
                <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-6">
                    <p>Releases could not be loaded.</p>
                    <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
                </div>
            ) : query.publications.length === 0 ? (
                <p className="rounded-lg border border-zinc-800 p-10 text-center text-zinc-400">No releases are available yet.</p>
            ) : (
                <>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {query.publications.map((publication) => <VideoCard key={publication.publication_id} publication={publication} />)}
                    </div>
                    {query.hasNextPage && (
                        <div className="mt-8 text-center">
                            <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                                {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
