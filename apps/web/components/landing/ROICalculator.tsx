'use client';

import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import type { LandingCopy, LandingLocale } from './landing-copy';
import { calculateTicketSplit, formatMicroUsdc } from './roi';

type Props = {
    locale: LandingLocale;
    copy: LandingCopy['roi'];
};

export function ROICalculator({ locale, copy }: Props) {
    const [ticketPrice, setTicketPrice] = useState(12);
    const [ticketCount, setTicketCount] = useState(800);
    const split = useMemo(
        () => calculateTicketSplit(String(ticketPrice), BigInt(ticketCount)),
        [ticketCount, ticketPrice],
    );
    const numberLocale = locale === 'tr' ? 'tr-TR' : 'en-US';

    return (
        <section id="roi-calculator" className="bg-black py-24">
            <div className="container mx-auto px-4">
                <div className="mb-12 max-w-3xl">
                    <div className="mb-4 flex items-center gap-3">
                        <Calculator aria-hidden="true" className="h-7 w-7 text-zinc-300" />
                        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.eyebrow}</p>
                    </div>
                    <h2 className="mb-4 text-3xl font-black text-white md:text-5xl">{copy.title}</h2>
                    <p className="text-lg leading-relaxed text-zinc-400">{copy.description}</p>
                </div>

                <div className="mb-8 flex flex-wrap gap-3">
                    {copy.presets.map((preset) => {
                        const active = ticketPrice === Number(preset.price) && ticketCount === preset.sales;
                        return (
                            <button
                                key={preset.label}
                                type="button"
                                aria-pressed={active}
                                onClick={() => {
                                    setTicketPrice(Number(preset.price));
                                    setTicketCount(preset.sales);
                                }}
                                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green ${active ? 'border-near-green/50 bg-near-green/10 text-near-green' : 'border-white/10 bg-zinc-950 text-zinc-300 hover:border-white/40 hover:text-white'}`}
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
                                <label htmlFor="ticket-price" className="text-sm font-medium text-zinc-400">{copy.ticketPrice}</label>
                                <span className="text-2xl font-black text-white">{ticketPrice} USDC</span>
                            </div>
                            <input
                                id="ticket-price"
                                type="range"
                                min={2}
                                max={100}
                                value={ticketPrice}
                                aria-valuetext={`${ticketPrice} USDC`}
                                onChange={(event) => setTicketPrice(Number(event.target.value))}
                                className="landing-range h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                            />
                            <div className="mt-1 flex justify-between text-xs text-zinc-600"><span>2 USDC</span><span>100 USDC</span></div>
                        </div>

                        <div className="mb-8">
                            <div className="mb-3 flex items-center justify-between gap-4">
                                <label htmlFor="ticket-count" className="text-sm font-medium text-zinc-400">{copy.estimatedSales}</label>
                                <span className="text-2xl font-black text-white">{ticketCount.toLocaleString(numberLocale)}</span>
                            </div>
                            <input
                                id="ticket-count"
                                type="range"
                                min={10}
                                max={5000}
                                step={10}
                                value={ticketCount}
                                aria-valuetext={ticketCount.toLocaleString(numberLocale)}
                                onChange={(event) => setTicketCount(Number(event.target.value))}
                                className="landing-range h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                            />
                            <div className="mt-1 flex justify-between text-xs text-zinc-600"><span>10</span><span>{(5000).toLocaleString(numberLocale)}</span></div>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-black p-4">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-zinc-400">{copy.totalSales}</span>
                                <span className="text-xl font-bold text-white">{formatMicroUsdc(split.grossMicroUsdc, locale)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-zinc-950 p-6 md:p-8">
                        <div className="mb-6">
                            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{copy.creatorShare}</p>
                            <p className="mt-3 text-5xl font-black text-white">{formatMicroUsdc(split.creatorMicroUsdc, locale)}</p>
                            <p className="mt-2 text-sm text-zinc-400">{copy.creatorShareDescription}</p>

                            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-md border border-white/10 bg-black/50 p-4">
                                    <dt className="text-xs uppercase tracking-wide text-zinc-500">{locale === 'tr' ? 'Üretici payı' : 'Creator share'}</dt>
                                    <dd className="mt-1 text-2xl font-black text-white">98%</dd>
                                </div>
                                <div className="rounded-md border border-white/10 bg-black/50 p-4">
                                    <dt className="text-xs uppercase tracking-wide text-zinc-500">{copy.platformFee}</dt>
                                    <dd className="mt-1 text-2xl font-black text-white">{formatMicroUsdc(split.platformMicroUsdc, locale)}</dd>
                                </div>
                            </dl>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border border-white/10 bg-black/60 p-5">
                                <p className="mb-2 text-sm font-semibold text-zinc-300">{copy.uploadFeeTitle}</p>
                                <p className="text-xs leading-relaxed text-zinc-500">{copy.uploadFeeDescription}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/60 p-5">
                                <p className="mb-2 text-sm font-semibold text-zinc-300">{locale === 'tr' ? 'Yalnızca tahmin' : 'Estimate only'}</p>
                                <p className="text-xs leading-relaxed text-zinc-500">{copy.estimateNote}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
