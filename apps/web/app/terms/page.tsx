import Link from 'next/link';
import { FEATURE_FLAGS, NEAR_CONFIG } from '@/lib/constants';
import { PageShell } from '@/components/PageShell';

export default function TermsPage() {
    return (
        <PageShell className="max-w-3xl space-y-6 text-zinc-300">
            <h1 className="text-3xl font-bold text-white">Terms</h1>
            <p>You must own or control the rights required to upload and sell a video. Prohibited or infringing publications may be suspended or taken down.</p>
            <p>Publishing and ticket purchases use NEAR transactions and USDC. Blockchain transactions may be irreversible and network fees may apply.</p>
            <p>Livepeer processes and delivers published video. Availability depends on the approved release configuration and provider operation.</p>
            <h2 className="text-xl font-semibold text-white">{FEATURE_FLAGS.publicTestnetVideoV1 ? 'Public Testnet' : 'Testnet Beta'}</h2>
            {FEATURE_FLAGS.publicTestnetVideoV1 ? (
                <>
                    <p>Test tokens have no real value. Upload and sponsor fees are non-refundable. Files can be up to 5 GB; each account can start two uploads per UTC day with one active upload at a time. There are ten active upload slots overall.</p>
                    <p>Your video must publish within 24 hours of the accepted payment. Resuming does not extend this deadline. A video published in time remains watchable after the deadline.</p>
                    <p id="test-tokens">For network fees, get free <a className="underline" href="https://docs.near.org/getting-started/faucet" target="_blank" rel="noreferrer">test NEAR</a>. For uploads and tickets, open the <a className="underline" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Circle faucet</a>, select USDC and Near Testnet, and enter your connected wallet account. Return to the upload page and check payment options again.</p>
                    <p className="break-all text-sm">Accepted test USDC contract: {NEAR_CONFIG.usdcContractId}. Tokens with a different contract cannot pay for uploads or tickets. Faucet availability and request limits are controlled by the faucet.</p>
                </>
            ) : <p>The 14-day beta uses test tokens with no real value. Upload and sponsor fees are non-refundable. Verified uploads publish automatically; each job expires after 24 hours and new uploads close after day 13.</p>}
            <p>You must keep your source file. Infringing or reported content may be taken down, and its exact Livepeer asset may then be deleted. Successfully published assets are not deleted merely because the beta ends.</p>
            <p>Beta operations and emergency closure are owned by @4rmus. Report abuse to <a className="text-emerald-300" href="mailto:abuse@youtick.net">abuse@youtick.net</a>.</p>
            <p>This repository cleanup does not activate a production service. Final production terms require legal-owner approval before deployment.</p>
            <Link href="/" className="inline-block text-emerald-300">Back home</Link>
        </PageShell>
    );
}
