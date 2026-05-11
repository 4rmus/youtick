import { memo } from 'react';
import { CheckCircle2, Eye, Upload } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const AudienceSection = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.audience_section;

  const creatorBenefits = [
    s.creator_benefit_upload,
    s.creator_benefit_price,
    s.creator_benefit_share,
  ];

  const viewerBenefits = [
    s.viewer_benefit_clear,
    s.viewer_benefit_access,
    s.viewer_benefit_support,
  ];

  return (
    <section id="audience" className="bg-black py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {s.eyebrow}
          </p>
          <h2 className="mb-4 text-3xl font-black text-white md:text-5xl">
            {s.title}
          </h2>
          <p className="text-lg leading-relaxed text-zinc-400">
            {s.description}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-lg border border-white/10 bg-zinc-950 p-6 md:p-8">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-black">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">{s.creator_title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{s.creator_desc}</p>
              </div>
            </div>
            <ul className="space-y-4">
              {creatorBenefits.map((benefit) => (
                <li key={benefit} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border border-white/10 bg-black p-6 md:p-8">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white">
                <Eye className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">{s.viewer_title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{s.viewer_desc}</p>
              </div>
            </div>
            <ul className="space-y-4">
              {viewerBenefits.map((benefit) => (
                <li key={benefit} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
});

AudienceSection.displayName = 'AudienceSection';
