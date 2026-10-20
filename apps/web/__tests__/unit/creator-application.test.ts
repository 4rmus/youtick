import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import PrivacyPage from '@/app/(site)/privacy/page';
import { applyCopy } from '@/components/apply/apply-copy';
import { CreatorApplicationForm } from '@/components/apply/CreatorApplicationForm';
import { creatorApplyHref, landingCopy } from '@/components/landing/landing-copy';
import { contentSecurityPolicy } from '@/lib/csp';
import {
    creatorApplicationMail,
    handleCreatorApplication,
    parseCreatorApplication,
    TURNSTILE_SITEVERIFY_URL,
    type CreatorApplicationDeps,
    type CreatorApplicationMail,
} from '@/lib/creator-application';

const valid = {
    locale: 'tr',
    name: 'Deniz Kaya',
    email: 'deniz@example.com',
    country: 'Türkiye',
    workLink: 'https://example.com/concert',
    workType: 'concert',
    plannedRelease: 'A concert film this winter',
    message: 'Line one\nLine two',
    consent: true,
    turnstileToken: 'token-1',
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('https://youtick.net/api/creator-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://youtick.net', 'cf-connecting-ip': '203.0.113.7', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

function turnstile(result: Record<string, unknown>) {
    return vi.fn(async () => Response.json(result)) as unknown as typeof fetch;
}

function deps(overrides: Partial<CreatorApplicationDeps> = {}): CreatorApplicationDeps & { sent: CreatorApplicationMail[] } {
    const sent: CreatorApplicationMail[] = [];
    return {
        sent,
        turnstileSecret: 'secret',
        send: async (mail) => { sent.push(mail); },
        limit: async () => true,
        fetchImpl: turnstile({ success: true, action: 'creator_application' }),
        now: () => new Date('2026-10-17T12:00:00Z'),
        ...overrides,
    };
}

describe('creator application parsing', () => {
    it('accepts a complete application and normalises the link', () => {
        const parsed = parseCreatorApplication(valid);
        expect(parsed).toMatchObject({ ok: true, turnstileToken: 'token-1', application: { locale: 'tr', workLink: 'https://example.com/concert', workType: 'concert' } });
        expect(parseCreatorApplication({ ...valid, plannedRelease: undefined, message: undefined })).toMatchObject({ ok: true, application: { plannedRelease: '', message: '' } });
    });

    it('rejects header injection, plain http links, bad e-mail, unknown types and oversize text', () => {
        for (const change of [
            { name: 'Deniz\r\nBcc: someone@example.com' },
            { country: 'TR\nX' },
            { workLink: 'http://example.com' },
            { workLink: 'https://user:pass@example.com' },
            { workLink: 'javascript:alert(1)' },
            { email: 'not-an-email' },
            { email: 'a@b' },
            { workType: 'podcast' },
            { locale: 'de' },
            { name: '   ' },
            { message: 'x'.repeat(2001) },
            { message: 'bell\u0007' },
            { turnstileToken: '' },
        ]) {
            expect(parseCreatorApplication({ ...valid, ...change })).toEqual({ ok: false, error: 'invalid_request' });
        }
        expect(parseCreatorApplication([valid])).toEqual({ ok: false, error: 'invalid_request' });
        expect(parseCreatorApplication({ ...valid, consent: 'true' })).toEqual({ ok: false, error: 'consent_required' });
    });

    it('puts applicant text only in the mail body', () => {
        const parsed = parseCreatorApplication(valid);
        if (!parsed.ok) throw new Error('expected a valid application');
        const mail = creatorApplicationMail(parsed.application, new Date('2026-10-17T12:00:00Z'));
        expect(mail.subject).toBe('Creator application (tr)');
        expect(Object.keys(mail)).toEqual(['subject', 'text']);
        expect(mail.text).toContain('Email: deniz@example.com');
        expect(mail.text).toContain('Work type: Concert recording');
        expect(mail.text).toContain('Line one\nLine two');
        expect(mail.text).toContain('Received: 2026-10-17T12:00:00.000Z');
    });
});

describe('creator application route', () => {
    it('stays closed until the Turnstile secret and the mail sender are configured', async () => {
        for (const missing of [{ turnstileSecret: null }, { send: null }]) {
            const context = deps(missing);
            const response = await handleCreatorApplication(request(valid), context);
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ error: 'unavailable' });
            expect(context.sent).toEqual([]);
        }
    });

    it('rejects cross-origin, non-JSON and oversize requests before sending', async () => {
        const context = deps();
        expect((await handleCreatorApplication(request(valid, { origin: 'https://evil.example' }), context)).status).toBe(403);
        expect((await handleCreatorApplication(request(valid, { origin: '' }), context)).status).toBe(403);
        expect((await handleCreatorApplication(request(valid, { 'sec-fetch-site': 'cross-site' }), context)).status).toBe(403);
        expect((await handleCreatorApplication(request(valid, { 'content-type': 'text/plain' }), context)).status).toBe(415);
        expect((await handleCreatorApplication(request({ ...valid, message: 'x'.repeat(17_000) }), context)).status).toBe(413);
        expect((await handleCreatorApplication(request('{'), context)).status).toBe(400);
        expect(context.sent).toEqual([]);
    });

    it('applies the rate limit per client address', async () => {
        const limit = vi.fn(async () => false);
        const context = deps({ limit });
        const response = await handleCreatorApplication(request(valid), context);
        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({ error: 'rate_limited' });
        expect(limit).toHaveBeenCalledWith('creator-application:203.0.113.7');
        expect(context.sent).toEqual([]);
    });

    it('requires a successful Turnstile check for the form action', async () => {
        for (const result of [{ success: false }, { success: true, action: 'other' }]) {
            const context = deps({ fetchImpl: turnstile(result) });
            const response = await handleCreatorApplication(request(valid), context);
            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({ error: 'verification_failed' });
            expect(context.sent).toEqual([]);
        }
        const failing = deps({ fetchImpl: vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch });
        expect((await handleCreatorApplication(request(valid), failing)).status).toBe(403);
    });

    it('verifies the token with the client address and sends one mail', async () => {
        const fetchImpl = turnstile({ success: true, action: 'creator_application' });
        const context = deps({ fetchImpl });
        const response = await handleCreatorApplication(request(valid), context);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ ok: true });
        const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
        expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
        const form = init.body as FormData;
        expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['secret', 'token-1', '203.0.113.7']);
        expect(context.sent).toHaveLength(1);
    });

    it('reports a mail failure as unavailable', async () => {
        const context = deps({ send: async () => { throw new Error('send failed'); } });
        const response = await handleCreatorApplication(request(valid), context);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'unavailable' });
    });
});

describe('creator application pages', () => {
    it('links both landings to their application page', () => {
        expect(creatorApplyHref('en')).toBe('/apply');
        expect(creatorApplyHref('tr')).toBe('/tr/apply');
        expect(landingCopy.tr.ctas.apply).toBe('Sanatçı olarak başvur');
        expect(landingCopy.en.ctas.apply).toBe('Apply as an artist');
    });

    it('shows the e-mail fallback when the form is not configured', () => {
        for (const locale of ['en', 'tr'] as const) {
            const html = renderToStaticMarkup(React.createElement(CreatorApplicationForm, { locale, siteKey: null }));
            expect(html).toContain('mailto:contact@youtick.net');
            expect(html).not.toContain('<form');
            expect(html.match(/contact@youtick\.net/g)).toHaveLength(2);
            expect(applyCopy[locale].unavailable).not.toContain('contact@youtick.net');
        }
        const form = renderToStaticMarkup(React.createElement(CreatorApplicationForm, { locale: 'en', siteKey: 'site-key' }));
        expect(form).toContain('<form');
        expect(form).toContain('name="consent"');
        expect(form).toContain('href="/privacy#creator-applications"');
    });

    it('describes application data, retention and providers in the privacy notice', () => {
        const privacy = renderToStaticMarkup(React.createElement(PrivacyPage));
        expect(privacy).toContain('id="creator-applications"');
        expect(privacy).toContain('12 months after the last message');
        expect(privacy).toContain('Turnstile');
        expect(privacy).toContain('Google Workspace');
        expect(privacy).toContain('does not keep a separate copy');
    });

    it('allows Turnstile in the CSP only when the form is configured', () => {
        const off = contentSecurityPolicy('n', null, null);
        expect(off).not.toContain('challenges.cloudflare.com');
        expect(off).not.toContain('frame-src');
        const on = contentSecurityPolicy('n', null, { script: ' https://challenges.cloudflare.com', frame: 'https://challenges.cloudflare.com' });
        expect(on).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
        expect(on).toContain('frame-src https://challenges.cloudflare.com');
        const both = contentSecurityPolicy('n', { script: ' https://widgets.sandbox.cleeng.com', frame: 'https://*.sandbox.cleeng.com' }, { script: ' https://challenges.cloudflare.com', frame: 'https://challenges.cloudflare.com' });
        expect(both).toContain('frame-src https://*.sandbox.cleeng.com https://challenges.cloudflare.com');
    });
});
