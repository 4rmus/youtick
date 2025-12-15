'use client';

import { useLanguage } from '@/components/providers/LanguageContext';

export const Roadmap = () => {
    const { t } = useLanguage();

    return (
        <section id="roadmap" className="py-24 px-4 bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">{t.roadmap.title}</h2>
                    <p className="text-xl text-gray-500 dark:text-gray-400">{t.roadmap.subtitle}</p>
                </div>

                <div className="relative">
                    {/* Vertical Line */}
                    <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-800 transform -translate-x-1/2"></div>

                    <div className="space-y-12">
                        {t.roadmap.phases.map((phase, index) => (
                            <div key={index} className={`relative flex flex-col md:flex-row gap-8 ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>

                                {/* Timeline Dot */}
                                <div className="absolute left-4 md:left-1/2 w-4 h-4 bg-black dark:bg-white rounded-full border-4 border-white dark:border-black transform -translate-x-1/2 mt-1.5 z-10"></div>

                                {/* Content */}
                                <div className="ml-12 md:ml-0 md:w-1/2">
                                    <div className={`bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 ${index % 2 === 0 ? 'md:mr-12' : 'md:ml-12'}`}>
                                        <span className="inline-block px-3 py-1 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-full mb-3">
                                            {phase.year}
                                        </span>
                                        <h3 className="text-xl font-bold mb-2">{phase.title}</h3>
                                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                            {phase.desc}
                                        </p>
                                    </div>
                                </div>

                                {/* Empty space for the other side */}
                                <div className="hidden md:block md:w-1/2"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
