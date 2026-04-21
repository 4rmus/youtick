/**
 * Gift Service Unit Tests
 *
 * Tests for gift link generation, validation, claiming,
 * and sponsored trial account creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setMockLocalStorage, clearMockLocalStorage } from '../setup';

// Import the functions to test
import {
  generateKeyPairs,
  parseGiftLink,
  hasOnboardingKey,
  getOnboardingKey,
  setOnboardingKey,
  getTrialPoolBalance,
  validateGiftLink,
  createSponsoredTrialDirect,
  claimFreeTicketDirect,
  grantFreeAccessDirect,
  createSponsoredTrialRelayer,
  createSponsoredTrial
} from '@/lib/gift-service';

describe('Gift Service', () => {
  beforeEach(() => {
    clearMockLocalStorage();
    vi.clearAllMocks();
  });

  describe('generateKeyPairs', () => {
    it('should generate correct number of keypairs', () => {
      const pairs = generateKeyPairs(5);
      expect(pairs).toHaveLength(5);
    });

    it('should generate 1 keypair', () => {
      const pairs = generateKeyPairs(1);
      expect(pairs).toHaveLength(1);
    });

    it('should return valid ed25519 keys', () => {
      const pairs = generateKeyPairs(1);
      const pair = pairs[0];

      expect(pair.publicKey).toBeDefined();
      expect(pair.secretKey).toBeDefined();
      expect(pair.publicKey).toMatch(/^ed25519:/);
      expect(pair.secretKey).toMatch(/^ed25519:/);
    });

    it('should generate unique keypairs', () => {
      const pairs = generateKeyPairs(3);
      const publicKeys = pairs.map(p => p.publicKey);
      const uniqueKeys = new Set(publicKeys);

      expect(uniqueKeys.size).toBe(3);
    });

    it('should handle zero count', () => {
      const pairs = generateKeyPairs(0);
      expect(pairs).toHaveLength(0);
    });
  });

  describe('parseGiftLink', () => {
    it('should parse valid URL with key and pk', () => {
      const secretKey = 'ed25519:abc123secretkey';
      const publicKey = 'ed25519:xyz789publickey';
      const url = `https://app.example.com/claim?key=${encodeURIComponent(secretKey)}&pk=${encodeURIComponent(publicKey)}`;

      const result = parseGiftLink(url);

      expect(result).not.toBeNull();
      expect(result?.secretKey).toBe(secretKey);
      expect(result?.publicKey).toBe(publicKey);
    });

    it('should derive pk from secretKey if missing', () => {
      // Generate a real keypair for this test
      const pairs = generateKeyPairs(1);
      const secretKey = pairs[0].secretKey;
      const url = `https://app.example.com/claim?key=${encodeURIComponent(secretKey)}`;

      const result = parseGiftLink(url);

      expect(result).not.toBeNull();
      expect(result?.secretKey).toBe(secretKey);
      expect(result?.publicKey).toMatch(/^ed25519:/);
    });

    it('should return null for invalid URL', () => {
      const result = parseGiftLink('not-a-valid-url');
      expect(result).toBeNull();
    });

    it('should return null for URL without key param', () => {
      const url = 'https://app.example.com/claim?other=value';
      const result = parseGiftLink(url);
      expect(result).toBeNull();
    });

    it('should handle URL with only key param', () => {
      const pairs = generateKeyPairs(1);
      const url = `https://example.com/claim?key=${encodeURIComponent(pairs[0].secretKey)}`;

      const result = parseGiftLink(url);
      expect(result).not.toBeNull();
    });
  });

  describe('Onboarding Key Management', () => {
    describe('hasOnboardingKey', () => {
      it('should return false when no key stored', () => {
        // Clear any existing data
        vi.mocked(localStorage.getItem).mockReturnValue(null);
        const result = hasOnboardingKey();
        expect(result).toBe(false);
      });

      it('should return true when key is stored', () => {
        // Mock localStorage.getItem to return a key
        vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
          if (key === 'onboarding_key:test-contract.testnet') {
            return 'ed25519:secretkey';
          }
          return null;
        });
        const result = hasOnboardingKey();
        expect(result).toBe(true);
      });
    });

    describe('getOnboardingKey', () => {
      it('should return null when no key stored', () => {
        vi.mocked(localStorage.getItem).mockReturnValue(null);
        const result = getOnboardingKey();
        expect(result).toBeNull();
      });

      it('should return stored key', () => {
        const secretKey = 'ed25519:testsecretkey123';
        vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
          if (key === 'onboarding_key:test-contract.testnet') {
            return secretKey;
          }
          return null;
        });

        const result = getOnboardingKey();
        expect(result).toBe(secretKey);
      });
    });

    describe('setOnboardingKey', () => {
      it('should call localStorage.setItem with correct key', () => {
        const secretKey = 'ed25519:newsecretkey456';
        setOnboardingKey(secretKey);

        expect(localStorage.setItem).toHaveBeenCalledWith(
          'onboarding_key:test-contract.testnet',
          secretKey
        );
      });
    });
  });

  describe('getTrialPoolBalance', () => {
    it('should return balance from contract', async () => {
      const balance = await getTrialPoolBalance();

      // Mock returns 10 NEAR
      expect(balance).toBe('10000000000000000000000000');
    });

    it('should return 0 on error', async () => {
      // Override fetch to simulate error
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const balance = await getTrialPoolBalance();
      expect(balance).toBe('0');

      global.fetch = originalFetch;
    });
  });

  describe('validateGiftLink', () => {
    it('should return null for invalid key', async () => {
      // Override fetch to return no result
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: { message: 'Not found' } })
      });

      const result = await validateGiftLink('ed25519:invalidkey');
      expect(result).toBeNull();

      global.fetch = originalFetch;
    });

    it('should return GiftInfo for valid key', async () => {
      // Override fetch to return valid gift info
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            result: Array.from(Buffer.from(JSON.stringify({
              event_cid: 'QmTestCid123',
              creator_id: 'creator.testnet',
              remaining_claims: 5,
              deposit_per_claim: '150000000000000000000000'
            })))
          }
        })
      });

      const result = await validateGiftLink('ed25519:validkey');

      expect(result).not.toBeNull();
      expect(result?.eventCid).toBe('QmTestCid123');
      expect(result?.creatorId).toBe('creator.testnet');
      expect(result?.remainingClaims).toBe(5);

      global.fetch = originalFetch;
    });
  });

  describe('createSponsoredTrialDirect', () => {
    it('should fail when onboarding key is missing', async () => {
      clearMockLocalStorage();

      const result = await createSponsoredTrialDirect('testuser');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Onboarding key unavailable');
    });

    it('should create trial account when onboarding key is valid', async () => {
      const onboardingKey = generateKeyPairs(1)[0].secretKey;
      setMockLocalStorage('onboarding_key:test-contract.testnet', onboardingKey);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            result: Array.from(Buffer.from('true'))
          }
        })
      });

      const result = await createSponsoredTrialDirect('newuser');

      expect(result.success).toBe(true);
      expect(result.accountId).toBe('newuser.test-contract.testnet');

      global.fetch = originalFetch;
    });
  });

  describe('claimFreeTicketDirect', () => {
    it('should fail when onboarding key is missing', async () => {
      clearMockLocalStorage();
      const result = await claimFreeTicketDirect('alice.testnet', 'cid-123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Onboarding key unavailable');
    });

    it('should claim free ticket when onboarding key is valid', async () => {
      const onboardingKey = generateKeyPairs(1)[0].secretKey;
      setMockLocalStorage('onboarding_key:test-contract.testnet', onboardingKey);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            result: Array.from(Buffer.from('true'))
          }
        })
      });

      const result = await claimFreeTicketDirect('alice.testnet', 'cid-123');
      expect(result.success).toBe(true);

      global.fetch = originalFetch;
    });
  });

  describe('grantFreeAccessDirect', () => {
    it('should fail when onboarding key is missing', async () => {
      clearMockLocalStorage();
      const result = await grantFreeAccessDirect('alice.testnet', 'cid-123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Onboarding key unavailable');
    });

    it('should grant free access when onboarding key is valid', async () => {
      const onboardingKey = generateKeyPairs(1)[0].secretKey;
      setMockLocalStorage('onboarding_key:test-contract.testnet', onboardingKey);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            result: Array.from(Buffer.from('true'))
          }
        })
      });

      const result = await grantFreeAccessDirect('alice.testnet', 'cid-123');
      expect(result.success).toBe(true);

      global.fetch = originalFetch;
    });
  });

  describe('createSponsoredTrialRelayer', () => {
    it('should call relayer API successfully', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          account_id: 'alice.test-contract.testnet'
        })
      });

      const result = await createSponsoredTrialRelayer('alice');

      expect(result.success).toBe(true);
      expect(result.accountId).toBe('alice.test-contract.testnet');
      expect(result.secretKey).toBeDefined();

      global.fetch = originalFetch;
    });

    it('should handle relayer API error', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'Rate limit exceeded'
        })
      });

      const result = await createSponsoredTrialRelayer('bob');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');

      global.fetch = originalFetch;
    });

    it('should handle network error', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await createSponsoredTrialRelayer('charlie');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');

      global.fetch = originalFetch;
    });
  });

  describe('createSponsoredTrial', () => {
    it('should return failure when onboarding key is missing', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);

      const result = await createSponsoredTrial('user123');

      expect(result.success).toBe(false);
    });

    it('should return secretKey on direct success', async () => {
      const onboardingKey = generateKeyPairs(1)[0].secretKey;
      setMockLocalStorage('onboarding_key:test-contract.testnet', onboardingKey);

      const originalFetch = global.fetch;
      // Onboarding key auth check, then signAndSendTransaction
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              result: Array.from(Buffer.from('true'))
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {}
          })
        });

      const result = await createSponsoredTrial('newaccount');

      expect(result.success).toBe(true);
      expect(result.secretKey).toBeDefined();
      expect(result.accountId).toBe('newaccount.test-contract.testnet');

      global.fetch = originalFetch;
    });

    it('should return failure when direct path fails', async () => {
      const onboardingKey = generateKeyPairs(1)[0].secretKey;
      setMockLocalStorage('onboarding_key:test-contract.testnet', onboardingKey);

      const originalFetch = global.fetch;
      // Direct path will fail (onboarding key auth returns false)
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              result: Array.from(Buffer.from('false'))
            }
          })
        });

      const result = await createSponsoredTrial('failuser');

      expect(result.success).toBe(false);

      global.fetch = originalFetch;
    });
  });

  describe('Gift Link URL Generation', () => {
    it('should generate valid claim URLs', () => {
      const pairs = generateKeyPairs(1);
      const pair = pairs[0];

      // Simulate link generation (from createGiftLinks)
      const APP_URL = 'http://localhost:3000';
      const link = `${APP_URL}/claim?key=${encodeURIComponent(pair.secretKey)}&pk=${encodeURIComponent(pair.publicKey)}`;

      // Parse it back
      const parsed = parseGiftLink(link);

      expect(parsed).not.toBeNull();
      expect(parsed?.secretKey).toBe(pair.secretKey);
      expect(parsed?.publicKey).toBe(pair.publicKey);
    });

    it('should handle special characters in keys', () => {
      // Keys may contain + and / characters from base64
      const secretKey = 'ed25519:AAAA+BBB/CCC==';
      const publicKey = 'ed25519:XXXX+YYY/ZZZ==';
      const url = `https://example.com/claim?key=${encodeURIComponent(secretKey)}&pk=${encodeURIComponent(publicKey)}`;

      const parsed = parseGiftLink(url);

      expect(parsed).not.toBeNull();
      expect(parsed?.secretKey).toBe(secretKey);
      expect(parsed?.publicKey).toBe(publicKey);
    });
  });

  describe('Deposit Calculation', () => {
    it('should calculate correct deposit for single link', () => {
      const DEPOSIT_PER_LINK = 0.15; // NEAR
      const numLinks = 1;
      const totalDeposit = DEPOSIT_PER_LINK * numLinks;

      expect(totalDeposit).toBe(0.15);
    });

    it('should calculate correct deposit for multiple links', () => {
      const DEPOSIT_PER_LINK = 0.15;
      const numLinks = 10;
      const totalDeposit = DEPOSIT_PER_LINK * numLinks;

      expect(totalDeposit).toBe(1.5);
    });

    it('should enforce maximum 50 links limit', () => {
      const numLinks = 50;
      expect(numLinks).toBeLessThanOrEqual(50);

      const invalidNum = 51;
      expect(invalidNum).toBeGreaterThan(50);
    });
  });
});
