'use client';

import { useLanguage } from '@/components/providers/LanguageContext';

interface BrandingProps {
    size?: 'sm' | 'md' | 'lg';
}

export const Branding = ({ size = 'md' }: BrandingProps) => {
    const { t } = useLanguage();

    const sizeClasses = {
        sm: 'text-xl',
        md: 'text-2xl',
        lg: 'text-4xl',
    };

    return (
        <span className={`font-black tracking-tight text-white ${sizeClasses[size]}`}>
            {t.landing.branding.name}
        </span>
    );
};
