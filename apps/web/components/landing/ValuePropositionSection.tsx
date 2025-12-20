import { memo } from 'react';
import { TrendingUp, Zap, Shield } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

export const ValuePropositionSection = memo(() => {
    const { t } = useLanguage();

    return (
        <section id="value-proposition" className="py-32 bg-black relative overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent" />



            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-5xl mx-auto">
                    {/* Main Value Prop */}
                    <div className="text-center mb-16">
                        <div className="inline-block mb-6">
                            <div className="text-8xl md:text-9xl font-black bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-500 bg-clip-text text-transparent animate-pulse mb-2">
                                {t.landing.value_proposition.title}
                            </div>
                            <div className="text-zinc-400 text-4xl md:text-5xl font-bold tracking-tight">
                                {t.landing.value_proposition.percentage}
                            </div>
                        </div>

                        <h2 className="text-6xl md:text-7xl font-black text-white mb-6">
                            {t.landing.value_proposition.subtitle}
                        </h2>

                        <p className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed">
                            {t.landing.value_proposition.description}
                        </p>
                    </div>

                    {/* Benefits Grid */}
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className={`p-8 rounded-2xl ${COLORS.background.card} border ${COLORS.border.default} hover:border-emerald-500/30 ${ANIMATION.transition.default} group`}>
                            <div className="w-14 h-14 mb-6 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                <Zap className="w-7 h-7 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t.landing.value_proposition.instant}</h3>
                            <p className="text-zinc-500">{t.landing.value_proposition.instant_desc}</p>
                        </div>

                        <div className={`p-8 rounded-2xl ${COLORS.background.card} border ${COLORS.border.default} hover:border-emerald-500/30 ${ANIMATION.transition.default} group`}>
                            <div className="w-14 h-14 mb-6 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                <Shield className="w-7 h-7 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t.landing.value_proposition.no_middlemen}</h3>
                            <p className="text-zinc-500">{t.landing.value_proposition.no_middlemen_desc}</p>
                        </div>

                        <div className={`p-8 rounded-2xl ${COLORS.background.card} border ${COLORS.border.default} hover:border-emerald-500/30 ${ANIMATION.transition.default} group`}>
                            <div className="w-14 h-14 mb-6 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                <TrendingUp className="w-7 h-7 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t.landing.value_proposition.full_control}</h3>
                            <p className="text-zinc-500">{t.landing.value_proposition.full_control_desc}</p>
                        </div>
                    </div>
                </div>
            </div>

        </section>
    );
});

ValuePropositionSection.displayName = 'ValuePropositionSection';
