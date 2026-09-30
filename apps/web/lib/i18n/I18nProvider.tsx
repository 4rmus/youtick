'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_LOCALE, readStoredLocale, setStoredLocale, subscribeLocale, type Locale } from './locale';
import { messages, type Messages } from './messages';

const InitialLocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
    return <InitialLocaleContext.Provider value={initialLocale}>{children}</InitialLocaleContext.Provider>;
}

export function useLocale(): Locale {
    const initialLocale = useContext(InitialLocaleContext);
    const locale = useSyncExternalStore(
        subscribeLocale,
        () => readStoredLocale() ?? initialLocale,
        () => initialLocale,
    );
    useEffect(() => {
        if (document.documentElement.lang !== locale) document.documentElement.lang = locale;
    }, [locale]);
    return locale;
}

export function useMessages(): Messages {
    return messages[useLocale()];
}

export { setStoredLocale as setLocale };
