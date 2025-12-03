// lib/env.ts
// Environment variable validation and type-safe access

/**
 * Validates that all required environment variables are present
 * Call this at application startup to fail fast if configuration is missing
 */
export function validateEnv() {
  const requiredServerVars = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWT_SECRET',
    'LIVEPEER_API_KEY',
    'LIVEPEER_PRIVATE_KEY',
    'LIVEPEER_PUBLIC_KEY',
    'LIVEPEER_PUBLIC_KEY',
    // 'LIGHTHOUSE_API_KEY', // Moved to client vars for demo
  ] as const;

  const requiredClientVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_NFT_CONTRACT_ID',
    'NEXT_PUBLIC_LIGHTHOUSE_API_KEY',
  ] as const;

  const allRequired = [...requiredServerVars, ...requiredClientVars];
  const missing = allRequired.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}\n\n` +
      `Please check your .env.local file against .env.example`
    );
  }

  console.log('✅ Environment variables validated successfully');
}

/**
 * Type-safe access to environment variables
 * Throws error if accessed from wrong context (client/server)
 */
export const env = {
  // Server-only variables
  get supabaseServiceRoleKey() {
    if (typeof window !== 'undefined') {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY accessed from client-side code');
    }
    return process.env.SUPABASE_SERVICE_ROLE_KEY!;
  },

  get supabaseJwtSecret() {
    if (typeof window !== 'undefined') {
      throw new Error('SUPABASE_JWT_SECRET accessed from client-side code');
    }
    return process.env.SUPABASE_JWT_SECRET!;
  },

  get livepeerApiKey() {
    if (typeof window !== 'undefined') {
      throw new Error('LIVEPEER_API_KEY accessed from client-side code');
    }
    return process.env.LIVEPEER_API_KEY!;
  },

  get livepeerPrivateKey() {
    if (typeof window !== 'undefined') {
      throw new Error('LIVEPEER_PRIVATE_KEY accessed from client-side code');
    }
    return process.env.LIVEPEER_PRIVATE_KEY!;
  },

  get livepeerPublicKey() {
    if (typeof window !== 'undefined') {
      throw new Error('LIVEPEER_PUBLIC_KEY accessed from client-side code');
    }
    return process.env.LIVEPEER_PUBLIC_KEY!;
  },

  get lighthouseApiKey() {
    return process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY!;
  },

  // Public client-safe variables
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL!;
  },

  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  },

  get nearNetwork() {
    return process.env.NEXT_PUBLIC_NEAR_NETWORK as 'testnet' | 'mainnet';
  },

  get nftContractId() {
    return process.env.NEXT_PUBLIC_NFT_CONTRACT_ID!;
  },
} as const;
