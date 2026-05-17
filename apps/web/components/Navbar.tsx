'use client';

import Link from '@/components/Web4Link';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, User, LogOut } from 'lucide-react';

import { Branding } from '@/components/landing/Branding';

export function Navbar() {
    const { connect, accountId, signOut } = useWallet();
    const { t } = useLanguage();
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
                    {accountId ? (
                        <div className="rounded-full bg-near-black border border-near-green/30 flex items-center pl-3 pr-1 py-1 gap-2">
                            <User className="w-3 h-3 text-near-green" />
                            <span className="text-xs font-mono text-zinc-400 truncate max-w-[100px]">{accountId}</span>
                            <Button
                                aria-label={t.nav.disconnect}
                                onClick={handleSignOut}
                                className="h-8 w-8 ml-1 p-0 rounded-full bg-transparent hover:bg-near-red/10 text-zinc-500 hover:text-near-red flex items-center justify-center transition-colors focus-visible:ring-near-red"
                            >
                                <LogOut className="w-3 h-3" />
                            </Button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSignIn}
                            className="px-4 py-2 text-sm font-semibold text-near-black bg-near-green rounded-full hover:bg-near-green/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                        >
                            {t.nav.connect}
                        </button>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <button
                    type="button"
                    aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={isMenuOpen}
                    className="md:hidden p-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
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
                    <div className="flex items-center gap-4 text-sm">
                        <Link href="/terms" onClick={() => setIsMenuOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">Terms</Link>
                        <Link href="/privacy" onClick={() => setIsMenuOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">Privacy</Link>
                    </div>
                    <div className="h-px bg-white/10 my-2" />
                    {accountId ? (
                        <button type="button" onClick={handleSignOut} className="rounded-md text-left text-near-red font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-red">{t.nav.disconnect}</button>
                    ) : (
                        <button type="button" onClick={handleSignIn} className="rounded-md text-left font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green">{t.nav.connect}</button>
                    )}
                </div>
            )}
        </nav>
    );
}
