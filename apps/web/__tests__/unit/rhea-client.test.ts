import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rheaMocks = vi.hoisted(() => ({
  initEnv: vi.fn(),
  ftGetTokenMetadata: vi.fn(),
  fetchAllPools: vi.fn(),
  getStablePools: vi.fn(),
  estimateSwap: vi.fn(),
  instantSwap: vi.fn(),
  ftGetStorageBalance: vi.fn(),
  getMinStorageBalance: vi.fn(),
  nearDepositTransaction: vi.fn(),
  getNearPrice: vi.fn(),
}));

vi.mock('@ref-finance/ref-sdk', () => ({
  init_env: rheaMocks.initEnv,
  ftGetTokenMetadata: rheaMocks.ftGetTokenMetadata,
  fetchAllPools: rheaMocks.fetchAllPools,
  getStablePools: rheaMocks.getStablePools,
  estimateSwap: rheaMocks.estimateSwap,
  instantSwap: rheaMocks.instantSwap,
  ftGetStorageBalance: rheaMocks.ftGetStorageBalance,
  getMinStorageBalance: rheaMocks.getMinStorageBalance,
  nearDepositTransaction: rheaMocks.nearDepositTransaction,
}));

vi.mock('@/lib/price', () => ({
  getNearPrice: rheaMocks.getNearPrice,
}));

describe('rhea client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';

    rheaMocks.initEnv.mockReturnValue({ WRAP_NEAR_CONTRACT_ID: 'wrap.near' });
    rheaMocks.ftGetTokenMetadata.mockResolvedValue({
      id: 'usdc.near',
      name: 'USDC',
      symbol: 'USDC',
      decimals: 6,
      icon: '',
    });
    rheaMocks.fetchAllPools.mockResolvedValue({
      simplePools: [{ id: 1 }],
      unRatedPools: [],
      ratedPools: [],
    });
    rheaMocks.getStablePools.mockResolvedValue([]);
    rheaMocks.getNearPrice.mockResolvedValue(5);
    rheaMocks.estimateSwap.mockResolvedValue([
      { estimate: '0.40', pool: { id: 1 } },
      { estimate: '0.65', pool: { id: 2 } },
    ]);
    rheaMocks.instantSwap.mockResolvedValue([
      {
        receiverId: 'wrap.near',
        functionCalls: [{
          methodName: 'ft_transfer_call',
          args: { receiver_id: 'v2.ref-finance.near' },
          gas: '100000000000000',
          amount: '0.000000000000000000000001',
        }],
      },
    ]);
    rheaMocks.ftGetStorageBalance.mockResolvedValue('1');
    rheaMocks.getMinStorageBalance.mockResolvedValue('1250000000000000000000');
    rheaMocks.nearDepositTransaction.mockImplementation((amount: string) => ({
      receiverId: 'wrap.near',
      functionCalls: [{
        methodName: 'near_deposit',
        args: {},
        gas: '30000000000000',
        amount,
      }],
    }));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_NEAR_NETWORK;
  });

  it('quotes NEAR to USDC with slippage coverage', async () => {
    const { quoteNearToUsdc } = await import('@/lib/rhea/client');

    const quote = await quoteNearToUsdc(1_000_000);

    expect(rheaMocks.initEnv).toHaveBeenCalledWith('mainnet', undefined, 'https://free.rpc.fastnear.com');
    expect(rheaMocks.estimateSwap).toHaveBeenCalledWith(expect.objectContaining({
      amountIn: expect.any(String),
      tokenIn: expect.objectContaining({ id: 'wrap.near' }),
      tokenOut: expect.objectContaining({ symbol: 'USDC' }),
    }));
    expect(quote.amountOutUsdcUnits).toBe(1_050_000);
    expect(quote.minAmountOutUsdcUnits).toBeGreaterThanOrEqual(1_000_000);
  });

  it('fails clearly when Rhea has no route', async () => {
    rheaMocks.estimateSwap.mockResolvedValue([]);
    const { quoteNearToUsdc } = await import('@/lib/rhea/client');

    await expect(quoteNearToUsdc(1_000_000)).rejects.toThrow('Rhea route unavailable');
  });

  it('builds wrap NEAR deposit before the Rhea swap transaction', async () => {
    rheaMocks.ftGetStorageBalance.mockResolvedValueOnce(null);
    const { buildNearToUsdcSwapTransactions, quoteNearToUsdc } = await import('@/lib/rhea/client');
    const quote = await quoteNearToUsdc(1_000_000);

    const transactions = await buildNearToUsdcSwapTransactions('alice.near', quote);

    expect(rheaMocks.nearDepositTransaction).toHaveBeenCalledWith(expect.any(String));
    expect(transactions).toHaveLength(2);
    expect(transactions[0].receiverId).toBe('wrap.near');
    expect(transactions[0].actions[0]).toMatchObject({ methodName: 'near_deposit' });
    expect(transactions[1].actions[0]).toMatchObject({ methodName: 'ft_transfer_call' });
  });

  it('builds USDC ticket payment with a stable payment id', async () => {
    const { buildUsdcTicketPaymentTransaction } = await import('@/lib/rhea/client');

    const transaction = buildUsdcTicketPaymentTransaction({
      buyerId: 'alice.near',
      encryptedCid: 'cid-1',
      amount: '1000000',
      paymentId: 'rhea:alice.near:cid-1:1',
    });

    const action = transaction.actions[0];
    const msg = JSON.parse(action.args.msg);

    expect(transaction.receiverId).toContain('17208628');
    expect(action.methodName).toBe('ft_transfer_call');
    expect(action.args.amount).toBe('1000000');
    expect(msg).toMatchObject({
      action: 'buy_ticket',
      buyer_id: 'alice.near',
      encrypted_cid: 'cid-1',
      payment_id: 'rhea:alice.near:cid-1:1',
    });
  });
});
