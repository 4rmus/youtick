import { memo } from 'react';
import { Check, Package, Palette, Zap, Coins, Globe } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

const advantages = [
    { icon: Package, titleKey: 'end_to_end', descKey: 'end_to_end_desc', color: 'text-purple-400' },
    { icon: Palette, titleKey: 'event_centric', descKey: 'event_centric_desc', color: 'text-pink-400' },
    { icon: Zap, titleKey: 'hybrid', descKey: 'hybrid_desc', color: 'text-blue-400' },
    { icon: Coins, titleKey: 'creator_first', descKey: 'creator_first_desc', color: 'text-emerald-400' },
    { icon: Globe, titleKey: 'near_ecosystem', descKey: 'near_ecosystem_desc', color: 'text-orange-400' },
] as const;

export const CompetitiveAdvantagesSection = memo(() => {
    const { t } = useLanguage();

    return (
        <section className="py-32 bg-black">
            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-black mb-6">
                        <span className="text-white">{t.landing.competitive_advantages.title}</span>
                    </h2>
                    <p className="text-zinc-400 text-lg">
                        {t.landing.competitive_advantages.subtitle}
                    </p>
                </div>

                {/* Advantages Grid */}
                <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
                    {advantages.map(({ icon: Icon, titleKey, descKey, color }) => (
                        <div
                            key={titleKey}
                            className={`p-8 rounded-2xl ${COLORS.background.card} border ${COLORS.border.default} hover:border-white/20 ${ANIMATION.transition.default} group`}
                        >
                            <div className={`w-14 h-14 mb-6 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-white/10 ${ANIMATION.transition.colors}`}>
                                <Icon className={`w-7 h-7 ${color}`} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                {t.landing.competitive_advantages[titleKey as keyof typeof t.landing.competitive_advantages]}
                            </h3>
                            <p className="text-zinc-500 leading-relaxed">
                                {t.landing.competitive_advantages[descKey as keyof typeof t.landing.competitive_advantages]}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Comparison Cards */}
                <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
                    <div className={`p-8 rounded-2xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20 ${ANIMATION.transition.default}`}>
                        <div className="flex items-start gap-3 mb-4">
                            <Check className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-1" />
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">
                                    {t.landing.competitive_advantages.comparison_web2}
                                </h3>
                                <p className="text-zinc-400">
                                    {t.landing.competitive_advantages.comparison_web2_desc}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className={`p-8 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 ${ANIMATION.transition.default}`}>
                        <div className="flex items-start gap-3 mb-4">
                            <Check className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-1" />
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">
                                    {t.landing.competitive_advantages.comparison_web3}
                                </h3>
                                <p className="text-zinc-400">
                                    {t.landing.competitive_advantages.comparison_web3_desc}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
});

CompetitiveAdvantagesSection.displayName = 'CompetitiveAdvantagesSection';
