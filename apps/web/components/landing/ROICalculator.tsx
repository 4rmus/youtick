'use client';

import { memo, useState, useMemo } from 'react';
import { Calculator, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

/**
 * ROICalculator - Interactive calculator showing artist earnings comparison.
 * All calculations in USD.
 */
export const ROICalculator = memo(() => {
    const { t } = useLanguage();

    const [ticketPrice, setTicketPrice] = useState(5); // USD
    const [ticketCount, setTicketCount] = useState(500);

    const calculations = useMemo(() => {
        const grossSales = ticketPrice * ticketCount;

        // YouTick: 98% to artist
        const youtickRevenue = grossSales * 0.98;
        const youtickFee = grossSales * 0.02;

        // YouTube (ad model): ~$1-2 per 1000 views
        const youtubeRevenue = (ticketCount / 1000) * 1.5;

        // Vimeo OTT: 90% to artist
        const vimeoRevenue = grossSales * 0.90;

        // Spotify equivalent: $0.004 per stream
        const spotifyRevenue = ticketCount * 0.004;

        return {
            grossSales,
            youtickRevenue,
            youtickFee,
            youtubeRevenue,
            vimeoRevenue,
            spotifyRevenue,
        };
    }, [ticketPrice, ticketCount]);

    const formatUsd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

    return (
        <section id="roi-calculator" className="py-32 bg-black relative overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute bottom-0 right-1/4 w-[700px] h-[700px] rounded-full animate-glow-pulse"
                    style={{
                        background: 'radial-gradient(circle, rgba(0, 236, 151, 0.1) 0%, transparent 70%)',
                    }}
                />
            </div>

            <div className="container mx-auto px-4 relative z-10">
                {/* Header - Left aligned */}
                <div className="max-w-3xl mb-16">
                    <div className="flex items-center gap-3 mb-4">
                        <Calculator className="w-8 h-8 text-near-green" />
                        <h2 className="text-3xl md:text-4xl font-black text-white text-left">
                            {t.landing.roi_calculator?.title || 'Calculate Your Earnings'}
                        </h2>
                    </div>
                    <p className="text-lg text-zinc-400 text-left">
                        {t.landing.roi_calculator?.subtitle || "See how much you'll earn on YouTick."}
                    </p>
                </div>

                <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
                    {/* Input Panel */}
                    <div className="p-8 rounded-2xl bg-zinc-900/50 border border-white/10">
                        <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
                            📊 {t.landing.roi_calculator?.event_details || 'Event Details'}
                        </h3>

                        {/* Ticket Price Slider */}
                        <div className="mb-8">
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-sm font-medium text-zinc-400">
                                    {t.landing.roi_calculator?.ticket_price || 'Ticket Price'}
                                </label>
                                <span className="text-2xl font-bold text-near-green">
                                    ${ticketPrice}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={100}
                                value={ticketPrice}
                                onChange={(e) => setTicketPrice(Number(e.target.value))}
                                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-near-green"
                            />
                            <div className="flex justify-between text-xs text-zinc-600 mt-1">
                                <span>$1</span>
                                <span>$100</span>
                            </div>
                        </div>

                        {/* Ticket Count Slider */}
                        <div className="mb-8">
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-sm font-medium text-zinc-400">
                                    {t.landing.roi_calculator?.sales_count || 'Sales Count'}
                                </label>
                                <span className="text-2xl font-bold text-near-purple">
                                    {ticketCount.toLocaleString()}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={5000}
                                step={10}
                                value={ticketCount}
                                onChange={(e) => setTicketCount(Number(e.target.value))}
                                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-near-purple"
                            />
                            <div className="flex justify-between text-xs text-zinc-600 mt-1">
                                <span>10</span>
                                <span>5,000</span>
                            </div>
                        </div>

                        {/* Gross Sales */}
                        <div className="p-4 rounded-xl bg-zinc-800/50 border border-white/5">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-zinc-400">
                                    {t.landing.roi_calculator?.gross_sales || 'Gross Sales'}
                                </span>
                                <span className="text-xl font-bold text-white">
                                    {formatUsd(calculations.grossSales)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Results Panel */}
                    <div className="p-8 rounded-2xl bg-near-green/5 border border-near-green/20">
                        <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
                            💰 {t.landing.roi_calculator?.estimated_earnings || 'Your Estimated Earnings'}
                        </h3>

                        {/* YouTick Result - Highlighted */}
                        <div className="p-6 rounded-xl bg-near-green/10 border border-near-green/30 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-lg font-bold text-near-green">YouTick</span>
                                <span className="px-2 py-1 text-xs font-bold bg-near-green/20 text-near-green rounded-full">
                                    ⭐ {t.landing.roi_calculator?.best || 'BEST'}
                                </span>
                            </div>
                            <div className="text-4xl font-black text-near-green mb-2">
                                {formatUsd(calculations.youtickRevenue)}
                            </div>
                            <div className="mt-4 pt-4 border-t border-near-green/20 text-xs text-zinc-500">
                                {t.landing.roi_calculator?.platform_fee || 'Platform Fee:'} {formatUsd(calculations.youtickFee)} (2%)
                            </div>
                        </div>

                        {/* Comparison with other platforms */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/30">
                                <span className="text-sm text-zinc-400">Vimeo OTT</span>
                                <div className="text-right">
                                    <span className="text-lg font-bold text-zinc-300">{formatUsd(calculations.vimeoRevenue)}</span>
                                    <div className="text-xs text-near-green">
                                        +{formatUsd(calculations.youtickRevenue - calculations.vimeoRevenue)} {t.landing.roi_calculator?.more || 'more'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/30">
                                <span className="text-sm text-zinc-400">YouTube</span>
                                <div className="text-right">
                                    <span className="text-lg font-bold text-zinc-300">{formatUsd(calculations.youtubeRevenue)}</span>
                                    <div className="text-xs text-near-green flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" />
                                        {Math.round(calculations.youtickRevenue / Math.max(calculations.youtubeRevenue, 1))}x {t.landing.roi_calculator?.more || 'more'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/30">
                                <span className="text-sm text-zinc-400">Spotify</span>
                                <div className="text-right">
                                    <span className="text-lg font-bold text-zinc-300">{formatUsd(calculations.spotifyRevenue)}</span>
                                    <div className="text-xs text-near-green flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" />
                                        {Math.round(calculations.youtickRevenue / Math.max(calculations.spotifyRevenue, 1))}x {t.landing.roi_calculator?.more || 'more'}
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

ROICalculator.displayName = 'ROICalculator';
