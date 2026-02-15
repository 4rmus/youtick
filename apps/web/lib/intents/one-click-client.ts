import {
    OpenAPI,
    OneClickService,
    ApiError,
    QuoteRequest,
    type QuoteResponse,
    type GetExecutionStatusResponse,
} from '@defuse-protocol/one-click-sdk-typescript';
import { ONE_CLICK_CONFIG, NEAR_NATIVE_ASSET, getTokenConfig } from './config';
import type { PaymentMethod, ChainId, SwapQuote } from './types';

let initialized = false;

/**
 * Initialize the 1Click SDK with API credentials
 */
function ensureInitialized() {
    if (initialized) return;
    OpenAPI.BASE = ONE_CLICK_CONFIG.baseUrl;
    if (ONE_CLICK_CONFIG.apiToken) {
        OpenAPI.TOKEN = ONE_CLICK_CONFIG.apiToken;
    }
    initialized = true;
}

/**
 * Create a deadline timestamp (ISO format) N minutes from now
 */
function createDeadline(minutesFromNow: number = ONE_CLICK_CONFIG.quoteDeadlineMinutes): string {
    const deadline = new Date(Date.now() + minutesFromNow * 60 * 1000);
    return deadline.toISOString();
}

/**
 * Convert USD amount (cents) to token smallest units
 * For USDC/USDT with 6 decimals: $5.00 = 500 cents = 5000000 units
 */
function usdCentsToTokenUnits(cents: number, decimals: number): string {
    // cents to dollars, then to smallest unit
    // e.g. 500 cents = 5.00 dollars = 5000000 (6 decimals)
    const dollars = cents / 100;
    const units = Math.floor(dollars * Math.pow(10, decimals));
    return units.toString();
}

/**
 * Get a swap quote: Stablecoin → NEAR
 *
 * @param token - USDC or USDT
 * @param chain - Source chain (near, arb, base)
 * @param amountUsdCents - Amount in USD cents (500 = $5.00)
 * @param recipientNearAccountId - NEAR account to receive NEAR tokens
 * @param refundAddress - Address for refunds (NEAR account or EVM address)
 * @param dry - If true, returns quote without generating deposit address
 * @param refundAddressOverride - Optional EVM address override for cross-chain refunds
 */
export async function getSwapQuote(
    token: PaymentMethod,
    chain: ChainId,
    amountUsdCents: number,
    recipientNearAccountId: string,
    refundAddress: string,
    dry: boolean = false,
    refundAddressOverride?: string,
): Promise<SwapQuote> {
    ensureInitialized();

    if (token === 'NEAR') {
        throw new Error('Cannot swap NEAR to NEAR. Use direct NEAR payment.');
    }

    const tokenConfig = getTokenConfig(token, chain);
    if (!tokenConfig) {
        throw new Error(`Token ${token} not supported on chain ${chain}`);
    }

    const amount = usdCentsToTokenUnits(amountUsdCents, tokenConfig.decimals);

    // Use ORIGIN_CHAIN for all actual deposits — the user sends tokens directly
    // to the deposit address via ft_transfer. INTENTS deposit type requires a
    // two-step flow (ft_transfer_call to intents.near + mt_transfer) which is
    // more complex. ORIGIN_CHAIN works with simple ft_transfer for NEP-141 tokens.
    const depositType = QuoteRequest.depositType.ORIGIN_CHAIN;

    // For dry quotes, use INTENTS refund so NEAR account ID is valid as refund address.
    // For actual quotes, use ORIGIN_CHAIN refund — refund goes directly to the sender.
    const refundType = dry
        ? QuoteRequest.refundType.INTENTS
        : QuoteRequest.refundType.ORIGIN_CHAIN;

    // For cross-chain (Arbitrum/Base): use EVM address as refund address so failed swaps
    // refund to the MetaMask wallet on the origin chain (not a NEAR account).
    const effectiveRefundAddress = refundAddressOverride || refundAddress;

    const quoteRequest: QuoteRequest = {
        dry,
        swapType: QuoteRequest.swapType.EXACT_INPUT,
        slippageTolerance: ONE_CLICK_CONFIG.defaultSlippageBps,
        originAsset: tokenConfig.assetId,
        depositType,
        destinationAsset: NEAR_NATIVE_ASSET,
        amount,
        refundTo: effectiveRefundAddress,
        refundType,
        recipient: recipientNearAccountId,
        recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
        deadline: createDeadline(),
        referral: ONE_CLICK_CONFIG.referralId,
        quoteWaitingTimeMs: 0,
        ...(ONE_CLICK_CONFIG.platformFeeBps > 0 && {
            appFees: [{
                recipient: ONE_CLICK_CONFIG.platformFeeRecipient,
                fee: ONE_CLICK_CONFIG.platformFeeBps,
            }],
        }),
    };

    let response: QuoteResponse;
    try {
        response = await OneClickService.getQuote(quoteRequest);
    } catch (err) {
        if (err instanceof ApiError) {
            const detail = typeof err.body === 'object' ? JSON.stringify(err.body) : err.body;
            console.error('[1Click] API error:', err.status, detail);
            throw new Error(err.body?.message || `1Click API error (${err.status}): ${detail}`);
        }
        throw err;
    }

    return {
        quote: response,
        depositAddress: response.quote.depositAddress || '',
        amountIn: response.quote.amountIn,
        amountInFormatted: response.quote.amountInFormatted,
        amountOut: response.quote.amountOut,
        amountOutFormatted: response.quote.amountOutFormatted,
        amountInUsd: response.quote.amountInUsd,
        amountOutUsd: response.quote.amountOutUsd,
        timeEstimate: response.quote.timeEstimate,
        deadline: response.quote.deadline,
    };
}

/**
 * Get a dry quote (preview only, no deposit address)
 */
export async function getDryQuote(
    token: PaymentMethod,
    chain: ChainId,
    amountUsdCents: number,
    recipientNearAccountId: string,
): Promise<SwapQuote> {
    return getSwapQuote(
        token,
        chain,
        amountUsdCents,
        recipientNearAccountId,
        recipientNearAccountId, // refund to self for dry quotes
        true,
    );
}

/**
 * Check the execution status of a swap
 */
export async function getSwapStatus(
    depositAddress: string,
): Promise<GetExecutionStatusResponse> {
    ensureInitialized();
    return OneClickService.getExecutionStatus(depositAddress);
}

/**
 * Submit a deposit transaction hash to speed up processing
 */
export async function submitDeposit(
    txHash: string,
    depositAddress: string,
    nearSenderAccount?: string,
) {
    ensureInitialized();
    return OneClickService.submitDepositTx({
        txHash,
        depositAddress,
        nearSenderAccount,
    });
}

/**
 * Get all supported tokens from the 1Click API
 */
export async function getSupportedTokens() {
    ensureInitialized();
    return OneClickService.getTokens();
}
