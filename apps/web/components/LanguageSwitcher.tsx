'use client';

import { useLanguage } from '@/components/providers/LanguageContext';
import { Globe } from 'lucide-react';

/**
 * Floating Language Switcher - NEAR Brand Style
 * Kept outside the nav so it does not compete with primary navigation.
 */
export const LanguageSwitcher = () => {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
            <button
                type="button"
                aria-label={language === 'tr' ? 'Switch to English' : 'Turkceye gec'}
                onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                className="flex min-h-11 items-center gap-2 px-3 py-2 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg hover:border-near-green/50 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                title={language === 'tr' ? 'Switch to English' : 'Türkçe\'ye geç'}
            >
                <Globe className="w-4 h-4 text-zinc-500 group-hover:text-near-green transition-colors" />
                <span className="text-xs font-bold text-near-green">
                    {language === 'tr' ? 'TR' : 'EN'}
                </span>
                <span className="text-xs text-zinc-600">
                    → {language === 'tr' ? 'EN' : 'TR'}
                </span>
            </button>
        </div>
    );
};
