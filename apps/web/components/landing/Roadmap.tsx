'use client';

import { Check, ShieldCheck, Smartphone } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const Roadmap = () => {
    const { t } = useLanguage();
    const icons = [Check, Smartphone, ShieldCheck];

    return (
        <section id="roadmap" className="border-y border-white/5 bg-zinc-950 py-24 text-white">
            <div className="container mx-auto px-4">
                <div className="mb-12 grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
                    <div>
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-near-green">
                            2026
                        </p>
                        <h2 className="text-3xl font-black text-white md:text-5xl">
                            {t.roadmap.title}
                        </h2>
                    </div>
                    <p className="text-lg leading-relaxed text-zinc-400">
                        {t.roadmap.subtitle}
                    </p>
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                    {t.roadmap.phases.map((phase, index) => {
                        const Icon = icons[index] ?? ShieldCheck;
                        const statusLabel = index === 0
                            ? t.roadmap.completed_label
                            : index === 1
                                ? t.roadmap.next_label
                                : t.roadmap.later_label;
                        const isCompleted = index === 0;

                        return (
                            <article
                                key={phase.year}
                                className={`rounded-lg border p-6 ${
                                    isCompleted
                                        ? 'border-near-green/35 bg-near-green/10'
                                        : 'border-white/10 bg-black'
                                }`}
                            >
                                <div className="mb-8 flex items-center justify-between gap-4">
                                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                                        isCompleted ? 'bg-near-green text-black' : 'bg-white/5 text-near-green'
                                    }`}>
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                                        isCompleted
                                            ? 'bg-near-green text-black'
                                            : 'border border-white/10 text-zinc-300'
                                    }`}>
                                        {statusLabel}
                                    </span>
                                </div>

                                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                                    {phase.year}
                                </p>
                                <h3 className={`mb-3 text-xl font-bold ${isCompleted ? 'text-near-green' : 'text-white'}`}>
                                    {phase.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-zinc-400">
                                    {phase.desc}
                                </p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
