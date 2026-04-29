'use client';

import { useRouter } from 'next/navigation';
import { DiscoverView } from '@/components/discover/DiscoverView';

export default function DiscoverPage() {
    const router = useRouter();

    return <DiscoverView onBackClick={() => router.push('/')} />;
}
