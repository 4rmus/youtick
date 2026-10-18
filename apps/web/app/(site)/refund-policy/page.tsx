import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { LegalDraftNotice } from '@/components/legal/LegalDraftNotice';
import { CANCELLATION_DAYS, COMPANY, REFUND_ANSWER_HOURS, USDC_REFUND_WINDOW_DAYS } from '@/components/legal/legal-facts';

export const metadata: Metadata = {
    title: 'Refund policy',
    description: 'When a youtick ticket can be refunded, for card and USDC payments.',
    alternates: { canonical: '/refund-policy' },
};

const link = 'text-emerald-300 underline-offset-2 hover:underline';

export default function RefundPolicyPage() {
    return (
        <PageShell className="max-w-3xl space-y-8 text-zinc-300">
            <header className="space-y-4">
                <h1 className="text-3xl font-bold text-white">Refund policy</h1>
                <LegalDraftNotice />
                <p>This policy explains when a youtick ticket can be refunded. It is part of the <Link className={link} href="/terms">terms</Link>. It does not affect your statutory rights as a consumer.</p>
            </header>

            <section id="instant-access" className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Immediate access and your right to cancel</h2>
                <p>A ticket gives you digital content. When you buy, you have a {CANCELLATION_DAYS}-day right to cancel. At checkout we ask you to tick a box to request that the video is made available to you immediately and to acknowledge that this right ends once you start playback. Without that box ticked, you cannot buy.</p>
                <p>So, until you start playback, you can cancel within {CANCELLATION_DAYS} days of purchase for any reason. Once playback has started, you can no longer cancel because you changed your mind, but you keep your rights if the video is faulty or not as described.</p>
            </section>

            <section id="card" className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Tickets paid by card</h2>
                <p>Card payments are processed by our payment partner Cleeng, which sells the ticket to you as reseller (merchant of record). Refunds of card payments follow Cleeng&apos;s standard refund policy, which covers technical problems such as a video that does not play. Cleeng returns the money to the card you paid with.</p>
                <p>To ask for a refund, write to <a className={link} href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a> with your ticket code and what went wrong. We pass the request to Cleeng. When a card payment is refunded, the ticket stops working.</p>
            </section>

            <section id="usdc" className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Tickets paid with USDC</h2>
                <p>When you pay with USDC, the price stays held for {USDC_REFUND_WINDOW_DAYS} days before it is paid out. During that time:</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><strong className="text-white">A ticket you have not played</strong> can be refunded through youtick.</li>
                    <li><strong className="text-white">A ticket you have played</strong> can be refunded if the video did not play properly or was not as described. A change of mind is not refunded.</li>
                </ul>
                <p>Ask from <Link className={link} href="/tickets">My tickets</Link> within 27 days of purchase, so that we can answer within {REFUND_ANSWER_HOURS} hours and inside the {USDC_REFUND_WINDOW_DAYS}-day period. An approved refund returns the full price to your youtick balance; only your own account can receive it.</p>
            </section>

            <section id="takedown" className="space-y-3">
                <h2 className="text-xl font-semibold text-white">If a video is taken down</h2>
                <p>If we take a video down, access ends for every ticket. Tickets that were never played are refunded, whichever way you paid. Tickets that were already played are not refunded, because the video was supplied; this does not affect your rights if the video was faulty or not as described.</p>
            </section>

            <section id="contact" className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Questions and complaints</h2>
                <p>Write to <a className={link} href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>. youtick is operated by {COMPANY.name}, registered in {COMPANY.jurisdiction} under company number {COMPANY.companyNumber}.</p>
            </section>

            <Link href="/" className="inline-block text-emerald-300">Back home</Link>
        </PageShell>
    );
}
