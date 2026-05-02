import { memo } from 'react';
import { CalendarDays, Film, Music, Ticket } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const AudienceSection = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.audience_section;

  const audienceCards = [
    { icon: Music, title: s.musicians_title, text: s.musicians_desc },
    { icon: Film, title: s.directors_title, text: s.directors_desc },
    { icon: CalendarDays, title: s.event_teams_title, text: s.event_teams_desc },
    { icon: Ticket, title: s.viewers_title, text: s.viewers_desc },
  ];

  return (
    <section id="audience" className="bg-black py-24">
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

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {audienceCards.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-lg border border-white/10 bg-zinc-950 p-6 transition-colors hover:border-near-green/40"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-near-green/10">
                <Icon className="h-6 w-6 text-near-green" />
              </div>
              <h3 className="mb-3 text-xl font-bold text-white">{title}</h3>
              <p className="leading-relaxed text-zinc-400">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
});

AudienceSection.displayName = 'AudienceSection';
