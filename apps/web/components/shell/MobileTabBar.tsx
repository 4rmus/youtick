'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Clapperboard, Ticket, User } from 'lucide-react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Dialog } from '@/components/ui/dialog';
import { useMessages } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { AccountMenuContent } from './AccountMenu';
import { isNavItemActive, usesAppShell, visibleNavItems, type NavKey } from './nav';

const ICONS: Record<NavKey, typeof Clapperboard> = { discover: Clapperboard, tickets: Ticket, studio: BarChart3 };
const tab = 'flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 text-[11px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ice';

export function MobileTabBar() {
    const pathname = usePathname();
    const { accountId } = useWallet();
    const t = useMessages().nav;
    const [accountOpen, setAccountOpen] = React.useState(false);
    const items = visibleNavItems();

    React.useEffect(() => { setAccountOpen(false); }, [pathname]);

    if (!usesAppShell(pathname, accountId)) return null;

    return (
        <>
            <div aria-hidden="true" className="h-20 md:hidden" />
            <nav
                aria-label={t.mainNav}
                className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-ink pb-[env(safe-area-inset-bottom)] md:hidden"
                style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
            >
                {items.map((item) => {
                    const Icon = ICONS[item.key];
                    const active = isNavItemActive(item, pathname);
                    return (
                        <Link
                            key={item.key}
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(tab, active ? 'border-ice text-light' : 'border-transparent text-light-3')}
                        >
                            <Icon aria-hidden="true" className="h-5 w-5" />
                            {t[item.key]}
                        </Link>
                    );
                })}
                <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setAccountOpen(true)}
                    className={cn(tab, 'border-transparent text-light-3')}
                >
                    <User aria-hidden="true" className="h-5 w-5" />
                    {t.account}
                </button>
            </nav>
            <Dialog
                open={accountOpen}
                onClose={() => setAccountOpen(false)}
                title={accountId ? t.account : t.connect}
                closeLabel={t.closeMenu}
            >
                {accountOpen && <AccountMenuContent onNavigate={() => setAccountOpen(false)} />}
            </Dialog>
        </>
    );
}
