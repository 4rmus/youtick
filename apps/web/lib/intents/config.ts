import type { TokenResponse } from '@defuse-protocol/one-click-sdk-typescript';
import { NEAR_CONFIG } from '../constants';
import type { TokenConfig, ChainId, PaymentMethod } from './types';

/**
 * 1Click API Configuration
 */
export const ONE_CLICK_CONFIG = {
    enabled: process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT === 'true',
    baseUrl: 'https://1click.chaindefuser.com',
    /** JWT token from Partners Portal (partners.near-intents.org) */
    apiToken: process.env.NEXT_PUBLIC_ONE_CLICK_API_TOKEN || '',
    /** Default slippage tolerance in basis points (100 = 1%) */
    defaultSlippageBps: 100,
    /** Quote deadline offset in minutes */
    quoteDeadlineMinutes: 10,
    /** Polling interval for swap status (ms) */
    statusPollInterval: 3000,
    /** YouTick referral ID */
    referralId: 'youtick',
    /** Optional 1Click referral fee; contract-level paid ticket platform fee is applied separately. */
    platformFeeBps: 0,
    /** Platform fee recipient NEAR account */
    platformFeeRecipient: NEAR_CONFIG.marketContractId,
} as const;

/**
 * NEAR native token asset ID for 1Click API
 * The 1Click API uses wrapped NEAR (wNEAR) as the canonical representation
 * of the NEAR native token. wNEAR has 24 decimals (same as native NEAR).
 */
export const NEAR_NATIVE_ASSET = 'nep141:wrap.near';

/**
 * Supported stablecoin tokens with their 1Click asset IDs
 *
 * Asset ID format: `nep141:{near_contract_id}` for NEAR-native tokens
 * Asset IDs for cross-chain tokens use the omft (Omni Fungible Token) bridge format
 */
export const STABLECOIN_TOKENS: Record<string, TokenConfig[]> = {
    USDC: [
        {
            assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
            symbol: 'USDC',
            decimals: 6,
            chainId: 'near',
            chainName: 'NEAR',
        },
        {
            assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
            symbol: 'USDC',
            decimals: 6,
            chainId: 'arb',
            chainName: 'Arbitrum',
        },
        {
            assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
            symbol: 'USDC',
            decimals: 6,
            chainId: 'base',
            chainName: 'Base',
        },
    ],
    USDT: [
        {
            assetId: 'nep141:usdt.tether-token.near',
            symbol: 'USDT',
            decimals: 6,
            chainId: 'near',
            chainName: 'NEAR',
        },
        {
            assetId: 'nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near',
            symbol: 'USDT',
            decimals: 6,
            chainId: 'arb',
            chainName: 'Arbitrum',
        },
        // Note: USDT on Base is NOT supported by the 1Click API
    ],
};

type SupportedStablecoin = Exclude<PaymentMethod, 'NEAR'>;

const SUPPORTED_STABLECOINS: SupportedStablecoin[] = ['USDC', 'USDT'];

const BLOCKCHAIN_TO_CHAIN: Partial<Record<TokenResponse.blockchain, ChainId>> = {
    near: 'near',
    arb: 'arb',
    base: 'base',
};

let tokenCatalogOverrides: Partial<Record<SupportedStablecoin, TokenConfig[]>> = {};

function cloneTokenConfig(token: TokenConfig): TokenConfig {
    return { ...token };
}

function normalizeTokenConfig(symbol: SupportedStablecoin, token: TokenResponse): TokenConfig | null {
    const chainId = BLOCKCHAIN_TO_CHAIN[token.blockchain];
    if (!chainId) return null;
    if (token.symbol !== symbol) return null;

    return {
        assetId: token.assetId,
        symbol,
        decimals: token.decimals,
        chainId,
        chainName: CHAIN_CONFIG[chainId].name,
    };
}

function dedupeTokenConfigs(tokens: TokenConfig[]): TokenConfig[] {
    const seen = new Set<string>();
    return tokens.filter((token) => {
        const key = `${token.chainId}:${token.assetId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function updateSupportedTokenCatalog(tokens: TokenResponse[]): void {
    const nextOverrides: Partial<Record<SupportedStablecoin, TokenConfig[]>> = {};

    for (const symbol of SUPPORTED_STABLECOINS) {
        const dynamicTokens = dedupeTokenConfigs(
            tokens
                .map((token) => normalizeTokenConfig(symbol, token))
                .filter((token): token is TokenConfig => token !== null)
        );

        if (dynamicTokens.length > 0) {
            nextOverrides[symbol] = dynamicTokens;
        }
    }

    tokenCatalogOverrides = nextOverrides;
}

function getTokenCatalog(symbol: SupportedStablecoin): TokenConfig[] {
    const dynamicTokens = tokenCatalogOverrides[symbol];
    if (dynamicTokens && dynamicTokens.length > 0) {
        return dynamicTokens.map(cloneTokenConfig);
    }

    return (STABLECOIN_TOKENS[symbol] || []).map(cloneTokenConfig);
}

/**
 * Chain display configuration
 */
export const CHAIN_CONFIG: Record<ChainId, { name: string; icon: string }> = {
    near: { name: 'NEAR', icon: 'Ⓝ' },
    arb: { name: 'Arbitrum', icon: '🔵' },
    base: { name: 'Base', icon: '🔷' },
};

/**
 * Get token config by symbol and chain
 */
export function getTokenConfig(symbol: string, chainId: ChainId): TokenConfig | undefined {
    if (symbol === 'NEAR') return undefined;
    return getTokenCatalog(symbol as SupportedStablecoin).find(t => t.chainId === chainId);
}

/**
 * Get all supported chains for a token symbol
 */
export function getSupportedChains(symbol: string): TokenConfig[] {
    if (symbol === 'NEAR') return [];
    return getTokenCatalog(symbol as SupportedStablecoin);
}
