import { memo } from 'react';
import { TrendingUp, Zap, Shield } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

export const ValuePropositionSection = memo(() => {
    const { t } = useLanguage();

    return (
        <section id="value-proposition" className="py-32 bg-black relative overflow-hidden">
            {/* Background gradient orb */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full animate-glow-pulse"
                    style={{
                        background: 'radial-gradient(circle, rgba(255, 0, 110, 0.15) 0%, rgba(131, 56, 236, 0.1) 40%, transparent 70%)',
                    }}
                />
            </div>

            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-5xl mx-auto">
                    {/* Main Value Prop */}
                    <div className="text-center mb-16">
                        <div className="inline-block mb-6">
                            <div className="text-zinc-300 text-4xl md:text-5xl font-bold tracking-tight mb-2">
                                {t.landing.value_proposition.percentage}
                            </div>
                            <div className="text-8xl md:text-9xl font-black text-gradient-concert animate-gradient-flow" style={{ backgroundSize: '200% 200%' }}>
                                {t.landing.value_proposition.title}
                            </div>
                        </div>

                        <h2 className="text-6xl md:text-7xl font-black text-white mb-6">
                            {t.landing.value_proposition.subtitle}
                        </h2>

                        <p className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed">
                            {t.landing.value_proposition.description}
                        </p>
                    </div>

                    {/* Benefits Grid - Concert Colors */}
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="p-8 rounded-2xl glass-card hover:scale-[1.02] transition-all duration-300 group">
                            <div className="w-14 h-14 mb-6 bg-[var(--near-green)]/10 rounded-xl flex items-center justify-center group-hover:bg-[var(--near-green)]/20 transition-colors">
                                <Zap className="w-7 h-7 text-[var(--near-green)]" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t.landing.value_proposition.instant}</h3>
                            <p className="text-zinc-500">{t.landing.value_proposition.instant_desc}</p>
                        </div>

                        <div className="p-8 rounded-2xl glass-card hover:scale-[1.02] transition-all duration-300 group">
                            <div className="w-14 h-14 mb-6 bg-[var(--near-purple)]/10 rounded-xl flex items-center justify-center group-hover:bg-[var(--near-purple)]/20 transition-colors">
                                <Shield className="w-7 h-7 text-[var(--near-purple)]" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t.landing.value_proposition.no_middlemen}</h3>
                            <p className="text-zinc-500">{t.landing.value_proposition.no_middlemen_desc}</p>
                        </div>

                        <div className="p-8 rounded-2xl glass-card hover:scale-[1.02] transition-all duration-300 group">
                            <div className="w-14 h-14 mb-6 bg-[var(--near-blue)]/10 rounded-xl flex items-center justify-center group-hover:bg-[var(--near-blue)]/20 transition-colors">
                                <TrendingUp className="w-7 h-7 text-[var(--near-blue)]" />
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

