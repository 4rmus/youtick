import type { ChainId } from '@/lib/intents';

/** ERC-20 token addresses per EVM chain */
export const EVM_TOKEN_ADDRESSES: Record<string, Record<number, `0x${string}`>> = {
    USDC: {
        42161: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum
        8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',  // Base
    },
    USDT: {
        42161: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // Arbitrum
        // USDT on Base is NOT supported by 1Click API
    },
};

/** EVM chain ID → 1Click chain ID mapping */
export const EVM_CHAIN_TO_1CLICK: Record<number, ChainId> = {
    42161: 'arb',
    8453: 'base',
};

/** 1Click chain ID → EVM chain ID mapping */
export const ONE_CLICK_TO_EVM_CHAIN: Record<string, number> = {
    arb: 42161,
    base: 8453,
};

/** Minimal ERC-20 ABI for transfer and balanceOf */
export const ERC20_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;
