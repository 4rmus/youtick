/**
 * YouTick Constants
 *
 * This file contains:
 * 1. Application Configuration (NEAR, storage, IPFS)
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
    usdcContractId: string;
}> = {
    testnet: {
        marketContractId: 'replace-with-market.testnet',
        accessContractId: 'replace-with-access.testnet',
        registryContractId: 'replace-with-registry.testnet',
        usdcContractId: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
    },
    mainnet: {
        marketContractId: 'youtick.near',
        accessContractId: 'access.youtick.near',
        registryContractId: 'registry.youtick.near',
        usdcContractId: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    },
};

function getConfiguredNetworkId(): NetworkId {
    return process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
}

function getContractId(envName: string, defaultValue: string, aliasEnvName?: string): string {
    const value = process.env[envName] || (aliasEnvName ? process.env[aliasEnvName] : undefined);
    return value || defaultValue;
}

const configuredNetworkId = getConfiguredNetworkId();
const defaultContracts = DEFAULT_CONTRACT_IDS[configuredNetworkId];
const configuredMarketContractId =
    getContractId('NEXT_PUBLIC_MARKET_CONTRACT_ID', defaultContracts.marketContractId, 'NEXT_PUBLIC_NFT_CONTRACT_ID');
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
        getContractId('NEXT_PUBLIC_ACCESS_CONTRACT_ID', defaultContracts.accessContractId),

    /** Zero-trust registry contract ID */
    registryContractId:
        getContractId('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', defaultContracts.registryContractId),

    /** Circle USDC contract used for paid-job creation and ticket settlement. */
    usdcContractId:
        getContractId('NEXT_PUBLIC_USDC_CONTRACT_ID', defaultContracts.usdcContractId),
} as const;

export const FEATURE_FLAGS = {
    /** Livepeer paid-media v1. Keep false until every mandatory provider gate passes. */
    enablePaidMediaLivepeerV1: process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 === 'true',
    /** Paid-media v4 private R2 ingest. Keep false until provider canaries pass. */
    enablePaidMediaV4Ingest: process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_V4_INGEST === 'true',
    /** Cross-chain checkout is experimental and must be explicitly enabled. */
    enableCrossChainCheckout: process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT === 'true',
    /** Secondary Lighthouse persistence checks through the Storage API Worker. */
    enableLighthousePersistence: process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE === 'true',
    /** Lighthouse is the default storage upload path through the Storage API Worker. */
    enableLighthousePrimaryUpload: process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD !== 'false',
    /** Optional hot media delivery Worker. Direct gateway fallback remains available. */
    enableMediaDeliveryWorker: process.env.NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER === 'true',
} as const;

export const MEDIA_UPLOAD_POLICY = {
    paidSourceMaxBytes: 20_000_000_000,
    livepeerTusChunkBytes: 32 * 1024 * 1024,
    r2PartBytes: 64 * 1024 * 1024,
} as const;

export const APP_CONFIG = {
    publicAppUrl: configuredAppUrl,
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
    storageApiUrl: process.env.NEXT_PUBLIC_STORAGE_API_URL || '',
    mediaDeliveryUrl: process.env.NEXT_PUBLIC_MEDIA_DELIVERY_URL || '',
    livepeerBridgeUrl: process.env.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL || '',
} as const;

/**
 * IPFS Configuration
 * Public gateway fallback used after the configured storage/delivery path.
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
