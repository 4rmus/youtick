import { memo } from 'react';
import Image from 'next/image';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';

export const HeroSection = memo(() => {
  const { t } = useLanguage();
  const { connect, accountId } = useWallet();
  const h = t.landing.hero_section;

  const handlePublish = () => {
    if (accountId) {
      window.location.href = '/upload';
      return;
    }
    connect();
  };

  return (
    <section className="relative min-h-[82vh] overflow-hidden bg-black pt-20">
      <div className="absolute inset-0">
        <Image
          src="/hero_concert.png"
          alt="Concert stage with audience lights"
          fill
          className="object-cover opacity-28 grayscale"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.82)_54%,rgba(0,0,0,0.58)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
      </div>

      <div className="container relative z-10 mx-auto flex min-h-[calc(82vh-5rem)] items-center px-4 py-12 sm:py-16">
        <div className="min-w-0 max-w-4xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 py-2 text-sm font-semibold text-zinc-200 backdrop-blur">
            <Play className="h-4 w-4" />
            {h.badge}
          </div>

          <h1 className="max-w-5xl text-balance text-4xl font-black leading-[1.02] text-white sm:text-5xl md:text-7xl lg:text-8xl">
            {h.title}
          </h1>

          <p className="mt-6 max-w-2xl text-xl font-semibold leading-relaxed text-zinc-200 md:text-2xl">
            {h.subtitle}
          </p>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg">
            {h.description}
          </p>

          <p className="mt-5 hidden text-sm text-zinc-500 sm:block">
            {h.trial_hint}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={handlePublish}
              className="w-full rounded-full bg-white px-8 py-7 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto"
            >
              {h.cta_primary} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Link href="/discover" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full rounded-full border-white/25 bg-white/5 px-8 py-7 text-base font-bold text-white hover:border-white/50 hover:bg-white/10"
              >
                {h.cta_secondary}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
});

HeroSection.displayName = 'HeroSection';
