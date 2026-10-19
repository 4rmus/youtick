// Creator applications: validation, Turnstile check, rate limit and the mail to the youtick inbox.
// Nothing is stored; the inbox is the only record (privacy notice, "Creator applications").

export const CREATOR_WORK_TYPES = ['concert', 'film', 'festival', 'other'] as const;
export type CreatorWorkType = (typeof CREATOR_WORK_TYPES)[number];

export type CreatorApplication = {
    locale: 'en' | 'tr';
    name: string;
    email: string;
    country: string;
    workLink: string;
    workType: CreatorWorkType;
    plannedRelease: string;
    message: string;
};

export type CreatorApplicationError =
    | 'invalid_request'
    | 'consent_required'
    | 'verification_failed'
    | 'rate_limited'
    | 'unavailable';

export const CREATOR_APPLICATION_LIMITS = {
    name: 100,
    email: 254,
    country: 60,
    workLink: 300,
    plannedRelease: 100,
    message: 2000,
    turnstileToken: 2048,
    bodyBytes: 16 * 1024,
} as const;

// Control characters other than tab/newline are rejected; single-line fields also reject newlines.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LINE_BREAK = /[\r\n\u2028\u2029]/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function text(value: unknown, max: number, { required, multiline }: { required: boolean; multiline: boolean }): string | null {
    if (value === undefined || value === null) return required ? null : '';
    if (typeof value !== 'string') return null;
    const trimmed = value.normalize('NFC').trim();
    if (required && !trimmed) return null;
    if (trimmed.length > max || CONTROL.test(trimmed)) return null;
    if (!multiline && LINE_BREAK.test(trimmed)) return null;
    return trimmed;
}

function workLink(value: unknown): string | null {
    const raw = text(value, CREATOR_APPLICATION_LIMITS.workLink, { required: true, multiline: false });
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
        return url.toString();
    } catch {
        return null;
    }
}

export type ParsedCreatorApplication =
    | { ok: true; application: CreatorApplication; turnstileToken: string }
    | { ok: false; error: 'invalid_request' | 'consent_required' };

export function parseCreatorApplication(input: unknown): ParsedCreatorApplication {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid_request' };
    const body = input as Record<string, unknown>;
    const locale = body.locale === 'tr' ? 'tr' : body.locale === 'en' ? 'en' : null;
    const name = text(body.name, CREATOR_APPLICATION_LIMITS.name, { required: true, multiline: false });
    const email = text(body.email, CREATOR_APPLICATION_LIMITS.email, { required: true, multiline: false });
    const country = text(body.country, CREATOR_APPLICATION_LIMITS.country, { required: true, multiline: false });
    const link = workLink(body.workLink);
    const workType = CREATOR_WORK_TYPES.find((type) => type === body.workType) ?? null;
    const plannedRelease = text(body.plannedRelease, CREATOR_APPLICATION_LIMITS.plannedRelease, { required: false, multiline: false });
    const message = text(body.message, CREATOR_APPLICATION_LIMITS.message, { required: false, multiline: true });
    const token = text(body.turnstileToken, CREATOR_APPLICATION_LIMITS.turnstileToken, { required: true, multiline: false });
    if (!locale || !name || !email || !EMAIL.test(email) || !country || !link || !workType
        || plannedRelease === null || message === null || !token) {
        return { ok: false, error: 'invalid_request' };
    }
    if (body.consent !== true) return { ok: false, error: 'consent_required' };
    return {
        ok: true,
        application: { locale, name, email, country, workLink: link, workType, plannedRelease, message },
        turnstileToken: token,
    };
}

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Server-side Turnstile check. Any failure, including a network error, counts as not verified. */
export async function verifyTurnstile(input: {
    token: string;
    secret: string;
    remoteIp: string | null;
    expectedAction: string;
    fetchImpl?: typeof fetch;
}): Promise<boolean> {
    const form = new FormData();
    form.set('secret', input.secret);
    form.set('response', input.token);
    if (input.remoteIp) form.set('remoteip', input.remoteIp);
    try {
        const response = await (input.fetchImpl ?? fetch)(TURNSTILE_SITEVERIFY_URL, { method: 'POST', body: form });
        if (!response.ok) return false;
        const result = await response.json() as { success?: unknown; action?: unknown };
        return result.success === true && result.action === input.expectedAction;
    } catch {
        return false;
    }
}

export type CreatorApplicationMail = {
    subject: string;
    text: string;
};

const WORK_TYPE_LABELS: Record<CreatorWorkType, string> = {
    concert: 'Concert recording',
    film: 'Independent film',
    festival: 'Festival selection',
    other: 'Other',
};

/** The mail to the youtick inbox. Applicant text goes only into the body, never into a header. */
export function creatorApplicationMail(application: CreatorApplication, receivedAt: Date): CreatorApplicationMail {
    const lines = [
        `Received: ${receivedAt.toISOString()}`,
        `Page language: ${application.locale}`,
        `Name: ${application.name}`,
        `Email: ${application.email}`,
        `Country: ${application.country}`,
        `Work link: ${application.workLink}`,
        `Work type: ${WORK_TYPE_LABELS[application.workType]}`,
        `Planned first release: ${application.plannedRelease || '-'}`,
        '',
        'Message:',
        application.message || '-',
        '',
        'The applicant agreed to be contacted about this application. Retention: see the privacy notice.',
    ];
    return {
        subject: `Creator application (${application.locale})`,
        text: lines.join('\n'),
    };
}

export type CreatorApplicationDeps = {
    turnstileSecret: string | null;
    send: ((mail: CreatorApplicationMail) => Promise<void>) | null;
    limit: (key: string) => Promise<boolean>;
    fetchImpl?: typeof fetch;
    now?: () => Date;
};

export const CREATOR_APPLICATION_TURNSTILE_ACTION = 'creator_application';

function clientIp(request: Request): string | null {
    return request.headers.get('cf-connecting-ip');
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

function reply(status: number, body: { ok: true } | { error: CreatorApplicationError }): Response {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleCreatorApplication(request: Request, deps: CreatorApplicationDeps): Promise<Response> {
    if (!deps.turnstileSecret || !deps.send) return reply(503, { error: 'unavailable' });
    if (isCrossOrigin(request)) return reply(403, { error: 'invalid_request' });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, { error: 'invalid_request' });

    const ip = clientIp(request);
    if (!(await deps.limit(`creator-application:${ip ?? 'unknown'}`))) return reply(429, { error: 'rate_limited' });

    const raw = await request.arrayBuffer();
    if (raw.byteLength > CREATOR_APPLICATION_LIMITS.bodyBytes) return reply(413, { error: 'invalid_request' });
    let input: unknown;
    try {
        input = JSON.parse(new TextDecoder().decode(raw));
    } catch {
        return reply(400, { error: 'invalid_request' });
    }
    const parsed = parseCreatorApplication(input);
    if (!parsed.ok) return reply(400, { error: parsed.error });

    const verified = await verifyTurnstile({
        token: parsed.turnstileToken,
        secret: deps.turnstileSecret,
        remoteIp: ip,
        expectedAction: CREATOR_APPLICATION_TURNSTILE_ACTION,
        fetchImpl: deps.fetchImpl,
    });
    if (!verified) return reply(403, { error: 'verification_failed' });

    try {
        await deps.send(creatorApplicationMail(parsed.application, (deps.now ?? (() => new Date()))()));
    } catch {
        return reply(503, { error: 'unavailable' });
    }
    return reply(200, { ok: true });
}
