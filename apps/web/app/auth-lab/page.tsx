import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NearAuthLab } from '@/components/NearAuthLab';
import { nearAuthLabEnabled } from '@/lib/near-auth-lab';

export const metadata: Metadata = {
    title: 'Giriş denemesi',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
};

export default function NearAuthLabPage() {
    if (!nearAuthLabEnabled(process.env.NODE_ENV, process.env.NEAR_AUTH_LAB_ENABLED, process.env.NEXT_PUBLIC_NEAR_NETWORK)) {
        notFound();
    }
    const clientId = process.env.NEAR_AUTH_LAB_CLIENT_ID?.trim() || '';
    const sessionConfigured = /^[a-f0-9]{64}$/.test(process.env.NEAR_AUTH_LAB_SESSION_SECRET || '');
    return <NearAuthLab clientId={sessionConfigured && /^[A-Za-z0-9_-]{1,128}$/.test(clientId) ? clientId : null} />;
}
