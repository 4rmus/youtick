'use client';

import Link from 'next/link';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, User, LogOut, Sparkles } from 'lucide-react';

import { Branding } from '@/components/landing/Branding';

export function Navbar() {
    const { connect, accountId, signOut } = useWallet();
    const { language, t } = useLanguage();
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    const handleSignIn = () => {
        connect();
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            window.location.reload();
        } catch (e) {
            console.error("Failed to sign out:", e);
            window.location.reload();
        }
    };

    if (!mounted) return null;

    // Do not render Navbar on landing page for guests
    if (pathname === '/' && !accountId) return null;

    const navLinks = [
        { href: '/discover', label: t.nav.discover },
        { href: '/upload', label: t.nav.upload },
        { href: '/watch', label: t.nav.watch },
        ...(accountId ? [{ href: '/profile', label: t.nav.profile }] : []),
    ];

    return (
        <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-black/95 border-b border-white/10 transition-colors duration-300">
            <div className="container mx-auto flex justify-between items-center h-16 px-4 relative">
                <Link href="/" className="flex items-center gap-2">
                    <Branding size="sm" />
                </Link>

                {/* Desktop Nav */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`text-sm font-medium transition-colors hover:text-near-green ${pathname === link.href ? 'text-near-green font-bold' : 'text-zinc-400'}`}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

                <div className="hidden md:flex items-center gap-3">
                    {/* Try Free CTA */}
                    {!accountId && (
                        <Link href="/trial">
                            <button className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-near-green border border-near-green/50 rounded-full hover:bg-near-green/10 transition-colors">
                                <Sparkles className="w-4 h-4" />
                                {language === 'tr' ? 'Ücretsiz Dene' : 'Try Free'}
                            </button>
                        </Link>
                    )}

                    {accountId ? (
                        <div className="rounded-full bg-near-black border border-near-green/30 flex items-center pl-3 pr-1 py-1 gap-2">
                            <User className="w-3 h-3 text-near-green" />
                            <span className="text-xs font-mono text-zinc-400 truncate max-w-[100px]">{accountId}</span>
                            <Button
                                onClick={handleSignOut}
                                className="h-6 w-6 ml-1 p-0 rounded-full bg-transparent hover:bg-near-red/10 text-zinc-500 hover:text-near-red flex items-center justify-center transition-colors"
                            >
                                <LogOut className="w-3 h-3" />
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={handleSignIn}
                            className="px-4 py-2 text-sm font-semibold text-near-black bg-near-green rounded-full hover:bg-near-green/80 transition-colors"
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
                            className={`text-lg font-medium transition-colors ${pathname === link.href ? 'text-white' : 'text-zinc-400'}`}
                        >
                            {link.label}
                        </Link>
                    ))}
                    <div className="h-px bg-white/10 my-2" />
                    {!accountId && (
                        <Link href="/trial" onClick={() => setIsMenuOpen(false)} className="text-near-green font-semibold flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            {language === 'tr' ? 'Ücretsiz Dene' : 'Try Free'}
                        </Link>
                    )}
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
