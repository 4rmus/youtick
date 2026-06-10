import { describe, expect, it } from 'vitest';
import { rawSha256CidFromRef, verifyRawCidContent } from '@/lib/ipfs/integrity';

// CIDv1 raw sha2-256 of the exact bytes "hello-segment".
const RAW_CID = 'bafkreiarrg3lo7wwgsxigewmyxxl2k2nuxwfkiljttyfw5rlnyt2dpoykm';
const RAW_CID_BYTES = new TextEncoder().encode('hello-segment');

describe('ipfs content-address integrity', () => {
    it('recognizes a bare raw-sha256 CID, with or without ipfs:// scheme', () => {
        expect(rawSha256CidFromRef(RAW_CID)).toBe(RAW_CID);
        expect(rawSha256CidFromRef(`ipfs://${RAW_CID}`)).toBe(RAW_CID);
    });

    it('does not treat directory sub-paths or CIDv0 as verifiable', () => {
        expect(rawSha256CidFromRef(`${RAW_CID}/segments/0001.bin`)).toBeNull();
        expect(rawSha256CidFromRef('QmInitSegment000000000000000000000000000000000')).toBeNull();
        expect(rawSha256CidFromRef('bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja')).toBeNull();
    });

    it('accepts bytes that match the content address', async () => {
        await expect(verifyRawCidContent(RAW_CID, RAW_CID_BYTES)).resolves.toBe(true);
        await expect(verifyRawCidContent(`ipfs://${RAW_CID}`, RAW_CID_BYTES.buffer)).resolves.toBe(true);
    });

    it('rejects tampered bytes for a raw CID', async () => {
        const tampered = new TextEncoder().encode('tampered-bytes');
        await expect(verifyRawCidContent(RAW_CID, tampered)).resolves.toBe(false);
    });

    it('passes through refs it cannot content-address (never blocks)', async () => {
        const anyBytes = new TextEncoder().encode('whatever');
        await expect(verifyRawCidContent('QmSeg0', anyBytes)).resolves.toBe(true);
        await expect(verifyRawCidContent(`${RAW_CID}/child.bin`, anyBytes)).resolves.toBe(true);
    });
});
