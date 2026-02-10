/**
 * YouTick Constants
 *
 * This file contains:
 * 1. Application Configuration (NEAR, Nova, IPFS)
 * 2. Design System Constants (colors, layout, animation)
 */

// ============================================================================
// APPLICATION CONFIGURATION
// ============================================================================

/**
 * NEAR Protocol Configuration
 */
export const NEAR_CONFIG = {
    /** NFT Contract ID (e.g., youtick-prod-v1.near) */
    contractId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'youtick-prod-v1.near',

    /** Network ID (testnet or mainnet) */
    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'mainnet',
} as const;

/**
 * Onboarding Key Configuration (Decentralized Trial Creation)
 * This is a Function Call Access Key restricted to:
 * - create_sponsored_trial_direct
 * - claim_free_ticket_direct
 */
export const ONBOARDING_CONFIG = {
    /** Onboarding key (ed25519 private key, restricted scope) */
    secretKey: process.env.NEXT_PUBLIC_ONBOARDING_KEY || '',
} as const;

/**
 * IPFS Configuration
 * Uses ipfs.io as primary gateway for best availability
 */
export const IPFS_CONFIG = {
    /** Primary Gateway URL - Crust IPFS for decentralized pinning */
    gatewayUrl: 'https://crustipfs.xyz/ipfs',

    /** Default placeholder image - uses a minimal data URI for guaranteed availability */
    placeholderImage: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIyNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMTgxODFiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM3MTcxN2YiIGZvbnQtZmFtaWx5PSJzeXN0ZW0tdWkiIGZvbnQtc2l6ZT0iMjQiPvCfjqwgVmlkZW88L3RleHQ+PC9zdmc+',
} as const;

/**
 * Gas & Deposit Constants
 */
export const GAS_CONSTANTS = {
    /** Standard gas for function calls (300 TGas) */
    standardGas: BigInt('300000000000000'),

    /** Medium gas for simpler calls (100 TGas) */
    mediumGas: BigInt('100000000000000'),

    /** Small gas for simple calls (30 TGas) */
    smallGas: BigInt('30000000000000'),

    /** High gas for complex calls (200 TGas) */
    highGas: BigInt('200000000000000'),

    /** Storage deposit for NFT minting (0.01 NEAR in yocto) */
    storageCost: '10000000000000000000000',

    /** Minimum prepaid balance for session key operations (NFT mint + Event creation + buffer) */
    /** Nova group registration (~0.67 NEAR) is a separate platform cost, charged for paid videos */
    minNovaBalance: 0.25,

    /** Default session key allowance */
    sessionKeyAllowance: 0.25,
} as const;

/**
 * Deposit Constants (in yoctoNEAR)
 */
export const DEPOSIT_CONSTANTS = {
    /** 1 yoctoNEAR - security deposit for sensitive operations */
    oneYocto: BigInt('1'),

    /** 0.1 NEAR - standard storage deposit for NFT minting */
    storageDeposit: BigInt('100000000000000000000000'),

    /** 0.01 NEAR - small storage deposit for ticket purchases */
    smallStorageDeposit: BigInt('10000000000000000000000'),

    /** 0.15 NEAR - deposit per gift link (account creation + NFT storage + buffer) */
    giftDepositPerLink: BigInt('150000000000000000000000'),
} as const;

/**
 * Rate Limiting Constants
 */
export const RATE_LIMITS = {
    /** Upload limit per account per hour */
    uploadPerHour: 10,

    /** Trial account limit per IP per day */
    trialPerIpPerDay: 3,

    /** Global trial account limit per day */
    trialGlobalPerDay: 100,
} as const;

/**
 * Metadata Schema Constants
 */
export const METADATA_SCHEMA = {
    /** Delimiter for title metadata encoding */
    delimiter: ':::',

    /** Current format version */
    formatVersion: 2,
} as const;

// Type exports
export type NetworkId = 'testnet' | 'mainnet';

// ============================================================================
// DESIGN SYSTEM CONSTANTS
// ============================================================================

// NEAR Brand Colors
export const NEAR_COLORS = {
  black: '#000000',
  white: '#FFFFFF',
  offWhite: '#f2f1e9',
  green: '#00ec97',
  red: '#ff7966',
  purple: '#9797ff',
  blue: '#17d9d4',
} as const;

export const COLORS = {
  background: {
    primary: 'bg-black',
    secondary: 'bg-zinc-950',
    tertiary: 'bg-zinc-900',
    card: 'bg-zinc-950',
  },
  text: {
    primary: 'text-white',
    secondary: 'text-zinc-400',
    tertiary: 'text-zinc-500',
    accent: 'text-near-purple',
  },
  border: {
    default: 'border-white/5',
    hover: 'border-white/20',
    active: 'border-near-green/50',
  },
  button: {
    primary: 'bg-near-green hover:bg-near-green/80 text-near-black font-semibold',
    secondary: 'border-white/20 bg-transparent text-white hover:bg-white/10 hover:border-near-green/30',
    ghost: 'text-zinc-400 hover:text-white',
  },
  // NEAR specific utility classes
  near: {
    gradient: 'from-near-green via-near-purple to-near-blue',
    glow: {
      green: 'shadow-near-green/30',
      purple: 'shadow-near-purple/30',
      blue: 'shadow-near-blue/30',
    },
  },
} as const;

export const BRANDING = {
  name: {
    part1: 'you',
    part2: 'tick',
  },
  logo: {
    primary: 'text-white',
    secondary: 'text-zinc-500',
  },
} as const;

export const ANIMATION = {
  transition: {
    default: 'transition-all',
    colors: 'transition-colors',
    transform: 'transition-transform',
    opacity: 'transition-opacity',
  },
  duration: {
    fast: 'duration-200',
    normal: 'duration-300',
    slow: 'duration-700',
  },
  hover: {
    scale: 'hover:scale-105',
    scaleSubtle: 'hover:scale-[1.02]',
    scaleImage: 'group-hover:scale-110',
  },
} as const;

export const LAYOUT = {
  container: 'container mx-auto px-4',
  section: {
    padding: 'py-32',
    paddingSmall: 'py-20',
  },
  nav: {
    height: 'h-20',
    heightSmall: 'h-16',
  },
} as const;

export const STATS = {
  ticketCapacity: 1000000,
  potentialEvents: 50000,
  fraudRate: 0,
} as const;
