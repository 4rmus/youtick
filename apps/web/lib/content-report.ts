// Content reports and takedown requests (gate C3, E9-lite): validation, Turnstile check, rate limit and
// the mail to the youtick inbox. Same pattern as lib/creator-application.ts. Nothing is stored; the
// inbox is the only record. Off until the Email Service binding, addresses, rate limiter and Turnstile
// secret are configured (app/api/content-reports/route.ts).
import { verifyTurnstile } from './creator-application';

export const CONTENT_REPORTER_ROLES = ['rights_holder', 'viewer', 'other'] as const;
export type ContentReporterRole = (typeof CONTENT_REPORTER_ROLES)[number];

export const CONTENT_REPORT_REASONS = ['copyright', 'other_rights', 'illegal', 'harmful', 'privacy', 'not_as_described', 'other'] as const;
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];

export type ContentReport = {
    role: ContentReporterRole;
    reason: ContentReportReason;
    name: string;
    email: string;
    contentLink: string;
    /** Rights holders: the work or right concerned and, for an agent, whom they act for. */
    rightsDetails: string;
    details: string;
};

export type ContentReportError =
    | 'invalid_request'
    | 'declaration_required'
    | 'verification_failed'
    | 'rate_limited'
    | 'unavailable';

export const CONTENT_REPORT_LIMITS = {
    name: 100,
    email: 254,
    contentLink: 500,
    rightsDetails: 1000,
    detailsMin: 20,
    details: 4000,
    turnstileToken: 2048,
    bodyBytes: 24 * 1024,
} as const;

export const CONTENT_REPORT_TURNSTILE_ACTION = 'content_report';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LINE_BREAK = /[\r\n\u2028\u2029]/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function text(value: unknown, max: number, { required, multiline, min = 0 }: { required: boolean; multiline: boolean; min?: number }): string | null {
    if (value === undefined || value === null) return required ? null : '';
    if (typeof value !== 'string') return null;
    const trimmed = value.normalize('NFC').trim();
    if (required && !trimmed) return null;
    if (trimmed && trimmed.length < min) return null;
    if (trimmed.length > max || CONTROL.test(trimmed)) return null;
    if (!multiline && LINE_BREAK.test(trimmed)) return null;
    return trimmed;
}

function link(value: unknown): string | null {
    const raw = text(value, CONTENT_REPORT_LIMITS.contentLink, { required: true, multiline: false });
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
        return url.toString();
    } catch {
        return null;
    }
}

export type ParsedContentReport =
    | { ok: true; report: ContentReport; turnstileToken: string }
    | { ok: false; error: 'invalid_request' | 'declaration_required' };

export function parseContentReport(input: unknown): ParsedContentReport {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid_request' };
    const body = input as Record<string, unknown>;
    const role = CONTENT_REPORTER_ROLES.find((value) => value === body.role) ?? null;
    const reason = CONTENT_REPORT_REASONS.find((value) => value === body.reason) ?? null;
    const name = text(body.name, CONTENT_REPORT_LIMITS.name, { required: true, multiline: false });
    const email = text(body.email, CONTENT_REPORT_LIMITS.email, { required: true, multiline: false });
    const contentLink = link(body.contentLink);
    const rightsDetails = text(body.rightsDetails, CONTENT_REPORT_LIMITS.rightsDetails, { required: false, multiline: true });
    const details = text(body.details, CONTENT_REPORT_LIMITS.details, { required: true, multiline: true, min: CONTENT_REPORT_LIMITS.detailsMin });
    const token = text(body.turnstileToken, CONTENT_REPORT_LIMITS.turnstileToken, { required: true, multiline: false });
    if (!role || !reason || !name || !email || !EMAIL.test(email) || !contentLink || rightsDetails === null || !details || !token) {
        return { ok: false, error: 'invalid_request' };
    }
    // A rights claim must say which right is concerned.
    if (role === 'rights_holder' && (reason === 'copyright' || reason === 'other_rights') && !rightsDetails) {
        return { ok: false, error: 'invalid_request' };
    }
    if (body.declaration !== true) return { ok: false, error: 'declaration_required' };
    return { ok: true, report: { role, reason, name, email, contentLink, rightsDetails, details }, turnstileToken: token };
}

export type ContentReportMail = { subject: string; text: string };

const ROLE_LABELS: Record<ContentReporterRole, string> = {
    rights_holder: 'Rights holder or their agent',
    viewer: 'Viewer',
    other: 'Other',
};

export const REASON_LABELS: Record<ContentReportReason, string> = {
    copyright: 'Copyright infringement',
    other_rights: 'Other rights (trade mark, image or voice rights)',
    illegal: 'Illegal content',
    harmful: 'Harmful or abusive content',
    privacy: 'Personal data or privacy',
    not_as_described: 'Not as described',
    other: 'Something else',
};

/** The mail to the youtick inbox. Reporter text goes only into the body, never into a header. */
export function contentReportMail(report: ContentReport, receivedAt: Date): ContentReportMail {
    const lines = [
        `Received: ${receivedAt.toISOString()}`,
        `Reporter: ${ROLE_LABELS[report.role]}`,
        `Reason: ${REASON_LABELS[report.reason]}`,
        `Name: ${report.name}`,
        `Email: ${report.email}`,
        `Content link: ${report.contentLink}`,
        '',
        'Right concerned:',
        report.rightsDetails || '-',
        '',
        'Report:',
        report.details,
        '',
        'The reporter declared that the report is accurate and made in good faith. Nothing was stored by the web service.',
    ];
    return { subject: `Content report: ${REASON_LABELS[report.reason]}`, text: lines.join('\n') };
}

export type ContentReportDeps = {
    turnstileSecret: string | null;
    send: ((mail: ContentReportMail) => Promise<void>) | null;
    limit: (key: string) => Promise<boolean>;
    fetchImpl?: typeof fetch;
    now?: () => Date;
};

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

function reply(status: number, body: { ok: true } | { error: ContentReportError }): Response {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleContentReport(request: Request, deps: ContentReportDeps): Promise<Response> {
    if (!deps.turnstileSecret || !deps.send) return reply(503, { error: 'unavailable' });
    if (isCrossOrigin(request)) return reply(403, { error: 'invalid_request' });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, { error: 'invalid_request' });

    const ip = request.headers.get('cf-connecting-ip');
    if (!(await deps.limit(`content-report:${ip ?? 'unknown'}`))) return reply(429, { error: 'rate_limited' });

    const raw = await request.arrayBuffer();
    if (raw.byteLength > CONTENT_REPORT_LIMITS.bodyBytes) return reply(413, { error: 'invalid_request' });
    let input: unknown;
    try {
        input = JSON.parse(new TextDecoder().decode(raw));
    } catch {
        return reply(400, { error: 'invalid_request' });
    }
    const parsed = parseContentReport(input);
    if (!parsed.ok) return reply(400, { error: parsed.error });

    const verified = await verifyTurnstile({
        token: parsed.turnstileToken,
        secret: deps.turnstileSecret,
        remoteIp: ip,
        expectedAction: CONTENT_REPORT_TURNSTILE_ACTION,
        fetchImpl: deps.fetchImpl,
    });
    if (!verified) return reply(403, { error: 'verification_failed' });

    try {
        await deps.send(contentReportMail(parsed.report, (deps.now ?? (() => new Date()))()));
    } catch {
        return reply(503, { error: 'unavailable' });
    }
    return reply(200, { ok: true });
}
