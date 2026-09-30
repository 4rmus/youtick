import Image from 'next/image';
import Link from 'next/link';
import {
    ArrowRight,
    CheckCircle2,
    Clapperboard,
    Eye,
    Film,
    Gauge,
    Github,
    Globe,
    Music,
    Play,
    Radio,
    ShieldCheck,
    Sparkles,
    Upload,
    WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROICalculator } from './ROICalculator';
import { getLandingCtas, landingCopy, type LandingCtas, type LandingLocale } from './landing-copy';

type Props = {
    locale: LandingLocale;
    enabled: boolean;
};

const useCaseIcons = [Music, Film, Clapperboard, Sparkles];
const trustIcons = [Upload, Gauge, ShieldCheck, WalletCards];

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

export function LandingPage({ locale, enabled }: Props) {
    const copy = landingCopy[locale];
    const ctas = getLandingCtas(locale, enabled);

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
                        {ctas.status && <p className="mt-5 text-sm font-semibold text-near-green">{ctas.status}</p>}
                        <div className="mt-8"><ActionButtons ctas={ctas} /></div>
                    </div>
                </div>
            </section>

            <section id="audience" className="bg-black py-24">
                <div className="container mx-auto px-4">
                    <div className="mb-12 max-w-3xl">
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.audience.eyebrow}</p>
                        <h2 className="mb-4 text-3xl font-black md:text-5xl">{copy.audience.title}</h2>
                        <p className="text-lg leading-relaxed text-zinc-400">{copy.audience.description}</p>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                        {[
                            { icon: Upload, content: copy.audience.creator },
                            { icon: Eye, content: copy.audience.viewer },
                        ].map(({ icon: Icon, content }) => (
                            <article key={content.title} className="rounded-2xl border border-white/10 bg-zinc-950 p-6 md:p-8">
                                <div className="mb-6 flex items-center gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-black"><Icon aria-hidden="true" className="h-6 w-6" /></div>
                                    <div>
                                        <h3 className="text-2xl font-black">{content.title}</h3>
                                        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{content.description}</p>
                                    </div>
                                </div>
                                <ul className="space-y-4">
                                    {content.benefits.map((benefit) => (
                                        <li key={benefit} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                                            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-near-green" />
                                            <span>{benefit}</span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="border-y border-white/5 bg-zinc-950 py-24">
                <div className="container mx-auto grid gap-12 px-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                    <div>
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.howItWorks.eyebrow}</p>
                        <h2 className="mb-5 text-3xl font-black md:text-5xl">{copy.howItWorks.title}</h2>
                        <p className="mb-10 text-lg leading-relaxed text-zinc-400">{copy.howItWorks.description}</p>
                        <ol className="space-y-4">
                            {copy.howItWorks.steps.map((step, index) => (
                                <li key={step.title} className="flex gap-4 rounded-xl border border-white/10 bg-black p-5">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-black">{index + 1}</span>
                                    <div><h3 className="mb-1 text-lg font-bold">{step.title}</h3><p className="text-sm leading-relaxed text-zinc-400">{step.description}</p></div>
                                </li>
                            ))}
                        </ol>
                    </div>
                    <div className="relative min-h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-black sm:aspect-[4/5] sm:min-h-0">
                        <Image src="/concert-crowd.webp" alt={copy.howItWorks.imageAlt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover opacity-75" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/5" />
                        <div className="absolute inset-x-5 bottom-5 rounded-xl border border-white/10 bg-black/85 p-5 backdrop-blur">
                            <div className="flex items-start justify-between gap-4">
                                <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{copy.howItWorks.previewLabel}</p><h3 className="mt-1 text-xl font-black sm:text-2xl">{copy.howItWorks.previewTitle}</h3></div>
                                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-black text-black">{copy.howItWorks.previewPrice}</span>
                            </div>
                            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                                {copy.howItWorks.previewDetails.map((item) => (
                                    <div key={item.label} className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-zinc-500">{item.label}</dt><dd className="mt-1 text-sm font-bold text-white">{item.value}</dd></div>
                                ))}
                            </dl>
                        </div>
                    </div>
                </div>
            </section>

            <section id="use-cases" className="bg-black py-24">
                <div className="container mx-auto px-4">
                    <div className="mb-12 max-w-3xl">
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.useCases.eyebrow}</p>
                        <h2 className="mb-4 text-3xl font-black md:text-5xl">{copy.useCases.title}</h2>
                        <p className="text-lg leading-relaxed text-zinc-400">{copy.useCases.description}</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {copy.useCases.items.map((item, index) => {
                            const Icon = useCaseIcons[index];
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

            <ROICalculator locale={locale} copy={copy.roi} />

            <section id="trust" className="border-y border-white/5 bg-zinc-950 py-24">
                <div className="container mx-auto px-4">
                    <div className="mb-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
                        <div><p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.trust.eyebrow}</p><h2 className="text-3xl font-black md:text-5xl">{copy.trust.title}</h2></div>
                        <p className="text-lg leading-relaxed text-zinc-400">{copy.trust.description}</p>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                        {copy.trust.items.map((item, index) => {
                            const Icon = trustIcons[index];
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
                        <Radio aria-hidden="true" className="h-4 w-4 text-near-green" />{copy.trust.technologyLabel}
                    </p>
                </div>
            </section>

            <section className="bg-black py-28">
                <div className="container mx-auto px-4 text-center">
                    <div className="mx-auto max-w-3xl">
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.cta.eyebrow}</p>
                        <h2 className="mb-6 text-4xl font-black leading-tight md:text-6xl">{copy.cta.title}</h2>
                        <p className="mx-auto mb-6 max-w-2xl text-lg leading-relaxed text-zinc-400">{copy.cta.description}</p>
                        {ctas.status && <p className="mb-6 text-sm font-semibold text-near-green">{ctas.status}</p>}
                        <div className="flex justify-center"><ActionButtons ctas={ctas} /></div>
                    </div>
                </div>
            </section>

            <footer className="border-t border-white/10 bg-black py-14">
                <div className="container mx-auto flex flex-col gap-10 px-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <Link href={locale === 'tr' ? '/tr' : '/'} className="text-2xl font-black tracking-tight">YouTick</Link>
                        <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-500">{copy.footer.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-zinc-500">
                        <a href="https://livepeer.org" target="_blank" rel="noreferrer" className="hover:text-white">Livepeer</a>
                        <a href="https://near.org" target="_blank" rel="noreferrer" className="hover:text-white">NEAR</a>
                        <a href="https://github.com/4rmus/youtick" target="_blank" rel="noreferrer" aria-label="GitHub" className="hover:text-white"><Github aria-hidden="true" className="h-5 w-5" /></a>
                        <Link href="/privacy" className="hover:text-white">{copy.footer.privacy}</Link>
                        <Link href="/terms" className="hover:text-white">{copy.footer.terms}</Link>
                        <a href="mailto:contact@youtick.net" className="hover:text-white">{copy.footer.support}</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
