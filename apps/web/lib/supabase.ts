import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Admin client with service role for backend operations
 * SECURITY: Only use server-side, never expose to client
 */
export const supabaseAdmin = createClient(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);
