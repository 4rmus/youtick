import type { QuoteResponse, GetExecutionStatusResponse } from '@defuse-protocol/one-click-sdk-typescript';

export type PaymentMethod = 'NEAR' | 'USDC' | 'USDT';

export type ChainId = 'near' | 'arb' | 'base';

export interface TokenConfig {
    assetId: string;
    symbol: string;
    decimals: number;
    chainId: ChainId;
    chainName: string;
    icon?: string;
}

export interface SwapQuote {
    quote: QuoteResponse;
    depositAddress: string;
    amountIn: string;
    amountInFormatted: string;
    amountOut: string;
    amountOutFormatted: string;
    amountInUsd: string;
    amountOutUsd: string;
    timeEstimate: number;
    deadline?: string;
}

export type SwapStatus =
    | 'idle'
    | 'quoting'
    | 'awaiting_deposit'
    | 'processing'
    | 'success'
    | 'failed'
    | 'refunded';

export interface SwapState {
    status: SwapStatus;
    quote: SwapQuote | null;
    depositAddress: string | null;
    error: string | null;
    executionStatus: GetExecutionStatusResponse | null;
}

export interface StablecoinPaymentParams {
    /** Token to pay with */
    token: PaymentMethod;
    /** Source chain */
    chain: ChainId;
    /** Amount in USD cents (e.g. 500 = $5.00) */
    amountUsdCents: number;
    /** Recipient NEAR account ID */
    recipientNearAccountId: string;
    /** Refund address (EVM address for EVM chains, NEAR account for NEAR) */
    refundAddress: string;
}
