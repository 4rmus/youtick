import { getCloudflareContext } from '@opennextjs/cloudflare';
import { handleOpeningNotice, openingNoticeDeps, type OpeningNoticeEnv } from '@/lib/opening-notice';

// Off until the Email Service binding, the sender and recipient addresses, the rate limiter and the
// Turnstile secret are all configured; until then the route answers 503. The page shows the e-mail
// fallback only while NEXT_PUBLIC_OPENING_NOTICE_TURNSTILE_SITE_KEY is unset, so set the site key only
// after the bindings, vars and secret are in place.
export async function POST(request: Request): Promise<Response> {
    let env: OpeningNoticeEnv = {};
    try {
        env = (await getCloudflareContext({ async: true })).env as OpeningNoticeEnv;
    } catch {
        // No Cloudflare context (plain `next dev`): the route reports itself unavailable.
    }
    return handleOpeningNotice(request, openingNoticeDeps(env));
}
