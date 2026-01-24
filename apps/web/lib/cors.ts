/**
 * CORS Configuration for YouTick API Routes
 *
 * SECURITY: Only allows requests from approved origins
 * - Production: youtick.net
 * - Development: localhost
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
    'https://youtick.net',
    'https://www.youtick.net',
    // Development origins
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
];

/**
 * Check if origin is allowed
 */
export function isAllowedOrigin(origin: string | null): boolean {
    if (!origin) return false;
    return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Get CORS headers for a request
 * Returns appropriate headers based on origin validation
 */
export function getCorsHeaders(request: Request): HeadersInit {
    const origin = request.headers.get('origin');

    // Only set Access-Control-Allow-Origin for allowed origins
    if (origin && isAllowedOrigin(origin)) {
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400', // 24 hours
        };
    }

    // For disallowed origins, don't include CORS headers
    // The browser will block the request
    return {};
}

/**
 * Add CORS headers to a NextResponse
 */
export function addCorsHeaders(response: Response, request: Request): Response {
    const headers = getCorsHeaders(request);

    Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    return response;
}

/**
 * Create OPTIONS response for preflight requests
 */
export function handleCorsPreflightRequest(request: Request): Response {
    const origin = request.headers.get('origin');

    if (origin && isAllowedOrigin(origin)) {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    // Return 403 for disallowed origins
    return new Response('Forbidden', { status: 403 });
}

/**
 * Middleware-style CORS check
 * Returns null if allowed, or a Response if blocked
 */
export function checkCors(request: Request): Response | null {
    const origin = request.headers.get('origin');

    // No origin header (same-origin request or non-browser) - allow
    if (!origin) return null;

    // Check if origin is allowed
    if (isAllowedOrigin(origin)) return null;

    // Block disallowed origins
    console.warn(`[CORS] Blocked request from disallowed origin: ${origin}`);
    return new Response(JSON.stringify({
        error: 'CORS policy: Origin not allowed',
        code: 'CORS_BLOCKED'
    }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
    });
}
