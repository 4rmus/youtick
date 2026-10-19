import { getCloudflareContext } from '@opennextjs/cloudflare';
import { handleOpeningNotice, type OpeningNoticeMail } from '@/lib/opening-notice';

// Cloudflare Email Service binding (`send_email`, structured API), as for creator applications. Off
// until the binding, the sender and recipient addresses, the rate limiter and the Turnstile secret
// are all configured; the route then answers 503 and the page shows the e-mail address instead.
type EmailBinding = { send(message: { to: string; from: string; subject: string; text: string }): Promise<unknown> };
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

type OpeningNoticeEnv = {
    OPENING_NOTICE_EMAIL?: EmailBinding;
    OPENING_NOTICE_FROM?: string;
    OPENING_NOTICE_TO?: string;
    OPENING_NOTICE_TURNSTILE_SECRET?: string;
    OPENING_NOTICE_RATE_LIMITER?: RateLimiter;
};

export async function POST(request: Request): Promise<Response> {
    let env: OpeningNoticeEnv = {};
    try {
        env = (await getCloudflareContext({ async: true })).env as OpeningNoticeEnv;
    } catch {
        // No Cloudflare context (plain `next dev`): the route reports itself unavailable.
    }
    const from = env.OPENING_NOTICE_FROM?.trim();
    const to = env.OPENING_NOTICE_TO?.trim();
    const binding = env.OPENING_NOTICE_EMAIL;
    const limiter = env.OPENING_NOTICE_RATE_LIMITER;
    const send = binding && from && to && limiter
        ? async (mail: OpeningNoticeMail) => { await binding.send({ to, from, subject: mail.subject, text: mail.text }); }
        : null;

    return handleOpeningNotice(request, {
        turnstileSecret: env.OPENING_NOTICE_TURNSTILE_SECRET?.trim() || null,
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
