export type NetworkId = 'testnet' | 'mainnet';

export const NEAR_NETWORK: NetworkId =
    process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';

function requiredPublicEnv(
    name: 'NEXT_PUBLIC_MARKET_CONTRACT_ID' | 'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
    rawValue: string | undefined,
): string {
    const value = rawValue?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

const USDC_CONTRACT_IDS: Record<NetworkId, string> = {
    testnet: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
    mainnet: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
};

export const NEAR_CONFIG = {
    marketContractId: requiredPublicEnv(
        'NEXT_PUBLIC_MARKET_CONTRACT_ID',
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID,
    ),
    accessContractId: requiredPublicEnv(
        'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID,
    ),
    usdcContractId: process.env.NEXT_PUBLIC_USDC_CONTRACT_ID?.trim() || USDC_CONTRACT_IDS[NEAR_NETWORK],
} as const;

const enableDerivedReadModel = process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL === 'true';

export const FEATURE_FLAGS = {
    enablePaidMediaLivepeerV1: process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 === 'true',
    enablePlaybackAuthorizerV2: process.env.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2 === 'true',
    enablePlaybackShadowV2: process.env.NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2 === 'true',
    enableLivepeerNearCreatorFee:
        process.env.NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE === 'true',
    enableSponsoredLivepeerUploads:
        process.env.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS === 'true',
    enableDerivedReadModel,
} as const;

export const MEDIA_UPLOAD_POLICY = {
    paidSourceMaxBytes: 20_000_000_000,
    livepeerTusChunkBytes: 32 * 1024 * 1024,
} as const;

export const APP_CONFIG = {
    publicAppUrl:
        process.env.NEXT_PUBLIC_APP_URL
        || (typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://youtick.net'),
    livepeerBridgeUrl: process.env.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL || '',
    marketReadModelUrl: readModelOrigin(
        process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL,
        enableDerivedReadModel,
    ),
} as const;

function readModelOrigin(rawValue: string | undefined, required: boolean): string {
    const value = rawValue?.trim();
    if (!value) {
        if (required) throw new Error('NEXT_PUBLIC_MARKET_READ_MODEL_URL is required');
        return '';
    }
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password
            || url.pathname !== '/' || url.search || url.hash || url.origin !== value) {
            throw new Error('invalid');
        }
        return url.origin;
    } catch {
        throw new Error('NEXT_PUBLIC_MARKET_READ_MODEL_URL must be an HTTPS origin');
    }
}

export const GAS_CONSTANTS = {
    mediumGas: 100_000_000_000_000n,
    sessionKeyAllowance: 0.25,
} as const;
