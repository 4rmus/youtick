import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navState = vi.hoisted(() => ({ publicTestnetVideoV1: false, menuOpen: false, connect: vi.fn(), signOut: vi.fn() }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [navState.menuOpen, vi.fn()] }));

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/constants', () => ({ FEATURE_FLAGS: { enablePaidMediaLivepeerV1: true, get publicTestnetVideoV1() { return navState.publicTestnetVideoV1; } } }));
vi.mock('@/components/providers/WalletProvider', () => ({
    useWallet: () => ({
        accountId: 'creator.testnet',
        connect: navState.connect,
        isReady: true,
        signOut: navState.signOut,
    }),
}));

import { Navbar } from '@/components/Navbar';

describe('Navbar', () => {
    afterEach(() => { navState.publicTestnetVideoV1 = false; navState.menuOpen = false; vi.clearAllMocks(); });

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
});
