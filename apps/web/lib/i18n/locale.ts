export type Locale = 'en' | 'tr';

export const LOCALES: readonly Locale[] = ['en', 'tr'];
export const DEFAULT_LOCALE: Locale = 'en';

// Preference stays in localStorage, the storage category the privacy notice already lists.
const LOCALE_KEY = 'youtick:locale';
const LEGACY_PLAYER_LANGUAGE_KEY = 'youtick:player-language';
const LOCALE_EVENT = 'youtick:locale-changed';

let selectedLocale: Locale | undefined;

export function isLocale(value: unknown): value is Locale {
    return value === 'en' || value === 'tr';
}

// Server-side default from Accept-Language; the header is read, never stored.
export function resolveLocale(acceptLanguage: string | null | undefined): Locale {
    if (!acceptLanguage) return DEFAULT_LOCALE;
    const ranked = acceptLanguage.split(',')
        .map((part, index) => {
            const [tag, ...params] = part.trim().toLowerCase().split(';');
            const quality = params.map((param) => param.trim())
                .find((param) => param.startsWith('q='));
            const q = quality ? Number(quality.slice(2)) : 1;
            return { language: tag.split('-')[0], q: Number.isFinite(q) ? q : 0, index };
        })
        .filter((item) => item.q > 0)
        .sort((left, right) => right.q - left.q || left.index - right.index);
    for (const item of ranked) {
        if (isLocale(item.language)) return item.language;
    }
    return DEFAULT_LOCALE;
}

export function readStoredLocale(): Locale | null {
    if (selectedLocale) return selectedLocale;
    try {
        const value = localStorage.getItem(LOCALE_KEY) ?? localStorage.getItem(LEGACY_PLAYER_LANGUAGE_KEY);
        if (isLocale(value)) return value;
    } catch { /* Language selection still works without persistent storage. */ }
    return null;
}

export function setStoredLocale(locale: Locale): void {
    selectedLocale = locale;
    try {
        localStorage.setItem(LOCALE_KEY, locale);
        localStorage.removeItem(LEGACY_PLAYER_LANGUAGE_KEY);
    } catch { /* Optional preference. */ }
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    window.dispatchEvent(new Event(LOCALE_EVENT));
}

export function subscribeLocale(notify: () => void): () => void {
    const changed = (event: StorageEvent) => {
        if (event.key === null || event.key === LOCALE_KEY || event.key === LEGACY_PLAYER_LANGUAGE_KEY) {
            selectedLocale = undefined;
            notify();
        }
    };
    window.addEventListener(LOCALE_EVENT, notify);
    window.addEventListener('storage', changed);
    return () => {
        window.removeEventListener(LOCALE_EVENT, notify);
        window.removeEventListener('storage', changed);
    };
}

// For code that formats copy outside React render: stored choice, then the server-set <html lang>.
export function currentLocale(): Locale {
    const stored = typeof window === 'undefined' ? null : readStoredLocale();
    if (stored) return stored;
    const documentLocale = typeof document === 'undefined' ? null : document.documentElement.lang;
    return isLocale(documentLocale) ? documentLocale : DEFAULT_LOCALE;
}
