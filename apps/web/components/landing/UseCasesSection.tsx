import { memo } from 'react';
import { Clapperboard, Film, Gift, Music, Sparkles } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const UseCasesSection = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.use_cases_section;

  const useCases = [
    { icon: Music, title: s.concert_title, text: s.concert_desc },
    { icon: Film, title: s.film_title, text: s.film_desc },
    { icon: Clapperboard, title: s.festival_title, text: s.festival_desc },
    { icon: Sparkles, title: s.behind_title, text: s.behind_desc },
    { icon: Gift, title: s.gift_title, text: s.gift_desc },
  ];

  return (
    <section id="use-cases" className="border-y border-white/5 bg-zinc-950 py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-near-green">
            {s.eyebrow}
          </p>
          <h2 className="mb-4 text-3xl font-black text-white md:text-5xl">
            {s.title}
          </h2>
          <p className="text-lg leading-relaxed text-zinc-400">
            {s.description}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {useCases.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-lg border border-white/10 bg-black p-5 transition-colors hover:border-near-green/40"
            >
              <Icon className="mb-5 h-7 w-7 text-near-green" />
              <h3 className="mb-3 text-lg font-bold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
});

UseCasesSection.displayName = 'UseCasesSection';
