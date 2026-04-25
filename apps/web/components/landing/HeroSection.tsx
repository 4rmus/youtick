import { memo } from 'react';
import Image from 'next/image';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play, ShieldCheck, Ticket } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

interface HeroSectionProps {
  onDiscoverClick: () => void;
}

export const HeroSection = memo(({ onDiscoverClick }: HeroSectionProps) => {
  const { t } = useLanguage();
  const h = t.landing.hero_section;

  return (
    <section className="relative min-h-screen overflow-hidden bg-black pt-20">
      <div className="absolute inset-0">
        <Image
          src="/hero_concert.png"
          alt="Concert stage with audience lights"
          fill
          className="object-cover opacity-35"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.78)_46%,rgba(0,0,0,0.38)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
      </div>

      <div className="container relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] items-center gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-near-green/30 bg-black/50 px-4 py-2 text-sm font-semibold text-near-green backdrop-blur">
            <Play className="h-4 w-4" />
            {h.badge}
          </div>

          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white md:text-7xl lg:text-8xl">
            {h.title}
          </h1>

          <p className="mt-6 max-w-2xl text-xl font-semibold leading-relaxed text-zinc-200 md:text-2xl">
            {h.subtitle}
          </p>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg">
            {h.description}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/upload">
              <Button
                size="lg"
                className="w-full rounded-full bg-near-green px-8 py-7 text-base font-bold text-near-black hover:bg-near-green/85 sm:w-auto"
              >
                {h.cta_primary} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-white/25 bg-white/5 px-8 py-7 text-base font-bold text-white hover:border-white/50 hover:bg-white/10"
              onClick={onDiscoverClick}
            >
              {h.cta_secondary}
            </Button>
          </div>

          <p className="mt-5 text-sm text-zinc-500">
            {h.trial_hint}
          </p>
        </div>

        <div className="hidden lg:block">
          <div className="relative ml-auto max-w-lg">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60">
              <div className="relative aspect-[4/3]">
                <Image
                  src="/cinema_scene.png"
                  alt="Cinema screening atmosphere"
                  fill
                  className="object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-near-green">
                    <Ticket className="h-3.5 w-3.5" />
                    {h.card_badge}
                  </div>
                  <h2 className="text-2xl font-black text-white">{h.card_title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    {h.card_desc}
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-8 -left-8 w-64 rounded-lg border border-white/10 bg-black/90 p-5 shadow-xl backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-near-green/10">
                  <ShieldCheck className="h-5 w-5 text-near-green" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{h.stat_revenue}</p>
                  <p className="text-xs text-zinc-500">{h.stat_access}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

HeroSection.displayName = 'HeroSection';
