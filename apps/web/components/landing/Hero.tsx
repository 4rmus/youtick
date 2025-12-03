'use client';

import Link from "next/link";
import { useLanguage } from "@/components/providers/LanguageContext";

export const Hero = () => {
    const { t } = useLanguage();

    return (
        <section className="flex flex-col items-center justify-center min-h-[90vh] text-center px-4 bg-white dark:bg-black text-black dark:text-white pt-20 transition-colors duration-300">
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6">
                {t.hero.title}
            </h1>
            <p className="text-2xl md:text-3xl font-light text-gray-800 dark:text-gray-200 mb-2">
                {t.hero.subtitle}
            </p>
            <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 mb-10 tracking-wide uppercase">
                {t.hero.tagline}
            </p>

            <div className="flex gap-4 mb-16">
                <Link
                    href="#discover"
                    className="bg-black text-white px-8 py-4 rounded-full font-medium hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors"
                >
                    {t.hero.cta_watch}
                </Link>
                <Link
                    href="#upload"
                    className="border border-black text-black px-8 py-4 rounded-full font-medium hover:bg-gray-50 dark:border-white dark:text-white dark:hover:bg-gray-900 transition-colors"
                >
                    {t.hero.cta_upload}
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full max-w-4xl border-t border-gray-100 dark:border-gray-800 pt-12">
                <div className="flex flex-col items-center">
                    <span className="text-4xl md:text-5xl font-bold mb-2">$50B+</span>
                    <span className="text-xs text-gray-400 uppercase tracking-widest">{t.hero.stats.market}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-4xl md:text-5xl font-bold mb-2">85%</span>
                    <span className="text-xs text-gray-400 uppercase tracking-widest">{t.hero.stats.cost}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-4xl md:text-5xl font-bold mb-2">100%</span>
                    <span className="text-xs text-gray-400 uppercase tracking-widest">{t.hero.stats.revenue}</span>
                </div>
            </div>
        </section>
    );
};
