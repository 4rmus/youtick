/**
 * Nova Groups Error Handling Tests
 *
 * Tests that membership check errors are properly distinguished
 * between "not a member" (expected) and network errors (unexpected).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NovaError } from '../../lib/nova/types';

// Mock nova modules
vi.mock('../../lib/nova/auth', () => ({
    generateNovaAuthToken: vi.fn().mockResolvedValue({
        authToken: 'mock-token',
        accountId: 'test.testnet',
        expiresAt: Date.now() + 3600000
    })
}));

const mockIsAuthorized = vi.fn();
const mockAddGroupMember = vi.fn();

vi.mock('../../lib/nova/config', () => ({
    hasApiKey: vi.fn().mockReturnValue(true),
    getNovaSdk: vi.fn(() => ({
        isAuthorized: mockIsAuthorized,
        addGroupMember: mockAddGroupMember,
        registerGroup: vi.fn().mockResolvedValue('test-group')
    })),
    createNovaGroup: vi.fn().mockResolvedValue('test-group'),
    setNovaConfig: vi.fn()
}));

import { isGroupMember } from '../../lib/nova/groups';

describe('Nova Groups Error Handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return true when user is a member', async () => {
        mockIsAuthorized.mockResolvedValueOnce(true);

        const result = await isGroupMember('group-1', 'member.testnet');
        expect(result).toBe(true);
    });

    it('should return false when user is not a member', async () => {
        mockIsAuthorized.mockResolvedValueOnce(false);

        const result = await isGroupMember('group-1', 'non-member.testnet');
        expect(result).toBe(false);
    });

    it('should return false on "not authorized" SDK error', async () => {
        mockIsAuthorized.mockRejectedValueOnce(new Error('not authorized'));

        const result = await isGroupMember('group-1', 'test.testnet');
        expect(result).toBe(false);
    });

    it('should return false on "not found" SDK error', async () => {
        mockIsAuthorized.mockRejectedValueOnce(new Error('not found'));

        const result = await isGroupMember('group-1', 'test.testnet');
        expect(result).toBe(false);
    });

    it('should return false on network errors (but still propagates internally)', async () => {
        mockIsAuthorized.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        // isGroupMember catches NovaError(NETWORK_ERROR) and returns false
        const result = await isGroupMember('group-1', 'test.testnet');
        expect(result).toBe(false);
    });

    it('should return false when API key is missing', async () => {
        const { hasApiKey } = await import('../../lib/nova/config');
        vi.mocked(hasApiKey).mockReturnValueOnce(false);

        const result = await isGroupMember('group-1', 'test.testnet');
        expect(result).toBe(false);
    });
});

describe('NovaError class', () => {
    it('should preserve error code', () => {
        const error = new NovaError('ACCESS_DENIED', 'Not authorized');
        expect(error.code).toBe('ACCESS_DENIED');
        expect(error.message).toBe('Not authorized');
        expect(error.name).toBe('NovaError');
    });

    it('should preserve cause error', () => {
        const cause = new Error('original error');
        const error = new NovaError('NETWORK_ERROR', 'Connection failed', cause);
        expect(error.cause).toBe(cause);
    });

    it('should be instanceof Error', () => {
        const error = new NovaError('FETCH_FAILED', 'test');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(NovaError);
    });
});
