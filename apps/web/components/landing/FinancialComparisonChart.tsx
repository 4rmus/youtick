'use client';

import { memo } from 'react';
import { useLanguage } from '@/components/providers/LanguageContext';

/**
 * FinancialComparisonChart - Bar chart comparing platform commission rates.
 * Based on VISUAL_ASSETS_MASTER_PROMPT.md specifications.
 */
export const FinancialComparisonChart = memo(() => {
    const { language } = useLanguage();

    const platforms = [
        {
            name: 'YouTick',
            commission: 2,
            color: 'bg-near-green',
            description: language === 'tr' ? 'Sanatçıya %98' : '98% to artist',
            highlight: true,
        },
        {
            name: 'YouTube',
            commission: 55,
            color: 'bg-near-red',
            description: language === 'tr' ? 'Platform kesintisi' : 'Platform cut',
        },
        {
            name: 'Spotify',
            commission: 70,
            color: 'bg-orange-500',
            description: language === 'tr' ? 'Platform + Label' : 'Platform + Label',
        },
        {
            name: 'Ticketmaster',
            commission: 28,
            color: 'bg-yellow-500',
            description: language === 'tr' ? 'Bilet komisyonu' : 'Ticket commission',
        },
        {
            name: 'Netflix',
            commission: 77,
            color: 'bg-red-600',
            description: language === 'tr' ? 'Lisans modeli' : 'License model',
        },
    ];

    const maxCommission = 100;

    return (
        <section id="commission-comparison" className="py-24 bg-black relative">
            <div className="container mx-auto px-4">
                {/* Header - Left aligned per NEAR guidelines */}
                <div className="max-w-3xl mb-16">
                    <h2 className="text-3xl md:text-4xl font-black text-white mb-4 text-left">
                        {language === 'tr' ? 'Komisyon Karşılaştırması' : 'Commission Comparison'}
                    </h2>
                    <p className="text-lg text-zinc-400 text-left">
                        {language === 'tr'
                            ? 'Geleneksel platformlar sanatçı gelirinin çoğunu alır. Biz farklıyız.'
                            : 'Traditional platforms take most of artist revenue. We\'re different.'}
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
                                        <span className="px-2 py-0.5 text-xs font-bold bg-near-green/20 text-near-green rounded-full">
                                            ⭐
                                        </span>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className={`text-2xl font-black ${platform.highlight ? 'text-near-green' : 'text-zinc-300'}`}>
                                        {platform.commission}%
                                    </span>
                                    <span className="text-xs text-zinc-500 ml-2">
                                        {language === 'tr' ? 'komisyon' : 'commission'}
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
                                        ? (language === 'tr' ? 'Sanatçı: %98 ✓' : 'Artist: 98% ✓')
                                        : (language === 'tr' ? `Sanatçı: %${100 - platform.commission}` : `Artist: ${100 - platform.commission}%`)
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
                <div className="mt-16 max-w-2xl mx-auto p-8 rounded-2xl bg-near-green/5 border border-near-green/20">
                    <div className="text-center">
                        <div className="text-6xl font-black text-near-green mb-4">
                            50x
                        </div>
                        <p className="text-lg text-zinc-300 mb-2">
                            {language === 'tr'
                                ? 'YouTick komisyonu diğer platformlara göre ~50 kat daha düşük'
                                : 'YouTick commission is ~50x lower than other platforms'}
                        </p>
                        <p className="text-sm text-zinc-500">
                            {language === 'tr'
                                ? '2% vs 55-70% platform kesintisi'
                                : '2% vs 55-70% platform cut'}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
});

FinancialComparisonChart.displayName = 'FinancialComparisonChart';
