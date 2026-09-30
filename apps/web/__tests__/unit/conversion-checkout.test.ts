import { describe, expect, it, vi } from 'vitest';
import {
    CONVERSION_POLLING_STATES,
    CONVERSION_READY_STATES,
    CONVERSION_TERMINAL_STATES,
    CONVERSION_WAITING_STATES,
    checkoutMatches,
    checkoutStateLabel,
    errorCode,
    formatAssetAmount,
    isRouteTooSlow,
    paymentErrorMessage,
    purposeIdentity,
    requireCurrentAmount,
    waitForPreflight,
} from '@/features/checkout/conversion-checkout';
import type { ActivePaymentCheckout, PaymentPreflight, PaymentQuoteResponse } from '@/lib/multi-asset-payments';

const TICKET = { type: 'ticket' as const, publication_id: 'job-001' };
const UPLOAD = { type: 'upload' as const, expected_source_bytes: '1024' };

function activeCheckout(purpose: typeof TICKET | typeof UPLOAD, required = '2000000') {
    return { required_usdc_micro: required, quote: { purpose } } as unknown as ActivePaymentCheckout;
}

function preflight(userRegistered: boolean): PaymentPreflight {
    return {
        userRegistered,
        marketRegistered: true,
        gasSufficient: true,
        usdcSufficient: false,
        storageMinYocto: '0',
        usdcBalanceMicro: '0',
        nearBalanceYocto: '0',
    };
}

describe('conversion checkout identity', () => {
    it('keys ticket and upload purposes separately', () => {
        expect(purposeIdentity(TICKET)).toBe('ticket:job-001');
        expect(purposeIdentity(UPLOAD)).toBe('upload:1024');
    });

    it('matches only the same purpose and required amount', () => {
        expect(checkoutMatches(activeCheckout(TICKET), 'ticket:job-001', '2000000')).toBe(true);
        expect(checkoutMatches(activeCheckout(TICKET), 'ticket:job-002', '2000000')).toBe(false);
        expect(checkoutMatches(activeCheckout(TICKET), 'ticket:job-001', '3000000')).toBe(false);
        expect(checkoutMatches(activeCheckout(UPLOAD), 'ticket:job-001', '2000000')).toBe(false);
    });

    it('rejects a quote whose USDC output differs from the required amount', () => {
        const quote = { amount_out_usdc: '2000000' } as PaymentQuoteResponse;
        expect(() => requireCurrentAmount(quote, '2000000')).not.toThrow();
        expect(() => requireCurrentAmount(quote, '2000001')).toThrow('payment_amount_changed');
    });
});

describe('conversion checkout states', () => {
    it('keeps the existing state groupings', () => {
        expect([...CONVERSION_POLLING_STATES]).toEqual(['awaiting_deposit', 'converting', 'quoted']);
        expect([...CONVERSION_TERMINAL_STATES]).toEqual(['usdc_final', 'complete', 'refunded', 'failed']);
        expect([...CONVERSION_READY_STATES]).toEqual(['usdc_final', 'complete']);
        expect([...CONVERSION_WAITING_STATES]).toEqual(['quoted', 'awaiting_deposit', 'converting', 'core_pending']);
    });

    it.each([
        ['awaiting_deposit', 'Waiting for the source transfer.'],
        ['converting', 'Converting to USDC…'],
        ['usdc_final', 'USDC is ready. Continue with the existing payment.'],
        ['core_pending', 'The USDC payment is finalizing…'],
        ['complete', 'Payment completed.'],
        ['refunded', 'The source transfer was refunded.'],
        ['failed', 'The conversion failed.'],
        ['quoted', 'Conversion status updated.'],
    ] as const)('labels %s', (state, label) => {
        expect(checkoutStateLabel(state)).toBe(label);
    });

    it('treats only routes above ten minutes as too slow', () => {
        expect(isRouteTooSlow(600)).toBe(false);
        expect(isRouteTooSlow(601)).toBe(true);
        expect(isRouteTooSlow(undefined)).toBe(false);
        expect(isRouteTooSlow('900')).toBe(false);
    });
});

describe('formatAssetAmount', () => {
    it.each([
        ['1234500', 6, '1.2345'],
        ['1000000', 6, '1'],
        ['5', 6, '0.000005'],
        ['0', 6, '0'],
        ['42', 0, '42'],
        ['1000000000000000000', 18, '1'],
    ])('formats %s with %i decimals', (value, decimals, expected) => {
        expect(formatAssetAmount(value, decimals)).toBe(expected);
    });
});

describe('payment error copy', () => {
    it.each([
        ['another_payment_checkout_active', 'Another conversion is active for this NEAR account. Complete it before starting a new one.'],
        ['payment_checkout_active', 'Another conversion is active for this NEAR account. Complete it before starting a new one.'],
        ['payment_market_usdc_not_registered', 'Payments are temporarily unavailable because the USDC setup does not match the market.'],
        ['payment_usdc_contract_mismatch', 'Payments are temporarily unavailable because the USDC setup does not match the market.'],
        ['payment_gas_reserve_insufficient', 'Keep enough NEAR in this account for the final USDC payment and one-time setup.'],
        ['payment_amount_changed', 'The payment amount changed. Review it before creating another conversion.'],
        ['payment_route_temporarily_unavailable', 'This conversion route is temporarily unavailable. Try another asset.'],
        ['payment_usdc_registration_pending', 'USDC registration is still syncing. Try again shortly.'],
        ['payment_converted_usdc_not_ready', 'The conversion finished, but the final USDC balance or NEAR gas reserve is not ready.'],
        ['payment_mode_mismatch', 'Conversion is temporarily unavailable because the web and payment service modes do not match.'],
        ['payment_unknown_error', 'The conversion could not be prepared. Check the asset and refund address, then try again.'],
    ])('maps %s', (code, message) => {
        expect(paymentErrorMessage(code)).toBe(message);
    });

    it('extracts error codes and falls back for unknown reasons', () => {
        expect(errorCode(new Error('payment_mode_mismatch'))).toBe('payment_mode_mismatch');
        expect(errorCode('boom')).toBe('payment_unknown_error');
    });
});

describe('waitForPreflight', () => {
    it('returns immediately when the account is already registered', async () => {
        const sleep = vi.fn(async () => undefined);
        const readPreflight = vi.fn().mockResolvedValue(preflight(true));
        await expect(waitForPreflight('buyer.testnet', '2000000', { readPreflight, sleep })).resolves.toEqual(preflight(true));
        expect(sleep).not.toHaveBeenCalled();
        expect(readPreflight).toHaveBeenCalledWith('buyer.testnet', '2000000');
    });

    it('retries registration after 1, 2 and 4 seconds, then returns the last read', async () => {
        const sleeps: number[] = [];
        const readPreflight = vi.fn().mockResolvedValue(preflight(false));
        const result = await waitForPreflight('buyer.testnet', '2000000', {
            readPreflight,
            sleep: async (milliseconds) => { sleeps.push(milliseconds); },
        });
        expect(result.userRegistered).toBe(false);
        expect(sleeps).toEqual([1_000, 2_000, 4_000]);
        expect(readPreflight).toHaveBeenCalledTimes(4);
    });

    it('stops retrying once registration appears', async () => {
        const sleeps: number[] = [];
        const readPreflight = vi.fn()
            .mockResolvedValueOnce(preflight(false))
            .mockResolvedValueOnce(preflight(true));
        await waitForPreflight('buyer.testnet', '2000000', {
            readPreflight,
            sleep: async (milliseconds) => { sleeps.push(milliseconds); },
        });
        expect(sleeps).toEqual([1_000]);
    });
});
