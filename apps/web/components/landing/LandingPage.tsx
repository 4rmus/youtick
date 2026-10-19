import Image from 'next/image';
import Link from 'next/link';
import {
    ArrowRight,
    Banknote,
    CheckCircle2,
    Clapperboard,
    Database,
    Film,
    Globe,
    Info,
    Mail,
    Music,
    Play,
    Radio,
    RotateCcw,
    ShieldCheck,
    Sparkles,
    Ticket,
    Upload,
    Video,
} from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { Button } from '@/components/ui/button';
import { LAUNCH_STAGE, type LaunchStage } from '@/lib/constants';
import {
    creatorApplyHref,
    getLandingCopy,
    getLandingCtas,
    heroProgrammeLink,
    landingHomeHref,
    type LandingCopy,
    type LandingCtas,
    type LandingLocale,
} from './landing-copy';
import { OPENING_PROGRAMME, openingProgrammeMode, type OpeningProgrammeEntry, type OpeningWorkType } from './opening-programme';
import { formatDollars, REVENUE_EXAMPLE_PRICE_CENTS, revenueSplit } from './revenue';

type Props = {
    locale: LandingLocale;
    /** Copy layer to render; defaults to the configured stage. */
    stage?: LaunchStage;
    /** The opening programme to render; defaults to the configured list (empty hides the section). */
    programme?: readonly OpeningProgrammeEntry[];
};

const programmeIcons = [Music, Film, Clapperboard, Sparkles];
const workTypeIcons: Record<OpeningWorkType, typeof Music> = {
    concert: Music,
    film: Film,
    documentary: Clapperboard,
    festival: Clapperboard,
    special: Sparkles,
};
const howItWorksIcons = [ShieldCheck, Database, Video, Info];

function ActionButtons({ ctas }: { ctas: LandingCtas }) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full rounded-full bg-white px-8 py-6 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto">
                <Link href={ctas.primary.href}>{ctas.primary.label}<ArrowRight aria-hidden="true" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full rounded-full border-white/25 bg-white/5 px-8 py-6 text-base font-bold text-white hover:border-white/50 hover:bg-white/10 sm:w-auto">
                <Link href={ctas.secondary.href}>{ctas.secondary.label}</Link>
            </Button>
        </div>
    );
}

function LanguageSwitcher({ locale }: { locale: LandingLocale }) {
    const target = locale === 'tr' ? 'en' : 'tr';
    return (
        <Link
            href={target === 'tr' ? '/tr' : '/'}
            hrefLang={target}
            aria-label={locale === 'tr' ? 'Switch to English' : 'Türkçeye geç'}
            className="group fixed bottom-4 right-4 z-50 flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 backdrop-blur-sm transition-colors hover:border-near-green/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green sm:bottom-6 sm:right-6"
        >
            <Globe aria-hidden="true" className="h-4 w-4 text-zinc-500 transition-colors group-hover:text-near-green" />
            <span className="text-xs font-bold text-near-green">{locale.toUpperCase()}</span>
            <span className="text-xs text-zinc-500">→ {target.toUpperCase()}</span>
        </Link>
    );
}

function SectionIntro({ intro }: { intro: { eyebrow: string; title: string; description: string } }) {
    const { eyebrow, title, description } = intro;
    return (
        <div className="mb-12 max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{eyebrow}</p>
            <h2 className="mb-4 text-3xl font-black md:text-5xl">{title}</h2>
            <p className="text-lg leading-relaxed text-zinc-400">{description}</p>
        </div>
    );
}

/** The two-card layout shared by the viewer's ticket section and the artists section. */
function ListCards({ cards, icons }: { cards: LandingCopy['ticket']['cards']; icons: readonly [typeof Music, typeof Music] }) {
    return (
        <div className="grid gap-5 lg:grid-cols-2">
            {cards.map((card, index) => {
                const Icon = icons[index];
                return (
                    <article key={card.title} className="rounded-2xl border border-white/10 bg-zinc-950 p-6 md:p-8">
                        <div className="mb-6 flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-black"><Icon aria-hidden="true" className="h-6 w-6" /></div>
                            <div>
                                <h3 className="text-2xl font-black">{card.title}</h3>
                                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{card.description}</p>
                            </div>
                        </div>
                        <ul className="space-y-4">
                            {card.items.map((item) => (
                                <li key={item} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-near-green" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </article>
                );
            })}
        </div>
    );
}

function OpeningProgramme({ copy, entries, locale }: { copy: LandingCopy['openingProgramme']; entries: readonly OpeningProgrammeEntry[]; locale: LandingLocale }) {
    const mode = openingProgrammeMode(entries);
    if (mode === 'hidden') return null;
    const intro = mode === 'programme' ? copy.programme : copy.artists;
    return (
        <section id="opening-programme" className="border-y border-white/5 bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
                <SectionIntro intro={{ eyebrow: copy.eyebrow, ...intro }} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {entries.map((entry) => {
                        const work = mode === 'programme' ? entry.work : undefined;
                        const Icon = work ? workTypeIcons[work.type] : Music;
                        return (
                            <article key={`${entry.artist}-${work?.title ?? ''}`} className="rounded-2xl border border-white/10 bg-black p-6">
                                <Icon aria-hidden="true" className="mb-5 h-7 w-7 text-zinc-200" />
                                {work && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{copy.workTypes[work.type]}</p>}
                                <h3 className="mb-2 text-lg font-bold">{work?.title ?? entry.artist}</h3>
                                {work && <p className="text-sm text-zinc-300">{entry.artist}</p>}
                                {work?.note && <p className="mt-3 text-sm leading-relaxed text-zinc-400">{work.note[locale]}</p>}
                                {work?.href && (
                                    <Link href={work.href} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-200 hover:text-white">
                                        {copy.screeningPage}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                                    </Link>
                                )}
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function RevenueExample({ copy }: { copy: NonNullable<LandingCopy['artists']['example']> }) {
    const split = revenueSplit(REVENUE_EXAMPLE_PRICE_CENTS);
    const rows = [
        { label: copy.price, value: formatDollars(split.priceCents) },
        { label: copy.vat, value: formatDollars(-split.vatCents) },
        { label: copy.card, value: formatDollars(-split.cardCents) },
        { label: copy.youtick, value: formatDollars(-split.youtickCents) },
    ];
    return (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black p-6 md:p-8">
            <h3 className="mb-5 text-lg font-bold">{copy.title}</h3>
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

export function LandingPage({ locale, stage = LAUNCH_STAGE, programme = OPENING_PROGRAMME }: Props) {
    const copy = getLandingCopy(locale, stage);
    const ctas = getLandingCtas(locale, stage);
    const applyHref = creatorApplyHref(locale);
    const heroLink = heroProgrammeLink(copy, openingProgrammeMode(programme));

    return (
        <div lang={locale} dir="ltr" className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
            <LanguageSwitcher locale={locale} />
            <section className="relative min-h-[82vh] overflow-hidden">
                <div className="absolute inset-0">
                    <Image
                        src="/hero-concert.webp"
                        alt={copy.hero.imageAlt}
                        fill
                        priority
                        sizes="100vw"
                        className="object-cover opacity-40 grayscale"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.80)_58%,rgba(0,0,0,0.48)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
                </div>
                <div className="container relative z-10 mx-auto flex min-h-[82vh] items-center px-4 py-16">
                    <div className="max-w-4xl">
                        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 py-2 text-sm font-semibold text-zinc-200 backdrop-blur">
                            <Play aria-hidden="true" className="h-4 w-4" />
                            {copy.hero.badge}
                        </p>
                        <h1 className="max-w-5xl text-balance text-4xl font-black leading-[1.02] sm:text-5xl md:text-7xl lg:text-8xl">
                            {copy.hero.title}
                        </h1>
                        <p className="mt-6 max-w-2xl text-xl font-semibold leading-relaxed text-zinc-200 md:text-2xl">{copy.hero.subtitle}</p>
                        <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg">{copy.hero.description}</p>
                        <div className="mt-8"><ActionButtons ctas={ctas} /></div>
                        <Link href={`#${heroLink.hash}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-200 underline-offset-4 hover:text-white hover:underline">
                            {heroLink.label}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </section>

            <OpeningProgramme copy={copy.openingProgramme} entries={programme} locale={locale} />

            <section id="programme" className="bg-black py-24">
                <div className="container mx-auto px-4">
                    <SectionIntro intro={copy.programme} />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {copy.programme.items.map((item, index) => {
                            const Icon = programmeIcons[index];
                            return (
                                <article key={item.title} className="rounded-2xl border border-white/10 bg-zinc-950 p-6 transition-colors hover:border-white/30">
                                    <Icon aria-hidden="true" className="mb-5 h-7 w-7 text-zinc-200" />
                                    <h3 className="mb-3 text-lg font-bold">{item.title}</h3>
                                    <p className="text-sm leading-relaxed text-zinc-400">{item.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section id="box-office" className="border-y border-white/5 bg-zinc-950 py-24">
                <div className="container mx-auto grid gap-12 px-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                    <div>
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.boxOffice.eyebrow}</p>
                        <h2 className="mb-5 text-3xl font-black md:text-5xl">{copy.boxOffice.title}</h2>
                        <p className="mb-10 text-lg leading-relaxed text-zinc-400">{copy.boxOffice.description}</p>
                        <ol className="space-y-4">
                            {copy.boxOffice.steps.map((step, index) => (
                                <li key={step.title} className="flex gap-4 rounded-xl border border-white/10 bg-black p-5">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-black">{index + 1}</span>
                                    <div><h3 className="mb-1 text-lg font-bold">{step.title}</h3><p className="text-sm leading-relaxed text-zinc-400">{step.description}</p></div>
                                </li>
                            ))}
                        </ol>
                    </div>
                    <div className="relative min-h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-black sm:aspect-[4/5] sm:min-h-0">
                        <Image src="/concert-crowd.webp" alt={copy.boxOffice.imageAlt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover opacity-75" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/5" />
                        <div className="absolute inset-x-5 bottom-5 rounded-xl border border-white/10 bg-black/85 p-5 backdrop-blur">
                            <div className="flex items-start justify-between gap-4">
                                <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{copy.boxOffice.preview.label}</p><h3 className="mt-1 text-xl font-black sm:text-2xl">{copy.boxOffice.preview.title}</h3></div>
                                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-black text-black">{copy.boxOffice.preview.tag}</span>
                            </div>
                            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                                {copy.boxOffice.preview.details.map((item) => (
                                    <div key={item.label} className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-zinc-500">{item.label}</dt><dd className="mt-1 text-sm font-bold text-white">{item.value}</dd></div>
                                ))}
                            </dl>
                        </div>
                    </div>
                </div>
            </section>

            <section id="ticket" className="bg-black py-24">
                <div className="container mx-auto px-4">
                    <SectionIntro intro={copy.ticket} />
                    <ListCards cards={copy.ticket.cards} icons={[Ticket, RotateCcw]} />
                    {copy.ticket.links && (
                        <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
                            <Link href="/terms" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-white hover:underline">{copy.ticket.links.terms}</Link>
                            <Link href="/refund-policy" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-white hover:underline">{copy.ticket.links.refund}</Link>
                        </p>
                    )}
                </div>
            </section>

            <section id="artists" className="border-y border-white/5 bg-zinc-950 py-24">
                <div className="container mx-auto px-4">
                    <SectionIntro intro={copy.artists} />
                    <ListCards cards={copy.artists.cards} icons={[Upload, Banknote]} />
                    {copy.artists.example && <RevenueExample copy={copy.artists.example} />}
                </div>
            </section>

            <section id="apply" className="bg-black py-24">
                <div className="container mx-auto grid gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                    <div>
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.apply.eyebrow}</p>
                        <h2 className="mb-5 text-3xl font-black md:text-5xl">{copy.apply.title}</h2>
                        <p className="text-lg leading-relaxed text-zinc-400">{copy.apply.description}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 md:p-8">
                        <ul className="space-y-4">
                            {copy.apply.points.map((point) => (
                                <li key={point} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-near-green" />
                                    <span>{point}</span>
                                </li>
                            ))}
                        </ul>
                        <Button asChild size="lg" className="mt-8 w-full rounded-full bg-white px-8 py-6 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto">
                            <Link href={applyHref}><Mail aria-hidden="true" />{copy.apply.action}</Link>
                        </Button>
                        <p className="mt-5 text-xs leading-relaxed text-zinc-500">{copy.apply.note}</p>
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="border-y border-white/5 bg-zinc-950 py-24">
                <div className="container mx-auto px-4">
                    <div className="mb-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
                        <div><p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.howItWorks.eyebrow}</p><h2 className="text-3xl font-black md:text-5xl">{copy.howItWorks.title}</h2></div>
                        <p className="text-lg leading-relaxed text-zinc-400">{copy.howItWorks.description}</p>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                        {copy.howItWorks.items.map((item, index) => {
                            const Icon = howItWorksIcons[index];
                            return (
                                <article key={item.title} className="rounded-2xl border border-white/10 bg-black p-6">
                                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/5"><Icon aria-hidden="true" className="h-5 w-5 text-near-green" /></div>
                                    <h3 className="mb-3 text-lg font-bold">{item.title}</h3>
                                    <p className="text-sm leading-relaxed text-zinc-400">{item.description}</p>
                                </article>
                            );
                        })}
                    </div>
                    <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black px-4 py-2 text-sm text-zinc-300">
                        <Radio aria-hidden="true" className="h-4 w-4 text-near-green" />{copy.howItWorks.technologyLabel}
                    </p>
                </div>
            </section>

            <section className="bg-black py-28">
                <div className="container mx-auto px-4 text-center">
                    <div className="mx-auto max-w-3xl">
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.closing.eyebrow}</p>
                        <h2 className="mb-6 text-4xl font-black leading-tight md:text-6xl">{copy.closing.title}</h2>
                        <p className="mx-auto mb-6 max-w-2xl text-lg leading-relaxed text-zinc-400">{copy.closing.description}</p>
                        <div className="flex justify-center"><ActionButtons ctas={ctas} /></div>
                    </div>
                </div>
            </section>

            <footer className="border-t border-white/10 bg-black py-14">
                <div className="container mx-auto flex flex-col gap-10 px-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <Link href={landingHomeHref(locale)} className="text-2xl"><BrandWordmark /></Link>
                        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500">{copy.footer.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-zinc-500">
                        <Link href="/privacy" className="hover:text-white">{copy.footer.privacy}</Link>
                        <Link href="/terms" className="hover:text-white">{copy.footer.terms}</Link>
                        {copy.footer.refund && <Link href="/refund-policy" className="hover:text-white">{copy.footer.refund}</Link>}
                        <Link href="/report" className="hover:text-white">{copy.footer.report}</Link>
                        <a href="mailto:contact@youtick.net" className="hover:text-white">{copy.footer.support}</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
