import { memo } from 'react';
import { Check, X } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

const comparisonRows = [
  { key: 'fake_risk', traditional: false, youtick: true },
  { key: 'transparent_pricing', traditional: false, youtick: true },
  { key: 'instant_transfer', traditional: false, youtick: true },
  { key: 'secondary_control', traditional: false, youtick: true },
  { key: 'low_commission', traditional: '%10-20', youtick: '%0-3' },
  { key: 'global_access', traditional: false, youtick: true },
  { key: 'proof_of_ownership', traditional: 'PDF/QR', youtick: 'NFT' },
] as const;

export const ComparisonSection = memo(() => {
  const { t } = useLanguage();

  return (
    <section id="comparison" className="py-32 bg-zinc-950">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            {t.landing.comparison.title.split(' vs ')[0]} vs <span className="text-white">{t.landing.comparison.title.split(' vs ')[1]}</span>
          </h2>
          <p className="text-zinc-400 text-lg">
            {t.landing.comparison.subtitle}
          </p>
        </div>

        {/* Comparison Table */}
        <div className="max-w-4xl mx-auto">
          <div className={`bg-black border ${COLORS.border.default} rounded-2xl overflow-hidden`}>
            {/* Header Row */}
            <div className="grid grid-cols-3 bg-zinc-900/50 p-6">
              <div className="text-zinc-400 font-medium">{t.landing.comparison.feature}</div>
              <div className="text-center text-zinc-400 font-medium">{t.landing.comparison.traditional}</div>
              <div className="text-center text-white font-bold">{t.landing.comparison.youtick}</div>
            </div>

            {/* Data Rows */}
            <div className="divide-y divide-white/5">
              {comparisonRows.map(({ key, traditional, youtick }) => (
                <div
                  key={key}
                  className={`grid grid-cols-3 p-6 items-center hover:bg-white/[0.02] ${ANIMATION.transition.colors}`}
                >
                  <div className="text-white">
                    {t.landing.comparison[key as keyof typeof t.landing.comparison]}
                  </div>
                  <div className="flex justify-center">
                    {typeof traditional === 'boolean' ? (
                      traditional ? (
                        <Check className="w-6 h-6 text-green-500" />
                      ) : (
                        <X className="w-6 h-6 text-red-500" />
                      )
                    ) : (
                      <span className="text-zinc-500">{traditional}</span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {typeof youtick === 'boolean' ? (
                      youtick ? (
                        <Check className="w-6 h-6 text-green-500" />
                      ) : (
                        <X className="w-6 h-6 text-red-500" />
                      )
                    ) : (
                      <span className="text-green-500 font-bold">{youtick}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

ComparisonSection.displayName = 'ComparisonSection';
