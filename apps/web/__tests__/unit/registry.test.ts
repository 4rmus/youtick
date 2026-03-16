import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewContractMock = vi.fn();

vi.mock('@/lib/near', () => ({
    getProvider: vi.fn(() => ({})),
    viewContract: viewContractMock,
}));

describe('registry client', () => {
    beforeEach(() => {
        vi.resetModules();
        viewContractMock.mockReset();
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = 'registry.testnet';
    });

    it('returns only active decryption operator endpoints', async () => {
        viewContractMock.mockResolvedValue([
            {
                account_id: 'operator-a.testnet',
                endpoint: 'https://kms-a.example.workers.dev',
                transport_public_key: 'key-a',
                kind: 'DecryptionOperator',
                active: true,
            },
            {
                account_id: 'operator-b.testnet',
                endpoint: 'https://kms-b.example.workers.dev',
                transport_public_key: 'key-b',
                kind: 'DecryptionOperator',
                active: false,
            },
            {
                account_id: 'operator-c.testnet',
                endpoint: 'https://kms-a.example.workers.dev',
                transport_public_key: 'key-c',
                kind: 'DecryptionOperator',
                active: true,
            },
        ]);

        const { listActiveDecryptionOperatorEndpoints } = await import('@/lib/registry');
        const endpoints = await listActiveDecryptionOperatorEndpoints();

        expect(endpoints).toEqual(['https://kms-a.example.workers.dev']);
    });
});
