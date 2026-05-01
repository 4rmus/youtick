'use client';

import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/providers/LanguageContext';
import { ArrowRight, Ticket } from 'lucide-react';

export default function MintPage() {
    const { t } = useLanguage();
    const m = t.legacy_mint;

    return (
        <div className="container mx-auto flex min-h-screen items-center justify-center px-4 py-24">
            <div className="max-w-2xl rounded-lg border border-white/10 bg-zinc-950 p-8 text-center shadow-xl shadow-black/30">
                <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-near-green/10">
                    <Ticket className="h-6 w-6 text-near-green" />
                </div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-near-green">
                    {m.eyebrow}
                </p>
                <h1 className="text-3xl font-black text-white md:text-5xl">
                    {m.title}
                </h1>
                <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-zinc-400 md:text-base">
                    {m.description}
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link href="/discover">
                        <Button
                            size="lg"
                            className="w-full bg-near-green font-bold text-near-black hover:bg-near-green/85 sm:w-auto"
                        >
                            {m.cta_discover} <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    <Link href="/upload">
                        <Button
                            size="lg"
                            variant="outline"
                            className="w-full border-white/20 bg-white/5 font-bold text-white hover:bg-white/10 sm:w-auto"
                        >
                            {m.cta_upload}
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
