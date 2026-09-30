'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { getLandingCtas, landingCopy, type LandingLocale } from '@/components/landing/landing-copy';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { LanguageToggle } from '@/components/shell/LanguageToggle';
import { isNavItemActive, usesAppShell, visibleNavItems } from '@/components/shell/nav';
import { FEATURE_FLAGS } from '@/lib/constants';
import { useMessages } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/utils';

export function Navbar() {
    const pathname = usePathname();
    const { accountId, connect, isReady } = useWallet();
    const t = useMessages().nav;
    const locale: LandingLocale = pathname === '/tr' ? 'tr' : 'en';
    const copy = landingCopy[locale];
    const ctas = getLandingCtas(locale, FEATURE_FLAGS.enablePaidMediaLivepeerV1);
    const landingHome = locale === 'tr' ? '/tr' : pathname === '/creators' ? '/creators' : '/';

    if (!usesAppShell(pathname, accountId)) {
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
        <header className="sticky top-0 z-50 w-full border-b border-line bg-ink/95 backdrop-blur-md">
            <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4 md:h-20">
                <Link href="/" className="font-logo flex min-h-11 items-center text-lg text-light md:text-xl">YOUTICK</Link>

                <nav aria-label={t.mainNav} className="hidden items-center gap-9 md:flex">
                    {visibleNavItems().map((item) => {
                        const active = isNavItemActive(item, pathname);
                        return (
                            <Link
                                key={item.key}
                                href={item.href}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex min-h-11 items-center border-b-2 text-[15px] font-semibold transition-colors',
                                    active ? 'border-ice text-light' : 'border-transparent text-light-2 hover:text-light',
                                )}
                            >
                                {t[item.key]}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex items-center gap-2">
                    <LanguageToggle />
                    <div className="hidden md:block"><AccountMenu /></div>
                </div>
            </div>
        </header>
    );
}
