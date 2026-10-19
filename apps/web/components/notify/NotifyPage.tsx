import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { notifyCopy, type NotifyLocale } from './notify-copy';
import { OpeningNoticeForm } from './OpeningNoticeForm';
import { openingNoticeSiteKey } from './site-key';

export function NotifyPage({ locale }: { locale: NotifyLocale }) {
    const copy = notifyCopy[locale];
    return (
        <PageShell className="max-w-2xl">
            <div lang={locale} className="space-y-8 text-zinc-300">
                <div>
                    <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.eyebrow}</p>
                    <h1 className="text-3xl font-black text-white md:text-5xl">{copy.title}</h1>
                    <p className="mt-5 text-base leading-relaxed text-zinc-400 md:text-lg">{copy.intro}</p>
                </div>
                <OpeningNoticeForm locale={locale} siteKey={openingNoticeSiteKey()} />
                <Link href={locale === 'tr' ? '/tr' : '/'} className="inline-block text-emerald-300">{copy.back}</Link>
            </div>
        </PageShell>
    );
}
