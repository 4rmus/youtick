import { memo } from 'react';
import { Ticket, Video, MessageCircle, Star, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { COLORS, ANIMATION } from '@/lib/constants';

export const DigitalSalonSection = memo(() => {
    const { t } = useLanguage();

    const comparisons = [
        { icon: Ticket, physical: t.landing.digital_salon.ticket_physical, digital: t.landing.digital_salon.ticket_digital, label: t.landing.digital_salon.ticket },
        { icon: Video, physical: t.landing.digital_salon.experience_physical, digital: t.landing.digital_salon.experience_digital, label: t.landing.digital_salon.experience },
        { icon: MessageCircle, physical: t.landing.digital_salon.social_physical, digital: t.landing.digital_salon.social_digital, label: t.landing.digital_salon.social },
        { icon: Star, physical: t.landing.digital_salon.memorabilia_physical, digital: t.landing.digital_salon.memorabilia_digital, label: t.landing.digital_salon.memorabilia },
    ];

    return (
        <section className="py-32 bg-zinc-950">
            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-black mb-6">
                        <span className="text-white">{t.landing.digital_salon.title}</span>
                    </h2>
                    <p className="text-zinc-400 text-lg">
                        {t.landing.digital_salon.subtitle}
                    </p>
                </div>

                {/* Comparison Grid */}
                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Header Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="hidden md:block" />
                        <div className="text-center">
                            <div className="text-zinc-500 font-bold text-lg">{t.landing.digital_salon.physical}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-white font-bold text-lg">{t.landing.digital_salon.digital}</div>
                        </div>
                    </div>

                    {/* Comparison Rows */}
                    {comparisons.map(({ icon: Icon, physical, digital, label }) => (
                        <div
                            key={label}
                            className={`grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-6 rounded-2xl ${COLORS.background.card} border ${COLORS.border.default} hover:border-white/20 ${ANIMATION.transition.default}`}
                        >
                            {/* Label */}
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
                                    <Icon className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-white font-bold text-lg">{label}</span>
                            </div>

                            {/* Physical */}
                            <div className="text-zinc-500 text-sm md:text-base text-center md:text-left">
                                {physical}
                            </div>

                            {/* Digital */}
                            <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm md:text-base">
                                <ArrowRight className="w-5 h-5 flex-shrink-0 hidden md:block" />
                                <span>{digital}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
});

DigitalSalonSection.displayName = 'DigitalSalonSection';
