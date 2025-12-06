import { memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Zap, Lock, Sparkles, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { ANIMATION } from '@/lib/constants';

interface HeroSectionProps {
  onDiscoverClick: () => void;
}

export const HeroSection = memo(({ onDiscoverClick }: HeroSectionProps) => {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero_concert.png"
          alt="Concert"
          fill
          className="object-cover opacity-40"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/50 to-black" />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 border border-white/10 rounded-full bg-white/5 backdrop-blur-sm mb-6">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          <span className="text-zinc-400 font-medium text-sm">{t.landing.hero.badge}</span>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none">
          <span className="block text-white">{t.landing.hero.title_line1}</span>
          <span className="block bg-gradient-to-r from-white via-zinc-400 to-zinc-600 bg-clip-text text-transparent">
            {t.landing.hero.title_line2}
          </span>
        </h1>

        {/* Description */}
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          <strong className="text-white">{t.landing.hero.description_creators}</strong>: {t.landing.hero.description_creators_text}
          <br className="hidden md:block" />
          <strong className="text-white">{t.landing.hero.description_viewers}</strong>: {t.landing.hero.description_viewers_text}
        </p>

        {/* Ownership Badges */}
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
            <Lock className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">{t.landing.hero.badge_no_censorship}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
            <Shield className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">{t.landing.hero.badge_ownership}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
            <Zap className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">{t.landing.hero.badge_instant_revenue}</span>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
          <Button
            size="lg"
            className={`bg-white text-black hover:bg-zinc-200 text-base px-8 py-6 rounded-full font-semibold ${ANIMATION.transition.default} ${ANIMATION.hover.scale}`}
            onClick={onDiscoverClick}
          >
            {t.landing.hero.cta_discover} <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Link href="/upload">
            <Button
              size="lg"
              variant="outline"
              className={`border-white/20 bg-transparent text-white hover:bg-white/10 text-base px-8 py-6 rounded-full font-semibold ${ANIMATION.transition.default}`}
            >
              {t.landing.hero.cta_create_event}
            </Button>
          </Link>
        </div>

        {/* Scroll Indicator */}
        <div className="pt-16">
          <a href="#features" className="inline-block animate-bounce">
            <ChevronDown className="w-8 h-8 text-zinc-500" />
          </a>
        </div>
      </div>
    </section>
  );
});

HeroSection.displayName = 'HeroSection';
