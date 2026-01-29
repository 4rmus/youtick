/**
 * Error Handling Module
 * Standardized error classes and codes for YouTick
 *
 * Usage:
 * import { AppError, ErrorCodes, isRetryableError } from '@/lib/errors';
 *
 * throw new AppError(ErrorCodes.RATE_LIMITED, 'Too many requests', true);
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standardized error codes for the application
 */
export const ErrorCodes = {
    // Rate Limiting
    RATE_LIMITED: 'RATE_LIMITED',
    DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',

    // Network & RPC
    NETWORK_ERROR: 'NETWORK_ERROR',
    RPC_ERROR: 'RPC_ERROR',
    RPC_TIMEOUT: 'RPC_TIMEOUT',
    ALL_RPC_FAILED: 'ALL_RPC_FAILED',

    // Authentication & Authorization
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    INVALID_SIGNATURE: 'INVALID_SIGNATURE',

    // NEAR Contract
    CONTRACT_ERROR: 'CONTRACT_ERROR',
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    INSUFFICIENT_GAS: 'INSUFFICIENT_GAS',
    STORAGE_DEPOSIT_REQUIRED: 'STORAGE_DEPOSIT_REQUIRED',
    TRIAL_POOL_EMPTY: 'TRIAL_POOL_EMPTY',
    ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
    ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',

    // Lit Protocol
    LIT_ERROR: 'LIT_ERROR',
    ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
    DECRYPTION_FAILED: 'DECRYPTION_FAILED',
    PKP_MINTING_FAILED: 'PKP_MINTING_FAILED',
    SESSION_SIGS_FAILED: 'SESSION_SIGS_FAILED',
    ACCESS_DENIED: 'ACCESS_DENIED',
    CAPABILITY_ERROR: 'CAPABILITY_ERROR',

    // IPFS / Crust Storage
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    IPFS_FETCH_FAILED: 'IPFS_FETCH_FAILED',
    CRUST_ERROR: 'CRUST_ERROR',

    // Validation
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_PARAMETER: 'MISSING_PARAMETER',

    // Configuration
    CONFIG_ERROR: 'CONFIG_ERROR',
    MISSING_ENV_VAR: 'MISSING_ENV_VAR',
    INVALID_CONFIG: 'INVALID_CONFIG',

    // General
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// App Error Class
// ============================================================================

/**
 * Custom application error with structured information
 */
export class AppError extends Error {
    /**
     * @param code - Error code from ErrorCodes
     * @param message - Human-readable error message
     * @param retryable - Whether the operation can be retried
     * @param details - Additional error details (for logging)
     * @param cause - Original error that caused this error
     */
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly retryable: boolean = false,
        public readonly details?: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'AppError';

        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }

    /**
     * Create error from unknown caught value
     */
    static from(error: unknown, defaultCode: ErrorCode = ErrorCodes.UNKNOWN_ERROR): AppError {
        if (error instanceof AppError) {
            return error;
        }

        if (error instanceof Error) {
            // Try to detect specific error types
            const code = detectErrorCode(error);
            return new AppError(
                code || defaultCode,
                error.message,
                isRetryableByCode(code || defaultCode),
                undefined,
                error
            );
        }

        const message = typeof error === 'string' ? error : 'Unknown error occurred';
        return new AppError(defaultCode, message, false);
    }

    /**
     * Convert to JSON for API responses
     */
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            details: this.details,
        };
    }
}

// ============================================================================
// Error Detection
// ============================================================================

/**
 * Detect error code from error message
 */
function detectErrorCode(error: Error): ErrorCode | null {
    const message = error.message.toLowerCase();

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
        return ErrorCodes.RATE_LIMITED;
    }

    // Network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('econnrefused')) {
        return ErrorCodes.NETWORK_ERROR;
    }

    // RPC errors
    if (message.includes('rpc') || message.includes('timeout') || message.includes('502') || message.includes('503')) {
        return ErrorCodes.RPC_ERROR;
    }

    // NEAR contract errors
    if (message.includes('insufficient') && message.includes('balance')) {
        return ErrorCodes.INSUFFICIENT_BALANCE;
    }
    if (message.includes('trial pool empty')) {
        return ErrorCodes.TRIAL_POOL_EMPTY;
    }
    if (message.includes('already exists')) {
        return ErrorCodes.ACCOUNT_EXISTS;
    }

    // Lit Protocol errors
    if (message.includes('capability') || message.includes('sessionSigs')) {
        return ErrorCodes.CAPABILITY_ERROR;
    }
    if (message.includes('access') && message.includes('denied')) {
        return ErrorCodes.ACCESS_DENIED;
    }
    if (message.includes('decrypt')) {
        return ErrorCodes.DECRYPTION_FAILED;
    }
    if (message.includes('encrypt')) {
        return ErrorCodes.ENCRYPTION_FAILED;
    }

    // Upload errors
    if (message.includes('upload') && message.includes('failed')) {
        return ErrorCodes.UPLOAD_FAILED;
    }

    return null;
}

/**
 * Check if error code is retryable by default
 */
function isRetryableByCode(code: ErrorCode): boolean {
    const retryableCodes: ErrorCode[] = [
        ErrorCodes.RATE_LIMITED,
        ErrorCodes.NETWORK_ERROR,
        ErrorCodes.RPC_ERROR,
        ErrorCodes.RPC_TIMEOUT,
        ErrorCodes.SESSION_EXPIRED,
        ErrorCodes.CAPABILITY_ERROR,
    ];
    return retryableCodes.includes(code);
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
    if (error instanceof AppError) {
        return error.retryable;
    }

    if (error instanceof Error) {
        const code = detectErrorCode(error);
        if (code) {
            return isRetryableByCode(code);
        }
    }

    return false;
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
    if (error instanceof AppError) {
        return error.message;
    }

    if (error instanceof Error) {
        // Clean up technical messages
        const message = error.message;

        if (message.includes('fetch')) {
            return 'Network connection failed. Please check your internet connection.';
        }
        if (message.includes('timeout')) {
            return 'Request timed out. Please try again.';
        }
        if (message.includes('rate limit')) {
            return 'Too many requests. Please wait a moment and try again.';
        }
        if (message.includes('insufficient balance')) {
            return 'Insufficient balance. Please add more NEAR to your account.';
        }
        if (message.includes('access denied') || message.includes('not authorized')) {
            return 'You do not have access to this content.';
        }

        return message;
    }

    return 'An unexpected error occurred. Please try again.';
}

/**
 * Log error with context
 */
export function logError(
    error: unknown,
    context?: string,
    additionalInfo?: Record<string, unknown>
): void {
    const appError = AppError.from(error);

    console.error(`[${context || 'Error'}]`, {
        code: appError.code,
        message: appError.message,
        retryable: appError.retryable,
        details: appError.details,
        ...additionalInfo,
        stack: appError.stack,
    });
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a rate limit error
 */
export function rateLimitError(retryAfterSeconds?: number): AppError {
    const message = retryAfterSeconds
        ? `Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`
        : 'Rate limit exceeded. Please try again later.';
    return new AppError(ErrorCodes.RATE_LIMITED, message, true);
}

/**
 * Create a validation error
 */
export function validationError(message: string): AppError {
    return new AppError(ErrorCodes.VALIDATION_ERROR, message, false);
}

/**
 * Create a network error
 */
export function networkError(message?: string): AppError {
    return new AppError(
        ErrorCodes.NETWORK_ERROR,
        message || 'Network connection failed. Please check your internet connection.',
        true
    );
}

/**
 * Create a configuration error
 */
export function configError(missing: string): AppError {
    return new AppError(
        ErrorCodes.CONFIG_ERROR,
        `Configuration error: ${missing} is not configured.`,
        false
    );
}
