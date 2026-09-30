import Link from 'next/link';
import { PageShell } from '@/components/PageShell';

export default function PrivacyPage() {
    return (
        <PageShell className="max-w-3xl space-y-6 text-light-2">
            <h1 className="text-3xl font-bold text-white">Privacy</h1>
            <p>This notice describes the wallet-based V1 testnet pilot. It does not cover a future Google / passkey login or card payment service. The final data notice must be completed before collecting personal data in a public pilot.</p>
            <p>YOUTICK LTD operates YouTick and is the data controller for YouTick&apos;s processing described in this notice. For privacy questions and data-rights requests, contact <a className="text-light underline underline-offset-4 hover:text-ice" href="mailto:contact@youtick.net">contact@youtick.net</a>.</p>
            <h2 className="text-xl font-semibold text-white">Account, media and public activity</h2>
            <p>YouTick uses your connected NEAR account for publishing, ticket purchases, recovery and playback access. Wallet identifiers, transaction details and contract activity are public on NEAR. Clearing browser data does not delete public blockchain records.</p>
            <p>Source video goes directly from your browser to Livepeer for processing, storage and protected delivery. The web application and Bridge do not receive the video body. The Bridge can serve a public first-frame cover image after checking the publication. Keep the permissions needed to publish people&apos;s images, voices and other content.</p>
            <h2 className="text-xl font-semibold text-white">Browser storage</h2>
            <p>IndexedDB holds playback device keys and certificates, authorization information and saved watch progress. localStorage holds public-testnet upload drafts, upload bookmarks and some preferences; sessionStorage holds upload job keys, recovery evidence and legacy drafts. These records support account access and recovery across reloads; they are separate from short-lived playback tokens.</p>
            <p>Playback tokens are kept in memory. This does not mean the browser stores no keys or identifiers. Clearing local records may lose device or upload recovery information; save your original source file and check pending operations before clearing data.</p>
            <h2 className="text-xl font-semibold text-white">Service providers and unresolved details</h2>
            <p>Your selected wallet and NEAR RPC services handle wallet and chain requests. Cloudflare hosts the web and control services; Livepeer handles media. The Bridge retains job, recovery and control records, and hosting providers may retain operational request logs. If the derived catalogue is enabled, it stores publication and activity data read from NEAR. These services may receive account, job and request metadata, including network information needed to deliver requests. Any enabled payment conversion provider needs a separate description before use.</p>
            <p>The video player may send playback/session identifiers and playback/device diagnostics to Livepeer. Local console measurements are separate. This notice does not promise that all analytics stay on your device.</p>
            <p>The legal basis for each purpose, provider roles and agreements, retention periods, international transfers, and applicable access, correction, deletion and complaint procedures remain to be finalized before collecting personal data. No fixed retention period or storage location is promised here.</p>
            <p>Questions or data-rights requests: <a className="text-light underline underline-offset-4 hover:text-ice" href="mailto:contact@youtick.net">contact@youtick.net</a>. We will explain what can be addressed in YouTick&apos;s records and what remains on a public blockchain or with another provider.</p>
            <Link href="/" className="inline-flex min-h-11 items-center text-light underline underline-offset-4 hover:text-ice">Back home</Link>
        </PageShell>
    );
}
