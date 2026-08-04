'use client';

import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { translations, Language } from '@/lib/translations';

type LanguageContextType = {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: typeof translations['en'];
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const languageListeners = new Set<() => void>();

function getStoredLanguage(): Language {
    const savedLang = localStorage.getItem('language') as Language | null;
    return savedLang === 'tr' || savedLang === 'en' ? savedLang : 'en';
}

function subscribeToLanguage(listener: () => void) {
    languageListeners.add(listener);
    return () => languageListeners.delete(listener);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const language = useSyncExternalStore<Language>(subscribeToLanguage, getStoredLanguage, () => 'en');

    const handleSetLanguage = (lang: Language) => {
        localStorage.setItem('language', lang);
        languageListeners.forEach((listener) => listener());
    };

    return (
        <LanguageContext.Provider value={{
            language,
            setLanguage: handleSetLanguage,
            t: translations[language]
        }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
