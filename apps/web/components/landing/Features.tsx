'use client';

import { useLanguage } from "@/components/providers/LanguageContext";

export const Features = () => {
    const { t } = useLanguage();

    return (
        <section id="features" className="py-24 px-4 bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
            <div className="max-w-6xl mx-auto">
                <div className="mb-16 text-center">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">{t.features.title}</h2>
                    <p className="text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">{t.features.subtitle}</p>
                </div>
                <div className="grid md:grid-cols-3 gap-x-12 gap-y-16">
                    {t.features.items.map((feature, index) => (
                        <div key={index} className="space-y-4">
                            <h3 className="text-2xl font-bold border-l-4 border-black dark:border-white pl-4">{feature.title}</h3>
                            <p className="text-gray-600 dark:text-gray-400 leading-relaxed pl-5">
                                {feature.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
