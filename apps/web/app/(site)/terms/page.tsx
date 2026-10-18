import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { LegalDraftNotice } from '@/components/legal/LegalDraftNotice';
import { CANCELLATION_DAYS, COMPANY, TICKET_DEVICE_LIMIT, USDC_REFUND_WINDOW_DAYS } from '@/components/legal/legal-facts';

export const metadata: Metadata = {
    title: 'Terms',
    description: 'Terms for buying and watching tickets on youtick, and for creators who release their work.',
    alternates: { canonical: '/terms' },
};

const link = 'text-emerald-300 underline-offset-2 hover:underline';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return <section id={id} className="space-y-3">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {children}
    </section>;
}

export default function TermsPage() {
    return (
        <PageShell className="max-w-3xl space-y-8 text-zinc-300">
            <header className="space-y-4">
                <h1 className="text-3xl font-bold text-white">Terms</h1>
                <LegalDraftNotice />
                <p>These terms apply when you buy a ticket on youtick, watch with it, or release your work on youtick. Please read them with the <Link className={link} href="/refund-policy">refund policy</Link> and the <Link className={link} href="/privacy">privacy notice</Link>.</p>
            </header>

            <Section id="who-we-are" title="1. Who we are">
                <p>youtick is operated by {COMPANY.name}, a company registered in {COMPANY.jurisdiction} under company number {COMPANY.companyNumber}, with its registered office as shown on the Companies House register. {COMPANY.name} is registered with the UK Information Commissioner&apos;s Office under reference {COMPANY.icoReference}. You can reach us at <a className={link} href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>.</p>
            </Section>

            <Section id="licence" title="2. How youtick sells access">
                <p>Creators keep the rights in their work. A creator who releases a video on youtick grants {COMPANY.name} a licence to make that video available to ticket holders. {COMPANY.name} sells access to the video in its own name; the creator is paid under their agreement with us.</p>
                <p>When you pay by card, our payment partner Cleeng processes the payment as reseller (merchant of record) and its own terms apply to the payment. When you pay with USDC, you buy from {COMPANY.name} directly.</p>
            </Section>

            <Section id="ticket" title="3. What a ticket is">
                <p>A ticket is a personal right to watch one video on youtick. It does not transfer any rights in the video, and it gives you no right to copy, download, broadcast or show the video in public.</p>
                <p>A ticket is not a tradable token. There is no market for tickets and you cannot sell, resell, lend or transfer one. A ticket is recorded on the NEAR blockchain so that its status can be checked, but that record does not make it an asset you can trade.</p>
                <p>You can link one ticket to up to {TICKET_DEVICE_LIMIT} devices at a time. A ticket does not expire: you can watch the video as often as you like for as long as it is available on youtick. Access can end earlier only as described in section 5.</p>
            </Section>

            <Section id="buying" title="4. Buying and watching">
                <p>Prices are shown before you pay and include VAT where it applies. The video is supplied as digital content as soon as you start playback. At checkout you are asked to agree to immediate supply and to acknowledge that your {CANCELLATION_DAYS}-day right to cancel ends once playback starts. Until you start playback, the cancellation right is not affected.</p>
                <p>Playback needs a working internet connection and a supported browser. Each video shows a short ticket code on the screen while it plays.</p>
            </Section>

            <Section id="takedown" title="5. Takedown">
                <p>We may stop selling a video or take it down if it breaks these terms, if a rights holder or a court asks us to and the request appears valid, or if the law requires it. Anyone can ask us to review a video through the <Link className={link} href="/report">content report page</Link>.</p>
                <p>When a video is taken down, access ends for every ticket. Tickets that were never played are refunded. Tickets that were already played are not refunded, because the video was supplied; this does not affect your rights if the video was faulty.</p>
            </Section>

            <Section id="refunds" title="6. Refunds">
                <p>The <Link className={link} href="/refund-policy">refund policy</Link> sets out the rules for each payment method. In short:</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><strong className="text-white">Card payments</strong> follow Cleeng&apos;s standard refund policy, which covers technical problems such as a video that does not play.</li>
                    <li><strong className="text-white">USDC payments:</strong> a ticket you have not played can be refunded through youtick within {USDC_REFUND_WINDOW_DAYS} days of purchase. After playback starts, a refund is for a technical problem or a video that is not as described.</li>
                    <li>A change of mind after playback starts is not refunded.</li>
                </ul>
            </Section>

            <Section id="consumer-rights" title="7. Your statutory rights">
                <p>Nothing in these terms excludes or limits your statutory rights as a consumer, including your rights under the Consumer Rights Act 2015 when digital content is faulty, not as described or not fit for purpose. If anything in these terms conflicts with those rights, your statutory rights prevail.</p>
            </Section>

            <Section id="creators" title="8. Creators and prohibited content">
                <p>If you release a video on youtick, you confirm that you own or control every right needed to grant the licence in section 2, including rights in music, footage and the images and voices of people who appear in it. Keep your original source file: youtick does not keep a backup copy.</p>
                <p>The following content is not allowed on youtick:</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>content that infringes copyright, trade marks or other rights of anyone else;</li>
                    <li>sexual content involving minors, sexually explicit content, and intimate images shared without consent;</li>
                    <li>content that promotes terrorism, violent extremism or serious violence;</li>
                    <li>content that harasses, threatens or incites hatred against people for who they are;</li>
                    <li>content that promotes self-harm or suicide;</li>
                    <li>content that is otherwise illegal in the United Kingdom, including fraud and the sale of illegal goods;</li>
                    <li>personal data of other people published without a lawful basis;</li>
                    <li>content that misleads viewers about what the ticket contains.</li>
                </ul>
                <p>We may stop sales of, or take down, content that breaks this list, and we may close a creator account that does so repeatedly.</p>
            </Section>

            <Section id="liability" title="9. Our responsibility">
                <p>We take reasonable care to keep youtick available, but service providers and networks can fail. We are responsible for loss you suffer that is a foreseeable result of our breaking these terms or failing to use reasonable care and skill. We do not exclude liability where the law does not allow it, such as for death or personal injury caused by negligence, or for fraud.</p>
            </Section>

            <Section id="law" title="10. Governing law and complaints">
                <p>These terms are governed by the law of {COMPANY.jurisdiction}. If you live elsewhere in the United Kingdom, you may also bring proceedings in your local courts, and you keep any mandatory protection of the law of the country where you live.</p>
                <p>Questions or complaints: <a className={link} href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>. Content reports: the <Link className={link} href="/report">content report page</Link> or <a className={link} href={`mailto:${COMPANY.reportsEmail}`}>{COMPANY.reportsEmail}</a>. Content restrictions and provider removal are separate actions and removal may not be immediate.</p>
            </Section>

            <Section id="v1-pilot" title="V1 wallet pilot on NEAR testnet">
                <p>The earlier wallet-based pilot uses a connected NEAR testnet wallet and test tokens with no real value. It is not a real-money commercial launch. In that pilot youtick operates the publishing, ticket and viewing interface; NEAR records settlement and access rights; Livepeer processes and delivers media. The illustrative pilot fee model allocates 5% of a ticket to youtick and 95% to the creator balance, withdrawn to the creator&apos;s own NEAR wallet. This is not a promise of earnings or bank payout.</p>
                <p>The pilot source-file limit is 5 GB per video; tickets start at 2 test USDC. The upload fee is separate from the ticket price. Your upload must publish within 24 hours of accepted payment; resuming does not extend that deadline. A 30-day device authorization is a device access check, not the duration of your ticket right.</p>
                <p>Completed blockchain operations may be irreversible. The pilot flow does not automatically refund a processed upload or a cancelled job. Returned tokens for a rejected or duplicate transfer follow the protocol; they are not a commercial refund promise. Nothing in this notice excludes applicable statutory consumer rights.</p>
                <p id="test-tokens">Use only test tokens on NEAR testnet. Free <a className="underline" href="https://docs.near.org/getting-started/faucet" target="_blank" rel="noreferrer">test NEAR</a> and <a className="underline" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">test USDC</a> may be available from their respective faucets. If Near Testnet is offered by the Circle faucet, select USDC and that network for your connected testnet account. Availability and request limits are controlled by the providers. Do not send real-money assets for this pilot.</p>
            </Section>

            <Link href="/" className="inline-block text-emerald-300">Back home</Link>
        </PageShell>
    );
}
