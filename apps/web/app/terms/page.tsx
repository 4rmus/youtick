import Link from 'next/link';
import { PageShell } from '@/components/PageShell';

export default function TermsPage() {
    return (
        <PageShell className="max-w-3xl space-y-6 text-light-2">
            <h1 className="text-3xl font-bold text-white">Terms</h1>
            <h2 className="text-xl font-semibold text-white">V1 controlled testnet pilot</h2>
            <p>This pilot uses a connected NEAR testnet wallet and test tokens with no real value. It is not a real-money commercial launch. Google / passkey sign-in, card payments and bank payouts are planned for a later phase and are not available in V1.</p>
            <p>YouTick operates the publishing, ticket and viewing interface and coordinates access checks. NEAR records settlement and access rights; Livepeer processes and delivers media. The illustrative pilot fee model allocates 5% of a ticket to YouTick and 95% to the creator balance, withdrawn to the creator&apos;s own NEAR wallet. This is not a promise of earnings or bank payout.</p>
            <p>You must own or control the rights required to publish your video, including music and participant permissions. Prohibited or infringing publications may be suspended or taken down. Keep your original source file and the information needed to recover an interrupted upload.</p>
            <p>The pilot source-file limit is 5 GB per video; tickets start at 2 test USDC. The upload fee is separate from the ticket price. Review the upload quote and any sponsor fee before approval; test NEAR may be needed for network fees.</p>
            <p>Your upload must publish within 24 hours of accepted payment; resuming does not extend that deadline. Successful publication does not guarantee permanent availability. Provider outages, suspension or takedown may prevent viewing. A 30-day device authorization is a device access check, not the duration of your ticket right or a lifetime availability promise.</p>
            <p>Completed blockchain operations may be irreversible. The current flow does not automatically refund a processed upload or a cancelled job. Returned tokens for a rejected or duplicate transfer follow the protocol; they are not a commercial refund promise. Nothing in this notice excludes applicable statutory consumer rights.</p>
            <p id="test-tokens">Use only test tokens on NEAR testnet. Free <a className="underline" href="https://docs.near.org/getting-started/faucet" target="_blank" rel="noreferrer">test NEAR</a> and <a className="underline" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">test USDC</a> may be available from their respective faucets. If Near Testnet is offered by the Circle faucet, select USDC and that network for your connected testnet account. Availability and request limits are controlled by the providers. Do not send real-money assets for this pilot.</p>
            <p>Commercial seller identity, tax and invoicing duties, cancellation and refund handling, and final commercial terms remain to be confirmed before a real-money launch, including payments from a crypto wallet. The party selling each ticket and handling invoices and refunds must be identified before that launch.</p>
            <p>Questions or complaints: <a className="text-light underline underline-offset-4 hover:text-ice" href="mailto:contact@youtick.net">contact@youtick.net</a>. Content reports: <a className="text-light underline underline-offset-4 hover:text-ice" href="mailto:abuse@youtick.net">abuse@youtick.net</a>. Content restrictions and provider removal are separate actions and removal may not be immediate.</p>
            <Link href="/" className="inline-flex min-h-11 items-center text-light underline underline-offset-4 hover:text-ice">Back home</Link>
        </PageShell>
    );
}
