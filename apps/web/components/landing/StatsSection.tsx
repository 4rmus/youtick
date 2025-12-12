import { memo } from 'react';
import { Users, Palette, DollarSign, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

const stats = [
  { icon: Users, labelKey: 'users', valueKey: 'users_value', color: 'text-blue-400' },
  { icon: Palette, labelKey: 'creators', valueKey: 'creators_value', color: 'text-purple-400' },
  { icon: DollarSign, labelKey: 'revenue', valueKey: 'revenue_value', color: 'text-emerald-400' },
  { icon: TrendingUp, labelKey: 'volume', valueKey: 'volume_value', color: 'text-orange-400' },
] as const;

export const StatsSection = memo(() => {
  const { t } = useLanguage();

  return (
    <section id="stats" className="py-20 bg-zinc-950 border-y border-white/5">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {stats.map(({ icon: Icon, labelKey, valueKey, color }) => (
            <div
              key={labelKey}
              className={`text-center p-6 rounded-2xl ${COLORS.background.card} border ${COLORS.border.default} hover:border-white/20 ${ANIMATION.transition.default} group`}
            >
              <div className={`w-14 h-14 mx-auto mb-4 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-white/10 ${ANIMATION.transition.colors}`}>
                <Icon className={`w-7 h-7 ${color}`} />
              </div>
              <div className={`text-4xl font-black mb-2 ${color}`}>
                {t.landing.stats[valueKey as keyof typeof t.landing.stats]}
              </div>
              <div className="text-sm text-zinc-400 font-medium">
                {t.landing.stats[labelKey as keyof typeof t.landing.stats]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

StatsSection.displayName = 'StatsSection';
