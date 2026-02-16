import { memo } from 'react';
import { Ticket, Video, MessageCircle, Star, Sparkles } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const DigitalSalonSection = memo(() => {
    const { t } = useLanguage();

    const features = [
        { key: 'ticket', icon: Ticket, color: 'text-blue-400' },
        { key: 'experience', icon: Video, color: 'text-purple-400' },
        { key: 'social', icon: MessageCircle, color: 'text-pink-400' },
        { key: 'memorabilia', icon: Star, color: 'text-yellow-400' },
    ];

    return (
        <section id="digital-salon" className="py-32 bg-black relative">


            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-black mb-6 text-white">
                        {t.landing.digital_salon.title}
                    </h2>
                    <p className="text-zinc-400 text-lg">
                        {t.landing.digital_salon.subtitle}
                    </p>
                </div>

                {/* Comparison Table */}
                <div className="max-w-5xl mx-auto rounded-3xl border border-white/10 overflow-hidden backdrop-blur-sm bg-white/5">
                    <div className="grid grid-cols-3 border-b border-white/10 bg-white/5">
                        <div className="p-6 text-zinc-500 font-bold uppercase tracking-wider text-sm"></div>
                        <div className="p-6 text-zinc-400 font-bold text-center border-l border-white/10 text-lg">{t.landing.digital_salon.physical}</div>
                        <div className="p-6 text-emerald-400 font-bold text-center border-l border-emerald-500/20 bg-emerald-500/5 text-lg flex items-center justify-center gap-2">
                            <Sparkles className="w-5 h-5" />
                            {t.landing.digital_salon.digital}
                        </div>
                    </div>

                    <div className="divide-y divide-white/10">
                        {features.map((item) => (
                            <div key={item.key} className="grid grid-cols-3 group hover:bg-white/5 transition-colors">
                                <div className="p-6 flex items-center gap-4 text-white font-medium">
                                    <div className={`p-3 rounded-lg bg-white/5 ${item.color.replace('text-', 'bg-')}/10`}>
                                        <item.icon className={`w-6 h-6 ${item.color}`} />
                                    </div>
                                    {t.landing.digital_salon[item.key as keyof typeof t.landing.digital_salon]}
                                </div>
                                <div className="p-6 flex items-center justify-center text-zinc-400 text-center border-l border-white/10">
                                    {t.landing.digital_salon[`${item.key}_physical` as keyof typeof t.landing.digital_salon]}
                                </div>
                                <div className="p-6 flex items-center justify-center text-white font-semibold text-center border-l border-emerald-500/20 bg-emerald-500/5 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]">
                                    {t.landing.digital_salon[`${item.key}_digital` as keyof typeof t.landing.digital_salon]}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </section>
    );
});

DigitalSalonSection.displayName = 'DigitalSalonSection';
