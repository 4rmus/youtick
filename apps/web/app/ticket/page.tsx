'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * /ticket?cid=... — Legacy query-string route.
 * Redirects to /watch?cid=... or /discover if no cid.
 */
function TicketRedirect() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const cid = searchParams.get('cid');

    useEffect(() => {
        if (cid) {
            router.replace(`/watch?cid=${cid}`);
        } else {
            router.replace('/discover');
        }
    }, [cid, router]);

    return (
        <div className="flex h-screen items-center justify-center bg-black text-white">
            <Loader2 className="animate-spin w-10 h-10 text-primary" />
        </div>
    );
}

export default function TicketPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-black text-white">
                <Loader2 className="animate-spin w-10 h-10 text-primary" />
            </div>
        }>
            <TicketRedirect />
        </Suspense>
    );
}
