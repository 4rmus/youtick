import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navState = vi.hoisted(() => ({ publicTestnetVideoV1: false, menuOpen: false, pathname: '/', accountId: 'creator.testnet' as string | null, connect: vi.fn(), signOut: vi.fn() }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [navState.menuOpen, vi.fn()] }));

vi.mock('next/navigation', () => ({ usePathname: () => navState.pathname }));
vi.mock('@/lib/constants', () => ({ LAUNCH_STAGE: 'prova', FEATURE_FLAGS: { enablePaidMediaLivepeerV1: true, get publicTestnetVideoV1() { return navState.publicTestnetVideoV1; } } }));
vi.mock('@/components/providers/WalletProvider', () => ({
    useWallet: () => ({
        accountId: navState.accountId,
        connect: navState.connect,
        isReady: true,
        signOut: navState.signOut,
    }),
}));

import { Navbar } from '@/components/Navbar';

describe('Navbar', () => {
    afterEach(() => {
        navState.publicTestnetVideoV1 = false; navState.menuOpen = false; navState.pathname = '/'; navState.accountId = 'creator.testnet';
        vi.clearAllMocks();
    });

    it.each([false, true])('separates account switch and disconnect with mobile menu=%s', mobile => {
        navState.publicTestnetVideoV1 = true;
        navState.menuOpen = mobile;
        const tree = Navbar();
        const buttons: Array<React.ReactElement<{ onClick?: () => void; 'aria-label'?: string; children?: React.ReactNode }>> = [];
        function visit(node: React.ReactNode) {
            React.Children.forEach(node, child => {
                if (!React.isValidElement<{ onClick?: () => void; 'aria-label'?: string; children?: React.ReactNode }>(child)) return;
                if (child.props.onClick) buttons.push(child);
                visit(child.props.children);
            });
        }
        visit(tree);
        const switches = buttons.filter(button => button.props['aria-label'] === 'Switch account' || button.props.children === 'Switch account');
        expect(switches).toHaveLength(mobile ? 2 : 1);
        switches.forEach(button => button.props.onClick!());
        expect(navState.connect).toHaveBeenCalledTimes(switches.length);
        expect(navState.signOut).not.toHaveBeenCalled();
        const html = renderToStaticMarkup(React.createElement(Navbar));
        expect(html).toContain('Switch account');
        expect(html).toContain('aria-label="Disconnect"');
    });

    it('shows app links and the connected account on the landing page', () => {
        const html = renderToStaticMarkup(React.createElement(Navbar));

        expect(html).toContain('href="/discover"');
        expect(html).toContain('href="/profile"');
        expect(html).toContain('creator.testnet');
    });

    it.each([
        ['/privacy', 'en', '/notify', 'Notify me when it opens', '/#programme'],
        ['/report', 'en', '/notify', 'Notify me when it opens', '/#box-office'],
        ['/tr/notify', 'tr', '/tr/notify', 'Açılıştan haberdar ol', '/tr#programme'],
    ])('gives the public page %s the landing navigation in %s', (pathname, _locale, notify, label, section) => {
        navState.pathname = pathname;
        navState.accountId = null;
        const html = renderToStaticMarkup(React.createElement(Navbar));
        expect(html).toContain(`href="${notify}"`);
        expect(html).toContain(label);
        expect(html).toContain(`href="${section}"`);
        expect(html).not.toContain('href="/discover"');
        expect(html).not.toContain('href="/upload"');
        expect(html).not.toMatch(/invited creators|davetli/i);
    });
});
