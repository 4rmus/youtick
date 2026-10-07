// V2 balance top-up (roadmap E7d): converts another token to USDC in the user's own NEAR Auth
// account through the Bridge's 1Click quote, so the one-approval checkout can then pay from it.
// The Bridge's `ticket` purpose prices the conversion from Market V2 `get_publication`; the user's
// account is the recipient. 1Click SUCCESS is not a purchase: only the account's USDC balance
// counts, and the purchase itself still goes through `buyTicket`.
import {
    multiAssetPaymentMode,
    requestPaymentQuote,
    type PaymentExecutionStatus,
    type PaymentQuoteResponse,
} from '../multi-asset-payments';

export type FundingStep = 'awaiting_deposit' | 'converting' | 'funded' | 'refunded' | 'failed';

/** Languages whose UI does not offer the crypto rail; Turkish by default (roadmap E7). */
export function cryptoRailDisabledLanguages(
    value: string | undefined = process.env.NEXT_PUBLIC_V2_CRYPTO_RAIL_DISABLED_LANGUAGES,
): string[] {
    const list = (value ?? 'tr').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    return list.every((entry) => /^[a-z]{2,3}$/.test(entry)) ? list : ['tr'];
}

/** False when any of the user's languages is one where the crypto rail is off. */
export function cryptoRailEnabled(languages: readonly string[], disabled = cryptoRailDisabledLanguages()): boolean {
    return !languages.some((language) => disabled.includes(language.trim().toLowerCase().split('-')[0]));
}

export function fundingAvailable(mode = multiAssetPaymentMode): boolean {
    return mode !== 'off';
}

/** A quote that converts the ticket price into USDC delivered to the user's own account. */
export async function quoteTicketFunding(input: {
    accountId: string; publicationId: string; originAssetId: string; refundAddress: string; dry: boolean;
}, request: typeof requestPaymentQuote = requestPaymentQuote): Promise<PaymentQuoteResponse> {
    if (!/^[0-9a-f]{64}$/.test(input.accountId)) throw new Error('invalid_payment_account');
    const quote = await request({
        accountId: input.accountId, originAssetId: input.originAssetId, refundAddress: input.refundAddress.trim(),
        purpose: { type: 'ticket', publication_id: input.publicationId }, dry: input.dry,
    });
    // `requestPaymentQuote` already checks the response against the request; keep the recipient explicit.
    if (quote.quote_response.quoteRequest.recipient !== input.accountId) throw new Error('payment_quote_mismatch');
    return quote;
}

/** The next step from a 1Click status and whether the account's USDC already covers the price. */
export function fundingStep(status: PaymentExecutionStatus, balanceCoversPrice: boolean): FundingStep {
    if (balanceCoversPrice) return 'funded';
    if (status === 'PENDING_DEPOSIT') return 'awaiting_deposit';
    if (status === 'REFUNDED') return 'refunded';
    if (status === 'FAILED') return 'failed';
    // SUCCESS too: 1Click is done, but the purchase waits until final state shows the USDC.
    return 'converting';
}
