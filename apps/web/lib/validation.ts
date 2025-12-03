// lib/validation.ts
/**
 * Input validation utilities for API routes
 * SECURITY: Validates and sanitizes all user input
 */

/**
 * Validates that a string is non-empty and within length limits
 */
export function validateString(
    value: unknown,
    fieldName: string,
    options: { minLength?: number; maxLength?: number; pattern?: RegExp } = {}
): string {
    if (typeof value !== 'string') {
        throw new ValidationError(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        throw new ValidationError(`${fieldName} cannot be empty`);
    }

    if (options.minLength && trimmed.length < options.minLength) {
        throw new ValidationError(
            `${fieldName} must be at least ${options.minLength} characters`
        );
    }

    if (options.maxLength && trimmed.length > options.maxLength) {
        throw new ValidationError(
            `${fieldName} must be no more than ${options.maxLength} characters`
        );
    }

    if (options.pattern && !options.pattern.test(trimmed)) {
        throw new ValidationError(`${fieldName} has invalid format`);
    }

    return trimmed;
}

/**
 * Sanitizes a string to only allow alphanumeric characters, underscores, and hyphens
 * Useful for IDs, tokens, etc.
 */
export function sanitizeId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Validates video access request body
 */
export interface VideoAccessRequest {
    tokenId: string;
    playbackId: string;
}

export function validateVideoAccessRequest(body: unknown): VideoAccessRequest {
    if (!body || typeof body !== 'object') {
        throw new ValidationError('Request body must be a JSON object');
    }

    const data = body as Record<string, unknown>;

    // Validate tokenId
    const tokenId = validateString(data.tokenId, 'tokenId', {
        minLength: 1,
        maxLength: 256,
        pattern: /^[a-zA-Z0-9_.-]+$/, // Alphanumeric + common separators
    });

    // Validate playbackId
    const playbackId = validateString(data.playbackId, 'playbackId', {
        minLength: 1,
        maxLength: 256,
        pattern: /^[a-zA-Z0-9_-]+$/, // Alphanumeric + underscore/hyphen
    });

    return { tokenId, playbackId };
}

/**
 * Custom validation error
 */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Validates NEAR wallet address format
 */
export function validateNearAddress(address: string): boolean {
    // NEAR addresses can be:
    // 1. Implicit (64 hex characters)
    // 2. Named (account.testnet or account.near)
    const implicitPattern = /^[0-9a-f]{64}$/;
    const namedPattern = /^[a-z0-9_-]+\.(testnet|near)$/;

    return implicitPattern.test(address) || namedPattern.test(address);
}

/**
 * Validates NFT token ID format
 * Typically a number or string identifier
 */
export function validateTokenId(tokenId: string): boolean {
    // Allow alphanumeric, underscores, hyphens, dots
    // Max length: 256 characters (reasonable limit)
    return /^[a-zA-Z0-9_.-]{1,256}$/.test(tokenId);
}

/**
 * Validates Livepeer playback ID format
 */
export function validatePlaybackId(playbackId: string): boolean {
    // Livepeer playback IDs are typically alphanumeric with hyphens/underscores
    return /^[a-zA-Z0-9_-]{1,256}$/.test(playbackId);
}

/**
 * Rate limiting helper (simple in-memory implementation)
 * For production, use Redis or similar
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
    identifier: string,
    maxRequests: number = 100,
    windowMs: number = 60000 // 1 minute
): boolean {
    const now = Date.now();
    const limit = rateLimitMap.get(identifier);

    if (limit && now < limit.resetTime) {
        if (limit.count >= maxRequests) {
            return false; // Rate limit exceeded
        }
        limit.count++;
    } else {
        rateLimitMap.set(identifier, {
            count: 1,
            resetTime: now + windowMs,
        });
    }

    // Cleanup old entries periodically
    if (rateLimitMap.size > 10000) {
        for (const [key, value] of rateLimitMap.entries()) {
            if (now >= value.resetTime) {
                rateLimitMap.delete(key);
            }
        }
    }

    return true; // Within rate limit
}
