import { describe, expect, it } from 'vitest';
import { EVM_CHAIN_TO_1CLICK, EVM_TOKEN_ADDRESSES, ONE_CLICK_TO_EVM_CHAIN } from '@/lib/evm/constants';

describe('EVM checkout config', () => {
  it('limits v1 EVM checkout to Arbitrum and Base', () => {
    expect(ONE_CLICK_TO_EVM_CHAIN).toEqual({
      arb: 42161,
      base: 8453,
    });
    expect(EVM_CHAIN_TO_1CLICK).toEqual({
      42161: 'arb',
      8453: 'base',
    });
  });

  it('does not expose Ethereum mainnet token addresses', () => {
    expect(EVM_TOKEN_ADDRESSES.USDC[1]).toBeUndefined();
    expect(EVM_TOKEN_ADDRESSES.USDT[1]).toBeUndefined();
  });
});
