import { PageShell } from '@/components/PageShell';
import { BuyTicket } from '@/components/v2/BuyTicket';

export const metadata = { title: 'Buy a ticket', robots: { index: false, follow: false } };

export default async function BuyTicketPage({ searchParams }: { searchParams: Promise<{ publication?: string | string[] }> }) {
    const { publication } = await searchParams;
    return <PageShell><BuyTicket publicationId={typeof publication === 'string' ? publication : null} /></PageShell>;
}
