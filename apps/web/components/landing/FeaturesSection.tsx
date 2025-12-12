import { memo } from 'react';
import { Lock, DollarSign, Zap, Shield, Clock, Globe } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

const features = [
  { icon: Lock, key: 'nft_gated' },
  { icon: DollarSign, key: 'revenue_share' },
  { icon: Zap, key: 'near_speed' },
  { icon: Shield, key: 'true_ownership' },
  { icon: Clock, key: 'instant_payment' },
  { icon: Globe, key: 'global_access' },
] as const;

export const FeaturesSection = memo(() => {
  const { t } = useLanguage();

  return (
    <section id="features" className="py-32 bg-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            <span className="text-white">{t.landing.features.title}</span>
          </h2>
          <p className="text-zinc-400 text-lg">
            {t.landing.features.subtitle}
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map(({ icon: Icon, key }) => (
            <div
              key={key}
              className={`${COLORS.background.card} border ${COLORS.border.default} p-8 rounded-2xl hover:border-white/20 ${ANIMATION.transition.default} group`}
            >
              <div className={`w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center mb-6 group-hover:bg-white/10 ${ANIMATION.transition.colors}`}>
                <Icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">
                {t.landing.features[`${key}_title` as keyof typeof t.landing.features]}
              </h3>
              <p className="text-zinc-500 leading-relaxed">
                {t.landing.features[`${key}_desc` as keyof typeof t.landing.features]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

FeaturesSection.displayName = 'FeaturesSection';
