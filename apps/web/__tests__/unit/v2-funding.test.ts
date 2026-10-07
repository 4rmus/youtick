import { describe, expect, it, vi } from 'vitest';
import type { PaymentQuoteResponse, requestPaymentQuote } from '@/lib/multi-asset-payments';
import { cryptoRailDisabledLanguages, cryptoRailEnabled, fundingAvailable, fundingStep, quoteTicketFunding } from '@/lib/v2/funding';

const ACCOUNT = 'ab'.repeat(32);

function fakeQuote(recipient: string): PaymentQuoteResponse {
    return {
        schema: 'youtick.payment-quote.v1',
        purpose: { type: 'ticket', publication_id: 'job-001' },
        amount_out_usdc: '5000000',
        origin_asset: { asset_id: 'nep141:base-usdc', network: 'base', symbol: 'USDC', decimals: 6, contract_address: '0x1' },
        destination_asset_id: 'nep141:usdc',
        quote_response: { quoteRequest: { recipient }, quote: { amountIn: '5050000', amountOut: '5000000' }, signature: 's' },
    };
}

describe('V2 balance funding', () => {
    it('quotes the ticket price into USDC delivered to the user’s own account', async () => {
        const request = vi.fn(async () => fakeQuote(ACCOUNT)) as unknown as typeof requestPaymentQuote;
        const quote = await quoteTicketFunding({
            accountId: ACCOUNT, publicationId: 'job-001', originAssetId: 'nep141:base-usdc', refundAddress: ' 0xabc ', dry: true,
        }, request);
        expect(quote.amount_out_usdc).toBe('5000000');
        expect(request).toHaveBeenCalledWith({
            accountId: ACCOUNT, originAssetId: 'nep141:base-usdc', refundAddress: '0xabc',
            purpose: { type: 'ticket', publication_id: 'job-001' }, dry: true,
        });
    });

    it('refuses a non-implicit account or a quote for another recipient', async () => {
        const request = vi.fn(async () => fakeQuote('cd'.repeat(32))) as unknown as typeof requestPaymentQuote;
        const input = { publicationId: 'job-001', originAssetId: 'a', refundAddress: 'r', dry: false };
        await expect(quoteTicketFunding({ ...input, accountId: 'alice.near' }, request)).rejects.toThrow('invalid_payment_account');
        await expect(quoteTicketFunding({ ...input, accountId: ACCOUNT }, request)).rejects.toThrow('payment_quote_mismatch');
    });

    it('treats only the account balance as funded, never a 1Click SUCCESS alone', () => {
        expect(fundingStep('SUCCESS', false)).toBe('converting');
        expect(fundingStep('PROCESSING', true)).toBe('funded');
        expect(fundingStep('PENDING_DEPOSIT', false)).toBe('awaiting_deposit');
        expect(fundingStep('KNOWN_DEPOSIT_TX', false)).toBe('converting');
        expect(fundingStep('INCOMPLETE_DEPOSIT', false)).toBe('converting');
        expect(fundingStep('REFUNDED', false)).toBe('refunded');
        expect(fundingStep('FAILED', false)).toBe('failed');
    });

    it('is available only when multi-asset payments are on', () => {
        expect(fundingAvailable('off')).toBe(false);
        expect(fundingAvailable('preview')).toBe(true);
        expect(fundingAvailable('live')).toBe(true);
    });
});

describe('V2 crypto rail', () => {
    it('is off for Turkish by default and follows any of the browser languages', () => {
        expect(cryptoRailDisabledLanguages(undefined)).toEqual(['tr']);
        expect(cryptoRailEnabled(['en-GB', 'en'], ['tr'])).toBe(true);
        expect(cryptoRailEnabled(['tr-TR'], ['tr'])).toBe(false);
        expect(cryptoRailEnabled(['en-US', 'TR'], ['tr'])).toBe(false);
        expect(cryptoRailEnabled([], ['tr'])).toBe(true);
    });

    it('reads the language list from configuration and falls back to Turkish on bad input', () => {
        expect(cryptoRailDisabledLanguages('tr, de')).toEqual(['tr', 'de']);
        expect(cryptoRailDisabledLanguages('')).toEqual([]);
        expect(cryptoRailDisabledLanguages('tr;drop')).toEqual(['tr']);
    });
});
