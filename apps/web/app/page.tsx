import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
    return (
        <div className="container mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col items-start justify-center px-4 py-20">
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">NEAR + Livepeer</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">Paid video, with access settled onchain.</h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">Creators upload directly to Livepeer. NEAR records publications, USDC payments and playback entitlement.</p>
            <div className="mt-8 flex gap-3">
                <Button asChild><Link href="/discover">Discover</Link></Button>
                <Button asChild variant="outline"><Link href="/upload">Publish</Link></Button>
            </div>
        </div>
    );
}
