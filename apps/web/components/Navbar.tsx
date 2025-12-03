'use client';

import Link from 'next/link';
import { useWallet } from '@/components/providers/WalletProvider';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function Navbar() {
    const { modal, accountId, selector } = useWallet();
    const { language, setLanguage, t } = useLanguage();
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Mounting check for hydration safety
    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    const handleSignIn = () => {
        modal?.show();
    };

    const handleSignOut = async () => {
        const wallet = await selector?.wallet();
        wallet?.signOut();
    };

    if (!mounted) return null;

    return (
        <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/80 dark:bg-black/80 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex justify-between items-center transition-colors duration-300">
            <Link href="/" className="text-2xl font-bold text-black dark:text-white tracking-tighter">
                youtick
            </Link>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 mr-2">
                    <button
                        onClick={() => setLanguage('en')}
                        className={`text-sm font-medium ${language === 'en' ? 'text-black dark:text-white underline' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        EN
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                        onClick={() => setLanguage('tr')}
                        className={`text-sm font-medium ${language === 'tr' ? 'text-black dark:text-white underline' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        TR
                    </button>
                </div>

                <button
                    onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Toggle Dark Mode"
                >
                    {resolvedTheme === 'dark' ? '☀️' : '🌙'}
                </button>

                {accountId ? (
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600 dark:text-gray-300">{accountId}</span>
                        <button
                            onClick={handleSignOut}
                            className="px-4 py-2 text-sm font-medium text-black bg-gray-100 rounded-full hover:bg-gray-200 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700 transition-colors"
                        >
                            {t.nav.disconnect}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleSignIn}
                        className="px-4 py-2 text-sm font-medium text-white bg-black rounded-full hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors"
                    >
                        {t.nav.connect}
                    </button>
                )}
            </div>
        </nav>
    );
}
