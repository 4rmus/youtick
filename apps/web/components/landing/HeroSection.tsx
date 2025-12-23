import { memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Zap, Lock, Sparkles } from 'lucide-react';
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

      {/* Animated Gradient Orbs */}
      <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
        {/* Pink Orb - Top Right */}
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(255, 0, 110, 0.4) 0%, transparent 70%)',
          }}
        />
        {/* Violet Orb - Bottom Left */}
        <div
          className="absolute -bottom-60 -left-40 w-[700px] h-[700px] rounded-full animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(131, 56, 236, 0.35) 0%, transparent 70%)',
            animationDelay: '1s',
          }}
        />
        {/* Cyan Orb - Center */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(0, 245, 212, 0.2) 0%, transparent 70%)',
            animationDelay: '2s',
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-6 py-3 border border-white/20 rounded-full bg-white/5 backdrop-blur-md mb-6 hover:bg-white/10 hover:border-[#FF006E]/50 transition-all duration-500 group">
          <Sparkles className="w-5 h-5 text-[#FF006E] group-hover:animate-pulse" />
          <span className="text-white font-semibold text-sm tracking-wide">{t.landing.hero.badge}</span>
        </div>

        {/* Title with Concert Gradient */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none">
          <span className="block text-white mb-2">{t.landing.hero.title_line1}</span>
          <span className="block text-gradient-concert animate-gradient-flow" style={{ backgroundSize: '200% 200%' }}>
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

        {/* Value Badges - Concert Colors */}
        <div className="flex flex-wrap justify-center gap-4 pt-6">
          <div className="flex items-center gap-2 px-5 py-3 bg-[#FF006E]/10 border border-[#FF006E]/30 rounded-full hover:bg-[#FF006E]/20 hover:scale-105 transition-all duration-300 cursor-default">
            <Shield className="w-5 h-5 text-[#FF006E]" />
            <span className="text-sm font-semibold text-pink-300">{t.landing.hero.badge_ownership}</span>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 bg-[#8338EC]/10 border border-[#8338EC]/30 rounded-full hover:bg-[#8338EC]/20 hover:scale-105 transition-all duration-300 cursor-default">
            <Zap className="w-5 h-5 text-[#8338EC]" />
            <span className="text-sm font-semibold text-violet-300">{t.landing.hero.badge_instant_revenue}</span>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 bg-[#00F5D4]/10 border border-[#00F5D4]/30 rounded-full hover:bg-[#00F5D4]/20 hover:scale-105 transition-all duration-300 cursor-default">
            <Lock className="w-5 h-5 text-[#00F5D4]" />
            <span className="text-sm font-semibold text-cyan-300">{t.landing.hero.badge_no_censorship}</span>
          </div>
        </div>

        {/* CTAs with Concert Glow */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
          <Button
            size="lg"
            className={`bg-gradient-to-r from-[#FF006E] to-[#8338EC] text-white hover:opacity-90 hover:scale-105 text-lg px-10 py-7 rounded-full font-bold shadow-2xl shadow-[#FF006E]/30 ${ANIMATION.transition.default}`}
            onClick={onDiscoverClick}
          >
            {t.landing.hero.cta_discover} <ArrowRight className="ml-2 w-6 h-6" />
          </Button>
          <Link href="/upload">
            <Button
              size="lg"
              variant="outline"
              className={`border-white/30 bg-white/5 backdrop-blur-sm text-white hover:bg-white/10 hover:border-[#00F5D4]/50 hover:scale-105 text-lg px-10 py-7 rounded-full font-bold ${ANIMATION.transition.default}`}
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

