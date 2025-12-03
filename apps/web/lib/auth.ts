// lib/auth.ts
import { supabaseAdmin } from './supabase';

export interface UserPayload {
    wallet: string;
    sub: string; // profile ID
}

/**
 * Verifies a Supabase JWT token and returns the user's wallet information
 *
 * SECURITY: This function now uses ONLY real Supabase JWT verification.
 * All mock authentication and fallback logic has been removed.
 *
 * @param authHeader - The Authorization header (format: "Bearer <token>")
 * @returns UserPayload if valid, null if invalid/missing
 */
export async function verifyUserJwt(authHeader: string | null): Promise<UserPayload | null> {
    // Validate Authorization header format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    if (!token || token.trim() === '') {
        return null;
    }

    try {
        // Verify the Supabase JWT using the service role client
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            console.error('JWT verification failed:', error?.message);
            return null;
        }

        // Fetch the user's profile to get wallet address
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('wallet_address')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.error('Profile lookup failed:', profileError?.message);
            return null;
        }

        // Verify wallet address exists
        if (!profile.wallet_address) {
            console.error('User profile missing wallet address');
            return null;
        }

        return {
            wallet: profile.wallet_address,
            sub: user.id
        };
    } catch (error) {
        console.error('Unexpected error during JWT verification:', error);
        return null;
    }
}

/**
 * Helper function to create a standardized unauthorized response
 */
export function createUnauthorizedResponse() {
    return {
        error: 'Unauthorized - Valid authentication token required',
        code: 'AUTH_REQUIRED'
    };
}

/**
 * Helper function to create a standardized forbidden response
 */
export function createForbiddenResponse(reason: string) {
    return {
        error: 'Forbidden',
        reason,
        code: 'ACCESS_DENIED'
    };
}
