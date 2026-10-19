import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import PrivacyPage from '@/app/(site)/privacy/page';
import RefundPolicyPage from '@/app/(site)/refund-policy/page';
import TermsPage from '@/app/(site)/terms/page';
import sitemap from '@/app/sitemap';
import { LEGAL_DRAFT_NOTICE } from '@/components/legal/legal-facts';
import { CardCheckout } from '@/components/v2/CardCheckout';
import { InstantAccessConsent } from '@/components/v2/InstantAccessConsent';
import { INSTANT_ACCESS_CONSENT_TEXT, INSTANT_ACCESS_CONSENT_VERSION } from '@/components/v2/instant-access-consent';

// sitemap() reads the request host (root-host gate, L3); a non-root host gets the full list.
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'app.youtick.net' }) }));

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

    it('states the takedown and card refund rules without naming the provider', () => {
        expect(terms).toContain('Tickets that were never played are refunded. Tickets that were already played are not refunded');
        expect(terms).toContain('our card payment provider processes the payment as reseller (merchant of record) and its own terms apply to the payment');
        expect(terms).toContain('Card payments follow our card payment provider\'s standard refund policy');
        expect(terms).toContain('Nothing in these terms excludes or limits your statutory rights as a consumer');
        expect(terms).not.toMatch(/cleeng|payment partner|USDC/i);
    });

    it('names the company, the governing law and the content rules', () => {
        expect(terms).toContain('YOUTICK LTD, a company registered in England and Wales under company number 17290900');
        expect(terms).toContain('These terms are governed by the law of England and Wales');
        expect(terms).toContain('content that infringes copyright');
        expect(renderToStaticMarkup(React.createElement(TermsPage))).toContain('href="/report"');
    });

    it('keeps the V1 pilot section out of the public build and uses no never-used claim', () => {
        const html = renderToStaticMarkup(React.createElement(TermsPage));
        expect(html).not.toContain('id="v1-pilot"');
        expect(html).not.toContain('id="test-tokens"');
        expect(terms).not.toMatch(/pilot|testnet|test tokens/i);
        expectNoNeverUsedClaims(terms);
    });
});

describe('refund policy draft', () => {
    const policy = text(React.createElement(RefundPolicyPage));

    it('is a visible draft with the same rules as the terms', () => {
        expect(policy).toContain(LEGAL_DRAFT_NOTICE);
        expect(policy).toContain('Refunds of card payments follow our card payment provider\'s standard refund policy');
        expect(policy).toContain('We pass the request to our card payment provider');
        expect(policy).toContain('you can no longer cancel because you changed your mind');
        expect(policy).toContain('Tickets that were never played are refunded. Tickets that were already played are not refunded');
        expect(policy).not.toMatch(/cleeng|payment partner|USDC/i);
        expect(policy).toContain('It does not affect your statutory rights as a consumer');
        expect(policy).toContain('this right ends once you start playback');
        expectNoNeverUsedClaims(policy);
    });

    it('is listed in the sitemap', async () => {
        expect((await sitemap()).map((entry) => entry.url)).toContain('https://youtick.net/refund-policy');
    });
});

describe('privacy notice draft', () => {
    const privacy = text(React.createElement(PrivacyPage));
    const html = renderToStaticMarkup(React.createElement(PrivacyPage));

    it('is a visible draft that names the controller and the ICO registration', () => {
        expect(privacy).toContain(LEGAL_DRAFT_NOTICE);
        expect(privacy).toContain('YOUTICK LTD operates youtick and is the data controller');
        expect(privacy).toContain('registration reference ZC276359');
    });

    it('discloses that each sign-in is recorded publicly on NEAR and cannot be deleted', () => {
        expect(privacy).toContain('Each sign-in is recorded on the NEAR blockchain.');
        expect(privacy).toContain('your Google account identifier');
        expect(privacy).toContain('cannot be changed or deleted');
        expect(privacy).toContain('The token does not contain your name or email address');
    });

    it('describes card payments without naming the provider, and keeps the country out of our records', () => {
        expect(privacy).toContain('you pay our card payment provider, which sells the ticket to you as reseller (merchant of record)');
        expect(privacy).toContain('We never see your card number');
        expect(privacy).toContain('We do not store your country');
        expect(privacy).not.toMatch(/cleeng|payment partner|USDC/i);
    });

    it('has the sections that forms and pages link to, with the stated retention', () => {
        for (const id of ['creator-applications', 'content-reports', 'opening-notices']) expect(html).toContain(`id="${id}"`);
        expect(privacy).toContain('12 months after the last message about it');
        expect(privacy).toContain('30 days after youtick opens');
        expect(privacy).toContain('The legal basis is your consent');
    });

    it('keeps the earlier pilot, testnet and invitation wording out of the public build', () => {
        expect(html).not.toContain('id="v1-pilot"');
        expect(privacy).not.toMatch(/pilot|testnet|invit/i);
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
