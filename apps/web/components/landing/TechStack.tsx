'use client';

import { useLanguage } from "@/components/providers/LanguageContext";

export const TechStack = () => {
    const { t } = useLanguage();

    return (
        <section className="py-24 px-4 bg-white dark:bg-black text-black dark:text-white border-t border-gray-100 dark:border-gray-800 transition-colors duration-300">
            <div className="max-w-4xl mx-auto text-center">
                <h2 className="text-3xl md:text-5xl font-bold mb-16">{t.techStack.title}</h2>

                <div className="grid md:grid-cols-3 gap-12 items-start">
                    <div className="space-y-4">
                        <h3 className="text-2xl font-bold">NEAR Protocol</h3>
                        <ul className="text-left text-gray-600 dark:text-gray-400 space-y-2 text-sm">
                            <li>• Sub-second finality</li>
                            <li>• Human-readable accounts</li>
                            <li>• Carbon-neutral blockchain</li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-2xl font-bold">Filecoin + Lighthouse</h3>
                        <ul className="text-left text-gray-600 dark:text-gray-400 space-y-2 text-sm">
                            <li>• Perpetual storage</li>
                            <li>• Threshold encryption</li>
                            <li>• No vendor lock-in</li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-2xl font-bold">Livepeer Network</h3>
                        <ul className="text-left text-gray-600 dark:text-gray-400 space-y-2 text-sm">
                            <li>• Decentralized transcoding</li>
                            <li>• 1/10th the cost</li>
                            <li>• Global GPU network</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
};
