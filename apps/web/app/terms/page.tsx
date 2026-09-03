import Link from 'next/link';
import { PageShell } from '@/components/PageShell';

export default function TermsPage() {
    return (
        <PageShell className="max-w-3xl space-y-6 text-zinc-300">
            <h1 className="text-3xl font-bold text-white">Terms</h1>
            <p>You must own or control the rights required to upload and sell a video. Prohibited or infringing publications may be suspended or taken down.</p>
            <p>Publishing and ticket purchases use NEAR transactions and USDC. Blockchain transactions may be irreversible and network fees may apply.</p>
            <p>Livepeer processes and delivers published video. Availability depends on the approved release configuration and provider operation.</p>
            <h2 className="text-xl font-semibold text-white">Testnet Beta</h2>
            <p>The 14-day beta uses test tokens with no real value. Upload and sponsor fees are non-refundable. Verified uploads publish automatically; each job expires after 24 hours and new uploads close after day 13.</p>
            <p>You must keep your source file. Infringing or reported content may be taken down, and its exact Livepeer asset may then be deleted. Successfully published assets are not deleted merely because the beta ends.</p>
            <p>Beta operations and emergency closure are owned by @4rmus. Report abuse to <a className="text-emerald-300" href="mailto:abuse@youtick.net">abuse@youtick.net</a>.</p>
            <p>This repository cleanup does not activate a production service. Final production terms require legal-owner approval before deployment.</p>
            <Link href="/" className="inline-block text-emerald-300">Back home</Link>
        </PageShell>
    );
}
