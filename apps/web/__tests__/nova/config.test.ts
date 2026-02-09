/**
 * NOVA Configuration Tests
 *
 * Tests configuration management, validation, and environment variable handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getNovaConfig,
  setNovaConfig,
  resetNovaConfig,
  validateNovaConfig,
  isNovaConfigured,
  getShadeAgentUrl,
  getGatewayUrl,
  getApiKey,
  hasApiKey,
  NOVA_ENDPOINTS,
  NOVA_CONSTANTS
} from '../../lib/nova/config';
import { NovaError } from '../../lib/nova/types';

describe('NOVA Configuration', () => {
  beforeEach(() => {
    resetNovaConfig();
  });

  afterEach(() => {
    resetNovaConfig();
  });

  describe('Default Configuration', () => {
    it('should load default configuration with required fields', () => {
      const config = getNovaConfig();

      expect(config.network).toBeDefined();
      expect(config.shadeAgentUrl).toBeDefined();
      expect(config.gatewayUrl).toBeDefined();
    });

    it('should have valid network value', () => {
      const config = getNovaConfig();
      expect(['testnet', 'mainnet']).toContain(config.network);
    });
  });

  describe('Configuration Update', () => {
    it('should update network configuration', () => {
      setNovaConfig({ network: 'mainnet' });
      const config = getNovaConfig();
      expect(config.network).toBe('mainnet');
    });

    it('should update API key configuration', () => {
      setNovaConfig({ apiKey: 'test-key-123' });
      const config = getNovaConfig();
      expect(config.apiKey).toBe('test-key-123');
    });

    it('should preserve other config values when updating', () => {
      const originalConfig = getNovaConfig();
      setNovaConfig({ apiKey: 'new-key' });
      const updatedConfig = getNovaConfig();

      expect(updatedConfig.network).toBe(originalConfig.network);
      expect(updatedConfig.shadeAgentUrl).toBe(originalConfig.shadeAgentUrl);
      expect(updatedConfig.apiKey).toBe('new-key');
    });
  });

  describe('Configuration Reset', () => {
    it('should reset configuration to defaults', () => {
      setNovaConfig({ apiKey: 'temporary-key', network: 'mainnet' });
      resetNovaConfig();
      const config = getNovaConfig();

      expect(config.apiKey).not.toBe('temporary-key');
    });
  });

  describe('Configuration Validation', () => {
    it('should pass validation with default config', () => {
      expect(() => validateNovaConfig()).not.toThrow();
    });

    it('should throw NovaError for invalid network', () => {
      setNovaConfig({ network: 'invalid-network' as 'testnet' | 'mainnet' });

      expect(() => validateNovaConfig()).toThrow(NovaError);
    });

    it('should have correct error code for invalid config', () => {
      setNovaConfig({ network: 'invalid-network' as 'testnet' | 'mainnet' });

      try {
        validateNovaConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NovaError);
        expect((error as NovaError).code).toBe('INVALID_CONFIG');
      }
    });
  });

  describe('isNovaConfigured', () => {
    it('should return boolean', () => {
      const result = isNovaConfigured();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('URL Retrieval', () => {
    it('should return valid Shade Agent URL', () => {
      const url = getShadeAgentUrl();

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url.startsWith('http')).toBe(true);
    });

    it('should return valid Gateway URL', () => {
      const url = getGatewayUrl();

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url.startsWith('http')).toBe(true);
    });
  });

  describe('API Key Management', () => {
    it('should return boolean for hasApiKey', () => {
      const result = hasApiKey();
      expect(typeof result).toBe('boolean');
    });

    it('should throw NovaError when getting API key without one set', () => {
      if (!hasApiKey()) {
        expect(() => getApiKey()).toThrow(NovaError);
      }
    });

    it('should return API key when set', () => {
      setNovaConfig({ apiKey: 'my-api-key' });
      expect(getApiKey()).toBe('my-api-key');
      expect(hasApiKey()).toBe(true);
    });
  });

  describe('Network Endpoints', () => {
    it('should have endpoints for both networks', () => {
      expect(NOVA_ENDPOINTS.testnet).toBeDefined();
      expect(NOVA_ENDPOINTS.mainnet).toBeDefined();
    });

    it('should have shade agent endpoint for testnet', () => {
      expect(NOVA_ENDPOINTS.testnet.shadeAgent).toBeDefined();
    });

    it('should have gateway endpoint for mainnet', () => {
      expect(NOVA_ENDPOINTS.mainnet.gateway).toBeDefined();
    });
  });

  describe('Constants Validation', () => {
    it('should have positive auth token cache duration', () => {
      expect(NOVA_CONSTANTS.AUTH_TOKEN_CACHE_DURATION).toBeGreaterThan(0);
    });

    it('should have positive max file size', () => {
      expect(NOVA_CONSTANTS.MAX_FILE_SIZE).toBeGreaterThan(0);
    });

    it('should have positive upload timeout', () => {
      expect(NOVA_CONSTANTS.UPLOAD_TIMEOUT).toBeGreaterThan(0);
    });

    it('should have positive fetch timeout', () => {
      expect(NOVA_CONSTANTS.FETCH_TIMEOUT).toBeGreaterThan(0);
    });
  });
});
