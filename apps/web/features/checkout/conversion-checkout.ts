import {
    readPaymentPreflight,
    type ActivePaymentCheckout,
    type PaymentCheckoutState,
    type PaymentPreflight,
    type PaymentPurpose,
    type PaymentQuoteResponse,
} from '@/lib/multi-asset-payments';
import type { Locale } from '@/lib/i18n/locale';
import { messages } from '@/lib/i18n/messages';

export const CONVERSION_POLLING_STATES: readonly PaymentCheckoutState[] = ['awaiting_deposit', 'converting', 'quoted'];
export const CONVERSION_TERMINAL_STATES: readonly PaymentCheckoutState[] = ['usdc_final', 'complete', 'refunded', 'failed'];
export const CONVERSION_READY_STATES: readonly PaymentCheckoutState[] = ['usdc_final', 'complete'];
export const CONVERSION_WAITING_STATES: readonly PaymentCheckoutState[] = ['quoted', 'awaiting_deposit', 'converting', 'core_pending'];

const PREFLIGHT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const SLOW_ROUTE_SECONDS = 600;

export function purposeIdentity(purpose: PaymentPurpose): string {
    return purpose.type === 'ticket'
        ? `ticket:${purpose.publication_id}`
        : `upload:${purpose.expected_source_bytes}`;
}

export function checkoutMatches(
    checkout: ActivePaymentCheckout,
    purposeKey: string,
    requiredUsdcMicro: string,
): boolean {
    return purposeIdentity(checkout.quote.purpose) === purposeKey
        && checkout.required_usdc_micro === requiredUsdcMicro;
}

export function requireCurrentAmount(quote: PaymentQuoteResponse, expected: string): void {
    if (quote.amount_out_usdc !== expected) throw new Error('payment_amount_changed');
}

export function isRouteTooSlow(timeEstimate: unknown): boolean {
    return typeof timeEstimate === 'number' && timeEstimate > SLOW_ROUTE_SECONDS;
}

export async function waitForPreflight(
    accountId: string,
    requiredUsdcMicro: string,
    deps: {
        readPreflight(accountId: string, requiredUsdcMicro: string): Promise<PaymentPreflight>;
        sleep(milliseconds: number): Promise<void>;
    } = {
        readPreflight: (account, required) => readPaymentPreflight(account, required),
        sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    },
): Promise<PaymentPreflight> {
    let result = await deps.readPreflight(accountId, requiredUsdcMicro);
    for (const delay of PREFLIGHT_RETRY_DELAYS_MS) {
        if (result.userRegistered) return result;
        await deps.sleep(delay);
        result = await deps.readPreflight(accountId, requiredUsdcMicro);
    }
    return result;
}

export function formatAssetAmount(value: string, decimals: number): string {
    const amount = BigInt(value);
    const scale = 10n ** BigInt(decimals);
    const whole = amount / scale;
    const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function checkoutStateLabel(state: ActivePaymentCheckout['state'], locale: Locale = 'en'): string {
    return messages[locale].conversion.states[state] ?? messages[locale].conversion.states.quoted;
}

export function errorCode(reason: unknown): string {
    return reason instanceof Error ? reason.message : 'payment_unknown_error';
}

export function paymentErrorMessage(code: string, locale: Locale = 'en'): string {
    const t = messages[locale].conversion.errors;
    if (code === 'another_payment_checkout_active' || code === 'payment_checkout_active') return t.anotherActive;
    if (code === 'payment_market_usdc_not_registered' || code === 'payment_usdc_contract_mismatch') return t.usdcMismatch;
    if (code === 'payment_gas_reserve_insufficient') return t.gasReserve;
    if (code === 'payment_amount_changed') return t.amountChanged;
    if (code === 'payment_route_temporarily_unavailable') return t.routeUnavailable;
    if (code === 'payment_usdc_registration_pending') return t.registrationPending;
    if (code === 'payment_converted_usdc_not_ready') return t.convertedNotReady;
    if (code === 'payment_mode_mismatch') return t.modeMismatch;
    return t.fallback;
}
