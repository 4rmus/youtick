/** Build-time public Turnstile site key of the opening-notice form; without it the page shows the e-mail address. */
export function openingNoticeSiteKey(raw = process.env.NEXT_PUBLIC_OPENING_NOTICE_TURNSTILE_SITE_KEY): string | null {
    return raw?.trim() || null;
}
