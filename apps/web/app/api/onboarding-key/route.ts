import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { RateLimiter } from '@/lib/rate-limiter';

/**
 * Secure server-side endpoint for distributing onboarding Function Call Access Keys.
 *
 * Protections added per 2026-04 security audit:
 * - Per-IP rate limiting (5 req/hour)
 * - Cloudflare Turnstile challenge verification (when configured)
 * - Request logging and alerting hooks
 * - Multiple key pool support (random distribution)
 * - Never caches the response
 */

// Onboarding key fetch limiter: 5 requests per IP per hour
const onboardingKeyLimiter = new RateLimiter(
    {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 5,
    },
    'onboarding-key-per-ip'
);

async function getClientIp(): Promise<string> {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = h.get('x-real-ip');
    if (realIp) return realIp.trim();
    return 'unknown';
}

function logRequest(ip: string, result: string, details?: string) {
    const timestamp = new Date().toISOString();
    console.log(
        `[ONBOARDING_KEY_API] ${timestamp} ip=${ip} result=${result}${details ? ' ' + details : ''}`
    );
}

async function verifyTurnstile(token: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return true; // Skip if not configured

    try {
        const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, response: token }),
        });
        const data = await resp.json();
        return data.success === true;
    } catch {
        return false;
    }
}

export async function GET(request: Request): Promise<NextResponse> {
    const ip = await getClientIp();

    // Rate limit check
    if (!onboardingKeyLimiter.checkLimit(ip)) {
        logRequest(ip, 'RATE_LIMITED');
        return NextResponse.json(
            { error: 'Rate limit exceeded. Please try again later.' },
            { status: 429 }
        );
    }

    // Turnstile verification (required when the server-side secret is set)
    const { searchParams } = new URL(request.url);
    const turnstileToken = searchParams.get('turnstileToken');
    const requireTurnstile = process.env.NODE_ENV !== 'development' && Boolean(process.env.TURNSTILE_SECRET_KEY);

    if (requireTurnstile) {
        if (!turnstileToken) {
            logRequest(ip, 'TURNSTILE_MISSING');
            onboardingKeyLimiter.rollback(ip);
            return NextResponse.json(
                { error: 'Challenge token required.' },
                { status: 403 }
            );
        }
        const ok = await verifyTurnstile(turnstileToken);
        if (!ok) {
            logRequest(ip, 'TURNSTILE_FAILED');
            onboardingKeyLimiter.rollback(ip);
            return NextResponse.json(
                { error: 'Challenge verification failed.' },
                { status: 403 }
            );
        }
    }

    // Support multiple keys (ONBOARDING_KEYS=comma,separated,list)
    // Falls back to legacy ONBOARDING_KEY for backward compatibility
    const keysEnv = process.env.ONBOARDING_KEYS || process.env.ONBOARDING_KEY;
    if (!keysEnv || keysEnv.trim().length === 0) {
        logRequest(ip, 'NOT_CONFIGURED');
        return NextResponse.json(
            { error: 'Onboarding key not configured' },
            { status: 503 }
        );
    }

    const keys = keysEnv
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.startsWith('ed25519:'));

    if (keys.length === 0) {
        logRequest(ip, 'INVALID_FORMAT');
        return NextResponse.json(
            { error: 'Invalid onboarding key format' },
            { status: 500 }
        );
    }

    // Randomly select one key to distribute load and avoid single-key fingerprinting
    const key = keys[Math.floor(Math.random() * keys.length)];

    logRequest(ip, 'SUCCESS', `keys_available=${keys.length}`);

    const response = NextResponse.json({ key });
    response.headers.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
}
