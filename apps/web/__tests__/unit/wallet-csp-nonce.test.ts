import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hot-labs/near-connect', () => ({ NearConnector: class {} }));

import { readDocumentCspNonce } from '@/components/providers/WalletProvider';

function documentWithNonce(nonce?: string): void {
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { querySelector: vi.fn(() => nonce ? { nonce } : null) },
    });
}

describe('wallet CSP nonce', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'document');
    });

    it('reads the request nonce applied to the current document script', () => {
        documentWithNonce('YWJjZGVmZ2hpamtsbW5vcA==');

        expect(readDocumentCspNonce()).toBe('YWJjZGVmZ2hpamtsbW5vcA==');
    });

    it.each([undefined, 'unsafe;nonce', 'too-short'])('rejects an invalid nonce', (nonce) => {
        documentWithNonce(nonce);

        expect(readDocumentCspNonce()).toBeNull();
    });
});
