import { PageShell } from '@/components/PageShell';
import { MyTickets } from '@/components/v2/MyTickets';

export const metadata = { title: 'My tickets', robots: { index: false, follow: false } };

export default function TicketsPage() {
    return <PageShell><MyTickets /></PageShell>;
}
