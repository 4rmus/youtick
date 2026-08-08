import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/constants', () => ({ FEATURE_FLAGS: { enablePaidMediaLivepeerV1: true } }));
vi.mock('@/components/providers/WalletProvider', () => ({
    useWallet: () => ({
        accountId: 'creator.testnet',
        connect: vi.fn(),
        isReady: true,
        signOut: vi.fn(),
    }),
}));

import { Navbar } from '@/components/Navbar';

describe('Navbar', () => {
    it('shows app links and the connected account on the landing page', () => {
        const html = renderToStaticMarkup(React.createElement(Navbar));

        expect(html).toContain('href="/discover"');
        expect(html).toContain('href="/profile"');
        expect(html).toContain('creator.testnet');
    });
});
