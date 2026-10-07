import { PageShell } from '@/components/PageShell';
import { InviteAccept } from '@/components/v2/InviteAccept';

export const metadata = { title: 'Invite', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
    const { code } = await searchParams;
    return <PageShell className="flex items-center justify-center"><InviteAccept code={typeof code === 'string' ? code : null} /></PageShell>;
}
