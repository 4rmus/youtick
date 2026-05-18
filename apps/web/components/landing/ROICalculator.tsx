'use client';

import { memo, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

export const ROICalculator = memo(() => {
  const { t } = useLanguage();
  const s = t.landing.roi_calculator_section;

  const presets = [
    { label: s.preset_short_film, price: 6, sales: 250 },
    { label: s.preset_concert, price: 12, sales: 800 },
    { label: s.preset_festival, price: 18, sales: 1200 },
    { label: s.preset_documentary, price: 10, sales: 600 },
  ];

  const [ticketPrice, setTicketPrice] = useState(12);
  const [ticketCount, setTicketCount] = useState(800);

  const calculations = useMemo(() => {
    const totalSales = ticketPrice * ticketCount;
    const platformFee = totalSales * 0.02;
    const youtickRevenue = totalSales * 0.98;

    return {
      totalSales,
      platformFee,
      youtickRevenue,
    };
  }, [ticketPrice, ticketCount]);

  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

  return (
    <section id="roi-calculator" className="bg-black py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 max-w-3xl">
          <div className="mb-4 flex items-center gap-3">
            <Calculator className="h-7 w-7 text-zinc-300" />
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {s.eyebrow}
            </p>
          </div>
          <h2 className="mb-4 text-3xl font-black text-white md:text-5xl">
            {s.title}
          </h2>
          <p className="text-lg leading-relaxed text-zinc-400">
            {s.description}
          </p>
        </div>

        <div className="mb-8 flex flex-wrap gap-3">
          {presets.map((preset) => {
            const isActive = ticketPrice === preset.price && ticketCount === preset.sales;

            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setTicketPrice(preset.price);
                  setTicketCount(preset.sales);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green ${
                  isActive
                    ? 'border-near-green/50 bg-near-green/10 text-near-green'
                    : 'border-white/10 bg-zinc-950 text-zinc-300 hover:border-white/40 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-white/10 bg-zinc-950 p-6 md:p-8">
            <div className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-zinc-400">{s.ticket_price}</label>
                <span className="text-2xl font-black text-white">${ticketPrice}</span>
              </div>
              <input
                type="range"
                aria-label={s.ticket_price}
                min={1}
                max={100}
                value={ticketPrice}
                onChange={(event) => setTicketPrice(Number(event.target.value))}
                className="landing-range h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
              />
              <div className="mt-1 flex justify-between text-xs text-zinc-600">
                <span>$1</span>
                <span>$100</span>
              </div>
            </div>

            <div className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-zinc-400">{s.estimated_sales}</label>
                <span className="text-2xl font-black text-white">{ticketCount.toLocaleString()}</span>
              </div>
              <input
                type="range"
                aria-label={s.estimated_sales}
                min={10}
                max={5000}
                step={10}
                value={ticketCount}
                onChange={(event) => setTicketCount(Number(event.target.value))}
                className="landing-range h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
              />
              <div className="mt-1 flex justify-between text-xs text-zinc-600">
                <span>10</span>
                <span>5,000</span>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-zinc-400">{s.total_sales}</span>
                <span className="text-xl font-bold text-white">{formatUsd(calculations.totalSales)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-zinc-950 p-6 md:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {s.youtick_revenue_label}
              </p>
              <div className="mt-3 text-5xl font-black text-white">
                {formatUsd(calculations.youtickRevenue)}
              </div>
              <p className="mt-2 text-sm text-zinc-400">{s.youtick_revenue_desc}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-white/10 bg-black/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{s.creator_share_label}</p>
                  <p className="mt-1 text-2xl font-black text-white">98%</p>
                </div>
                <div className="rounded-md border border-white/10 bg-black/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{s.platform_fee_label}</p>
                  <p className="mt-1 text-2xl font-black text-white">{formatUsd(calculations.platformFee)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">{s.publish_cost_note}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/60 p-5">
                <p className="mb-2 text-sm font-semibold text-zinc-300">{s.traditional_model}</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  {s.traditional_desc}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/60 p-5">
                <p className="mb-2 text-sm font-semibold text-zinc-300">{s.loss_avoided}</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  {s.loss_desc}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

ROICalculator.displayName = 'ROICalculator';
