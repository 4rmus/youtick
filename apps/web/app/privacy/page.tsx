import Link from 'next/link';
import { PageShell } from '@/components/PageShell';

export default function PrivacyPage() {
    return (
        <PageShell className="max-w-3xl space-y-6 text-zinc-300">
            <h1 className="text-3xl font-bold text-white">Privacy</h1>
            <p>YouTick uses your connected NEAR account to authorize publishing, purchases and playback. Wallet identifiers and public contract activity are visible on NEAR.</p>
            <p>Video source files are uploaded directly from your browser to Livepeer for transcoding, storage and protected HLS delivery. YouTick&apos;s web application and control Worker do not receive the video body.</p>
            <p>Short-lived playback credentials and resource-bound session grants are used to request protected playback. Playback credentials are kept in memory and are not stored in browser storage.</p>
            <p>Operational providers may process request metadata needed to run the service. Final production terms require legal-owner approval before deployment.</p>
            <Link href="/" className="inline-block text-emerald-300">Back home</Link>
        </PageShell>
    );
}
