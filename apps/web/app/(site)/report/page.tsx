import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { COMPANY } from '@/components/legal/legal-facts';
import { ContentReportForm } from './ContentReportForm';
import { contentReportSiteKey } from './site-key';

export const metadata: Metadata = {
    title: 'Report content',
    description: 'How rights holders and viewers can ask youtick to review or take down a video.',
    alternates: { canonical: '/report' },
};

const link = 'text-emerald-300 underline-offset-2 hover:underline';

export default function ReportPage() {
    return (
        <PageShell className="max-w-2xl space-y-8 text-zinc-300">
            <header className="space-y-4">
                <h1 className="text-3xl font-bold text-white">Report content</h1>
                <p>Use this page to ask us to review a video or a creator page on youtick, or to take it down. A person reads every report.</p>
                <p className="text-sm text-zinc-400">If someone is in immediate danger, contact the police first. Child sexual abuse material can also be reported to the Internet Watch Foundation at <a className={link} href="https://report.iwf.org.uk/" target="_blank" rel="noreferrer">report.iwf.org.uk</a>.</p>
            </header>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Who can report</h2>
                <ul className="list-disc space-y-2 pl-5">
                    <li><strong className="text-white">Rights holders</strong>, or someone acting for them, when a video uses their work, trade mark, image or voice without permission.</li>
                    <li><strong className="text-white">Viewers and anyone else</strong>, when content looks illegal, harmful, abusive, publishes someone&apos;s personal data, or is not what the ticket described.</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">What to include</h2>
                <ul className="list-disc space-y-2 pl-5">
                    <li>a link to the content on youtick and, for a video, the time in the video;</li>
                    <li>what is wrong and why you think it is not allowed under our <Link className={link} href="/terms#creators">terms</Link> or the law;</li>
                    <li>for a rights claim: the work or right concerned, a link to the original if there is one, and whom you act for if you are an agent;</li>
                    <li>your name and an email address where we can reach you.</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">What happens next</h2>
                <ul className="list-disc space-y-2 pl-5">
                    <li>We review the report and may ask you for more information.</li>
                    <li>If the content appears to break our terms or the law, we may stop its sales or take it down. Removal from our video provider is a separate step and may not be immediate.</li>
                    <li>We may tell the creator what the report says so that they can respond. We do not give them your email address unless you agree or the law requires it.</li>
                    <li>We tell you by email what we decided. Ticket holders of a video that is taken down are refunded as set out in the <Link className={link} href="/refund-policy#takedown">refund policy</Link>.</li>
                </ul>
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Send a report</h2>
                <ContentReportForm siteKey={contentReportSiteKey()} />
                <p className="text-xs leading-relaxed text-zinc-500">The report is sent as an email to the youtick inbox; the web service does not keep a copy. Cloudflare delivers the email and runs the security check that protects this form, and receives your network address for that check and for rate limiting. We use your details only to handle the report. {COMPANY.name} is the controller; see the <Link className={link} href="/privacy">privacy notice</Link> for your rights. You can also email <a className={link} href={`mailto:${COMPANY.reportsEmail}`}>{COMPANY.reportsEmail}</a>.</p>
            </section>
        </PageShell>
    );
}
