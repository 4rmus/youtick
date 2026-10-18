import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TermsPage from '@/app/(site)/terms/page';
import { LEGAL_DRAFT_NOTICE } from '@/components/legal/legal-facts';

/** Claim register (design language plan §4.4): wording never used, plus claim 14 (per-viewer watermark). */
const NEVER_USED = [
    /35\+\s*chains/i, /any token/i, /\blicensed\b/i, /\bFCA\b/, /\bMiCA\b/i, /invest/i, /\bvalue (?:will|may) (?:rise|grow)/i,
    /screen recording (?:is )?(?:blocked|prevented)/i, /instant card payment/i, /cheaper than/i,
    /forensic/i, /per[- ]viewer/i, /unique to (?:each|every) viewer/i,
];

function text(element: React.ReactElement): string {
    return renderToStaticMarkup(element).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ');
}

export function expectNoNeverUsedClaims(value: string) {
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
