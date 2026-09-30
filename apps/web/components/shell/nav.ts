export type NavKey = 'discover' | 'tickets' | 'studio';

export type NavItem = {
    key: NavKey;
    /** null until the route exists; G7 adds /tickets and /studio. */
    href: string | null;
    matches: readonly string[];
};

export const NAV_ITEMS: readonly NavItem[] = [
    { key: 'discover', href: '/discover', matches: ['/discover', '/watch'] },
    { key: 'tickets', href: null, matches: [] },
    { key: 'studio', href: '/upload', matches: ['/upload', '/profile'] },
];

export function visibleNavItems(): Array<NavItem & { href: string }> {
    return NAV_ITEMS.filter((item): item is NavItem & { href: string } => item.href !== null);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
    return item.matches.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** The landing page keeps its own header for visitors; everyone else gets the app shell. */
export function usesAppShell(pathname: string, accountId: string | null): boolean {
    return Boolean(accountId) || (pathname !== '/' && pathname !== '/tr');
}
