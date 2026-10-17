import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { CreatorApplicationForm } from './CreatorApplicationForm';
import { applyCopy, type ApplyLocale } from './apply-copy';

export function creatorApplicationSiteKey(raw = process.env.NEXT_PUBLIC_CREATOR_APPLICATION_TURNSTILE_SITE_KEY): string | null {
    return raw?.trim() || null;
}

export function ApplyPage({ locale }: { locale: ApplyLocale }) {
    const copy = applyCopy[locale];
    return (
        <PageShell className="max-w-2xl">
            <div lang={locale} className="space-y-8 text-zinc-300">
                <div>
                    <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.eyebrow}</p>
                    <h1 className="text-3xl font-black text-white md:text-5xl">{copy.title}</h1>
                    <p className="mt-5 text-base leading-relaxed text-zinc-400 md:text-lg">{copy.intro}</p>
                </div>
                <CreatorApplicationForm locale={locale} siteKey={creatorApplicationSiteKey()} />
                <Link href={locale === 'tr' ? '/tr' : '/'} className="inline-block text-emerald-300">{copy.back}</Link>
            </div>
        </PageShell>
    );
}
