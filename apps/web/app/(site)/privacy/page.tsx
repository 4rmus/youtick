import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { LegalDraftNotice } from '@/components/legal/LegalDraftNotice';
import { COMPANY } from '@/components/legal/legal-facts';
import { FEATURE_FLAGS } from '@/lib/constants';
import { OPENING_NOTICE_RETENTION_DAYS_AFTER_OPENING } from '@/lib/opening-notice';

export const metadata: Metadata = {
    title: 'Privacy',
    description: 'What personal data youtick processes when you visit, sign in, buy and watch a ticket, release your work, apply, report content or ask to hear when youtick opens.',
    alternates: { canonical: '/privacy' },
};

const link = 'text-emerald-300 underline-offset-2 hover:underline';

/** The V1 wallet pilot notice renders only in the testnet builds that still run that pilot, never in the public launch build. */
const showV1Pilot = FEATURE_FLAGS.publicTestnetVideoV1 || FEATURE_FLAGS.publicTestnetBeta;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return <section id={id} className="space-y-3">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {children}
    </section>;
}

function Contact() {
    return <a className={link} href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>;
}

export default function PrivacyPage() {
    return (
        <PageShell className="max-w-3xl space-y-8 text-zinc-300">
            <header className="space-y-4">
                <h1 className="text-3xl font-bold text-white">Privacy</h1>
                <LegalDraftNotice />
                <p>This notice explains what personal data youtick processes when you visit the site, sign in, buy and watch a ticket, release your work, apply as a creator, report content or ask to hear when youtick opens. Please read it with the <Link className={link} href="/terms">terms</Link>.</p>
            </header>

            <Section id="who-we-are" title="1. Who we are">
                <p>{COMPANY.name} operates youtick and is the data controller for youtick&apos;s processing described in this notice. {COMPANY.name} is registered in {COMPANY.jurisdiction} under company number {COMPANY.companyNumber}. For privacy questions and data-rights requests, contact <Contact />.</p>
                <p>{COMPANY.name} is registered with the UK Information Commissioner&apos;s Office (ICO) as a data protection fee payer under registration reference {COMPANY.icoReference}.</p>
            </Section>

            <Section id="visiting" title="2. Visiting the site">
                <p>Cloudflare hosts youtick and our services. To deliver pages and protect the service, it receives your network (IP) address, browser details and the pages you request. Our pages set no cookies of their own and use no advertising trackers.</p>
                <p>The site still includes a NEAR wallet connector from an earlier version of youtick. When a page loads, it fetches a list of supported wallets from GitHub, or from jsDelivr as a fallback, so those services receive your network address and browser details, and it may keep its own records in your browser&apos;s storage.</p>
                <p>Forms on the site are protected by Cloudflare Turnstile, which receives your network address and browser details to check that a person is sending the form.</p>
            </Section>

            <Section id="sign-in" title="3. Signing in">
                <p>You sign in with your Google account or a passkey through the NEAR Auth sign-in service. We receive a sign-in token that contains an identifier for your account at the sign-in provider (for a Google sign-in, your Google account identifier), a session identifier and the time. The token does not contain your name or email address.</p>
                <p>From that identifier, youtick opens a NEAR account for you and keeps a record that links a one-way hash of your sign-in identity to that account, so that you can sign in again and find your tickets on any device.</p>
                <p><strong className="text-white">Each sign-in is recorded on the NEAR blockchain.</strong> To create the keys that protect your tickets, every sign-in sends your sign-in token to a public NEAR contract. Anyone can read that record: it shows the sign-in provider&apos;s identifier for your account, the session identifier and the time, and it links them to your youtick account on NEAR. Records on a public blockchain cannot be changed or deleted.</p>
                <p>Your signed-in session, the keys that open your tickets and the sign-in token are kept in your browser&apos;s memory only; reloading the page signs you out of youtick. The sign-in service and Google may keep their own sign-in session in your browser until you sign out there.</p>
            </Section>

            <Section id="buying" title="4. Buying a ticket by card">
                <p>When you pay by card, you pay our card payment provider, which sells the ticket to you as reseller (merchant of record). It collects your card details and any billing details on its own payment form, under its own terms and privacy notice. We never see your card number.</p>
                <p>To open the order we send the provider an order number, the screening, the price and your country, which we work out from your network address. We do not send it your name or email address. We keep an order record with the order number, the provider&apos;s order number and a keyed reference to it, the screening and its creator&apos;s account, the ticket identifier and its public key, your browser&apos;s playback key (its public part and certificate hash) with the ticket key&apos;s signature over it, the price, the status, the version of the immediate-access request you ticked and the times. We do not store your country. Our order records and the provider&apos;s records together can link a payment to a screening and to the playback key of the browser you used, and so to other tickets bought in that browser.</p>
                <p>Your ticket is recorded on the NEAR blockchain so that its status can be checked: the ticket identifier, the screening, the price, the payment type, the status, the purchase and first-play times and the devices linked to it. The ticket record holds no name or email address and not your account; it holds the creator&apos;s account, the ticket&apos;s public key and a keyed reference to the card order.</p>
                <p>We count how many people reach each checkout step, using fixed step names without any identifier. Nothing is counted when your browser signals Do Not Track or Global Privacy Control.</p>
            </Section>

            <Section id="watching" title="5. Watching">
                <p>Your browser creates a playback key for this site that cannot be exported. Its public part, with a certificate hash, is linked to your ticket on the NEAR blockchain. Tickets bought in the same browser share that key, so they can be linked to each other on the blockchain.</p>
                <p>Before playback, youtick checks your ticket and gives your browser a short-lived playback token. Livepeer delivers the video and receives your network address, browser details and the token; on iPhone and iPad the token is part of the video address. While the video plays, a short ticket code is shown on the screen.</p>
            </Section>

            <Section id="creators" title="6. Releasing your work">
                <p>When you upload, your browser keeps the upload details (file name, size, a fingerprint of the file, title and price) until the upload finishes or you close the tab. If an upload does not finish, your browser also keeps your NEAR account and the upload&apos;s identifier until you clear the site&apos;s data. Each upload approval records an approval token with the same sign-in identifier as in section 3 on the NEAR blockchain. The video goes directly from your browser to Livepeer for processing, storage and delivery; our services do not receive the video itself. Our upload service keeps a record of each upload job, and the publication (your NEAR account, the title, the price and the times) is recorded on the NEAR blockchain, where it is public. A first-frame cover image of a published video can be shown publicly. Keep the permissions needed to publish people&apos;s images, voices and other content.</p>
                <p>Payments to creators and the details they need are handled under our agreement with each creator.</p>
            </Section>

            <Section id="creator-applications" title="7. Creator applications">
                <p>If you send a creator application on the application page, we receive the name, email address, country, work link, work type, planned first screening and message you enter. We use them only to assess your application and to reply to you. The legal basis is taking steps you ask for before a possible agreement with you; where that does not apply, our legitimate interest in answering your enquiry.</p>
                <p>The application is sent as an email to youtick&apos;s inbox, hosted by Google Workspace; the web service does not keep a separate copy. Cloudflare delivers the email and runs the Turnstile check that protects the form from automated abuse, and it receives your network address for that check and for rate limiting. These providers may process data outside the UK under their own transfer safeguards.</p>
                <p>We delete an application and our replies 12 months after the last message about it, unless we decide to work together; then it becomes part of our correspondence with you as a creator. You can ask us to delete your application earlier, or to see or correct it, at <Contact />. You can also complain to the ICO.</p>
            </Section>

            <Section id="content-reports" title="8. Content reports">
                <p>If you report content, we receive what you enter: your role, the reason, your name and email address, the link to the content, the right concerned, your description and your declaration. We use it to review the report, act on it and tell you what we decided. The legal basis is our legitimate interest in keeping youtick lawful and safe, and our legal obligations. We may tell the creator what the report says so that they can respond; we do not give them your email address unless you agree or the law requires it.</p>
                <p>The report is sent as an email to youtick&apos;s inbox in the same way as a creator application; the web service does not keep a copy. We keep a report and our correspondence about it for 12 months after the last message about it, or longer if we need it for a legal claim. See also the <Link className={link} href="/report">content report page</Link>.</p>
            </Section>

            <Section id="opening-notices" title="9. Opening notices">
                <p>If you ask to be told when youtick opens, we receive your email address and the language of the page you used. We use them only to send you one email when youtick opens. If you ask by email instead, for example when the form is not available, we use and delete your message in the same way. The legal basis is your consent, which you can withdraw at any time by writing to <Contact />.</p>
                <p>The request is sent as an email to youtick&apos;s inbox, hosted by Google Workspace; the web service does not keep a separate copy. Cloudflare delivers the email and runs the Turnstile check that protects the form, and receives your network address for that check and for rate limiting. These providers may process data outside the UK under their own transfer safeguards. We delete the request, and our copy of the opening email sent to you, {OPENING_NOTICE_RETENTION_DAYS_AFTER_OPENING} days after youtick opens. You can ask to see, correct or delete it earlier at <Contact />, and you can complain to the ICO.</p>
            </Section>

            <Section id="emails" title="10. Refund requests and other emails">
                <p>If you write to us, for example to ask for a refund, we receive your email address and what you write. For a card refund we pass your ticket code and the request to our card payment provider, which returns the money to your card (see the <Link className={link} href="/refund-policy">refund policy</Link>). Do not send card numbers or other sensitive details by email.</p>
            </Section>

            <Section id="browser-storage" title="11. What is kept in your browser">
                <ul className="list-disc space-y-2 pl-5">
                    <li>IndexedDB keeps the playback key of this browser until you clear the site&apos;s data. Clearing it means the browser needs a new key before you can watch again.</li>
                    <li>While a creator uploads, browser storage keeps the upload key and the upload details until the upload finishes or the tab is closed; if an upload does not finish, localStorage keeps the creator&apos;s NEAR account and the upload&apos;s identifier until the site&apos;s data is cleared.</li>
                    <li>Your signed-in session, ticket keys and playback tokens are kept in memory only.</li>
                    <li>The wallet connector described in section 2, the sign-in service and Google, the card payment provider&apos;s payment form and Turnstile may keep their own records in your browser.</li>
                </ul>
            </Section>

            <Section id="providers" title="12. Who else receives data">
                <ul className="list-disc space-y-2 pl-5">
                    <li>Cloudflare: hosting, storage of our service records, rate limiting, email delivery, Turnstile and service logs.</li>
                    <li>Google Workspace: youtick&apos;s inbox.</li>
                    <li>The NEAR Auth sign-in service and Google: sign-in.</li>
                    <li>The NEAR network and NEAR RPC providers: blockchain records and requests. Blockchain records are copied to computers worldwide.</li>
                    <li>Livepeer: video processing, storage and delivery.</li>
                    <li>Our card payment provider: card payments, as described in section 4.</li>
                    <li>GitHub and jsDelivr: the wallet list described in section 2.</li>
                </ul>
                <p>Some of these providers process data outside the UK under their own transfer safeguards.</p>
            </Section>

            <Section id="legal-bases" title="13. Legal bases">
                <ul className="list-disc space-y-2 pl-5">
                    <li>Contract: your account, tickets, playback, card orders, refunds and creator uploads.</li>
                    <li>Legitimate interests: protecting the service from abuse, rate limiting, checkout counts without identifiers, content reports, and answering enquiries.</li>
                    <li>Consent: opening notices.</li>
                    <li>Legal obligation: accounting and tax records, and responding to lawful requests.</li>
                </ul>
            </Section>

            <Section id="retention" title="14. How long we keep data">
                <ul className="list-disc space-y-2 pl-5">
                    <li>Creator applications and content reports: 12 months after the last message about them, as described above.</li>
                    <li>Opening notices: until {OPENING_NOTICE_RETENTION_DAYS_AFTER_OPENING} days after youtick opens.</li>
                    <li>Card order and payment records: as long as UK accounting and tax law requires, and as long as needed to handle refunds and chargebacks.</li>
                    <li>Account, ticket and upload records held by our services: while your account or your work is on youtick, and afterwards only as long as needed to settle disputes.</li>
                    <li>Records on the NEAR blockchain: permanently; they cannot be deleted.</li>
                    <li>Service logs: for the periods set by our hosting provider.</li>
                </ul>
            </Section>

            <Section id="rights" title="15. Your rights">
                <p>You can ask us to give you a copy of your data, correct it, delete it, restrict or object to its use, or move it to another service, and you can withdraw consent at any time. Write to <Contact />. We will explain what can be changed in youtick&apos;s records and what remains on the public blockchain or with another provider, such as our card payment provider. You can also complain to the ICO.</p>
            </Section>

            {showV1Pilot && <Section id="v1-pilot" title="Earlier wallet-based version on NEAR testnet">
                <p>This section describes the wallet-based V1 testnet pilot.</p>
                <p>youtick uses your connected NEAR account for publishing, ticket purchases, recovery and playback access. Wallet identifiers, transaction details and contract activity are public on NEAR. Clearing browser data does not delete public blockchain records.</p>
                <p>IndexedDB holds playback device keys and certificates, authorization information and saved watch progress. localStorage holds public-testnet upload drafts, upload bookmarks and some preferences; sessionStorage holds upload job keys, recovery evidence and legacy drafts. These records support account access and recovery across reloads; they are separate from short-lived playback tokens.</p>
                <p>Your selected wallet and NEAR RPC services handle wallet and chain requests. The video player may send playback/session identifiers and playback/device diagnostics to Livepeer. If the derived catalogue is enabled, it stores publication and activity data read from NEAR.</p>
            </Section>}

            <Link href="/" className="inline-block text-emerald-300">Back home</Link>
        </PageShell>
    );
}
