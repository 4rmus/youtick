'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * /ticket?cid=... — Legacy query-string route.
 * Redirects to /watch?cid=... or /discover if no cid.
 * Uses window.location for Web4 compatibility (avoids RSC data fetching).
 */
function TicketRedirect() {
    const searchParams = useSearchParams();
    const cid = searchParams.get('cid');

    useEffect(() => {
        if (cid) {
            window.location.replace(`/watch?cid=${cid}`);
        } else {
            window.location.replace('/discover');
        }
    }, [cid]);

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
