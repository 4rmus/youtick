'use client';

import Link from 'next/link';
import { useWallet } from '@/components/providers/WalletProvider';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

export function Navbar() {
    const { modal, accountId, selector } = useWallet();
    const { language, setLanguage, t } = useLanguage();
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

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

    const navLinks = [
        { href: '/discover', label: 'Discover' },
        { href: '/upload', label: 'Upload' },
        { href: '/mint', label: 'Get Pass' },
        { href: '/watch', label: 'Watch' },
    ];

    return (
        <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/80 dark:bg-black/80 border-b border-gray-200 dark:border-gray-800 px-4 py-3 transition-colors duration-300">
            <div className="container mx-auto flex justify-between items-center">
                <Link href="/" className="text-2xl font-bold text-black dark:text-white tracking-tighter flex items-center gap-2">
                    <span className="bg-black text-white dark:bg-white dark:text-black px-2 py-1 rounded-sm text-lg">YT</span>
                    youtick
                </Link>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`text-sm font-medium transition-colors hover:text-primary ${pathname === link.href ? 'text-primary font-bold' : 'text-muted-foreground'
                                }`}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

                <div className="hidden md:flex items-center gap-4">
                    <div className="flex items-center gap-2 mr-2 border-r border-gray-200 dark:border-gray-800 pr-4">
                        <button
                            onClick={() => setLanguage('en')}
                            className={`text-xs font-bold ${language === 'en' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            EN
                        </button>
                        <button
                            onClick={() => setLanguage('tr')}
                            className={`text-xs font-bold ${language === 'tr' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
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
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate max-w-[100px]">{accountId}</span>
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

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden p-2"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    {isMenuOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Mobile Menu */}
            {isMenuOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-4 shadow-xl">
                    {navLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setIsMenuOpen(false)}
                            className={`text-lg font-medium transition-colors ${pathname === link.href ? 'text-primary' : 'text-muted-foreground'
                                }`}
                        >
                            {link.label}
                        </Link>
                    ))}
                    <div className="h-px bg-gray-200 dark:bg-gray-800 my-2" />
                    {accountId ? (
                        <button onClick={handleSignOut} className="text-left text-red-500 font-medium">Disconnect</button>
                    ) : (
                        <button onClick={handleSignIn} className="text-left font-bold">Connect Wallet</button>
                    )}
                </div>
            )}
        </nav>
    );
}
