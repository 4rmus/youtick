'use client';

import { memo } from 'react';
import { useLanguage } from '@/components/providers/LanguageContext';

/**
 * FinancialComparisonChart - Illustrative comparison of release economics.
 */
export const FinancialComparisonChart = memo(() => {
    const { t } = useLanguage();
    const fc = t.financial_chart;

    const platforms = [
        {
            name: 'YouTick',
            commission: 2,
            color: 'bg-near-green',
            description: `98% ${fc?.to_artist || 'creator share'}`,
            highlight: true,
        },
        {
            name: 'Ticketing stack',
            commission: 55,
            color: 'bg-near-red',
            description: fc?.platform_cut || 'Platform cut',
        },
        {
            name: 'Platform + partner stack',
            commission: 70,
            color: 'bg-orange-500',
            description: fc?.platform_label || 'Platform + Label',
        },
        {
            name: 'Ticketing layer',
            commission: 28,
            color: 'bg-yellow-500',
            description: fc?.ticket_commission || 'Ticket commission',
        },
        {
            name: 'License path',
            commission: 77,
            color: 'bg-red-600',
            description: fc?.license_model || 'License model',
        },
    ];

    const maxCommission = 100;
    const artistLabel = fc?.artist_label || 'Artist';

    return (
        <section id="commission-comparison" className="py-24 bg-black relative">
            <div className="container mx-auto px-4">
                {/* Header - Left aligned per NEAR guidelines */}
                <div className="max-w-3xl mb-16">
                    <h2 className="text-3xl md:text-4xl font-black text-white mb-4 text-left">
                        {fc?.title || 'Ticket Split Comparison'}
                    </h2>
                    <p className="text-lg text-zinc-400 text-left">
                        {fc?.subtitle || 'Illustrative release paths can reduce the creator share. YouTick keeps the paid-ticket split simple for film and music releases.'}
                    </p>
                </div>

                {/* Chart */}
                <div className="max-w-4xl mx-auto space-y-6">
                    {platforms.map((platform) => (
                        <div key={platform.name} className="group">
                            {/* Platform Name & Commission */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <span className={`text-lg font-bold ${platform.highlight ? 'text-near-green' : 'text-white'}`}>
                                        {platform.name}
                                    </span>
                                    {platform.highlight && (
                                        <span className="rounded-full bg-near-green/20 px-2 py-0.5 text-xs font-bold text-near-green">
                                            2%
                                        </span>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className={`text-2xl font-black ${platform.highlight ? 'text-near-green' : 'text-zinc-300'}`}>
                                        {platform.commission}%
                                    </span>
                                    <span className="text-xs text-zinc-500 ml-2">
                                        {fc?.commission || 'commission'}
                                    </span>
                                </div>
                            </div>

                            {/* Bar */}
                            <div className="h-10 bg-zinc-900 rounded-lg overflow-hidden relative">
                                <div
                                    className={`h-full ${platform.color} transition-all duration-700 ease-out rounded-lg`}
                                    style={{ width: `${(platform.commission / maxCommission) * 100}%` }}
                                />
                                {/* Remaining (artist share) indicator */}
                                <div
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-300"
                                >
                                    {platform.highlight
                                        ? `${artistLabel}: 98%`
                                        : `${artistLabel}: ${100 - platform.commission}%`
                                    }
                                </div>
                            </div>

                            {/* Description */}
                            <p className="text-xs text-zinc-600 mt-1 text-left">
                                {platform.description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Summary Card */}
                <div className="mt-16 max-w-2xl mx-auto rounded-lg border border-near-green/20 bg-near-green/5 p-8">
                    <div className="text-center">
                        <div className="text-6xl font-black text-near-green mb-4">
                            2%
                        </div>
                        <p className="text-lg text-zinc-300 mb-2">
                            {fc?.summary_title || 'A simple platform fee for direct releases'}
                        </p>
                        <p className="text-sm text-zinc-500">
                            {fc?.summary_subtitle || '2% platform fee, 98% paid-ticket creator share'}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
});

FinancialComparisonChart.displayName = 'FinancialComparisonChart';
