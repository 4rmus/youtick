'use client';

import { useLanguage } from '@/components/providers/LanguageContext';
import { Globe } from 'lucide-react';

/**
 * Floating Language Switcher - NEAR Brand Style
 * Positioned at bottom-left, minimal and clean per NEAR guidelines
 */
export const LanguageSwitcher = () => {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="fixed bottom-6 left-6 z-50">
            <button
                onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg hover:border-near-green/50 transition-all group"
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
