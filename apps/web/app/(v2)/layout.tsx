import { notFound } from 'next/navigation';
import { NearAuthV2Provider } from '@/components/v2/NearAuthV2Provider';
import { v2Config } from '@/lib/v2/config';

// V2 pages exist only when NEAR Auth and every V2 endpoint are configured.
export default function V2Layout({ children }: { children: React.ReactNode }) {
    if (!v2Config()) notFound();
    return <NearAuthV2Provider>{children}</NearAuthV2Provider>;
}
