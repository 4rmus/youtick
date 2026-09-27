import { notFound } from 'next/navigation';
import { productSessionSettings } from '@/lib/near-auth-session-settings';

export const metadata = { title: 'Giriş', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default function AuthCallbackPage() {
    if (!productSessionSettings()) notFound();
    return <p role="status" className="p-6">Girişiniz doğrulanıyor…</p>;
}
