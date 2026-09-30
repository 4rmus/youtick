import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navState = vi.hoisted(() => ({
    pathname: '/',
    accountId: 'creator.testnet' as string | null,
    publicTestnetVideoV1: false,
    balance: { data: undefined as unknown, isError: false },
    beta: { data: undefined as unknown, isLoading: false, dataUpdatedAt: 0 },
    connect: vi.fn(),
    signOut: vi.fn(),
    setLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => navState.pathname }));
vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    return {
        ...actual,
        FEATURE_FLAGS: {
            ...actual.FEATURE_FLAGS,
            enablePaidMediaLivepeerV1: true,
            get publicTestnetVideoV1() { return navState.publicTestnetVideoV1; },
        },
    };
});
vi.mock('@/components/providers/WalletProvider', () => ({
    useWallet: () => ({ accountId: navState.accountId, connect: navState.connect, isReady: true, signOut: navState.signOut }),
}));
vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryKey: string[] }) => options.queryKey[0] === 'publicTestnetBetaState' ? navState.beta : navState.balance,
}));
vi.mock('@/lib/i18n/I18nProvider', async () => {
    const { messages } = await import('@/lib/i18n/messages');
    return { useMessages: () => messages.en, useLocale: () => 'en', setLocale: navState.setLocale };
});

import { Navbar } from '@/components/Navbar';
import { AccountMenuContent } from '@/components/shell/AccountMenu';
import { MobileTabBar } from '@/components/shell/MobileTabBar';
import { NAV_ITEMS, isNavItemActive, usesAppShell } from '@/components/shell/nav';
import { PublicTestnetBetaBanner } from '@/components/PublicTestnetBetaBanner';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { EmptyState, LoadErrorState, NotFoundState, StorageUnavailableState } from '@/components/states/states';

type Clickable = React.ReactElement<{ onClick?: () => void; children?: React.ReactNode; 'aria-label'?: string }>;

/** Calls the component as a function with React hooks stubbed, then collects clickable elements. */
async function clickablesOf(component: () => React.ReactNode): Promise<Clickable[]> {
    const react = await import('react');
    const spies = [
        vi.spyOn(react.default, 'useSyncExternalStore').mockImplementation((_subscribe, _get, server) => server!()),
    ];
    try {
        const found: Clickable[] = [];
        const visit = (node: React.ReactNode) => React.Children.forEach(node, (child) => {
            if (!React.isValidElement<{ onClick?: () => void; children?: React.ReactNode }>(child)) return;
            if (child.props.onClick) found.push(child as Clickable);
            visit(child.props.children);
        });
        visit(component());
        return found;
    } finally {
        spies.forEach((spy) => spy.mockRestore());
    }
}

const anchor = (html: string, href: string) => (html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`, 'g')) ?? []).join('\n');

const label = (element: Clickable) => element.props['aria-label'] ?? (typeof element.props.children === 'string'
    ? element.props.children
    : React.Children.toArray(element.props.children).filter((child) => typeof child === 'string').join(''));

describe('app shell navigation', () => {
    afterEach(() => {
        Object.assign(navState, { pathname: '/', accountId: 'creator.testnet', publicTestnetVideoV1: false,
            balance: { data: undefined, isError: false } });
        vi.clearAllMocks();
    });

    it('lists only routes that exist and marks the active one', () => {
        expect(NAV_ITEMS.map((item) => item.key)).toEqual(['discover', 'tickets', 'studio']);
        const html = renderToStaticMarkup(React.createElement(Navbar));
        expect(html).toContain('aria-label="Main navigation"');
        expect(anchor(html, '/')).toContain('aria-current="page"');
        expect(anchor(html, '/studio')).not.toContain('aria-current');
        expect(html).not.toContain('href="/tickets"');
        expect(html).toContain('aria-label="Account menu: creator.testnet"');
        expect(html).toContain('aria-label="Language: English. Switch to Türkçe"');
    });

    it('treats nested studio and screening paths as active', () => {
        const studio = NAV_ITEMS.find((item) => item.key === 'studio')!;
        expect(isNavItemActive(studio, '/studio')).toBe(true);
        expect(isNavItemActive(studio, '/studio/new')).toBe(true);
        expect(isNavItemActive(studio, '/studios')).toBe(false);
        expect(isNavItemActive(NAV_ITEMS[0], '/s/job-1')).toBe(true);
        expect(isNavItemActive(NAV_ITEMS[0], '/studio')).toBe(false);
    });

    it('keeps the landing header for visitors and the app shell elsewhere', () => {
        // The runtime is open in this suite, so `/` is Discover and the introduction lives at /creators.
        expect(usesAppShell('/', null)).toBe(true);
        expect(usesAppShell('/creators', null)).toBe(false);
        expect(usesAppShell('/tr', null)).toBe(false);
        expect(usesAppShell('/creators', 'a.testnet')).toBe(true);
        Object.assign(navState, { pathname: '/creators', accountId: null });
        expect(renderToStaticMarkup(React.createElement(Navbar))).not.toContain('Main navigation');
        expect(renderToStaticMarkup(React.createElement(MobileTabBar))).toBe('');
    });

    it('shows Connect instead of the account menu without a wallet', () => {
        navState.accountId = null;
        const html = renderToStaticMarkup(React.createElement(Navbar));
        expect(html).toContain('>Connect</button>');
        expect(html).not.toContain('Account menu');
    });

    it('renders the mobile tab bar with an account tab and a spacer', () => {
        const html = renderToStaticMarkup(React.createElement(MobileTabBar));
        expect(html).toContain('md:hidden');
        expect(anchor(html, '/')).toContain('aria-current="page"');
        expect(html).toContain('href="/studio"');
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).toContain('>Account</button>');
    });
});

describe('account menu', () => {
    afterEach(() => {
        Object.assign(navState, { accountId: 'creator.testnet', publicTestnetVideoV1: false, balance: { data: undefined, isError: false } });
        vi.clearAllMocks();
    });

    it.each([false, true])('separates account switch and disconnect when switching is %s', async (switching) => {
        navState.publicTestnetVideoV1 = switching;
        const buttons = await clickablesOf(() => AccountMenuContent({}));
        const switches = buttons.filter((button) => label(button) === 'Switch account');
        const disconnects = buttons.filter((button) => label(button) === 'Disconnect');
        expect(switches).toHaveLength(switching ? 1 : 0);
        expect(disconnects).toHaveLength(1);
        switches.forEach((button) => button.props.onClick!());
        expect(navState.connect).toHaveBeenCalledTimes(switches.length);
        expect(navState.signOut).not.toHaveBeenCalled();
        disconnects[0].props.onClick!();
        expect(navState.signOut).toHaveBeenCalledOnce();
    });

    it('switches the language from the menu', async () => {
        const buttons = await clickablesOf(() => AccountMenuContent({}));
        buttons.find((button) => label(button) === 'Language: English. Switch to Türkçe')!.props.onClick!();
        expect(navState.setLocale).toHaveBeenCalledWith('tr');
    });

    it.each([
        [{ data: undefined, isError: false }, 'Checking balance…'],
        [{ data: undefined, isError: true }, 'Balance unavailable'],
        [{ data: { usdcBalance: '24500000', nearBalanceYocto: '2000000000000000000000000' }, isError: false }, '24.5 USDC · 2 NEAR'],
    ])('shows the balance state', (balance, text) => {
        navState.balance = balance;
        expect(renderToStaticMarkup(React.createElement(AccountMenuContent, {}))).toContain(text);
    });

    it('offers only connect, language and legal links without a wallet', () => {
        navState.accountId = null;
        const html = renderToStaticMarkup(React.createElement(AccountMenuContent, {}));
        expect(html).toContain('Connecting is free; no payment is started.');
        expect(html).not.toContain('Disconnect');
        expect(html).not.toContain('Balance');
        expect(html).toContain('href="/terms"');
    });
});

describe('testnet strip', () => {
    afterEach(() => {
        Object.assign(navState, { publicTestnetVideoV1: false, beta: { data: undefined, isLoading: false, dataUpdatedAt: 0 } });
    });

    it('keeps the warning and the public limits visible', () => {
        navState.publicTestnetVideoV1 = true;
        const html = renderToStaticMarkup(React.createElement(PublicTestnetBetaBanner));
        expect(html).toContain('Public Testnet');
        expect(html).toContain('test tokens have no real value');
        expect(html).toContain('5 GB/file');
        expect(html).not.toContain('hidden');
    });

    it.each([
        [{ ends_at_ms: String(3 * 86_400_000), closed_at_ms: null }, '3 days remaining'],
        [{ ends_at_ms: '1', closed_at_ms: null }, '· closed'],
        [{ ends_at_ms: '1', closed_at_ms: '1' }, '· closed'],
    ])('shows beta time %j', (data, text) => {
        navState.beta = { data, isLoading: false, dataUpdatedAt: 10 };
        const html = renderToStaticMarkup(React.createElement(PublicTestnetBetaBanner));
        expect(html).toContain('Testnet Beta');
        expect(html).toContain(text);
        expect(html).not.toContain('closed remaining');
    });
});

describe('state screens', () => {
    const html = (element: React.ReactElement) => renderToStaticMarkup(element);

    it('announces neutral states politely and failures assertively', () => {
        expect(html(React.createElement(RuntimeClosed))).toMatch(/role="status"[\s\S]*Publishing is not open yet[\s\S]*No payment is taken/);
        expect(html(React.createElement(EmptyState))).toContain('Nothing on the programme yet');
        const loadError = html(React.createElement(LoadErrorState, { onRetry: vi.fn() }));
        expect(loadError).toContain('role="alert"');
        expect(loadError).toContain('Your tickets and balance are not affected.');
        expect(loadError).toContain('>Try again</button>');
        expect(html(React.createElement(NotFoundState))).toContain('href="/discover"');
        expect(html(React.createElement(StorageUnavailableState, { onCheckAgain: vi.fn() }))).toContain('Secure storage needed');
    });
});
