import { beforeEach, describe, expect, it, vi } from 'vitest';

const oneClickMocks = vi.hoisted(() => {
  const getTokens = vi.fn();
  const getQuote = vi.fn();
  const getExecutionStatus = vi.fn();
  const submitDepositTx = vi.fn();

  class MockApiError extends Error {
    status: number;
    body: unknown;

    constructor(status: number, body: unknown) {
      super('API error');
      this.status = status;
      this.body = body;
    }
  }

  return {
    getTokens,
    getQuote,
    getExecutionStatus,
    submitDepositTx,
    MockApiError,
  };
});

vi.mock('@defuse-protocol/one-click-sdk-typescript', () => ({
  OpenAPI: {},
  ApiError: oneClickMocks.MockApiError,
  QuoteRequest: {
    depositType: { ORIGIN_CHAIN: 'ORIGIN_CHAIN', INTENTS: 'INTENTS' },
    refundType: { ORIGIN_CHAIN: 'ORIGIN_CHAIN', INTENTS: 'INTENTS' },
    recipientType: { DESTINATION_CHAIN: 'DESTINATION_CHAIN', INTENTS: 'INTENTS' },
    swapType: { EXACT_INPUT: 'EXACT_INPUT' },
  },
  OneClickService: {
    getTokens: oneClickMocks.getTokens,
    getQuote: oneClickMocks.getQuote,
    getExecutionStatus: oneClickMocks.getExecutionStatus,
    submitDepositTx: oneClickMocks.submitDepositTx,
  },
}));

describe('one-click-client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT = 'true';
    process.env.NEXT_PUBLIC_ONE_CLICK_API_TOKEN = 'test-token';
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';
    process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'youtick.near';
  });

  it('uses the live token catalog when requesting quotes', async () => {
    oneClickMocks.getTokens.mockResolvedValue([
      {
        assetId: 'nep141:runtime-usdc.near',
        decimals: 6,
        blockchain: 'near',
        symbol: 'USDC',
        price: 1,
        priceUpdatedAt: new Date().toISOString(),
      },
    ]);
    oneClickMocks.getQuote.mockResolvedValue({
      correlationId: 'corr-1',
      timestamp: new Date().toISOString(),
      signature: 'sig',
      quoteRequest: {},
      quote: {
        depositAddress: 'deposit.near',
        depositMemo: 'memo-123',
        amountIn: '5000000',
        amountInFormatted: '5',
        amountInUsd: '5',
        minAmountIn: '5000000',
        amountOut: '1000000000000000000000000',
        amountOutFormatted: '1',
        amountOutUsd: '5',
        minAmountOut: '990000000000000000000000',
        timeEstimate: 30,
        deadline: new Date().toISOString(),
      },
    });

    const { getSwapQuote } = await import('@/lib/intents/one-click-client');
    const { getTokenConfig } = await import('@/lib/intents/config');

    const quote = await getSwapQuote('USDC', 'near', 500, 'alice.near', 'alice.near', true);

    expect(oneClickMocks.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        originAsset: 'nep141:runtime-usdc.near',
      }),
    );
    expect(getTokenConfig('USDC', 'near')?.assetId).toBe('nep141:runtime-usdc.near');
    expect(quote.depositMemo).toBe('memo-123');
  });

  it('forwards deposit memo to status and deposit-submit calls', async () => {
    oneClickMocks.getExecutionStatus.mockResolvedValue({ status: 'SUCCESS' });
    oneClickMocks.submitDepositTx.mockResolvedValue({ status: 'KNOWN_DEPOSIT_TX' });

    const { getSwapStatus, submitDeposit } = await import('@/lib/intents/one-click-client');

    await getSwapStatus('deposit.near', 'memo-123');
    await submitDeposit('tx-hash', 'deposit.near', 'alice.near', 'memo-123');

    expect(oneClickMocks.getExecutionStatus).toHaveBeenCalledWith('deposit.near', 'memo-123');
    expect(oneClickMocks.submitDepositTx).toHaveBeenCalledWith({
      txHash: 'tx-hash',
      depositAddress: 'deposit.near',
      nearSenderAccount: 'alice.near',
      memo: 'memo-123',
    });
  });
});
