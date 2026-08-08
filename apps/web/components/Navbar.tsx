'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, User, X } from 'lucide-react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { getLandingCtas, landingCopy, type LandingLocale } from '@/components/landing/landing-copy';
import { FEATURE_FLAGS } from '@/lib/constants';

const LINKS = [
    { href: '/discover', label: 'Discover' },
    { href: '/upload', label: 'Upload' },
    { href: '/profile', label: 'Profile' },
];

export function Navbar() {
    const pathname = usePathname();
    const { accountId, connect, isReady, signOut } = useWallet();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const isLanding = pathname === '/' || pathname === '/tr';
    const locale: LandingLocale = pathname === '/tr' ? 'tr' : 'en';
    const copy = landingCopy[locale];
    const ctas = getLandingCtas(locale, FEATURE_FLAGS.enablePaidMediaLivepeerV1);
    const landingHome = locale === 'tr' ? '/tr' : '/';
    const appLinks = accountId ? LINKS : LINKS.filter((link) => link.href !== '/profile');

    if (isLanding && !accountId) {
        return (
            <nav className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur">
                <div className="container mx-auto flex min-h-16 flex-wrap items-center justify-between gap-4 px-4 py-2">
                    <Link href={landingHome} className="font-bold tracking-tight">YouTick</Link>
                    <div className="hidden items-center gap-5 lg:flex">
                        <Link href={`${landingHome}#audience`} className="text-sm text-zinc-400 hover:text-white">{copy.nav.audience}</Link>
                        <Link href={`${landingHome}#how-it-works`} className="text-sm text-zinc-400 hover:text-white">{copy.nav.howItWorks}</Link>
                        <Link href={`${landingHome}#roi-calculator`} className="text-sm text-zinc-400 hover:text-white">{copy.nav.calculator}</Link>
                    </div>
                    <div className="flex items-center gap-3">
                        {ctas.status && <span className="hidden text-xs font-semibold text-near-green sm:inline">{ctas.status}</span>}
                        <Button asChild size="sm"><Link href={ctas.primary.href}>{ctas.primary.label}</Link></Button>
                        {FEATURE_FLAGS.enablePaidMediaLivepeerV1 && (
                            <Button size="sm" disabled={!isReady} onClick={() => void connect()}>{copy.nav.connect}</Button>
                        )}
                    </div>
                </div>
            </nav>
        );
    }

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/95 backdrop-blur-md">
            <div className="container relative mx-auto flex h-16 items-center justify-between px-4">
                <Link href="/" className="text-xl font-black tracking-tight text-white">YouTick</Link>

                <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-8 md:flex">
                    {appLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={pathname === link.href ? 'text-sm font-bold text-near-green' : 'text-sm font-medium text-zinc-400 transition-colors hover:text-near-green'}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

                <div className="hidden items-center md:flex">
                    {accountId ? (
                        <div className="flex items-center gap-2 rounded-full border border-near-green/30 bg-black py-1 pl-3 pr-1">
                            <User className="h-3 w-3 text-near-green" />
                            <span className="max-w-[100px] truncate font-mono text-xs text-zinc-400">{accountId}</span>
                            <Button
                                aria-label="Disconnect"
                                size="icon"
                                variant="ghost"
                                className="h-11 w-11 rounded-full text-zinc-500 hover:bg-near-red/10 hover:text-near-red focus-visible:ring-near-red"
                                onClick={() => void signOut()}
                            >
                                <LogOut />
                            </Button>
                        </div>
                    ) : (
                        <Button className="rounded-full" disabled={!isReady} onClick={() => void connect()}>Connect</Button>
                    )}
                </div>

                <button
                    type="button"
                    aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={isMenuOpen}
                    className="flex h-11 w-11 items-center justify-center rounded-md text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green md:hidden"
                    onClick={() => setIsMenuOpen((open) => !open)}
                >
                    {isMenuOpen ? <X /> : <Menu />}
                </button>
            </div>

            {isMenuOpen && (
                <div className="absolute left-0 top-full flex w-full flex-col gap-4 border-b border-white/10 bg-black p-4 shadow-xl md:hidden">
                    {appLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setIsMenuOpen(false)}
                            className={pathname === link.href ? 'min-h-11 py-2 text-lg font-bold text-white' : 'min-h-11 py-2 text-lg font-medium text-zinc-400'}
                        >
                            {link.label}
                        </Link>
                    ))}
                    <div className="h-px bg-white/10" />
                    <div className="flex min-h-11 items-center gap-4 text-sm">
                        <Link href="/terms" onClick={() => setIsMenuOpen(false)} className="text-zinc-500 hover:text-zinc-300">Terms</Link>
                        <Link href="/privacy" onClick={() => setIsMenuOpen(false)} className="text-zinc-500 hover:text-zinc-300">Privacy</Link>
                    </div>
                    <div className="h-px bg-white/10" />
                    {accountId ? (
                        <div className="flex min-h-11 items-center justify-between gap-4">
                            <span className="truncate font-mono text-xs text-zinc-400">{accountId}</span>
                            <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-md font-medium text-near-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-red">Disconnect</button>
                        </div>
                    ) : (
                        <button type="button" disabled={!isReady} onClick={() => void connect()} className="min-h-11 rounded-md text-left font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green disabled:opacity-50">Connect</button>
                    )}
                </div>
            )}
        </nav>
    );
}
