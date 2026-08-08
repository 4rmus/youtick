import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    query: vi.fn(),
    viewContract: vi.fn(),
}));

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: { livepeerBridgeUrl: 'https://bridge.youtick.net' },
    GAS_CONSTANTS: { mediumGas: 100_000_000_000_000n },
    NEAR_CONFIG: {
        marketContractId: 'market.testnet',
        usdcContractId: 'usdc.testnet',
    },
}));

vi.mock('@/lib/near', () => ({
    getProvider: () => ({ query: state.query }),
    viewContract: state.viewContract,
}));

const ASSET = {
    asset_id: 'nep141:base-usdc.omft.near',
    network: 'base',
    symbol: 'USDC',
    decimals: 6,
    contract_address: '0x8335',
};

function quoteResponse(input: {
    signature?: string;
    depositAddress?: string;
    amountOut?: string;
    dry?: boolean;
} = {}) {
    const amountOut = input.amountOut || '2000000';
    const dry = input.dry ?? false;
    return {
        schema: 'youtick.payment-quote.v1',
        purpose: { type: 'ticket', publication_id: 'job-001' },
        amount_out_usdc: amountOut,
        origin_asset: ASSET,
        destination_asset_id: 'nep141:usdc.testnet',
        quote_response: {
            signature: input.signature || 'signed-quote-1',
            quoteRequest: {
                dry,
                swapType: 'EXACT_OUTPUT',
                slippageTolerance: 100,
                originAsset: ASSET.asset_id,
                depositType: 'ORIGIN_CHAIN',
                destinationAsset: 'nep141:usdc.testnet',
                amount: amountOut,
                refundTo: '0xrefund',
                refundType: 'ORIGIN_CHAIN',
                recipient: 'buyer.testnet',
                recipientType: 'DESTINATION_CHAIN',
            },
            quote: {
                amountIn: '2020000',
                amountOut,
                ...(input.depositAddress ? { depositAddress: input.depositAddress } : {}),
            },
        },
    };
}

async function loadModule(mode: 'off' | 'preview' | 'live' = 'live') {
    process.env.NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE = mode;
    process.env.NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO = '1000';
    vi.resetModules();
    return import('@/lib/multi-asset-payments');
}

describe('multi-asset payment core', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE;
        delete process.env.NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO;
    });

    it('uses the Worker schema and forces preview quotes to stay dry', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                schema: 'youtick.payment-assets.v1',
                mode: 'preview',
                destination_asset_id: 'nep141:usdc.testnet',
                assets: [ASSET],
            })))
            .mockResolvedValueOnce(new Response(JSON.stringify(quoteResponse({ dry: true }))))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                schema: 'youtick.payment-status.v1',
                status: 'PROCESSING',
                updated_at: '2026-08-08T10:00:00.000Z',
                quote_response: quoteResponse({ depositAddress: '0xdeposit' }).quote_response,
                swap_details: {},
            })));
        vi.stubGlobal('fetch', fetchMock);
        const payments = await loadModule('preview');

        await expect(payments.listPaymentAssets()).resolves.toMatchObject({ assets: [ASSET] });
        await expect(payments.requestPaymentQuote({
            accountId: 'buyer.testnet',
            originAssetId: ASSET.asset_id,
            refundAddress: '0xrefund',
            purpose: { type: 'ticket', publication_id: 'job-001' },
            dry: false,
        })).resolves.toMatchObject({ amount_out_usdc: '2000000' });
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ dry: true });
        await expect(payments.readPaymentStatus('0xdeposit')).resolves.toMatchObject({
            status: 'PROCESSING',
        });
        expect(fetchMock.mock.calls[2][0]).toBe(
            'https://bridge.youtick.net/v1/payments/status?deposit_address=0xdeposit',
        );
    });

    it('rejects a quote whose signed amount or deposit identity does not match', async () => {
        const mismatched = quoteResponse({ depositAddress: '0xdeposit' });
        mismatched.quote_response.quote.amountOut = '2000001';
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(mismatched)))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                schema: 'youtick.payment-status.v1',
                status: 'SUCCESS',
                updated_at: '2026-08-08T10:00:00.000Z',
                quote_response: quoteResponse({ depositAddress: '0xother' }).quote_response,
                swap_details: {},
            }))));
        const payments = await loadModule('live');

        await expect(payments.requestPaymentQuote({
            accountId: 'buyer.testnet',
            originAssetId: ASSET.asset_id,
            refundAddress: '0xrefund',
            purpose: { type: 'ticket', publication_id: 'job-001' },
        })).rejects.toThrow('invalid_payment_quote_response');
        await expect(payments.readPaymentStatus('0xdeposit'))
            .rejects.toThrow('invalid_payment_status_response');
    });

    it('binds the signed quote to the requested account, asset and refund address', async () => {
        const mismatched = quoteResponse({ depositAddress: '0xdeposit' });
        mismatched.quote_response.quoteRequest.recipient = 'attacker.testnet';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify(mismatched)),
        ));
        const payments = await loadModule('live');

        await expect(payments.requestPaymentQuote({
            accountId: 'buyer.testnet',
            originAssetId: ASSET.asset_id,
            refundAddress: '0xrefund',
            purpose: { type: 'ticket', publication_id: 'job-001' },
        })).rejects.toThrow('invalid_payment_quote_response');
    });

    it('rejects a Worker destination that is not the configured Circle USDC asset', async () => {
        const mismatched = quoteResponse();
        mismatched.destination_asset_id = 'nep141:other-usdc.testnet';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify(mismatched)),
        ));
        const payments = await loadModule('live');

        await expect(payments.requestPaymentQuote({
            accountId: 'buyer.testnet',
            originAssetId: ASSET.asset_id,
            refundAddress: '0xrefund',
            purpose: { type: 'ticket', publication_id: 'job-001' },
        })).rejects.toThrow('invalid_payment_quote_response');
    });

    it('fails closed when the web and Worker payment modes drift', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            schema: 'youtick.payment-assets.v1',
            mode: 'live',
            destination_asset_id: 'nep141:usdc.testnet',
            assets: [ASSET],
        }))));
        const payments = await loadModule('preview');

        await expect(payments.listPaymentAssets()).rejects.toThrow('payment_mode_mismatch');
    });

    it('checks live storage, contract parity, gas and USDC before declaring readiness', async () => {
        state.query.mockResolvedValue({ amount: '5000' });
        state.viewContract.mockImplementation(async (
            _provider: unknown,
            _contractId: string,
            methodName: string,
            args?: Record<string, unknown>,
        ) => {
            if (methodName === 'get_usdc_contract_id') return 'usdc.testnet';
            if (methodName === 'storage_balance_bounds') return { min: '1250', max: '1250' };
            if (methodName === 'storage_balance_of') {
                return { total: args?.account_id === 'buyer.testnet' ? '1250' : '2000', available: '0' };
            }
            if (methodName === 'ft_balance_of') return '2000000';
            throw new Error(`unexpected method ${methodName}`);
        });
        const payments = await loadModule();

        await expect(payments.readPaymentPreflight('buyer.testnet', '2000000')).resolves.toEqual({
            userRegistered: true,
            marketRegistered: true,
            gasSufficient: true,
            usdcSufficient: true,
            storageMinYocto: '1250',
            usdcBalanceMicro: '2000000',
            nearBalanceYocto: '5000',
        });
        await expect(payments.verifyConvertedUsdcReady({
            accountId: 'buyer.testnet',
            requiredUsdcMicro: '2000000',
            status: 'PROCESSING',
        })).resolves.toBe(false);
        expect(state.viewContract).toHaveBeenCalledTimes(5);
        await expect(payments.verifyConvertedUsdcReady({
            accountId: 'buyer.testnet',
            requiredUsdcMicro: '2000000',
            status: 'SUCCESS',
        })).resolves.toBe(true);
        expect(payments.paymentCheckoutState('SUCCESS')).toBe('converting');
        expect(payments.paymentCheckoutState('SUCCESS', true)).toBe('usdc_final');

        state.viewContract.mockResolvedValueOnce('other-usdc.testnet');
        await expect(payments.readPaymentPreflight('buyer.testnet', '2000000'))
            .rejects.toThrow('payment_usdc_contract_mismatch');
    });

    it('builds only the exact live USDC storage registration transaction', async () => {
        const payments = await loadModule();
        const wallet = { signAndSendTransaction: vi.fn().mockResolvedValue({}) };

        await payments.registerUsdcAccount(wallet as never, 'buyer.testnet', '1250');

        expect(wallet.signAndSendTransaction).toHaveBeenCalledWith({
            receiverId: 'usdc.testnet',
            actions: [{
                type: 'FunctionCall',
                methodName: 'storage_deposit',
                args: { account_id: 'buyer.testnet', registration_only: true },
                gas: 100_000_000_000_000n,
                deposit: 1250n,
            }],
        });
    });

    it('keeps one active checkout per account and applies both retention windows', async () => {
        const payments = await loadModule();
        const now = 1_800_000_000_000;
        const quote = quoteResponse({ depositAddress: '0xdeposit' }) as never;
        const input = {
            account_id: 'buyer.testnet',
            required_usdc_micro: '2000000',
            state: 'awaiting_deposit' as const,
            quote,
            created_at_ms: now,
            updated_at_ms: now,
        };

        payments.saveActivePaymentCheckout(input, now);
        expect(payments.loadActivePaymentCheckout('buyer.testnet', now)?.state)
            .toBe('awaiting_deposit');
        expect(() => payments.saveActivePaymentCheckout({
            ...input,
            quote: quoteResponse({ signature: 'signed-quote-2', depositAddress: '0xother' }) as never,
        }, now)).toThrow('payment_checkout_active');
        expect(payments.loadActivePaymentCheckout('buyer.testnet', now + 30 * 24 * 60 * 60 * 1_000))
            .toBeNull();

        payments.saveActivePaymentCheckout(input, now);
        payments.saveActivePaymentCheckout({ ...input, updated_at_ms: now + 1_000 }, now + 1_000);
        expect(payments.loadActivePaymentCheckout(
            'buyer.testnet',
            now + 30 * 24 * 60 * 60 * 1_000,
        )).toBeNull();

        payments.saveActivePaymentCheckout({ ...input, state: 'failed' }, now);
        expect(payments.loadActivePaymentCheckout('buyer.testnet', now + 24 * 60 * 60 * 1_000))
            .toBeNull();
    });

    it('moves a converted checkout only through core pending to complete', async () => {
        const payments = await loadModule();
        const now = 1_800_000_000_000;
        const quote = quoteResponse({ depositAddress: '0xdeposit' }) as never;
        payments.saveActivePaymentCheckout({
            account_id: 'buyer.testnet',
            required_usdc_micro: '2000000',
            state: 'usdc_final',
            quote,
            created_at_ms: now,
            updated_at_ms: now,
        }, now);

        const expected = {
            purpose: { type: 'ticket' as const, publication_id: 'job-001' },
            requiredUsdcMicro: '2000000',
        };
        expect(payments.updateActivePaymentCheckoutState(
            'buyer.testnet', expected, 'complete', now + 1,
        ))
            .toBeNull();
        expect(payments.updateActivePaymentCheckoutState('buyer.testnet', {
            ...expected,
            purpose: { type: 'ticket', publication_id: 'other-job' },
        }, 'core_pending', now + 1)).toBeNull();
        expect(payments.updateActivePaymentCheckoutState('buyer.testnet', {
            ...expected,
            requiredUsdcMicro: '2000001',
        }, 'core_pending', now + 1)).toBeNull();
        expect(payments.updateActivePaymentCheckoutState(
            'buyer.testnet', expected, 'core_pending', now + 1,
        )?.state)
            .toBe('core_pending');
        expect(payments.updateActivePaymentCheckoutState(
            'buyer.testnet', expected, 'complete', now + 2,
        )?.state)
            .toBe('complete');
        expect(payments.loadActivePaymentCheckout('buyer.testnet', now + 2 + 24 * 60 * 60 * 1_000))
            .toBeNull();
    });

    it('keeps a stored checkout and status lookup usable after quote mode is off', async () => {
        const payments = await loadModule('off');
        const now = 1_800_000_000_000;
        const quote = quoteResponse({ depositAddress: '0xdeposit' }) as never;
        payments.saveActivePaymentCheckout({
            account_id: 'buyer.testnet',
            required_usdc_micro: '2000000',
            state: 'awaiting_deposit',
            quote,
            created_at_ms: now,
            updated_at_ms: now,
        }, now);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            schema: 'youtick.payment-status.v1',
            status: 'PROCESSING',
            updated_at: '2026-08-08T10:00:00.000Z',
            quote_response: quoteResponse({ depositAddress: '0xdeposit' }).quote_response,
            swap_details: {},
        }))));

        expect(payments.loadActivePaymentCheckout('buyer.testnet', now)?.state)
            .toBe('awaiting_deposit');
        await expect(payments.readPaymentStatus('0xdeposit')).resolves.toMatchObject({
            status: 'PROCESSING',
        });
        await expect(payments.listPaymentAssets()).rejects.toThrow('multi_asset_payments_disabled');
    });
});
