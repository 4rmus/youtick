'use client';

import { useLanguage } from "@/components/providers/LanguageContext";

export const UseCases = () => {
    const { t } = useLanguage();

    const icons = ["🎵", "🎬", "🎭", "📚", "🏟️", "🎤"];

    return (
        <section className="py-24 px-4 bg-gray-50 dark:bg-gray-900 text-black dark:text-white transition-colors duration-300">
            <div className="max-w-6xl mx-auto">
                <div className="mb-16 text-center">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">{t.useCases.title}</h2>
                    <p className="text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">{t.useCases.subtitle}</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {t.useCases.items.map((item, index) => (
                        <div key={index} className="bg-white dark:bg-black p-8 rounded-2xl shadow-sm hover:shadow-md transition-all border border-transparent dark:border-gray-800">
                            <div className="text-4xl mb-6">{icons[index]}</div>
                            <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                                {item.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
