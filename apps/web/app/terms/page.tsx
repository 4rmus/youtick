import Link from 'next/link';
import { PageShell } from '@/components/PageShell';

export default function TermsPage() {
    return (
        <PageShell className="max-w-3xl space-y-6 text-zinc-300">
            <h1 className="text-3xl font-bold text-white">Terms</h1>
            <p>You must own or control the rights required to upload and sell a video. Prohibited or infringing publications may be suspended or taken down.</p>
            <p>Publishing and ticket purchases use NEAR transactions and USDC. Blockchain transactions may be irreversible and network fees may apply.</p>
            <p>Livepeer processes and delivers published video. Availability depends on the approved release configuration and provider operation.</p>
            <p>This repository cleanup does not activate a production service. Final production terms require legal-owner approval before deployment.</p>
            <Link href="/" className="inline-block text-emerald-300">Back home</Link>
        </PageShell>
    );
}
