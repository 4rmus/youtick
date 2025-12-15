import { memo } from 'react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS } from '@/lib/constants';

const steps = [
  { number: 1, key: 'step1' },
  { number: 2, key: 'step2' },
  { number: 3, key: 'step3' },
] as const;

export const HowItWorksSection = memo(() => {
  const { t } = useLanguage();

  return (
    <section id="how-it-works" className="py-32 bg-zinc-950 border-y border-white/5">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            {t.landing.how_it_works.title}
          </h2>
          <p className="text-zinc-400 text-lg">
            {t.landing.how_it_works.subtitle}
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
          {steps.map(({ number, key }) => (
            <div key={number} className="text-center">
              <div className="w-20 h-20 mx-auto bg-white text-black rounded-full flex items-center justify-center text-3xl font-black mb-6">
                {number}
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">
                {t.landing.how_it_works[`${key}_title` as keyof typeof t.landing.how_it_works]}
              </h3>
              <p className={COLORS.text.tertiary}>
                {t.landing.how_it_works[`${key}_desc` as keyof typeof t.landing.how_it_works]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

HowItWorksSection.displayName = 'HowItWorksSection';
