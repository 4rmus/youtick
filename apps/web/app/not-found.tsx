import { PageShell } from '@/components/PageShell';
import { NotFoundState } from '@/components/states/states';

export default function NotFound() {
    return <PageShell><NotFoundState backHref="/" /></PageShell>;
}
