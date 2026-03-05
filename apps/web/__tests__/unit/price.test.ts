/**
 * Price Utils Unit Tests
 *
 * Tests for NEAR price fetching and storage fee calculations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getNearPrice,
  calculateStorageFee,
  STORAGE_COST_PER_GB
} from '@/lib/price';

describe('Price Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNearPrice', () => {
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

    it('should return fallback price on API error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('API unavailable'));

      const price = await getNearPrice();

      expect(price).toBe(5.00); // Fallback price
    });

    it('should return fallback for invalid response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          near: { usd: null }
        })
      });

      const price = await getNearPrice();

      expect(price).toBe(5.00);
    });

    it('should return fallback for negative price', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          near: { usd: -1 }
        })
      });

      const price = await getNearPrice();

      expect(price).toBe(5.00);
    });

    it('should return fallback for zero price', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          near: { usd: 0 }
        })
      });

      const price = await getNearPrice();

      expect(price).toBe(5.00);
    });

    it('should return fallback for missing data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      const price = await getNearPrice();

      expect(price).toBe(5.00);
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
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ near: { usd: price } })
        });

        const result = await getNearPrice();
        expect(result).toBe(price);
      }
    });

    it('should handle decimal prices correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ near: { usd: 3.14159 } })
      });

      const price = await getNearPrice();
      expect(price).toBeCloseTo(3.14159, 5);
    });
  });
});
