'use client';

import Link from 'next/link';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, User, LogOut } from 'lucide-react';

import { Branding } from '@/components/landing/Branding';

export function Navbar() {
    const { modal, accountId, selector } = useWallet();
    const { language, setLanguage, t } = useLanguage();
    // Theme toggle is removed as we are enforcing dark mode
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
        window.location.reload();
    };

    if (!mounted) return null;

    // Do not render Navbar on the landing page (root path)
    if (pathname === '/') return null;

    const navLinks = [
        { href: '/discover', label: t.nav.discover },
        { href: '/upload', label: t.nav.upload },
        { href: '/watch', label: t.nav.watch },
        { href: '/profile', label: t.nav.profile },
    ];

    return (
        <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-black/95 border-b border-white/10 px-4 py-3 transition-colors duration-300">
            <div className="container mx-auto flex justify-between items-center relative">
                <Link href="/" className="flex items-center gap-2">
                    <Branding size="sm" />
                </Link>

                {/* Desktop Nav */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`text-sm font-medium transition-colors hover:text-white ${pathname === link.href ? 'text-white font-bold' : 'text-zinc-400'
                                }`}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

                <div className="hidden md:flex items-center gap-4">
                    <div className="flex items-center gap-2 mr-2 border-r border-white/10 pr-4">
                        <button
                            onClick={() => setLanguage('en')}
                            className={`text-xs font-bold ${language === 'en' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                        >
                            EN
                        </button>
                        <button
                            onClick={() => setLanguage('tr')}
                            className={`text-xs font-bold ${language === 'tr' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                        >
                            TR
                        </button>
                    </div>

                    {accountId ? (
                        <div className="rounded-full bg-zinc-900 border border-zinc-800 flex items-center pl-3 pr-1 py-1 gap-2">
                            <User className="w-3 h-3 text-zinc-500" />
                            <span className="text-xs font-mono text-zinc-400 truncate max-w-[100px]">{accountId}</span>
                            <Button // This uses the generic button which might have different default styles, let's use standard button class instead or ensure Button import
                                onClick={handleSignOut}
                                className="h-6 w-6 ml-1 p-0 rounded-full bg-transparent hover:bg-red-500/10 text-zinc-500 hover:text-red-500 flex items-center justify-center transition-colors"
                            >
                                <LogOut className="w-3 h-3" />
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={handleSignIn}
                            className="px-4 py-2 text-sm font-medium text-black bg-white rounded-full hover:bg-gray-200 transition-colors"
                        >
                            {t.nav.connect}
                        </button>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden p-2 text-white"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    {isMenuOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Mobile Menu */}
            {isMenuOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-black border-b border-white/10 p-4 flex flex-col gap-4 shadow-xl">
                    {navLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setIsMenuOpen(false)}
                            className={`text-lg font-medium transition-colors ${pathname === link.href ? 'text-white' : 'text-zinc-400'
                                }`}
                        >
                            {link.label}
                        </Link>
                    ))}
                    <div className="h-px bg-white/10 my-2" />
                    {accountId ? (
                        <button onClick={handleSignOut} className="text-left text-red-500 font-medium">{t.nav.disconnect}</button>
                    ) : (
                        <button onClick={handleSignIn} className="text-left font-bold text-white">{t.nav.connect}</button>
                    )}
                </div>
            )}
        </nav>
    );
}
