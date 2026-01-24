/**
 * API Middleware Module
 * Standardized utilities for API route handling
 *
 * Usage:
 * import { withCors, successResponse, errorResponse } from '@/lib/api/middleware';
 */

import { NextRequest, NextResponse } from 'next/server';
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Standard success response format
 */
export interface SuccessResponseData<T = unknown> {
    success: true;
    data: T;
}

/**
 * Standard error response format
 */
export interface ErrorResponseData {
    success: false;
    error: string;
    code: string;
    details?: string;
    retryAfter?: number;
}

/**
 * Create a standardized success response
 *
 * @param data - Response data
 * @param request - Original request (for CORS headers)
 * @param status - HTTP status code (default: 200)
 */
export function successResponse<T>(
    data: T,
    request?: NextRequest,
    status: number = 200
): NextResponse {
    const response = NextResponse.json(
        { success: true, data } as SuccessResponseData<T>,
        { status }
    );

    if (request) {
        return addCorsHeaders(response, request) as NextResponse;
    }

    return response;
}

/**
 * Create a standardized error response
 *
 * @param code - Error code (e.g., 'RATE_LIMITED', 'VALIDATION_ERROR')
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @param request - Original request (for CORS headers)
 * @param options - Additional options (retryAfter, details)
 */
export function errorResponse(
    code: string,
    message: string,
    status: number,
    request?: NextRequest,
    options?: { retryAfter?: number; details?: string }
): NextResponse {
    const responseData: ErrorResponseData = {
        success: false,
        error: message,
        code,
        ...options
    };

    const headers: HeadersInit = {};
    if (options?.retryAfter) {
        headers['Retry-After'] = options.retryAfter.toString();
    }

    const response = NextResponse.json(responseData, { status, headers });

    if (request) {
        return addCorsHeaders(response, request) as NextResponse;
    }

    return response;
}

// ============================================================================
// Common Error Responses
// ============================================================================

/**
 * Rate limit exceeded response
 */
export function rateLimitResponse(
    request: NextRequest,
    retryAfterSeconds: number,
    message: string = 'Rate limit exceeded'
): NextResponse {
    return errorResponse(
        'RATE_LIMITED',
        message,
        429,
        request,
        { retryAfter: retryAfterSeconds }
    );
}

/**
 * Validation error response
 */
export function validationError(
    request: NextRequest,
    message: string
): NextResponse {
    return errorResponse('VALIDATION_ERROR', message, 400, request);
}

/**
 * Not found response
 */
export function notFoundResponse(
    request: NextRequest,
    message: string = 'Resource not found'
): NextResponse {
    return errorResponse('NOT_FOUND', message, 404, request);
}

/**
 * Server configuration error response
 */
export function configError(
    request: NextRequest,
    message: string = 'Server configuration error'
): NextResponse {
    return errorResponse('CONFIG_ERROR', message, 500, request);
}

/**
 * Internal server error response
 */
export function serverError(
    request: NextRequest,
    message: string = 'Internal server error',
    details?: string
): NextResponse {
    return errorResponse('INTERNAL_ERROR', message, 500, request, { details });
}

// ============================================================================
// Middleware Wrappers
// ============================================================================

type ApiHandler = (request: NextRequest) => Promise<NextResponse>;

/**
 * Wrap an API handler with CORS support
 * Automatically handles preflight requests and adds CORS headers
 */
export function withCors(handler: ApiHandler): ApiHandler {
    return async (request: NextRequest) => {
        // Handle preflight
        if (request.method === 'OPTIONS') {
            return handleCorsPreflightRequest(request) as NextResponse;
        }

        // Check CORS
        const corsBlock = checkCors(request);
        if (corsBlock) return corsBlock as NextResponse;

        // Execute handler
        const response = await handler(request);

        // Add CORS headers
        return addCorsHeaders(response, request) as NextResponse;
    };
}

/**
 * Wrap an API handler with error handling
 */
export function withErrorHandling(handler: ApiHandler): ApiHandler {
    return async (request: NextRequest) => {
        try {
            return await handler(request);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('API Error:', error);
            return serverError(request, message);
        }
    };
}

/**
 * Combine multiple middleware wrappers
 */
export function withMiddleware(
    handler: ApiHandler,
    ...middlewares: ((handler: ApiHandler) => ApiHandler)[]
): ApiHandler {
    return middlewares.reduceRight(
        (acc, middleware) => middleware(acc),
        handler
    );
}

// ============================================================================
// Request Helpers
// ============================================================================

/**
 * Get client IP from request headers
 */
export function getClientIp(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Parse JSON body with error handling
 */
export async function parseJsonBody<T>(request: NextRequest): Promise<T | null> {
    try {
        return await request.json() as T;
    } catch {
        return null;
    }
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { addCorsHeaders, handleCorsPreflightRequest, checkCors } from '@/lib/cors';
