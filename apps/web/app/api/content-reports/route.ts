import { getCloudflareContext } from '@opennextjs/cloudflare';
import { handleContentReport, type ContentReportMail } from '@/lib/content-report';

// Cloudflare Email Service binding (`send_email`, structured API), as for creator applications. Off
// until the binding, the sender and recipient addresses, the rate limiter and the Turnstile secret
// are all configured; the route then answers 503 and the report page shows the e-mail address instead.
type EmailBinding = { send(message: { to: string; from: string; subject: string; text: string }): Promise<unknown> };
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

type ContentReportEnv = {
    CONTENT_REPORT_EMAIL?: EmailBinding;
    CONTENT_REPORT_FROM?: string;
    CONTENT_REPORT_TO?: string;
    CONTENT_REPORT_TURNSTILE_SECRET?: string;
    CONTENT_REPORT_RATE_LIMITER?: RateLimiter;
};

export async function POST(request: Request): Promise<Response> {
    let env: ContentReportEnv = {};
    try {
        env = (await getCloudflareContext({ async: true })).env as ContentReportEnv;
    } catch {
        // No Cloudflare context (plain `next dev`): the route reports itself unavailable.
    }
    const from = env.CONTENT_REPORT_FROM?.trim();
    const to = env.CONTENT_REPORT_TO?.trim();
    const binding = env.CONTENT_REPORT_EMAIL;
    const limiter = env.CONTENT_REPORT_RATE_LIMITER;
    const send = binding && from && to && limiter
        ? async (mail: ContentReportMail) => { await binding.send({ to, from, subject: mail.subject, text: mail.text }); }
        : null;

    return handleContentReport(request, {
        turnstileSecret: env.CONTENT_REPORT_TURNSTILE_SECRET?.trim() || null,
        send,
        // Without the limiter binding `send` is null and the route answers 503 before this runs.
        limit: async (key) => {
            if (!limiter) return false;
            try {
                return (await limiter.limit({ key })).success;
            } catch {
                return false;
            }
        },
    });
}
