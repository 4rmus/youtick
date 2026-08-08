import { actions } from 'near-api-js';
import { APP_CONFIG, GAS_CONSTANTS, NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';
import type { WalletInstance } from '@/lib/types';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const CHECKOUT_STORAGE_PREFIX = 'youtick:multi-asset-payment:';
const DAY_MS = 24 * 60 * 60 * 1_000;
const TERMINAL_STATES = new Set<PaymentCheckoutState>(['complete', 'refunded', 'failed']);

export type MultiAssetPaymentMode = 'off' | 'preview' | 'live';
export type PaymentPurpose =
    | { type: 'ticket'; publication_id: string }
    | { type: 'upload'; expected_source_bytes: string };
export type PaymentAsset = {
    asset_id: string;
    network: string;
    symbol: string;
    decimals: number;
    contract_address: string;
};
export type PaymentAssetsResponse = {
    schema: 'youtick.payment-assets.v1';
    mode: MultiAssetPaymentMode;
    destination_asset_id: string;
    assets: PaymentAsset[];
};
export type OneClickQuoteResponse = Record<string, unknown> & {
    quoteRequest: Record<string, unknown>;
    quote: Record<string, unknown> & {
        amountIn: string;
        amountOut: string;
        depositAddress?: string;
        depositMemo?: string;
        deadline?: string;
        timeEstimate?: number;
        refundFee?: string;
        withdrawFee?: string;
    };
    signature: string;
};
export type PaymentQuoteResponse = {
    schema: 'youtick.payment-quote.v1';
    purpose: PaymentPurpose;
    amount_out_usdc: string;
    origin_asset: PaymentAsset;
    destination_asset_id: string;
    quote_response: OneClickQuoteResponse;
};
export type PaymentExecutionStatus =
    | 'KNOWN_DEPOSIT_TX'
    | 'PENDING_DEPOSIT'
    | 'INCOMPLETE_DEPOSIT'
    | 'PROCESSING'
    | 'SUCCESS'
    | 'REFUNDED'
    | 'FAILED';
export type PaymentStatusResponse = {
    schema: 'youtick.payment-status.v1';
    status: PaymentExecutionStatus;
    updated_at: string;
    quote_response: OneClickQuoteResponse;
    swap_details: Record<string, unknown>;
};
export type PaymentCheckoutState =
    | 'quoted'
    | 'awaiting_deposit'
    | 'converting'
    | 'usdc_final'
    | 'core_pending'
    | 'complete'
    | 'refunded'
    | 'failed';
export type ActivePaymentCheckout = {
    schema: 'youtick.active-payment-checkout.v1';
    account_id: string;
    required_usdc_micro: string;
    state: PaymentCheckoutState;
    quote: PaymentQuoteResponse;
    created_at_ms: number;
    updated_at_ms: number;
    expires_at_ms: number;
};
export type PaymentPreflight = {
    userRegistered: boolean;
    marketRegistered: boolean;
    gasSufficient: boolean;
    usdcSufficient: boolean;
    storageMinYocto: string;
    usdcBalanceMicro: string;
    nearBalanceYocto: string;
};

const configuredMode = process.env.NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE?.trim();
export const multiAssetPaymentMode: MultiAssetPaymentMode =
    configuredMode === 'preview' || configuredMode === 'live' ? configuredMode : 'off';
export const multiAssetPaymentsEnabled = multiAssetPaymentMode !== 'off';

export async function listPaymentAssets(): Promise<PaymentAssetsResponse> {
    requireMultiAssetPayments();
    const value = await paymentRequest('/v1/payments/assets');
    const response = parsePaymentAssets(value);
    if (response.mode !== multiAssetPaymentMode) {
        throw new Error('payment_mode_mismatch');
    }
    return response;
}

export async function requestPaymentQuote(input: {
    accountId: string;
    originAssetId: string;
    refundAddress: string;
    purpose: PaymentPurpose;
    dry?: boolean;
}): Promise<PaymentQuoteResponse> {
    requireMultiAssetPayments();
    requireAccountId(input.accountId);
    requireBoundedString(input.originAssetId, 'invalid_payment_asset_id');
    requireBoundedString(input.refundAddress, 'invalid_payment_refund_address');
    requirePurpose(input.purpose);
    const dry = multiAssetPaymentMode === 'preview' || input.dry === true;
    const value = await paymentRequest('/v1/payments/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            dry,
            account_id: input.accountId,
            origin_asset_id: input.originAssetId,
            refund_address: input.refundAddress,
            purpose: input.purpose,
        }),
    });
    return parsePaymentQuote(value, { ...input, dry }, !dry);
}

export async function readPaymentStatus(
    depositAddress: string,
    depositMemo?: string,
): Promise<PaymentStatusResponse> {
    requireBoundedString(depositAddress, 'invalid_payment_deposit_address');
    if (depositMemo !== undefined) requireBoundedString(depositMemo, 'invalid_payment_deposit_memo');
    const query = new URLSearchParams({ deposit_address: depositAddress });
    if (depositMemo) query.set('deposit_memo', depositMemo);
    const value = await paymentRequest(`/v1/payments/status?${query.toString()}`);
    return parsePaymentStatus(value, depositAddress, depositMemo);
}

export function paymentCheckoutState(
    status: PaymentExecutionStatus,
    usdcReady = false,
): PaymentCheckoutState {
    if (status === 'PENDING_DEPOSIT') return 'awaiting_deposit';
    if (status === 'SUCCESS') return usdcReady ? 'usdc_final' : 'converting';
    if (status === 'REFUNDED') return 'refunded';
    if (status === 'FAILED') return 'failed';
    return 'converting';
}

export async function readPaymentPreflight(
    accountId: string,
    requiredUsdcMicro: string,
): Promise<PaymentPreflight> {
    requireAccountId(accountId);
    requirePositiveInteger(requiredUsdcMicro, 'invalid_payment_usdc_amount');
    const gasReserveYocto = requiredPaymentGasReserveYocto();
    const provider = getProvider();
    const [configuredMarketUsdc, storageBounds, userStorage, marketStorage, nearAccount] = await Promise.all([
        viewContract<unknown>(provider, NEAR_CONFIG.marketContractId, 'get_usdc_contract_id'),
        viewContract<unknown>(provider, NEAR_CONFIG.usdcContractId, 'storage_balance_bounds'),
        viewContract<unknown>(provider, NEAR_CONFIG.usdcContractId, 'storage_balance_of', {
            account_id: accountId,
        }),
        viewContract<unknown>(provider, NEAR_CONFIG.usdcContractId, 'storage_balance_of', {
            account_id: NEAR_CONFIG.marketContractId,
        }),
        provider.query({
            request_type: 'view_account',
            finality: 'final',
            account_id: accountId,
        }) as Promise<unknown>,
    ]);
    if (configuredMarketUsdc !== NEAR_CONFIG.usdcContractId) {
        throw new Error('payment_usdc_contract_mismatch');
    }
    const storageMinYocto = parseStorageBounds(storageBounds);
    const userRegistered = parseStorageBalance(userStorage);
    const marketRegistered = parseStorageBalance(marketStorage);
    const nearBalanceYocto = parseNearBalance(nearAccount);
    const usdcBalanceMicro = userRegistered
        ? parseTokenBalance(await viewContract<unknown>(
            provider,
            NEAR_CONFIG.usdcContractId,
            'ft_balance_of',
            { account_id: accountId },
        ))
        : '0';
    const requiredNear = BigInt(gasReserveYocto) + (userRegistered ? 0n : BigInt(storageMinYocto));
    return {
        userRegistered,
        marketRegistered,
        gasSufficient: BigInt(nearBalanceYocto) >= requiredNear,
        usdcSufficient: BigInt(usdcBalanceMicro) >= BigInt(requiredUsdcMicro),
        storageMinYocto,
        usdcBalanceMicro,
        nearBalanceYocto,
    };
}

export async function registerUsdcAccount(
    wallet: WalletInstance,
    accountId: string,
    storageMinYocto: string,
): Promise<object> {
    requireAccountId(accountId);
    requirePositiveInteger(storageMinYocto, 'invalid_payment_storage_min');
    return wallet.signAndSendTransaction({
        receiverId: NEAR_CONFIG.usdcContractId,
        actions: [actions.functionCall(
            'storage_deposit',
            { account_id: accountId, registration_only: true },
            GAS_CONSTANTS.mediumGas,
            BigInt(storageMinYocto),
        )],
    });
}

export async function verifyConvertedUsdcReady(input: {
    accountId: string;
    requiredUsdcMicro: string;
    status: PaymentExecutionStatus;
}): Promise<boolean> {
    if (input.status !== 'SUCCESS') return false;
    const preflight = await readPaymentPreflight(input.accountId, input.requiredUsdcMicro);
    return preflight.userRegistered
        && preflight.marketRegistered
        && preflight.gasSufficient
        && preflight.usdcSufficient;
}

export function loadActivePaymentCheckout(
    accountId: string,
    now = Date.now(),
): ActivePaymentCheckout | null {
    requireAccountId(accountId);
    const storage = paymentStorage();
    if (!storage) return null;
    const key = checkoutStorageKey(accountId);
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
        const checkout = parseActiveCheckout(JSON.parse(raw), accountId);
        if (checkout.expires_at_ms <= now) {
            storage.removeItem(key);
            return null;
        }
        return checkout;
    } catch {
        storage.removeItem(key);
        return null;
    }
}

export function saveActivePaymentCheckout(
    input: Omit<ActivePaymentCheckout, 'schema' | 'expires_at_ms'>,
    now = Date.now(),
): ActivePaymentCheckout {
    requireAccountId(input.account_id);
    requirePositiveInteger(input.required_usdc_micro, 'invalid_payment_usdc_amount');
    if (input.required_usdc_micro !== input.quote.amount_out_usdc
        || !Number.isSafeInteger(input.created_at_ms)
        || !Number.isSafeInteger(input.updated_at_ms)
        || input.created_at_ms > input.updated_at_ms
        || input.updated_at_ms > now) {
        throw new Error('invalid_payment_checkout');
    }
    const storage = paymentStorage();
    if (!storage) throw new Error('payment_storage_unavailable');
    const existing = loadActivePaymentCheckout(input.account_id, now);
    if (existing
        && !TERMINAL_STATES.has(existing.state)
        && quoteIdentity(existing.quote) !== quoteIdentity(input.quote)) {
        throw new Error('payment_checkout_active');
    }
    const checkout: ActivePaymentCheckout = {
        ...input,
        schema: 'youtick.active-payment-checkout.v1',
        expires_at_ms: TERMINAL_STATES.has(input.state)
            ? input.updated_at_ms + DAY_MS
            : input.created_at_ms + 30 * DAY_MS,
    };
    parseActiveCheckout(checkout, input.account_id);
    storage.setItem(checkoutStorageKey(input.account_id), JSON.stringify(checkout));
    return checkout;
}

export function clearActivePaymentCheckout(accountId: string): void {
    requireAccountId(accountId);
    paymentStorage()?.removeItem(checkoutStorageKey(accountId));
}

export function updateActivePaymentCheckoutState(
    accountId: string,
    expected: { purpose: PaymentPurpose; requiredUsdcMicro: string },
    state: PaymentCheckoutState,
    now = Date.now(),
): ActivePaymentCheckout | null {
    const checkout = loadActivePaymentCheckout(accountId, now);
    if (!checkout
        || checkout.required_usdc_micro !== expected.requiredUsdcMicro
        || !samePurpose(checkout.quote.purpose, expected.purpose)) return null;
    const allowed = (state === 'core_pending' && checkout.state === 'usdc_final')
        || (state === 'complete' && checkout.state === 'core_pending')
        || (state === 'usdc_final' && checkout.state === 'core_pending');
    if (!allowed) return null;
    return saveActivePaymentCheckout({
        account_id: checkout.account_id,
        required_usdc_micro: checkout.required_usdc_micro,
        state,
        quote: checkout.quote,
        created_at_ms: checkout.created_at_ms,
        updated_at_ms: now,
    }, now);
}

function parsePaymentAssets(value: Record<string, unknown>): PaymentAssetsResponse {
    if (value.schema !== 'youtick.payment-assets.v1'
        || !['off', 'preview', 'live'].includes(String(value.mode))
        || value.destination_asset_id !== `nep141:${NEAR_CONFIG.usdcContractId}`
        || !Array.isArray(value.assets)) {
        throw new Error('invalid_payment_assets_response');
    }
    return {
        schema: value.schema,
        mode: value.mode as MultiAssetPaymentMode,
        destination_asset_id: value.destination_asset_id,
        assets: value.assets.map(parsePaymentAsset),
    };
}

function parsePaymentQuote(
    value: Record<string, unknown>,
    expected?: {
        accountId: string;
        originAssetId: string;
        refundAddress: string;
        purpose: PaymentPurpose;
        dry: boolean;
    },
    requireDeposit = false,
): PaymentQuoteResponse {
    const purpose = parsePurpose(value.purpose);
    if (value.schema !== 'youtick.payment-quote.v1'
        || (expected && !samePurpose(purpose, expected.purpose))
        || typeof value.amount_out_usdc !== 'string'
        || !POSITIVE_INTEGER_PATTERN.test(value.amount_out_usdc)
        || value.destination_asset_id !== `nep141:${NEAR_CONFIG.usdcContractId}`) {
        throw new Error('invalid_payment_quote_response');
    }
    const originAsset = parsePaymentAsset(value.origin_asset);
    const quoteResponse = parseOneClickQuote(value.quote_response);
    if ((expected && originAsset.asset_id !== expected.originAssetId)
        || quoteResponse.quote.amountOut !== value.amount_out_usdc
        || (expected && !matchesQuoteRequest(
            quoteResponse.quoteRequest,
            expected,
            value.amount_out_usdc,
        ))
        || (requireDeposit && !quoteResponse.quote.depositAddress)) {
        throw new Error('invalid_payment_quote_response');
    }
    return {
        schema: value.schema,
        purpose,
        amount_out_usdc: value.amount_out_usdc,
        origin_asset: originAsset,
        destination_asset_id: value.destination_asset_id,
        quote_response: quoteResponse,
    };
}

function parsePaymentStatus(
    value: Record<string, unknown>,
    depositAddress: string,
    depositMemo?: string,
): PaymentStatusResponse {
    const statuses: PaymentExecutionStatus[] = [
        'KNOWN_DEPOSIT_TX', 'PENDING_DEPOSIT', 'INCOMPLETE_DEPOSIT', 'PROCESSING',
        'SUCCESS', 'REFUNDED', 'FAILED',
    ];
    if (value.schema !== 'youtick.payment-status.v1'
        || !statuses.includes(value.status as PaymentExecutionStatus)
        || typeof value.updated_at !== 'string'
        || Number.isNaN(Date.parse(value.updated_at))
        || !value.swap_details
        || typeof value.swap_details !== 'object'
        || Array.isArray(value.swap_details)) {
        throw new Error('invalid_payment_status_response');
    }
    const quoteResponse = parseOneClickQuote(value.quote_response);
    if (quoteResponse.quote.depositAddress !== depositAddress
        || (depositMemo !== undefined && quoteResponse.quote.depositMemo !== depositMemo)) {
        throw new Error('invalid_payment_status_response');
    }
    return {
        schema: value.schema,
        status: value.status as PaymentExecutionStatus,
        updated_at: value.updated_at,
        quote_response: quoteResponse,
        swap_details: value.swap_details as Record<string, unknown>,
    };
}

function parsePaymentAsset(value: unknown): PaymentAsset {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid_payment_asset');
    }
    const asset = value as Record<string, unknown>;
    if (typeof asset.asset_id !== 'string'
        || typeof asset.network !== 'string'
        || typeof asset.symbol !== 'string'
        || !Number.isSafeInteger(asset.decimals)
        || Number(asset.decimals) < 0
        || Number(asset.decimals) > 30
        || typeof asset.contract_address !== 'string') {
        throw new Error('invalid_payment_asset');
    }
    return asset as PaymentAsset;
}

function parseOneClickQuote(value: unknown): OneClickQuoteResponse {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid_payment_quote_response');
    }
    const response = value as Record<string, unknown>;
    if (typeof response.signature !== 'string' || !response.signature
        || !response.quoteRequest
        || typeof response.quoteRequest !== 'object'
        || Array.isArray(response.quoteRequest)
        || !response.quote || typeof response.quote !== 'object' || Array.isArray(response.quote)) {
        throw new Error('invalid_payment_quote_response');
    }
    const request = response.quoteRequest as Record<string, unknown>;
    const quote = response.quote as Record<string, unknown>;
    if (unsafeOneClickFields(request)
        || typeof quote.amountIn !== 'string' || !POSITIVE_INTEGER_PATTERN.test(quote.amountIn)
        || typeof quote.amountOut !== 'string' || !POSITIVE_INTEGER_PATTERN.test(quote.amountOut)
        || (quote.depositAddress !== undefined && typeof quote.depositAddress !== 'string')
        || (quote.depositMemo !== undefined && typeof quote.depositMemo !== 'string')
        || 'customRecipientMsg' in quote
        || 'appFees' in quote
        || 'insured' in quote) {
        throw new Error('invalid_payment_quote_response');
    }
    return response as OneClickQuoteResponse;
}

function parseActiveCheckout(value: unknown, accountId: string): ActivePaymentCheckout {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_payment_checkout');
    const checkout = value as Record<string, unknown>;
    const states: PaymentCheckoutState[] = [
        'quoted', 'awaiting_deposit', 'converting', 'usdc_final',
        'core_pending', 'complete', 'refunded', 'failed',
    ];
    if (checkout.schema !== 'youtick.active-payment-checkout.v1'
        || checkout.account_id !== accountId
        || typeof checkout.required_usdc_micro !== 'string'
        || !POSITIVE_INTEGER_PATTERN.test(checkout.required_usdc_micro)
        || !states.includes(checkout.state as PaymentCheckoutState)
        || !Number.isSafeInteger(checkout.created_at_ms)
        || !Number.isSafeInteger(checkout.updated_at_ms)
        || !Number.isSafeInteger(checkout.expires_at_ms)
        || Number(checkout.created_at_ms) > Number(checkout.updated_at_ms)) {
        throw new Error('invalid_payment_checkout');
    }
    const quote = parsePaymentQuote(checkout.quote as Record<string, unknown>);
    if (quote.amount_out_usdc !== checkout.required_usdc_micro) throw new Error('invalid_payment_checkout');
    return { ...checkout, quote } as ActivePaymentCheckout;
}

function parseStorageBounds(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_payment_storage_bounds');
    const min = (value as Record<string, unknown>).min;
    if (typeof min !== 'string' || !POSITIVE_INTEGER_PATTERN.test(min)) {
        throw new Error('invalid_payment_storage_bounds');
    }
    return min;
}

function parseStorageBalance(value: unknown): boolean {
    if (value === null) return false;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid_payment_storage_balance');
    }
    const total = (value as Record<string, unknown>).total;
    if (typeof total !== 'string' || !/^[0-9]+$/.test(total)) {
        throw new Error('invalid_payment_storage_balance');
    }
    return true;
}

function parseNearBalance(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_payment_near_balance');
    const amount = (value as Record<string, unknown>).amount;
    if (typeof amount !== 'string' || !/^[0-9]+$/.test(amount)) throw new Error('invalid_payment_near_balance');
    return amount;
}

function parseTokenBalance(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) throw new Error('invalid_payment_usdc_balance');
    return value;
}

async function paymentRequest(route: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(paymentRoute(route), { ...init, cache: 'no-store' });
    const value = await readJson(response);
    if (!response.ok) {
        throw new Error(typeof value.error === 'string' ? value.error : `payment_http_${response.status}`);
    }
    return value;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
    try {
        const value = await response.json();
        if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
        // Mapped below.
    }
    throw new Error('invalid_payment_response');
}

function paymentRoute(route: string): string {
    try {
        const url = new URL(route, APP_CONFIG.livepeerBridgeUrl);
        if (url.protocol !== 'https:') throw new Error('invalid_payment_bridge_url');
        return url.toString();
    } catch {
        throw new Error('invalid_payment_bridge_url');
    }
}

function requiredPaymentGasReserveYocto(): string {
    const value = process.env.NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO?.trim();
    if (!value || !POSITIVE_INTEGER_PATTERN.test(value)) {
        throw new Error('payment_gas_reserve_not_configured');
    }
    return value;
}

function requireMultiAssetPayments(): void {
    if (!multiAssetPaymentsEnabled) throw new Error('multi_asset_payments_disabled');
}

function requireAccountId(accountId: string): void {
    if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error('invalid_account_id');
}

function requirePositiveInteger(value: string, error: string): void {
    if (!POSITIVE_INTEGER_PATTERN.test(value)) throw new Error(error);
}

function requireBoundedString(value: string, error: string): void {
    if (!value.trim() || value.length > 256) throw new Error(error);
}

function requirePurpose(purpose: PaymentPurpose): void {
    if (purpose.type === 'ticket') {
        requireBoundedString(purpose.publication_id, 'invalid_payment_purpose');
        return;
    }
    if (purpose.type === 'upload') {
        requirePositiveInteger(purpose.expected_source_bytes, 'invalid_payment_purpose');
        return;
    }
    throw new Error('invalid_payment_purpose');
}

function parsePurpose(value: unknown): PaymentPurpose {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid_payment_quote_response');
    }
    const purpose = value as PaymentPurpose;
    try {
        requirePurpose(purpose);
        return purpose;
    } catch {
        throw new Error('invalid_payment_quote_response');
    }
}

function samePurpose(value: unknown, expected: PaymentPurpose): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const purpose = value as Record<string, unknown>;
    return expected.type === 'ticket'
        ? purpose.type === 'ticket' && purpose.publication_id === expected.publication_id
        : purpose.type === 'upload' && purpose.expected_source_bytes === expected.expected_source_bytes;
}

function matchesQuoteRequest(
    request: Record<string, unknown>,
    expected: {
        accountId: string;
        originAssetId: string;
        refundAddress: string;
        dry: boolean;
    },
    amountOut: unknown,
): boolean {
    return request.dry === expected.dry
        && request.swapType === 'EXACT_OUTPUT'
        && request.slippageTolerance === 100
        && request.originAsset === expected.originAssetId
        && request.depositType === 'ORIGIN_CHAIN'
        && request.destinationAsset === `nep141:${NEAR_CONFIG.usdcContractId}`
        && request.amount === amountOut
        && request.refundTo === expected.refundAddress
        && request.refundType === 'ORIGIN_CHAIN'
        && request.recipient === expected.accountId
        && request.recipientType === 'DESTINATION_CHAIN'
        && !unsafeOneClickFields(request);
}

function unsafeOneClickFields(value: Record<string, unknown>): boolean {
    return 'customRecipientMsg' in value
        || (value.appFees !== undefined
            && (!Array.isArray(value.appFees) || value.appFees.length !== 0))
        || (value.insured !== undefined && value.insured !== false);
}

function paymentStorage(): Storage | null {
    return typeof window === 'undefined' ? null : window.localStorage;
}

function checkoutStorageKey(accountId: string): string {
    return `${CHECKOUT_STORAGE_PREFIX}${accountId}`;
}

function quoteIdentity(quote: PaymentQuoteResponse): string {
    return quote.quote_response.signature;
}
