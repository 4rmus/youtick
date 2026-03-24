import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/constants', () => ({
  APP_CONFIG: {
    publicAppUrl: 'https://app.youtick.io',
  },
  FEATURE_FLAGS: {
    enableCrossChainCheckout: false,
  },
  IPFS_CONFIG: {
    gatewayUrl: 'https://ipfs.io/ipfs',
    placeholderImage: '/placeholder.svg',
  },
  METADATA_SCHEMA: {
    delimiter: ':::',
  },
}));

import { parseTitleMetadata } from '@/lib/metadata-parser';

describe('Metadata Parser', () => {
  describe('parseTitleMetadata', () => {
    it('parses manifest-first titles with ipfs thumbnails', () => {
      const manifestCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const result = parseTitleMetadata(
        `${manifestCid}:::ipfs://QmThumbCid1234567890123456789012345678901234:::My Video`,
      );

      expect(result.title).toBe('My Video');
      expect(result.manifestCid).toBe(manifestCid);
      expect(result.thumbnailCid).toBe('ipfs://QmThumbCid1234567890123456789012345678901234');
      expect(result.thumbnailUrl).toBe('ipfs://QmThumbCid1234567890123456789012345678901234');
    });

    it('parses earlier four-part segmented titles without leaking manifest CID into the title', () => {
      const manifestCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const result = parseTitleMetadata(
        `QmLegacyOrDuplicateCid:::ipfs://QmThumbCid1234567890123456789012345678901234:::${manifestCid}:::My Video`,
      );

      expect(result.title).toBe('My Video');
      expect(result.manifestCid).toBe(manifestCid);
      expect(result.thumbnailCid).toBe('ipfs://QmThumbCid1234567890123456789012345678901234');
    });

    it('parses manifest-first titles with direct thumbnails', () => {
      const manifestCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const result = parseTitleMetadata(
        `${manifestCid}:::https://example.com/thumb.jpg:::Title`,
      );

      expect(result.title).toBe('Title');
      expect(result.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    });

    it('keeps bare thumbnail CIDs in protocol-native format', () => {
      const manifestCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const thumbnailCid = 'QmThumbCid123456789012345678901234567890123456';
      const result = parseTitleMetadata(
        `${manifestCid}:::${thumbnailCid}:::Title`,
      );

      expect(result.thumbnailCid).toBe(thumbnailCid);
      expect(result.thumbnailUrl).toBe(`ipfs://${thumbnailCid}`);
    });

    it('keeps titles with embedded delimiters', () => {
      const manifestCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const result = parseTitleMetadata(`${manifestCid}::::::Title:::With:::Colons`);

      expect(result.title).toBe('Title:::With:::Colons');
      expect(result.manifestCid).toBe(manifestCid);
      expect(result.thumbnailCid).toBeNull();
      expect(result.thumbnailUrl).toBe('/placeholder.svg');
    });

    it('falls back to placeholder for invalid thumbnail refs', () => {
      const manifestCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const result = parseTitleMetadata(`${manifestCid}:::invalid:::Title`);

      expect(result.thumbnailCid).toBeNull();
      expect(result.thumbnailUrl).toBe('/placeholder.svg');
    });

    it('treats plain titles as plain titles', () => {
      const result = parseTitleMetadata('Simple Title');

      expect(result.title).toBe('Simple Title');
      expect(result.manifestCid).toBeNull();
      expect(result.thumbnailCid).toBeNull();
    });

    it('uses the fallback title for empty input', () => {
      const result = parseTitleMetadata('', 'Custom Fallback');

      expect(result.title).toBe('Custom Fallback');
      expect(result.thumbnailUrl).toBe('/placeholder.svg');
    });
  });
});
