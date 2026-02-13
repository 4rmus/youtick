'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * /ticket/[cid] — Shareable purchase link.
 * Redirects to /watch?cid=... where the IpfsPlayer handles
 * both purchase (inline TicketPurchaseCard) and playback.
 */
export default function TicketRedirectPage() {
    const params = useParams();
    const router = useRouter();
    const cid = params?.cid as string;

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
