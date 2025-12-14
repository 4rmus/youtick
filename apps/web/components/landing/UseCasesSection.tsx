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
    <section id="use-cases" className="py-32 bg-black relative">


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

        {/* Use Cases Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {useCases.map(({ icon: Icon, titleKey, physicalKey, digitalKey, gradient, border }, index) => (
            <div
              key={titleKey}
              className={`relative p-6 rounded-3xl bg-gradient-to-br ${gradient} border ${border} ${ANIMATION.transition.default} hover:scale-[1.02] group flex flex-col h-full`}
            >
              {/* Header */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center shadow-lg border border-white/10 mb-4">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {t.landing.use_cases[titleKey as keyof typeof t.landing.use_cases]}
                </h3>
              </div>

              {/* Vertical Flow */}
              <div className="flex-1 flex flex-col gap-4">

                {/* Physical (Top) */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 backdrop-blur-sm relative opacity-60 group-hover:opacity-80 transition-opacity">
                  <div className="text-zinc-500 font-bold text-[10px] mb-2 uppercase tracking-widest">
                    Physical
                  </div>
                  <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                    {t.landing.use_cases[physicalKey as keyof typeof t.landing.use_cases]}
                  </p>
                </div>

                {/* Divider */}
                <div className="flex items-center justify-center py-2">
                  <div className="w-px h-8 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
                </div>

                {/* Digital (Bottom) */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md relative flex-1">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-500/50 to-transparent" />
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <div className="text-emerald-400 font-bold text-[10px] uppercase tracking-widest">Digital</div>
                  </div>
                  <p className="text-zinc-200 text-sm leading-relaxed font-medium">
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
