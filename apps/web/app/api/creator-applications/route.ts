import { getCloudflareContext } from '@opennextjs/cloudflare';
import { handleCreatorApplication, type CreatorApplicationMail } from '@/lib/creator-application';

// Cloudflare Email Service binding (`send_email`, structured API). Off until the binding, the sender and
// recipient addresses and the Turnstile secret are all configured; the route then answers 503.
type EmailBinding = { send(message: { to: string; from: string; subject: string; text: string }): Promise<unknown> };
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

type CreatorApplicationEnv = {
    CREATOR_APPLICATION_EMAIL?: EmailBinding;
    CREATOR_APPLICATION_FROM?: string;
    CREATOR_APPLICATION_TO?: string;
    CREATOR_APPLICATION_TURNSTILE_SECRET?: string;
    CREATOR_APPLICATION_RATE_LIMITER?: RateLimiter;
};

export async function POST(request: Request): Promise<Response> {
    let env: CreatorApplicationEnv = {};
    try {
        env = (await getCloudflareContext({ async: true })).env as CreatorApplicationEnv;
    } catch {
        // No Cloudflare context (plain `next dev`): the route reports itself unavailable.
    }
    const from = env.CREATOR_APPLICATION_FROM?.trim();
    const to = env.CREATOR_APPLICATION_TO?.trim();
    const binding = env.CREATOR_APPLICATION_EMAIL;
    const limiter = env.CREATOR_APPLICATION_RATE_LIMITER;
    const send = binding && from && to && limiter
        ? async (mail: CreatorApplicationMail) => { await binding.send({ to, from, subject: mail.subject, text: mail.text }); }
        : null;

    return handleCreatorApplication(request, {
        turnstileSecret: env.CREATOR_APPLICATION_TURNSTILE_SECRET?.trim() || null,
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
