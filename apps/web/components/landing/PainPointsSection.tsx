'use client';

import { memo } from 'react';
import { DollarSign, ShieldOff, Users, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

/**
 * PainPointsSection - Highlights artist pain points in Web2 vs YouTick solutions.
 * Based on PRODUCT_ANALYSIS_REPORT.md "Acı Noktaları" section.
 */
export const PainPointsSection = memo(() => {
    const { t } = useLanguage();

    const painPoints = [
        {
            icon: DollarSign,
            titleKey: 'revenue_title',
            web2Key: 'revenue_web2',
            youtickKey: 'revenue_youtick',
            iconColor: 'text-near-red',
            bgColor: 'bg-near-red/10',
            borderColor: 'border-near-red/20',
        },
        {
            icon: ShieldOff,
            titleKey: 'censorship_title',
            web2Key: 'censorship_web2',
            youtickKey: 'censorship_youtick',
            iconColor: 'text-near-purple',
            bgColor: 'bg-near-purple/10',
            borderColor: 'border-near-purple/20',
        },
        {
            icon: Users,
            titleKey: 'fan_title',
            web2Key: 'fan_web2',
            youtickKey: 'fan_youtick',
            iconColor: 'text-near-blue',
            bgColor: 'bg-near-blue/10',
            borderColor: 'border-near-blue/20',
        },
    ];

    return (
        <section id="pain-points" className="py-32 bg-black relative overflow-hidden">
            {/* Background subtle gradient */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full animate-glow-pulse"
                    style={{
                        background: 'radial-gradient(circle, rgba(255, 121, 102, 0.1) 0%, transparent 70%)',
                    }}
                />
            </div>

            <div className="container mx-auto px-4 relative z-10">
                <div className="text-center mb-20">
                    <div className="text-zinc-300 text-xl md:text-2xl font-semibold mb-2">
                        {t.landing.pain_points?.header_eyebrow || 'of every ticket sale'}
                    </div>
                    <div
                        className="text-7xl md:text-9xl font-black text-gradient-concert animate-gradient-flow mb-4"
                        style={{ backgroundSize: '200% 200%' }}
                    >
                        %98
                    </div>
                    <h2 className="text-4xl md:text-6xl font-black text-white mb-6">
                        {t.landing.pain_points?.title || 'Goes to You, Not the Middleman'}
                    </h2>
                    <p className="text-lg text-zinc-400 max-w-3xl mx-auto leading-relaxed">
                        {t.landing.pain_points?.subtitle || 'Traditional platforms take almost half. Here is exactly how.'}
                    </p>
                </div>

                {/* Pain Points Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                    {painPoints.map(({ icon: Icon, titleKey, web2Key, youtickKey, iconColor, bgColor, borderColor }) => (
                        <div
                            key={titleKey}
                            className={`p-8 rounded-xl bg-zinc-900/50 border ${borderColor} hover:border-white/20 transition-all duration-300 group`}
                        >
                            {/* Icon */}
                            <div className={`w-16 h-16 mb-6 ${bgColor} rounded-xl flex items-center justify-center`}>
                                <Icon className={`w-8 h-8 ${iconColor}`} />
                            </div>

                            {/* Title */}
                            <h3 className="text-2xl font-bold text-white mb-6 text-left">
                                {t.landing.pain_points?.[titleKey as keyof typeof t.landing.pain_points] || titleKey}
                            </h3>

                            {/* Web2 Problem */}
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-sm font-semibold text-near-red uppercase tracking-wider">Web2</span>
                                </div>
                                <p className="text-base text-zinc-400 leading-relaxed text-left">
                                    {t.landing.pain_points?.[web2Key as keyof typeof t.landing.pain_points] || web2Key}
                                </p>
                            </div>

                            {/* Arrow */}
                            <div className="flex justify-center my-4">
                                <ArrowRight className="w-5 h-5 text-near-green rotate-90" />
                            </div>

                            {/* YouTick Solution */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-sm font-semibold text-near-green uppercase tracking-wider">YouTick</span>
                                </div>
                                <p className="text-base text-zinc-200 leading-relaxed text-left font-medium">
                                    {t.landing.pain_points?.[youtickKey as keyof typeof t.landing.pain_points] || youtickKey}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
});

PainPointsSection.displayName = 'PainPointsSection';
