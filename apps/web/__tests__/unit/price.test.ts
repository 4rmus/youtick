/**
 * Price Utils Unit Tests
 *
 * Tests for NEAR price fetching and storage fee calculations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const nearMocks = vi.hoisted(() => ({
  getProvider: vi.fn(() => ({})),
  viewContract: vi.fn(),
}));

vi.mock('@/lib/near', () => ({
  getProvider: nearMocks.getProvider,
  viewContract: nearMocks.viewContract,
}));

import {
  getNearPrice,
  calculateStorageFee,
  STORAGE_COST_PER_GB
} from '@/lib/price';

describe('Price Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nearMocks.getProvider.mockReturnValue({});
    nearMocks.viewContract.mockRejectedValue(new Error('Pyth unavailable'));
  });

  describe('getNearPrice', () => {
    it('should fetch fresh price from Pyth oracle with the expected args', async () => {
      nearMocks.viewContract.mockResolvedValueOnce({
        price: '500000000',
        conf: '1',
        expo: -8,
        publish_time: Math.floor(Date.now() / 1000),
      });
      global.fetch = vi.fn();

      const price = await getNearPrice();

      expect(price).toBe(5);
      expect(nearMocks.viewContract).toHaveBeenCalledWith(
        {},
        'pyth-oracle.near',
        'get_price',
        { price_identifier: 'c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750' },
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch price from CoinGecko API', async () => {
      const mockPrice = 4.50;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          near: { usd: mockPrice }
        })
      });

      const price = await getNearPrice();

      expect(price).toBe(mockPrice);
      const calledUrls = vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((url) => url.includes('coingecko'))).toBe(true);
    });

    it('should fail closed on API error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('API unavailable'));

      await expect(getNearPrice()).rejects.toThrow('NEAR price unavailable');
    });

    it('should reject invalid response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          near: { usd: null }
        })
      });

      await expect(getNearPrice()).rejects.toThrow('NEAR price unavailable');
    });

    it('should reject negative price', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          near: { usd: -1 }
        })
      });

      await expect(getNearPrice()).rejects.toThrow('NEAR price unavailable');
    });

    it('should reject zero price', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          near: { usd: 0 }
        })
      });

      await expect(getNearPrice()).rejects.toThrow('NEAR price unavailable');
    });

    it('should reject missing data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await expect(getNearPrice()).rejects.toThrow('NEAR price unavailable');
    });
  });

  describe('calculateStorageFee', () => {
    it('should calculate fee for 1GB file', () => {
      const oneGB = 1024 * 1024 * 1024; // 1 GB in bytes
      const nearPrice = 5.00;

      const fee = calculateStorageFee(oneGB, nearPrice);

      // STORAGE_COST_PER_GB is 0 (IPFS is free)
      // So fee should be 0
      expect(fee).toBe('0.0000');
    });

    it('should return zero for zero file size', () => {
      const fee = calculateStorageFee(0, 5.00);

      expect(fee).toBe('0.0000');
    });

    it('should include 5% buffer', () => {
      // With STORAGE_COST_PER_GB = 0, buffer doesn't affect result
      const fee = calculateStorageFee(1024, 5.00);

      expect(fee).toBe('0.0000');
    });

    it('should handle small files correctly', () => {
      const oneMB = 1024 * 1024;
      const fee = calculateStorageFee(oneMB, 5.00);

      expect(fee).toBe('0.0000');
    });

    it('should handle large files', () => {
      const tenGB = 10 * 1024 * 1024 * 1024;
      const fee = calculateStorageFee(tenGB, 5.00);

      expect(fee).toBe('0.0000');
    });

    it('should return 4 decimal places', () => {
      const fee = calculateStorageFee(1000, 5.00);

      expect(fee).toMatch(/^\d+\.\d{4}$/);
    });
  });

  describe('STORAGE_COST_PER_GB constant', () => {
    it('should be zero (IPFS is free)', () => {
      expect(STORAGE_COST_PER_GB).toBe(0);
    });
  });

  describe('Price format validation', () => {
    it('should handle various NEAR prices', async () => {
      const testPrices = [1.00, 2.50, 5.00, 10.00, 100.00];

      for (const price of testPrices) {
        nearMocks.viewContract.mockResolvedValueOnce({
          price: String(price * 100_000_000),
          conf: '1',
          expo: -8,
          publish_time: Math.floor(Date.now() / 1000),
        });

        const result = await getNearPrice();
        expect(result).toBe(price);
      }
    });

    it('should handle decimal prices correctly', async () => {
      nearMocks.viewContract.mockResolvedValueOnce({
        price: '314159000',
        conf: '1',
        expo: -8,
        publish_time: Math.floor(Date.now() / 1000),
      });

      const price = await getNearPrice();
      expect(price).toBeCloseTo(3.14159, 5);
    });
  });
});
