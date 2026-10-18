/** Build-time public Turnstile site key of the report form; without it the page shows the e-mail address. */
export function contentReportSiteKey(raw = process.env.NEXT_PUBLIC_CONTENT_REPORT_TURNSTILE_SITE_KEY): string | null {
    return raw?.trim() || null;
}
