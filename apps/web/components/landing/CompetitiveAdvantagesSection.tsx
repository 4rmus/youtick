import { memo } from 'react';
import { Database, KeyRound, Lock, Server, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const CompetitiveAdvantagesSection = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.competitive_advantages_section;

  const trustItems = [
    { icon: Lock, title: s.ticket_title, text: s.ticket_desc },
    { icon: KeyRound, title: s.keys_title, text: s.keys_desc },
    { icon: Database, title: s.storage_title, text: s.storage_desc },
    { icon: Server, title: s.records_title, text: s.records_desc },
  ];

  const techLabels = [
    { key: 'near', label: s.near_label },
    { key: 'ipfs', label: s.ipfs_label },
    { key: 'lighthouse', label: s.lighthouse_label },
    { key: 'kms', label: s.kms_label },
  ];

  return (
    <section id="trust" className="border-y border-white/5 bg-zinc-950 py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {s.eyebrow}
            </p>
            <h2 className="text-3xl font-black text-white md:text-5xl">
              {s.title}
            </h2>
          </div>
          <p className="text-lg leading-relaxed text-zinc-400">
            {s.description}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-lg border border-white/10 bg-black p-6 transition-colors hover:border-white/30"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-white/5">
                <Icon className="h-5 w-5 text-zinc-200" />
              </div>
              <h3 className="mb-3 text-lg font-bold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{text}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm text-zinc-400">
          {techLabels.map(({ key, label }) => (
            <span
              key={key}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black px-4 py-2"
            >
              <ShieldCheck className="h-4 w-4 text-zinc-300" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
});

CompetitiveAdvantagesSection.displayName = 'CompetitiveAdvantagesSection';
