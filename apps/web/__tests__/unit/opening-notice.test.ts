import React from 'react';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NotifyPage } from '@/components/notify/NotifyPage';
import { OpeningNoticeForm } from '@/components/notify/OpeningNoticeForm';
import { notifyCopy } from '@/components/notify/notify-copy';
import { openingNoticeSiteKey } from '@/components/notify/site-key';
import { contentSecurityPolicy, turnstileSources } from '@/lib/csp';
import {
    handleOpeningNotice,
    openingNoticeDeps,
    openingNoticeMail,
    parseOpeningNotice,
    type OpeningNoticeDeps,
    type OpeningNoticeMail,
} from '@/lib/opening-notice';
import { isPublicRootRequest } from '@/lib/public-routes';

const valid = { locale: 'tr', email: 'deniz@example.com', consent: true, turnstileToken: 'token-1' };

function request(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('https://youtick.net/api/opening-notices', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://youtick.net', 'cf-connecting-ip': '203.0.113.7', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

function turnstile(result: Record<string, unknown>) {
    return vi.fn(async () => Response.json(result)) as unknown as typeof fetch;
}

function deps(overrides: Partial<OpeningNoticeDeps> = {}): OpeningNoticeDeps & { sent: OpeningNoticeMail[] } {
    const sent: OpeningNoticeMail[] = [];
    return {
        sent,
        turnstileSecret: 'secret',
        send: async (mail) => { sent.push(mail); },
        limit: async () => true,
        fetchImpl: turnstile({ success: true, action: 'opening_notice' }),
        now: () => new Date('2026-10-19T12:00:00Z'),
        ...overrides,
    };
}

describe('opening notice parsing and mail', () => {
    it('accepts an e-mail address with consent and nothing else', () => {
        expect(parseOpeningNotice(valid)).toEqual({ ok: true, notice: { locale: 'tr', email: 'deniz@example.com' }, turnstileToken: 'token-1' });
        for (const change of [
            { email: 'not-an-email' },
            { email: 'deniz@example.com\r\nBcc: x@example.com' },
            { email: `${'a'.repeat(250)}@example.com` },
            { locale: 'de' },
            { turnstileToken: '' },
        ]) {
            expect(parseOpeningNotice({ ...valid, ...change })).toEqual({ ok: false, error: 'invalid_request' });
        }
        expect(parseOpeningNotice({ ...valid, consent: 'true' })).toEqual({ ok: false, error: 'consent_required' });
        expect(parseOpeningNotice(null)).toEqual({ ok: false, error: 'invalid_request' });
    });

    it('puts the address only in the body and states the retention', () => {
        const mail = openingNoticeMail({ locale: 'en', email: 'deniz@example.com' }, new Date('2026-10-19T12:00:00Z'));
        expect(mail.subject).toBe('Opening notice (en)');
        expect(mail.subject).not.toContain('@');
        expect(mail.text).toContain('Email: deniz@example.com');
        expect(mail.text).toContain('30 days after youtick opens');
    });
});

describe('opening notice route', () => {
    it('stays closed until the Turnstile secret and the mail sender are configured', async () => {
        for (const missing of [{ turnstileSecret: null }, { send: null }]) {
            const context = deps(missing);
            const response = await handleOpeningNotice(request(valid), context);
            expect(response.status).toBe(503);
            expect(context.sent).toEqual([]);
        }
    });

    it('rejects cross-origin, non-JSON, oversize and rate-limited requests before sending', async () => {
        const context = deps();
        expect((await handleOpeningNotice(request(valid, { origin: 'https://evil.example' }), context)).status).toBe(403);
        expect((await handleOpeningNotice(request(valid, { 'sec-fetch-site': 'cross-site' }), context)).status).toBe(403);
        expect((await handleOpeningNotice(request(valid, { 'content-type': 'text/plain' }), context)).status).toBe(415);
        expect((await handleOpeningNotice(request({ ...valid, pad: 'x'.repeat(5_000) }), context)).status).toBe(413);
        expect((await handleOpeningNotice(request('{'), context)).status).toBe(400);
        const limit = vi.fn(async () => false);
        expect((await handleOpeningNotice(request(valid), deps({ limit }))).status).toBe(429);
        expect(limit).toHaveBeenCalledWith('opening-notice:203.0.113.7');
        expect(context.sent).toEqual([]);
    });

    it('requires the Turnstile check for its own action, then sends one mail', async () => {
        const wrongAction = deps({ fetchImpl: turnstile({ success: true, action: 'creator_application' }) });
        expect((await handleOpeningNotice(request(valid), wrongAction)).status).toBe(403);
        expect(wrongAction.sent).toEqual([]);

        const context = deps();
        const response = await handleOpeningNotice(request(valid), context);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(context.sent).toHaveLength(1);

        const failing = deps({ send: async () => { throw new Error('send failed'); } });
        expect((await handleOpeningNotice(request(valid), failing)).status).toBe(503);
    });

    it('is reachable on the root host only as a POST', () => {
        expect(isPublicRootRequest('/api/opening-notices', 'POST')).toBe(true);
        expect(isPublicRootRequest('/api/opening-notices', 'GET')).toBe(false);
        expect(isPublicRootRequest('/notify', 'GET')).toBe(true);
        expect(isPublicRootRequest('/tr/notify', 'GET')).toBe(true);
    });
});

describe('opening notice page', () => {
    it('shows the e-mail address instead of the form until the site key is set', () => {
        expect(openingNoticeSiteKey(undefined)).toBeNull();
        expect(openingNoticeSiteKey('  ')).toBeNull();
        const fallback = renderToStaticMarkup(React.createElement(OpeningNoticeForm, { locale: 'en', siteKey: null }));
        expect(fallback).toContain('mailto:contact@youtick.net');
        expect(fallback).not.toContain('<form');
        const form = renderToStaticMarkup(React.createElement(OpeningNoticeForm, { locale: 'tr', siteKey: 'key' }));
        expect(form).toContain('<form');
        expect(form).toContain('href="/privacy#opening-notices"');
        expect(form).toContain('Bana haber ver');
    });

    it('renders both languages and promises one e-mail and deletion 30 days after the opening', () => {
        expect(renderToStaticMarkup(React.createElement(NotifyPage, { locale: 'tr' }))).toContain('lang="tr"');
        expect(notifyCopy.en.intro).toContain('we delete it 30 days after the opening');
        expect(notifyCopy.tr.intro).toContain('açılıştan 30 gün sonra sileriz');
        const copy = JSON.stringify(notifyCopy);
        expect(copy).not.toMatch(/cleeng|USDC|crypto|kripto|rehearsal|prova|beta|invit|davet|soon|yakında/i);
    });

    it('allows Turnstile in the CSP when only the opening-notice form is configured', async () => {
        expect(turnstileSources(undefined, undefined, 'key')).toEqual({ script: ' https://challenges.cloudflare.com', frame: 'https://challenges.cloudflare.com' });
        expect(turnstileSources(undefined, undefined, undefined)).toBeNull();
        expect(contentSecurityPolicy('n', null, turnstileSources(undefined, undefined, 'key'))).toContain('frame-src https://challenges.cloudflare.com');
        expect(await readFile('app/api/opening-notices/route.ts', 'utf8')).toContain('openingNoticeDeps(env)');
    });

    it('sends mail only when the binding, both addresses and the rate limiter are configured', async () => {
        const send = vi.fn(async () => undefined);
        const limit = vi.fn(async () => ({ success: true }));
        const complete = {
            OPENING_NOTICE_EMAIL: { send },
            OPENING_NOTICE_FROM: 'notices@youtick.net',
            OPENING_NOTICE_TO: 'inbox@youtick.net',
            OPENING_NOTICE_TURNSTILE_SECRET: ' secret ',
            OPENING_NOTICE_RATE_LIMITER: { limit },
        };
        const configured = openingNoticeDeps(complete);
        expect(configured.turnstileSecret).toBe('secret');
        await configured.send!({ subject: 'Opening notice (en)', text: 'Email: a@example.com' });
        expect(send).toHaveBeenCalledWith({ to: 'inbox@youtick.net', from: 'notices@youtick.net', subject: 'Opening notice (en)', text: 'Email: a@example.com' });
        expect(await configured.limit('k')).toBe(true);

        for (const missing of ['OPENING_NOTICE_EMAIL', 'OPENING_NOTICE_FROM', 'OPENING_NOTICE_TO', 'OPENING_NOTICE_RATE_LIMITER'] as const) {
            expect(openingNoticeDeps({ ...complete, [missing]: undefined }).send, missing).toBeNull();
        }
        expect(openingNoticeDeps({ ...complete, OPENING_NOTICE_TO: '  ' }).send).toBeNull();
        expect(openingNoticeDeps({ ...complete, OPENING_NOTICE_TURNSTILE_SECRET: '  ' }).turnstileSecret).toBeNull();
        expect(await openingNoticeDeps({ ...complete, OPENING_NOTICE_RATE_LIMITER: { limit: async () => { throw new Error('down'); } } }).limit('k')).toBe(false);
        expect(await openingNoticeDeps({}).limit('k')).toBe(false);
    });
});
