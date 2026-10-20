import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clapperboard, Film, Globe, Music, Play, Sparkles } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { Button } from '@/components/ui/button';
import { LAUNCH_STAGE, type LaunchStage } from '@/lib/constants';
import {
    creatorApplyHref,
    faqHref,
    getLandingCopy,
    getLandingCtas,
    heroProgrammeLink,
    landingHomeHref,
    type LandingCopy,
    type LandingCtas,
    type LandingLocale,
} from './landing-copy';
import { OPENING_PROGRAMME, openingProgrammeMode, type OpeningProgrammeEntry, type OpeningWorkType } from './opening-programme';

type Props = {
    locale: LandingLocale;
    /** Copy layer to render; defaults to the configured stage. */
    stage?: LaunchStage;
    /** The opening programme to render; defaults to the configured list (empty hides the section). */
    programme?: readonly OpeningProgrammeEntry[];
};

const workTypeIcons: Record<OpeningWorkType, typeof Music> = {
    concert: Music,
    film: Film,
    documentary: Clapperboard,
    festival: Clapperboard,
    special: Sparkles,
};

const linkClass = 'inline-flex min-h-11 items-center underline-offset-4 hover:text-white hover:underline';

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

function OpeningProgramme({ copy, entries, locale }: { copy: LandingCopy['openingProgramme']; entries: readonly OpeningProgrammeEntry[]; locale: LandingLocale }) {
    const mode = openingProgrammeMode(entries);
    if (mode === 'hidden') return null;
    const intro = mode === 'programme' ? copy.programme : copy.artists;
    return (
        <section id="opening-programme" className="border-y border-white/5 bg-zinc-950 py-20">
            <div className="container mx-auto px-4">
                <div className="mb-10 max-w-3xl">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.eyebrow}</p>
                    <h2 className="mb-4 text-3xl font-black md:text-5xl">{intro.title}</h2>
                    <p className="text-lg leading-relaxed text-zinc-400">{intro.description}</p>
                </div>
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

/** One audience's block: a heading, an optional lead, a short list and an optional button. */
function Audience({ id, title, lead, items, action }: { id: string; title: string; lead?: string; items: readonly string[]; action?: { label: string; href: string } }) {
    return (
        <section id={id} className="border-t border-white/5 bg-black py-16">
            <div className="container mx-auto max-w-4xl px-4">
                <h2 className="mb-4 text-3xl font-black md:text-4xl">{title}</h2>
                {lead && <p className="mb-8 max-w-3xl text-lg leading-relaxed text-zinc-300 md:text-xl">{lead}</p>}
                <ul className={lead ? 'space-y-4' : 'mt-4 space-y-4'}>
                    {items.map((item) => (
                        <li key={item} className="flex gap-3 text-base leading-relaxed text-zinc-300 md:text-lg">
                            <CheckCircle2 aria-hidden="true" className="mt-1.5 h-4 w-4 shrink-0 text-near-green" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
                {action && (
                    <Button asChild size="lg" className="mt-8 w-full rounded-full bg-white px-8 py-6 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto">
                        <Link href={action.href}>{action.label}<ArrowRight aria-hidden="true" /></Link>
                    </Button>
                )}
            </div>
        </section>
    );
}

export function LandingPage({ locale, stage = LAUNCH_STAGE, programme = OPENING_PROGRAMME }: Props) {
    const copy = getLandingCopy(locale, stage);
    const ctas = getLandingCtas(locale, stage);
    const heroLink = heroProgrammeLink(copy, openingProgrammeMode(programme));

    return (
        <div lang={locale} dir="ltr" className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
            <LanguageSwitcher locale={locale} />
            <section className="relative min-h-[72vh] overflow-hidden">
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
                <div className="container relative z-10 mx-auto flex min-h-[72vh] items-center px-4 py-16">
                    <div className="max-w-4xl">
                        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 py-2 text-sm font-semibold text-zinc-200 backdrop-blur">
                            <Play aria-hidden="true" className="h-4 w-4" />
                            {copy.hero.badge}
                        </p>
                        <h1 className="max-w-5xl text-balance text-4xl font-black leading-[1.05] sm:text-5xl md:text-6xl lg:text-7xl">
                            {copy.hero.title}
                        </h1>
                        <p className="mt-6 max-w-3xl text-xl font-semibold leading-relaxed text-zinc-200 md:text-2xl">{copy.hero.subtitle}</p>
                        <div className="mt-8"><ActionButtons ctas={ctas} /></div>
                        {heroLink && (
                            <Link href={`#${heroLink.hash}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-200 underline-offset-4 hover:text-white hover:underline">
                                {heroLink.label}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                            </Link>
                        )}
                    </div>
                </div>
            </section>

            <OpeningProgramme copy={copy.openingProgramme} entries={programme} locale={locale} />

            <Audience id="ticket" title={copy.ticket.title} items={copy.ticket.items} />
            <Audience
                id="artists"
                title={copy.artists.title}
                lead={copy.artists.lead}
                items={copy.artists.items}
                action={{ label: copy.ctas.apply, href: creatorApplyHref(locale) }}
            />

            <section className="border-t border-white/5 bg-black py-10">
                <p className="container mx-auto flex flex-wrap items-center gap-x-5 gap-y-2 px-4 text-sm text-zinc-400">
                    <span>{copy.rules.label}</span>
                    <Link href="/terms" className={linkClass}>{copy.rules.terms}</Link>
                    {copy.rules.refund && <Link href="/refund-policy" className={linkClass}>{copy.rules.refund}</Link>}
                    <Link href={faqHref(locale)} className={linkClass}>{copy.rules.faq}</Link>
                </p>
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
