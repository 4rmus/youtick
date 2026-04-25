'use client';

import { memo } from 'react';
import { Archive, Clock, DollarSign, Users } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const PainPointsSection = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.pain_points_section;

  const painPoints = [
    { icon: DollarSign, title: s.money_title, text: s.money_desc },
    { icon: Clock, title: s.slow_title, text: s.slow_desc },
    { icon: Users, title: s.audience_title, text: s.audience_desc },
    { icon: Archive, title: s.archive_title, text: s.archive_desc },
  ];

  return (
    <section id="pain-points" className="bg-black py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {s.eyebrow}
          </p>
          <h2 className="mb-4 text-3xl font-black text-white md:text-5xl">
            {s.title}
          </h2>
          <p className="text-lg leading-relaxed text-zinc-400">
            {s.description}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {painPoints.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-lg border border-white/10 bg-zinc-950 p-6"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-red-500/10">
                <Icon className="h-5 w-5 text-red-300" />
              </div>
              <h3 className="mb-3 text-lg font-bold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
});

PainPointsSection.displayName = 'PainPointsSection';
