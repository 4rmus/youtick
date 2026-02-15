import { memo } from 'react';
import Image from 'next/image';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Zap, Lock, Sparkles, DollarSign } from 'lucide-react';
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
          className="object-cover opacity-25"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/70 to-black" />
      </div>

      {/* Animated Gradient Orbs - NEAR Colors */}
      <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
        {/* Green Orb - Top Right */}
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(0, 236, 151, 0.4) 0%, transparent 70%)',
          }}
        />
        {/* Purple Orb - Bottom Left */}
        <div
          className="absolute -bottom-60 -left-40 w-[700px] h-[700px] rounded-full animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(151, 151, 255, 0.35) 0%, transparent 70%)',
            animationDelay: '1s',
          }}
        />
        {/* Blue Orb - Center */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(23, 217, 212, 0.2) 0%, transparent 70%)',
            animationDelay: '2s',
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-6 py-3 border border-near-green/30 rounded-full bg-near-green/10 backdrop-blur-md mb-6 hover:bg-near-green/20 hover:border-near-green/50 transition-all duration-500 group">
          <DollarSign className="w-5 h-5 text-near-green group-hover:animate-pulse" />
          <span className="text-near-green font-semibold text-sm tracking-wide">{t.landing.hero.badge}</span>
        </div>

        {/* Title with NEAR Gradient */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none">
          <span className="block text-white mb-2">{t.landing.hero.title_line1}</span>
          <span className="block text-gradient-near animate-gradient-flow" style={{ backgroundSize: '200% 200%' }}>
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

        {/* Value Badges - NEAR Colors - Revenue First */}
        <div className="flex flex-wrap justify-center gap-4 pt-6">
          <div className="flex items-center gap-2 px-5 py-3 bg-near-green/10 border border-near-green/30 rounded-full hover:bg-near-green/20 hover:scale-105 transition-all duration-300 cursor-default">
            <DollarSign className="w-5 h-5 text-near-green" />
            <span className="text-sm font-semibold text-emerald-300">{t.landing.hero.badge_instant_revenue}</span>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 bg-near-purple/10 border border-near-purple/30 rounded-full hover:bg-near-purple/20 hover:scale-105 transition-all duration-300 cursor-default">
            <Shield className="w-5 h-5 text-near-purple" />
            <span className="text-sm font-semibold text-violet-300">{t.landing.hero.badge_ownership}</span>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 bg-near-blue/10 border border-near-blue/30 rounded-full hover:bg-near-blue/20 hover:scale-105 transition-all duration-300 cursor-default">
            <Lock className="w-5 h-5 text-near-blue" />
            <span className="text-sm font-semibold text-cyan-300">{t.landing.hero.badge_no_censorship}</span>
          </div>
        </div>

        {/* CTAs - Artist Focus + Free Trial */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
          <Link href="/upload">
            <Button
              size="lg"
              className={`bg-near-green text-near-black hover:bg-near-green/80 hover:scale-105 text-lg px-10 py-7 rounded-full font-bold shadow-2xl shadow-near-green/30 ${ANIMATION.transition.default}`}
            >
              {t.landing.hero.cta_create_event} <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className={`border-white/30 bg-white/5 backdrop-blur-sm text-white hover:bg-white/10 hover:border-near-green/50 hover:scale-105 text-lg px-10 py-7 rounded-full font-bold ${ANIMATION.transition.default}`}
            onClick={onDiscoverClick}
          >
            {t.landing.hero.cta_discover}
          </Button>
        </div>

        {/* Free Trial CTA - More Prominent */}
        <div className="mt-8 text-center">
          <Link href="/trial">
            <div className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-near-purple/20 to-near-blue/20 border border-near-purple/40 rounded-full hover:border-near-purple hover:scale-105 transition-all duration-300 cursor-pointer group">
              <Sparkles className="w-5 h-5 text-near-purple group-hover:animate-pulse" />
              <span className="text-white font-semibold">{t.landing.hero.cta_try_free}</span>
              <span className="text-zinc-400">—</span>
              <span className="text-zinc-300 text-sm">{t.landing.hero.trial_highlight}</span>
              <ArrowRight className="w-4 h-4 text-near-purple group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
});

HeroSection.displayName = 'HeroSection';
