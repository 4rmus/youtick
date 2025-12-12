import { memo } from 'react';
import { Music, Film, BookOpen, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

const useCases = [
  { icon: Music, titleKey: 'concerts_title', physicalKey: 'concerts_physical', digitalKey: 'concerts_digital', gradient: 'from-purple-500/10 to-pink-500/10', border: 'border-purple-500/20' },
  { icon: Film, titleKey: 'cinema_title', physicalKey: 'cinema_physical', digitalKey: 'cinema_digital', gradient: 'from-blue-500/10 to-cyan-500/10', border: 'border-blue-500/20' },
  { icon: BookOpen, titleKey: 'workshop_title', physicalKey: 'workshop_physical', digitalKey: 'workshop_digital', gradient: 'from-emerald-500/10 to-green-500/10', border: 'border-emerald-500/20' },
] as const;

export const UseCasesSection = memo(() => {
  const { t } = useLanguage();

  return (
    <section id="use-cases" className="py-32 bg-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-black mb-6 text-white">
            {t.landing.use_cases.title}
          </h2>
          <p className="text-zinc-400 text-lg">
            {t.landing.use_cases.subtitle}
          </p>
        </div>

        {/* Use Cases */}
        <div className="max-w-5xl mx-auto space-y-8">
          {useCases.map(({ icon: Icon, titleKey, physicalKey, digitalKey, gradient, border }) => (
            <div
              key={titleKey}
              className={`p-8 md:p-10 rounded-2xl bg-gradient-to-br ${gradient} border ${border} ${ANIMATION.transition.default} hover:scale-[1.02]`}
            >
              {/* Title */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl md:text-3xl font-black text-white">
                  {t.landing.use_cases[titleKey as keyof typeof t.landing.use_cases]}
                </h3>
              </div>

              {/* Comparison */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Physical */}
                <div className={`p-6 rounded-xl ${COLORS.background.card} border ${COLORS.border.default}`}>
                  <div className="text-zinc-500 font-semibold text-sm mb-3 uppercase tracking-wider">Physical</div>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    {t.landing.use_cases[physicalKey as keyof typeof t.landing.use_cases]}
                  </p>
                </div>

                {/* Digital */}
                <div className={`p-6 rounded-xl bg-white/5 border border-white/10 relative`}>
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRight className="w-5 h-5 text-emerald-400" />
                    <div className="text-emerald-400 font-semibold text-sm uppercase tracking-wider">YouTick Digital</div>
                  </div>
                  <p className="text-white text-sm leading-relaxed font-medium">
                    {t.landing.use_cases[digitalKey as keyof typeof t.landing.use_cases]}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

UseCasesSection.displayName = 'UseCasesSection';
