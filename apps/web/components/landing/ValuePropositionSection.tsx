import { memo } from 'react';
import { KeyRound, ShieldCheck, Ticket, WalletCards } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const ValuePropositionSection = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.value_proposition_section;

  const promises = [
    { icon: WalletCards, title: s.revenue_title, text: s.revenue_text, note: s.revenue_note },
    { icon: Ticket, title: s.control_title, text: s.control_text, note: s.control_note },
    { icon: ShieldCheck, title: s.trust_title, text: s.trust_text, note: s.trust_note },
    { icon: KeyRound, title: s.viewer_title, text: s.viewer_text, note: s.viewer_note },
  ];

  return (
    <section id="model" className="border-y border-white/5 bg-zinc-950 py-24">
      <div className="container mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-near-green">
              {s.eyebrow}
            </p>
            <h2 className="mb-5 text-3xl font-black text-white md:text-5xl">
              {s.title}
            </h2>
            <p className="text-lg leading-relaxed text-zinc-400">
              {s.description}
            </p>
            <div className="mt-8 rounded-lg border border-white/10 bg-black p-5">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-1 h-5 w-5 text-near-green" />
                <p className="text-sm leading-relaxed text-zinc-400">
                  {s.tech_note}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {promises.map(({ icon: Icon, title, text, note }) => (
              <article
                key={title}
                className="rounded-lg border border-white/10 bg-black p-6"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-near-green/10">
                    <Icon className="h-5 w-5 text-near-green" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{title}</h3>
                </div>
                <p className="text-lg font-semibold text-zinc-100">{text}</p>
                <p className="mt-2 text-sm text-zinc-500">{note}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

ValuePropositionSection.displayName = 'ValuePropositionSection';
