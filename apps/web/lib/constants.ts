/**
 * YouTick Constants
 *
 * This file contains:
 * 1. Application Configuration (NEAR, KMS, IPFS)
 * 2. Design System Constants (colors, layout, animation)
 */

// ============================================================================
// APPLICATION CONFIGURATION
// ============================================================================

export type NetworkId = 'testnet' | 'mainnet';

const DEFAULT_CONTRACT_IDS: Record<NetworkId, {
    marketContractId: string;
    accessContractId: string;
    registryContractId: string;
}> = {
    testnet: {
        marketContractId: 'dev-fresh-kurulum-3.testnet',
        accessContractId: 'access-1773606802388.v2-0.utick.testnet',
        registryContractId: 'registry-1773606802388.v2-0.utick.testnet',
    },
    mainnet: {
        marketContractId: 'youtick.near',
        accessContractId: 'access.youtick.near',
        registryContractId: 'registry.youtick.near',
    },
};

const configuredNetworkId = (process.env.NEXT_PUBLIC_NEAR_NETWORK as NetworkId | undefined) || 'mainnet';
const defaultContracts = DEFAULT_CONTRACT_IDS[configuredNetworkId];
const configuredMarketContractId =
    process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID
    || process.env.NEXT_PUBLIC_NFT_CONTRACT_ID
    || defaultContracts.marketContractId;
const configuredAppUrl =
    process.env.NEXT_PUBLIC_APP_URL
    || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://youtick.net');

/**
 * NEAR Protocol Configuration
 */
export const NEAR_CONFIG = {
    /** Active network ID. Defaults to mainnet when NEXT_PUBLIC_NEAR_NETWORK is not set. */
    networkId: configuredNetworkId,

    /** Market contract ID. `contractId` remains as a compatibility alias. */
    contractId: configuredMarketContractId,
    marketContractId: configuredMarketContractId,

    /** Zero-trust access/session contract ID */
    accessContractId:
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID
        || defaultContracts.accessContractId,

    /** Zero-trust registry contract ID */
    registryContractId:
        process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID
        || defaultContracts.registryContractId,
} as const;

export const FEATURE_FLAGS = {
    /** Cross-chain checkout is experimental and must be explicitly enabled. */
    enableCrossChainCheckout: process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT === 'true',
    /** Secondary Lighthouse persistence checks through the Storage API Worker. */
    enableLighthousePersistence: process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE === 'true',
    /** Lighthouse is the default storage upload path through the Storage API Worker. */
    enableLighthousePrimaryUpload: process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD !== 'false',
    /** Crust upload fallback is opt-in only; new uploads should stay Lighthouse-only. */
    enableCrustUploadFallback: process.env.NEXT_PUBLIC_ENABLE_CRUST_UPLOAD_FALLBACK === 'true',
    /** Optional hot media delivery Worker. Direct gateway fallback remains available. */
    enableMediaDeliveryWorker: process.env.NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER === 'true',
} as const;

export const APP_CONFIG = {
    publicAppUrl: configuredAppUrl,
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
    storageUploadProvider: process.env.NEXT_PUBLIC_STORAGE_UPLOAD_PROVIDER || 'lighthouse',
    storageApiUrl: process.env.NEXT_PUBLIC_STORAGE_API_URL || '',
    mediaDeliveryUrl: process.env.NEXT_PUBLIC_MEDIA_DELIVERY_URL || '',
} as const;

/**
 * IPFS Configuration
 * Uses ipfs.io as primary gateway for best availability
 */
export const IPFS_CONFIG = {
    /** Primary public gateway URL used only for legacy fallback cases */
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

    /** Minimum prepaid balance for session key operations (NFT mint + Event creation + buffer) */
    /** Key-management overhead is a separate platform cost, charged for paid videos */
    minPlatformBalance: 0.25,

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

// ============================================================================
// DESIGN SYSTEM CONSTANTS
// ============================================================================

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
