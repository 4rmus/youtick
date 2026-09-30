'use client';

import { setLocale, useLocale, useMessages } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/utils';

export function LanguageToggle({ className }: { className?: string }) {
    const locale = useLocale();
    const t = useMessages().nav;
    return (
        <button
            type="button"
            aria-label={t.switchLanguage}
            onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
            className={cn(
                'flex h-11 min-w-11 items-center justify-center rounded-xs px-2 text-[13px] font-bold text-light hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice',
                className,
            )}
        >
            {t.otherLanguageShort}
        </button>
    );
}
