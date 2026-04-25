import { memo } from 'react';
import Image from 'next/image';
import { BadgeDollarSign, Eye, Ticket, Upload } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const HowItWorksSection = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.how_it_works_section;

  const steps = [
    { number: '1', title: s.step1_title, text: s.step1_desc },
    { number: '2', title: s.step2_title, text: s.step2_desc },
    { number: '3', title: s.step3_title, text: s.step3_desc },
  ];

  const previewItems = [
    { icon: Upload, label: s.preview_upload },
    { icon: BadgeDollarSign, label: s.preview_ticket },
    { icon: Ticket, label: s.preview_discovery },
    { icon: Eye, label: s.preview_watch },
  ];

  return (
    <section id="how-it-works" className="bg-black py-24">
      <div className="container mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-near-green">
              {s.eyebrow}
            </p>
            <h2 className="mb-5 text-3xl font-black text-white md:text-5xl">
              {s.title}
            </h2>
            <p className="mb-10 text-lg leading-relaxed text-zinc-400">
              {s.description}
            </p>

            <div className="space-y-4">
              {steps.map((step) => (
                <article
                  key={step.number}
                  className="flex gap-4 rounded-lg border border-white/10 bg-zinc-950 p-5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-black">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold text-white">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-zinc-400">{step.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950">
            <div className="relative aspect-[16/10]">
              <Image
                src="/concert_crowd.png"
                alt="Audience at a live show"
                fill
                className="object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/5" />
              <div className="absolute left-5 right-5 top-5 flex flex-wrap gap-2">
                {previewItems.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-2 text-xs font-semibold text-zinc-200 backdrop-blur"
                  >
                    <Icon className="h-3.5 w-3.5 text-near-green" />
                    {label}
                  </div>
                ))}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="rounded-lg border border-white/10 bg-black/80 p-5 backdrop-blur">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-near-green">
                        {s.preview_studio_label}
                      </p>
                      <h3 className="mt-1 text-2xl font-black text-white">{s.preview_work_title}</h3>
                    </div>
                    <div className="rounded-full bg-near-green px-3 py-1 text-sm font-black text-black">
                      $12
                    </div>
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-md bg-white/5 p-3">
                      <p className="text-zinc-500">{s.preview_sales}</p>
                      <p className="font-bold text-white">842</p>
                    </div>
                    <div className="rounded-md bg-white/5 p-3">
                      <p className="text-zinc-500">{s.preview_share}</p>
                      <p className="font-bold text-near-green">98%</p>
                    </div>
                    <div className="rounded-md bg-white/5 p-3">
                      <p className="text-zinc-500">{s.preview_access}</p>
                      <p className="font-bold text-white">{s.preview_access_value}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

HowItWorksSection.displayName = 'HowItWorksSection';
