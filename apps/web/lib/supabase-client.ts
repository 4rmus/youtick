// lib/supabase-client.ts
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Client-side Supabase client with anon key
 * Safe for use in browser/client components
 */
export const supabase = createClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        }
    }
);

/**
 * Helper to get the current session JWT token
 * Returns null if no active session
 */
export async function getSessionToken(): Promise<string | null> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
        return null;
    }

    return session.access_token;
}

/**
 * Helper to check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
}
