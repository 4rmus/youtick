// Opening notices: "email me once when youtick opens". Validation, Turnstile check, rate limit and the
// mail to the youtick inbox, as for creator applications. Nothing is stored by the web service; the
// inbox is the only record, deleted 30 days after the opening (privacy notice, "Opening notices").

import { verifyTurnstile } from './creator-application';

export type OpeningNotice = {
    locale: 'en' | 'tr';
    email: string;
};

export type OpeningNoticeError =
    | 'invalid_request'
    | 'consent_required'
    | 'verification_failed'
    | 'rate_limited'
    | 'unavailable';

export const OPENING_NOTICE_LIMITS = {
    email: 254,
    turnstileToken: 2048,
    bodyBytes: 4 * 1024,
} as const;

export const OPENING_NOTICE_TURNSTILE_ACTION = 'opening_notice';

/** How long the inbox keeps the requests after youtick opens (privacy notice). */
export const OPENING_NOTICE_RETENTION_DAYS_AFTER_OPENING = 30;

const CONTROL = /[\u0000-\u001F\u007F\u2028\u2029]/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function line(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.normalize('NFC').trim();
    if (!trimmed || trimmed.length > max || CONTROL.test(trimmed)) return null;
    return trimmed;
}

export type ParsedOpeningNotice =
    | { ok: true; notice: OpeningNotice; turnstileToken: string }
    | { ok: false; error: 'invalid_request' | 'consent_required' };

export function parseOpeningNotice(input: unknown): ParsedOpeningNotice {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid_request' };
    const body = input as Record<string, unknown>;
    const locale = body.locale === 'tr' ? 'tr' : body.locale === 'en' ? 'en' : null;
    const email = line(body.email, OPENING_NOTICE_LIMITS.email);
    const token = line(body.turnstileToken, OPENING_NOTICE_LIMITS.turnstileToken);
    if (!locale || !email || !EMAIL.test(email) || !token) return { ok: false, error: 'invalid_request' };
    if (body.consent !== true) return { ok: false, error: 'consent_required' };
    return { ok: true, notice: { locale, email }, turnstileToken: token };
}

export type OpeningNoticeMail = {
    subject: string;
    text: string;
};

/** The mail to the youtick inbox. The address goes only into the body, never into a header. */
export function openingNoticeMail(notice: OpeningNotice, receivedAt: Date): OpeningNoticeMail {
    const lines = [
        `Received: ${receivedAt.toISOString()}`,
        `Page language: ${notice.locale}`,
        `Email: ${notice.email}`,
        '',
        'The person asked for one email when youtick opens, and agreed to nothing else.',
        `Delete this message, and any copy of the opening email sent to this address, ${OPENING_NOTICE_RETENTION_DAYS_AFTER_OPENING} days after youtick opens (privacy notice, "Opening notices").`,
    ];
    return {
        subject: `Opening notice (${notice.locale})`,
        text: lines.join('\n'),
    };
}

export type OpeningNoticeDeps = {
    turnstileSecret: string | null;
    send: ((mail: OpeningNoticeMail) => Promise<void>) | null;
    limit: (key: string) => Promise<boolean>;
    fetchImpl?: typeof fetch;
    now?: () => Date;
};

// Cloudflare Email Service binding (`send_email`, structured API) and the bindings and vars the route reads.
type EmailBinding = { send(message: { to: string; from: string; subject: string; text: string }): Promise<unknown> };
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

export type OpeningNoticeEnv = {
    OPENING_NOTICE_EMAIL?: EmailBinding;
    OPENING_NOTICE_FROM?: string;
    OPENING_NOTICE_TO?: string;
    OPENING_NOTICE_TURNSTILE_SECRET?: string;
    OPENING_NOTICE_RATE_LIMITER?: RateLimiter;
};

/**
 * The route's dependencies from its Worker env. Mail is sent only when the binding, both addresses and
 * the rate limiter are all present; otherwise `send` is null and the route answers 503.
 */
export function openingNoticeDeps(env: OpeningNoticeEnv): OpeningNoticeDeps {
    const from = env.OPENING_NOTICE_FROM?.trim();
    const to = env.OPENING_NOTICE_TO?.trim();
    const binding = env.OPENING_NOTICE_EMAIL;
    const limiter = env.OPENING_NOTICE_RATE_LIMITER;
    return {
        turnstileSecret: env.OPENING_NOTICE_TURNSTILE_SECRET?.trim() || null,
        send: binding && from && to && limiter
            ? async (mail) => { await binding.send({ to, from, subject: mail.subject, text: mail.text }); }
            : null,
        // Without the limiter binding `send` is null and the route answers 503 before this runs.
        limit: async (key) => {
            if (!limiter) return false;
            try {
                return (await limiter.limit({ key })).success;
            } catch {
                return false;
            }
        },
    };
}

function isCrossOrigin(request: Request): boolean {
    if (request.headers.get('sec-fetch-site') === 'cross-site') return true;
    const origin = request.headers.get('origin');
    if (origin === null) return true;
    try {
        return new URL(origin).host !== new URL(request.url).host;
    } catch {
        return true;
    }
}

function reply(status: number, body: { ok: true } | { error: OpeningNoticeError }): Response {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleOpeningNotice(request: Request, deps: OpeningNoticeDeps): Promise<Response> {
    if (!deps.turnstileSecret || !deps.send) return reply(503, { error: 'unavailable' });
    if (isCrossOrigin(request)) return reply(403, { error: 'invalid_request' });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, { error: 'invalid_request' });

    const ip = request.headers.get('cf-connecting-ip');
    if (!(await deps.limit(`opening-notice:${ip ?? 'unknown'}`))) return reply(429, { error: 'rate_limited' });

    const raw = await request.arrayBuffer();
    if (raw.byteLength > OPENING_NOTICE_LIMITS.bodyBytes) return reply(413, { error: 'invalid_request' });
    let input: unknown;
    try {
        input = JSON.parse(new TextDecoder().decode(raw));
    } catch {
        return reply(400, { error: 'invalid_request' });
    }
    const parsed = parseOpeningNotice(input);
    if (!parsed.ok) return reply(400, { error: parsed.error });

    const verified = await verifyTurnstile({
        token: parsed.turnstileToken,
        secret: deps.turnstileSecret,
        remoteIp: ip,
        expectedAction: OPENING_NOTICE_TURNSTILE_ACTION,
        fetchImpl: deps.fetchImpl,
    });
    if (!verified) return reply(403, { error: 'verification_failed' });

    try {
        await deps.send(openingNoticeMail(parsed.notice, (deps.now ?? (() => new Date()))()));
    } catch {
        return reply(503, { error: 'unavailable' });
    }
    return reply(200, { ok: true });
}
