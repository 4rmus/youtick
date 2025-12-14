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
          className="object-cover opacity-30"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/60 to-black" />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-6 py-3 border border-white/20 rounded-full bg-white/5 backdrop-blur-md mb-6 hover:bg-white/10 transition-all duration-300">
          <Sparkles className="w-5 h-5 text-white" />
          <span className="text-white font-semibold text-sm tracking-wide">{t.landing.hero.badge}</span>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none">
          <span className="block text-white mb-2">{t.landing.hero.title_line1}</span>
          <span className="block bg-gradient-to-r from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
            {t.landing.hero.title_line2}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-zinc-300 max-w-3xl mx-auto leading-relaxed font-medium">
          {t.landing.hero.subtitle}
        </p>

        {/* Description */}
        <p className="text-base md:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          {t.landing.hero.description}
        </p>

        {/* Value Badges */}
        <div className="flex flex-wrap justify-center gap-4 pt-6">
          <div className="flex items-center gap-2 px-5 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-full hover:bg-emerald-500/20 transition-all duration-300">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-300">{t.landing.hero.badge_ownership}</span>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 bg-purple-500/10 border border-purple-500/30 rounded-full hover:bg-purple-500/20 transition-all duration-300">
            <Zap className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-semibold text-purple-300">{t.landing.hero.badge_instant_revenue}</span>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 bg-blue-500/10 border border-blue-500/30 rounded-full hover:bg-blue-500/20 transition-all duration-300">
            <Lock className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-semibold text-blue-300">{t.landing.hero.badge_no_censorship}</span>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
          <Button
            size="lg"
            className={`bg-white text-black hover:bg-zinc-200 hover:scale-105 text-lg px-10 py-7 rounded-full font-bold shadow-2xl shadow-white/20 ${ANIMATION.transition.default}`}
            onClick={onDiscoverClick}
          >
            {t.landing.hero.cta_discover} <ArrowRight className="ml-2 w-6 h-6" />
          </Button>
          <Link href="/upload">
            <Button
              size="lg"
              variant="outline"
              className={`border-white/30 bg-white/5 backdrop-blur-sm text-white hover:bg-white/10 hover:border-white/50 hover:scale-105 text-lg px-10 py-7 rounded-full font-bold ${ANIMATION.transition.default}`}
            >
              {t.landing.hero.cta_create_event}
            </Button>
          </Link>
        </div>


      </div>
    </section>
  );
});

HeroSection.displayName = 'HeroSection';
