'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';

const LINKS = [
    { href: '/discover', label: 'Discover' },
    { href: '/upload', label: 'Upload' },
    { href: '/profile', label: 'Profile' },
];

export function Navbar() {
    const pathname = usePathname();
    const { accountId, connect, isReady, signOut } = useWallet();
    return (
        <nav className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur">
            <div className="container mx-auto flex min-h-16 flex-wrap items-center justify-between gap-4 px-4 py-2">
                <Link href="/" className="font-bold tracking-tight">YouTick</Link>
                <div className="flex items-center gap-4">
                    {LINKS.map((link) => (
                        <Link key={link.href} href={link.href} className={pathname === link.href ? 'text-sm text-emerald-300' : 'text-sm text-zinc-400 hover:text-white'}>
                            {link.label}
                        </Link>
                    ))}
                    {accountId ? (
                        <Button variant="outline" size="sm" onClick={() => void signOut()}>Disconnect</Button>
                    ) : (
                        <Button size="sm" disabled={!isReady} onClick={() => void connect()}>Connect</Button>
                    )}
                </div>
            </div>
        </nav>
    );
}
