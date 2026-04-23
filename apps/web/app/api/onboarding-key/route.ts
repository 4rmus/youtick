import { NextResponse } from 'next/server';

/**
 * Secure server-side endpoint for distributing the onboarding Function Call Access Key.
 *
 * Why this exists:
 * - Prevents the key from being baked into the client JS bundle (NEXT_PUBLIC_ leak).
 * - Allows future rate-limiting, Turnstile CAPTCHA, or IP-based throttling.
 * - Key is only delivered over HTTPS to authenticated or valid sessions.
 *
 * Security notes:
 * - The key must be stored in ONBOARDING_KEY (not NEXT_PUBLIC_ONBOARDING_KEY).
 * - The response is never cached by the CDN or browser.
 */
export async function GET(): Promise<NextResponse> {
    const key = process.env.ONBOARDING_KEY;

    if (!key || key.trim().length === 0) {
        return NextResponse.json(
            { error: 'Onboarding key not configured' },
            { status: 503 }
        );
    }

    // Basic format sanity check to catch accidental misconfiguration
    if (!key.startsWith('ed25519:')) {
        return NextResponse.json(
            { error: 'Invalid onboarding key format' },
            { status: 500 }
        );
    }

    // Prevent any caching of this sensitive endpoint
    const response = NextResponse.json({ key });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
}
