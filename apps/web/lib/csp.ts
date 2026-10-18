// The site's Content-Security-Policy, built per request with a fresh nonce (middleware.ts).

/**
 * Cleeng's hosted checkout (V2 card rail, roadmap E8.2) loads its script from Cleeng and renders in
 * an iframe. Only allowed while `NEXT_PUBLIC_V2_CARD_RAIL` is `sandbox`. The iframe's own hosts are
 * not documented; `*.sandbox.cleeng.com` is unverified until the sandbox opens.
 */
function cardRailSources(rail = process.env.NEXT_PUBLIC_V2_CARD_RAIL): { script: string; frame: string } | null {
    return rail?.trim() === 'sandbox' ? { script: ' https://widgets.sandbox.cleeng.com', frame: 'https://*.sandbox.cleeng.com' } : null;
}

/**
 * Cloudflare Turnstile on the creator application and content report forms. Allowed only when one of
 * them is configured (`NEXT_PUBLIC_CREATOR_APPLICATION_TURNSTILE_SITE_KEY`,
 * `NEXT_PUBLIC_CONTENT_REPORT_TURNSTILE_SITE_KEY`); Turnstile needs the host in script-src and frame-src.
 */
export function turnstileSources(
    siteKey = process.env.NEXT_PUBLIC_CREATOR_APPLICATION_TURNSTILE_SITE_KEY,
    reportSiteKey = process.env.NEXT_PUBLIC_CONTENT_REPORT_TURNSTILE_SITE_KEY,
): { script: string; frame: string } | null {
    return siteKey?.trim() || reportSiteKey?.trim() ? { script: ' https://challenges.cloudflare.com', frame: 'https://challenges.cloudflare.com' } : null;
}

export function contentSecurityPolicy(nonce: string, card = cardRailSources(), turnstile = turnstileSources()): string {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const frames = [card?.frame, turnstile?.frame].filter(Boolean);
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com${card?.script ?? ''}${turnstile?.script ?? ''}${isDevelopment ? " 'unsafe-eval'" : ''}`,
        ...(frames.length ? [`frame-src ${frames.join(' ')}`] : []),
        `style-src 'self' 'nonce-${nonce}'`,
        "style-src-elem 'self' 'unsafe-inline'",
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https:",
        "media-src 'self' blob: https:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');
}
