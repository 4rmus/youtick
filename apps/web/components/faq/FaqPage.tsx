import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { faqCopy, type FaqLocale, type RevenueExampleCopy } from './faq-copy';
import { formatDollars, REVENUE_EXAMPLE_PRICE_CENTS, revenueSplit } from './revenue';

const link = 'inline-flex min-h-11 items-center text-emerald-300 underline-offset-2 hover:underline';

function RevenueExample({ copy }: { copy: RevenueExampleCopy }) {
    const split = revenueSplit(REVENUE_EXAMPLE_PRICE_CENTS);
    const rows = [
        { label: copy.price, value: formatDollars(split.priceCents) },
        { label: copy.vat, value: formatDollars(-split.vatCents) },
        { label: copy.card, value: formatDollars(-split.cardCents) },
        { label: copy.youtick, value: formatDollars(-split.youtickCents) },
    ];
    return (
        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
            <h3 className="mb-4 text-base font-bold text-white">{copy.title}</h3>
            <dl className="divide-y divide-white/10 text-sm">
                {rows.map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
                        <dt className="text-zinc-400">{row.label}</dt>
                        <dd className="font-semibold tabular-nums text-zinc-200">{row.value}</dd>
                    </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="font-bold text-white">{copy.artist}</dt>
                    <dd className="text-lg font-black tabular-nums text-near-green">{formatDollars(split.artistCents)}</dd>
                </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">{copy.note}</p>
        </div>
    );
}

/** The bilingual FAQ: the detail the landing links to instead of carrying. */
export function FaqPage({ locale }: { locale: FaqLocale }) {
    const copy = faqCopy[locale];
    return (
        <PageShell className="max-w-3xl">
            <div lang={locale} className="space-y-10 text-zinc-300">
                <header className="space-y-4">
                    <h1 className="text-3xl font-black text-white md:text-5xl">{copy.title}</h1>
                    <p className="text-base leading-relaxed text-zinc-400 md:text-lg">{copy.intro}</p>
                </header>
                {copy.entries.map((entry) => (
                    <section key={entry.id} id={entry.id} className="space-y-3">
                        <h2 className="text-xl font-semibold text-white">{entry.question}</h2>
                        {entry.answers.map((answer) => <p key={answer} className="leading-relaxed">{answer}</p>)}
                        {entry.id === 'artist-share' && copy.revenue && <RevenueExample copy={copy.revenue} />}
                        {entry.link && <Link href={entry.link.href} className={link}>{entry.link.label}</Link>}
                    </section>
                ))}
                <Link href={locale === 'tr' ? '/tr' : '/'} className={link}>{copy.back}</Link>
            </div>
        </PageShell>
    );
}
