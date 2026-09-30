import { FEATURE_FLAGS } from '@/lib/constants';

export type NavKey = 'discover' | 'tickets' | 'studio';

export type NavItem = {
    key: NavKey;
    /** null hides an item whose route does not exist yet. */
    href: string | null;
    matches: readonly string[];
};

export const NAV_ITEMS: readonly NavItem[] = [
    { key: 'discover', href: '/', matches: ['/', '/s', '/watch'] },
    { key: 'tickets', href: '/tickets', matches: ['/tickets'] },
    { key: 'studio', href: '/studio', matches: ['/studio'] },
];

export function visibleNavItems(): Array<NavItem & { href: string }> {
    return NAV_ITEMS.filter((item): item is NavItem & { href: string } => item.href !== null);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
    return item.matches.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const RUNTIME_OPEN = FEATURE_FLAGS.enablePaidMediaLivepeerV1 || FEATURE_FLAGS.enableDerivedReadModel;

/** Paths that render the introduction page; `/` is Discover once the runtime is open. */
export function isLandingPath(pathname: string): boolean {
    return pathname === '/creators' || pathname === '/tr' || (pathname === '/' && !RUNTIME_OPEN);
}

/** The introduction keeps its own header for visitors; everyone else gets the app shell. */
export function usesAppShell(pathname: string, accountId: string | null): boolean {
    return Boolean(accountId) || !isLandingPath(pathname);
}
