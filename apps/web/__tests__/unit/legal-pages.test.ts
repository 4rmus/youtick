import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RefundPolicyPage from '@/app/(site)/refund-policy/page';
import TermsPage from '@/app/(site)/terms/page';
import sitemap from '@/app/sitemap';
import { LEGAL_DRAFT_NOTICE } from '@/components/legal/legal-facts';
import { CardCheckout } from '@/components/v2/CardCheckout';
import { InstantAccessConsent } from '@/components/v2/InstantAccessConsent';
import { INSTANT_ACCESS_CONSENT_TEXT, INSTANT_ACCESS_CONSENT_VERSION } from '@/components/v2/instant-access-consent';

/** Claim register (design language plan §4.4): wording never used, plus claim 14 (per-viewer watermark). */
const NEVER_USED = [
    /35\+\s*chains/i, /any token/i, /\blicensed\b/i, /\bFCA\b/, /\bMiCA\b/i, /invest/i, /\bvalue (?:will|may) (?:rise|grow)/i,
    /screen recording (?:is )?(?:blocked|prevented)/i, /instant card payment/i, /cheaper than/i,
    /forensic/i, /per[- ]viewer/i, /unique to (?:each|every) viewer/i,
];

function text(element: React.ReactElement): string {
    return renderToStaticMarkup(element).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ');
}

function expectNoNeverUsedClaims(value: string) {
    for (const pattern of NEVER_USED) expect(value).not.toMatch(pattern);
}

describe('terms draft', () => {
    const terms = text(React.createElement(TermsPage));

    it('is visibly marked as a draft pending counsel review', () => {
        expect(terms).toContain(LEGAL_DRAFT_NOTICE);
        expect(LEGAL_DRAFT_NOTICE).toMatch(/pending review by our legal counsel/);
    });

    it('states the licence model, the ticket right and its limits', () => {
        expect(terms).toContain('grants YOUTICK LTD a licence to make that video available');
        expect(terms).toContain('YOUTICK LTD sells access to the video in its own name');
        expect(terms).toContain('A ticket is not a tradable token. There is no market for tickets');
        expect(terms).toContain('cannot sell, resell, lend or transfer one');
        expect(terms).toContain('up to 3 devices at a time');
        expect(terms).toContain('A ticket does not expire');
    });

    it('states the takedown and refund rules per payment method', () => {
        expect(terms).toContain('Tickets that were never played are refunded. Tickets that were already played are not refunded');
        expect(terms).toContain('Card payments follow Cleeng\'s standard refund policy');
        expect(terms).toContain('a ticket you have not played can be refunded through youtick within 30 days of purchase');
        expect(terms).toContain('Nothing in these terms excludes or limits your statutory rights as a consumer');
    });

    it('names the company, the governing law and the content rules', () => {
        expect(terms).toContain('YOUTICK LTD, a company registered in England and Wales under company number 17290900');
        expect(terms).toContain('These terms are governed by the law of England and Wales');
        expect(terms).toContain('content that infringes copyright');
        expect(renderToStaticMarkup(React.createElement(TermsPage))).toContain('href="/report"');
    });

    it('keeps the pilot test-token anchor and uses no never-used claim', () => {
        expect(renderToStaticMarkup(React.createElement(TermsPage))).toContain('id="test-tokens"');
        expectNoNeverUsedClaims(terms);
    });
});

describe('refund policy draft', () => {
    const policy = text(React.createElement(RefundPolicyPage));

    it('is a visible draft with the same rules as the terms', () => {
        expect(policy).toContain(LEGAL_DRAFT_NOTICE);
        expect(policy).toContain('Refunds of card payments follow Cleeng\'s standard refund policy');
        expect(policy).toContain('A ticket you have not played can be refunded through youtick');
        expect(policy).toContain('A change of mind is not refunded');
        expect(policy).toContain('Tickets that were never played are refunded, whichever way you paid. Tickets that were already played are not refunded');
        expect(policy).toContain('It does not affect your statutory rights as a consumer');
        expect(policy).toContain('this right ends once you start playback');
        expectNoNeverUsedClaims(policy);
    });

    it('is listed in the sitemap', () => {
        expect(sitemap().map((entry) => entry.url)).toContain('https://youtick.net/refund-policy');
    });
});

describe('instant-access consent at checkout', () => {
    it('asks for immediate supply and acknowledges the end of the cancellation right, under a version', () => {
        expect(INSTANT_ACCESS_CONSENT_TEXT).toMatch(/made available to me immediately as digital content/);
        expect(INSTANT_ACCESS_CONSENT_TEXT).toMatch(/14-day right to cancel ends once I start playback/);
        expect(INSTANT_ACCESS_CONSENT_VERSION).toMatch(/^[a-z0-9][a-z0-9.-]{0,63}$/);
    });

    it('renders unticked by default', () => {
        const html = renderToStaticMarkup(React.createElement(InstantAccessConsent, { checked: false, onChange: () => undefined }));
        expect(html).toContain('type="checkbox"');
        expect(html).not.toMatch(/checked=""/);
        expect(html).toContain('href="/refund-policy"');
    });

    it('keeps the card button disabled until the consent is ticked', () => {
        const props = {
            config: {} as never, paymentServiceUrl: 'https://pay.example', rail: 'sandbox' as const, ckdKey: new Uint8Array(32),
            device: {} as never, publicationId: 'lp-job', priceLabel: '$5.00', reserveIndex: async () => 0, deps: { view: async () => null as never },
            onDone: () => undefined, onFailure: () => undefined, onStep: () => undefined,
        };
        expect(renderToStaticMarkup(React.createElement(CardCheckout, { ...props, consentVersion: null }))).toMatch(/<button[^>]*disabled=""/);
        expect(renderToStaticMarkup(React.createElement(CardCheckout, { ...props, consentVersion: INSTANT_ACCESS_CONSENT_VERSION }))).not.toMatch(/<button[^>]*disabled=""/);
    });

    it('gates the USDC purchase button on the consent, unticked at first', async () => {
        const source = await readFile('components/v2/BuyTicket.tsx', 'utf8');
        expect(source).toContain('const [consented, setConsented] = useState(false);');
        expect(source).toContain("disabled={state === 'buying' || !enough || !device || !consented}");
        expect(source).toContain('if (!signedIn || !device || !item || !consented) return;');
        expect(source).toContain('consentVersion={consented ? INSTANT_ACCESS_CONSENT_VERSION : null}');
    });
});
