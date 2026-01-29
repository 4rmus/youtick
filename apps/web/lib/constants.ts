/**
 * YouTick Constants
 *
 * This file contains:
 * 1. Application Configuration (NEAR, Lit, IPFS, etc.)
 * 2. Design System Constants (colors, layout, animation)
 */

// ============================================================================
// APPLICATION CONFIGURATION
// ============================================================================

/**
 * NEAR Protocol Configuration
 */
export const NEAR_CONFIG = {
    /** NFT Contract ID (e.g., v1.utick.testnet) */
    contractId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet',

    /** Network ID (testnet or mainnet) */
    networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',

    /** MPC Contract ID for Chain Signatures */
    mpcContractId: process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
        ? 'v1.signer'
        : 'v1.signer-prod.testnet',
} as const;

/**
 * Lit Protocol Configuration
 */
export const LIT_CONFIG = {
    /** Lit Network */
    network: 'datil-test' as const,

    /** Chronicle Yellowstone Chain ID */
    chainId: 175188,

    /** Chronicle Yellowstone RPC URL */
    rpcUrl: process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com',

    /** Lit Action IPFS CID for ownership verification */
    litActionCid: process.env.NEXT_PUBLIC_LIT_ACTION_IPFS_CID || '',

    /** Capacity Credit Token ID for delegation */
    capacityTokenId: process.env.NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID || '',

    /** Session cache duration (7 days in milliseconds) */
    sessionCacheDuration: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Crust Network Configuration
 * W3Auth-based decentralized IPFS storage
 *
 * Upload: crustipfs.xyz (W3Auth required)
 * Retrieval: ipfs.io preferred (faster, global availability)
 *
 * @see https://wiki.crust.network/docs/en/buildIPFSW3AuthPin
 */
export const CRUST_CONFIG = {
    /** W3Auth Upload Endpoint (supports NEAR wallet signatures) */
    uploadEndpoint: 'https://crustipfs.xyz',

    /** Primary Retrieval Gateway (ipfs.io is faster and more reliable) */
    primaryGateway: 'https://ipfs.io/ipfs',

    /** Backup gateways for failover (in priority order) */
    backupGateways: [
        'https://dweb.link/ipfs',
        'https://w3s.link/ipfs',
        'https://crustipfs.xyz/ipfs',
        'https://gw.crustfiles.app/ipfs'
    ],

    /** W3Auth Chain Type for NEAR Protocol */
    chainType: 'near' as const,

    /** Feature flag - Crust is the default and only storage provider */
    enabled: process.env.NEXT_PUBLIC_USE_CRUST !== 'false', // Default: true
} as const;

/**
 * IPFS Configuration
 * Uses ipfs.io as primary gateway for best availability
 */
export const IPFS_CONFIG = {
    /** Primary Gateway URL - ipfs.io for speed and reliability */
    gatewayUrl: 'https://ipfs.io/ipfs',

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

    /** Minimum prepaid balance for MPC operations */
    minMpcBalance: 0.25,

    /** Default session key allowance */
    sessionKeyAllowance: 0.25,
} as const;

/**
 * Rate Limiting Constants
 */
export const RATE_LIMITS = {
    /** PKP mint limit per account per day */
    pkpMintPerDay: 5,

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

/**
 * API Endpoints (internal)
 */
export const API_ENDPOINTS = {
    nearRpc: '/api/near-rpc',
    litRpc: '/api/lit-rpc',
    relayerMint: '/api/relayer/mint',
    trialSponsored: '/api/trial/sponsored',
    ticketClaimFree: '/api/ticket/claim-free',
} as const;

// Type exports
export type NetworkId = 'testnet' | 'mainnet';
export type LitNetwork = typeof LIT_CONFIG.network;

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
