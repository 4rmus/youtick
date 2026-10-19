import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import PrivacyPage from '@/app/(site)/privacy/page';
import ReportPage from '@/app/(site)/report/page';
import { ContentReportForm } from '@/app/(site)/report/ContentReportForm';
import { contentReportSiteKey } from '@/app/(site)/report/site-key';
import sitemap from '@/app/sitemap';
import { LEGAL_LINKS, LegalFooter } from '@/components/legal/LegalFooter';
import { contentSecurityPolicy, turnstileSources } from '@/lib/csp';
import {
    contentReportMail,
    handleContentReport,
    parseContentReport,
    type ContentReportDeps,
    type ContentReportMail,
} from '@/lib/content-report';

// sitemap() reads the request host (root-host gate, L3); a non-root host gets the full list.
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'app.youtick.net' }) }));

const valid = {
    role: 'rights_holder',
    reason: 'copyright',
    name: 'Ada Example',
    email: 'ada@example.com',
    contentLink: 'https://youtick.net/watch?v=lp-job',
    rightsDetails: 'My concert film "Night Set", https://example.com/night-set',
    details: 'The whole film is my recording, uploaded without permission.\nFrom 00:00 to the end.',
    declaration: true,
    turnstileToken: 'token-1',
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('https://youtick.net/api/content-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://youtick.net', 'cf-connecting-ip': '203.0.113.7', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

function deps(overrides: Partial<ContentReportDeps> = {}): ContentReportDeps & { sent: ContentReportMail[]; keys: string[] } {
    const sent: ContentReportMail[] = [];
    const keys: string[] = [];
    return {
        sent, keys,
        turnstileSecret: 'secret',
        send: async (mail) => { sent.push(mail); },
        limit: async (key) => { keys.push(key); return true; },
        fetchImpl: vi.fn(async () => Response.json({ success: true, action: 'content_report' })) as unknown as typeof fetch,
        now: () => new Date('2026-10-18T12:00:00Z'),
        ...overrides,
    };
}

describe('content report parsing', () => {
    it('accepts a complete report', () => {
        expect(parseContentReport(valid)).toMatchObject({ ok: true, turnstileToken: 'token-1', report: { role: 'rights_holder', reason: 'copyright' } });
        expect(parseContentReport({ ...valid, role: 'viewer', reason: 'illegal', rightsDetails: undefined })).toMatchObject({ ok: true, report: { rightsDetails: '' } });
    });

    it('refuses incomplete or malformed reports', () => {
        for (const bad of [
            { ...valid, role: 'admin' }, { ...valid, reason: 'spam' }, { ...valid, name: '' }, { ...valid, email: 'nope' },
            { ...valid, contentLink: 'http://youtick.net/watch' }, { ...valid, contentLink: 'https://user:pw@youtick.net/' },
            { ...valid, details: 'too short' }, { ...valid, details: 'x'.repeat(4001) }, { ...valid, name: 'Ada\nBcc: x@example.com' },
            { ...valid, rightsDetails: '' }, { ...valid, turnstileToken: '' }, [], null,
        ]) expect(parseContentReport(bad)).toEqual({ ok: false, error: 'invalid_request' });
        expect(parseContentReport({ ...valid, declaration: 'yes' })).toEqual({ ok: false, error: 'declaration_required' });
    });

    it('puts reporter text only in the mail body', () => {
        const parsed = parseContentReport(valid);
        if (!parsed.ok) throw new Error('expected a valid report');
        const mail = contentReportMail(parsed.report, new Date('2026-10-18T12:00:00Z'));
        expect(mail.subject).toBe('Content report: Copyright infringement');
        expect(mail.text).toContain('Email: ada@example.com');
        expect(mail.text).toContain('Nothing was stored by the web service.');
    });
});

describe('content report route', () => {
    it('stays off until configured', async () => {
        expect((await handleContentReport(request(valid), deps({ send: null }))).status).toBe(503);
        expect((await handleContentReport(request(valid), deps({ turnstileSecret: null }))).status).toBe(503);
    });

    it('checks origin, content type, rate limit and body size before anything else', async () => {
        const d = deps();
        expect((await handleContentReport(request(valid, { origin: 'https://evil.example' }), d)).status).toBe(403);
        expect((await handleContentReport(request(valid, { 'content-type': 'text/plain' }), d)).status).toBe(415);
        expect((await handleContentReport(request(valid), deps({ limit: async () => false }))).status).toBe(429);
        expect((await handleContentReport(request({ ...valid, details: 'x'.repeat(30_000) }), d)).status).toBe(413);
        expect((await handleContentReport(request('{'), d)).status).toBe(400);
        expect(d.sent).toHaveLength(0);
    });

    it('needs a Turnstile pass for the report action, then sends one mail', async () => {
        const wrongAction = deps({ fetchImpl: vi.fn(async () => Response.json({ success: true, action: 'creator_application' })) as unknown as typeof fetch });
        expect((await handleContentReport(request(valid), wrongAction)).status).toBe(403);
        expect(wrongAction.sent).toHaveLength(0);
        const d = deps();
        const response = await handleContentReport(request(valid), d);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(d.sent).toHaveLength(1);
        expect(d.keys).toEqual(['content-report:203.0.113.7']);
    });

    it('reports a mail failure as unavailable', async () => {
        const response = await handleContentReport(request(valid), deps({ send: async () => { throw new Error('mail down'); } }));
        expect(response.status).toBe(503);
    });
});

describe('report page and navigation', () => {
    it('says who may file, what to include and what happens', () => {
        const html = renderToStaticMarkup(React.createElement(ReportPage));
        for (const value of ['Who can report', 'Rights holders', 'Viewers and anyone else', 'What to include', 'What happens next', 'refund policy']) {
            expect(html).toContain(value);
        }
        expect(html).toContain('abuse@youtick.net');
    });

    it('shows the e-mail address instead of the form until the site key is set', () => {
        expect(contentReportSiteKey(undefined)).toBeNull();
        expect(contentReportSiteKey('  ')).toBeNull();
        expect(renderToStaticMarkup(React.createElement(ContentReportForm, { siteKey: null }))).toContain('The report form is not available at the moment');
        expect(renderToStaticMarkup(React.createElement(ContentReportForm, { siteKey: 'key' }))).toContain('<form');
    });

    it('allows Turnstile in the CSP when either form is configured', () => {
        expect(turnstileSources(undefined, undefined)).toBeNull();
        expect(turnstileSources(undefined, 'report-key')).not.toBeNull();
        expect(contentSecurityPolicy('n', null, turnstileSources(undefined, 'report-key'))).toContain('frame-src https://challenges.cloudflare.com');
    });

    it('links the report page from the legal footer, with only a neutral label in Turkish', () => {
        expect(LEGAL_LINKS.en.map((item) => item.href)).toEqual(['/terms', '/refund-policy', '/privacy', '/report']);
        expect(LEGAL_LINKS.tr).toEqual([{ href: '/report', label: 'İçerik bildir' }]);
        expect(renderToStaticMarkup(React.createElement(LegalFooter, { lang: 'tr' }))).not.toMatch(/Terms|Refund|iade|Şartlar/);
        expect(renderToStaticMarkup(React.createElement(LegalFooter, { lang: 'en' }))).toContain('Report content');
    });

    it('lists the new pages in the sitemap and links them from the privacy notice', async () => {
        expect((await sitemap()).map((entry) => entry.url)).toEqual(expect.arrayContaining(['https://youtick.net/report', 'https://youtick.net/refund-policy']));
        const privacy = renderToStaticMarkup(React.createElement(PrivacyPage));
        expect(privacy).toContain('href="/report"');
        expect(privacy).toContain('href="/refund-policy"');
    });
});
