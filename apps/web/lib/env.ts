// lib/env.ts
// Environment variable validation and type-safe access

/**
 * Validates that all required environment variables are present
 * Call this at application startup to fail fast if configuration is missing
 */
export function validateEnv() {
  const requiredVars = [
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_NFT_CONTRACT_ID',
  ] as const;

  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}\n` +
      `Please check your .env.local file.`
    );
  }

  // console.log('✅ Environment variables validated successfully');
}

/**
 * Type-safe access to environment variables
 */
export const env = {
  // App
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  nearNetwork: (process.env.NEXT_PUBLIC_NEAR_NETWORK || 'mainnet') as 'testnet' | 'mainnet',
  nftContractId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID!,

  // IPFS Storage (no API key needed - uses W3Auth with Session Keys)
  useIpfs: process.env.NEXT_PUBLIC_USE_IPFS !== 'false',

  // Nova Protocol
  novaNetwork: process.env.NEXT_PUBLIC_NOVA_NETWORK || 'mainnet',
  novaContractId: process.env.NEXT_PUBLIC_NOVA_CONTRACT_ID || 'nova-sdk.near',
} as const;
