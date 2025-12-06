import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

interface CTASectionProps {
  onDiscoverClick: () => void;
}

export const CTASection = memo(({ onDiscoverClick }: CTASectionProps) => {
  const { t } = useLanguage();

  return (
    <section className="py-40 bg-black relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center">
        <h2 className="text-5xl md:text-7xl font-black mb-8 leading-tight">
          {t.landing.cta.title_line1}
          <br />
          <span className={COLORS.text.accent}>{t.landing.cta.title_line2}</span>
        </h2>
        <p className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto">
          {t.landing.cta.subtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className={`bg-white hover:bg-zinc-200 text-black text-lg px-12 py-8 rounded-full font-bold ${ANIMATION.transition.default} ${ANIMATION.hover.scale}`}
            onClick={onDiscoverClick}
          >
            {t.landing.cta.start_exploring} <ArrowRight className="ml-2 w-6 h-6" />
          </Button>
        </div>
      </div>
    </section>
  );
});

CTASection.displayName = 'CTASection';
