import { memo } from 'react';
import { Mail, Gift, TestTube, GraduationCap } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

const features = [
    { icon: Mail, titleKey: 'fast_auth', descKey: 'fast_auth_desc', color: 'text-blue-400' },
    { icon: Gift, titleKey: 'gift_links', descKey: 'gift_links_desc', color: 'text-pink-400' },
    { icon: TestTube, titleKey: 'trial_accounts', descKey: 'trial_accounts_desc', color: 'text-purple-400' },
    { icon: GraduationCap, titleKey: 'progressive', descKey: 'progressive_desc', color: 'text-emerald-400' },
] as const;

export const Web3BridgeSection = memo(() => {
    const { t } = useLanguage();

    return (
        <section className="py-32 bg-zinc-950">
            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-black mb-6">
                        <span className="bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
                            {t.landing.web3_bridge.title}
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg">
                        {t.landing.web3_bridge.subtitle}
                    </p>
                </div>

                {/* Features Grid */}
                <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
                    {features.map(({ icon: Icon, titleKey, descKey, color }, index) => (
                        <div
                            key={titleKey}
                            className={`p-8 rounded-2xl ${COLORS.background.card} border ${COLORS.border.default} hover:border-white/20 ${ANIMATION.transition.default} group relative overflow-hidden`}
                        >
                            {/* Step number */}
                            <div className="absolute top-4 right-4 text-6xl font-black text-white/5">
                                {index + 1}
                            </div>

                            <div className={`w-14 h-14 mb-6 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-white/10 ${ANIMATION.transition.colors} relative z-10`}>
                                <Icon className={`w-7 h-7 ${color}`} />
                            </div>

                            <h3 className="text-xl font-bold text-white mb-3 relative z-10">
                                {t.landing.web3_bridge[titleKey as keyof typeof t.landing.web3_bridge]}
                            </h3>

                            <p className="text-zinc-500 leading-relaxed relative z-10">
                                {t.landing.web3_bridge[descKey as keyof typeof t.landing.web3_bridge]}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Call-out */}
                <div className="max-w-3xl mx-auto mt-16 p-8 rounded-2xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-center">
                    <p className="text-white text-xl font-bold">
                        Start with email login → Discover Web3 power gradually
                    </p>
                </div>
            </div>
        </section>
    );
});

Web3BridgeSection.displayName = 'Web3BridgeSection';
