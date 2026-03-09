/**
 * Metadata Parser Unit Tests
 *
 * Tests for title metadata encoding/decoding across schema versions.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock constants before importing
vi.mock('@/lib/constants', () => ({
  IPFS_CONFIG: {
    gatewayUrl: 'https://crustipfs.xyz/ipfs',
    placeholderImage: '/placeholder.svg'
  },
  METADATA_SCHEMA: {
    delimiter: ':::'
  }
}));

import {
  parseTitleMetadata,
  encodeTitleMetadata,
  extractRealCid,
  isValidCid,
  buildThumbnailUrl
} from '@/lib/metadata-parser';

describe('Metadata Parser', () => {
  describe('parseTitleMetadata', () => {
    describe('Schema v1 (legacy)', () => {
      it('should parse RealCID:::Title format', () => {
        const result = parseTitleMetadata('QmRealCid123:::My Video Title');

        expect(result.title).toBe('My Video Title');
        expect(result.realCid).toBe('QmRealCid123');
        expect(result.thumbnailCid).toBeNull();
        expect(result.schemaVersion).toBe(1);
      });

      it('should handle plain title without encoding', () => {
        const result = parseTitleMetadata('Just a Plain Title');

        expect(result.title).toBe('Just a Plain Title');
        expect(result.realCid).toBeNull();
        expect(result.thumbnailCid).toBeNull();
        expect(result.schemaVersion).toBe(1);
      });
    });

    describe('Schema v2 (IPFS CID)', () => {
      it('should parse RealCID:::ThumbnailCID:::Title format', () => {
        // Valid CIDv0: 46 chars starting with Qm
        const validCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
        const result = parseTitleMetadata(`QmRealCid:::${validCid}:::My Video`);

        expect(result.title).toBe('My Video');
        expect(result.realCid).toBe('QmRealCid');
        expect(result.thumbnailCid).toBe(validCid);
        expect(result.schemaVersion).toBe(2);
      });

      it('should construct gateway URL for IPFS CID thumbnail', () => {
        const validCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
        const result = parseTitleMetadata(`QmReal:::${validCid}:::Title`);

        expect(result.thumbnailUrl).toContain('crustipfs.xyz');
        expect(result.thumbnailUrl).toContain(validCid);
      });
    });

    describe('Schema v3 (ipfs:// URL)', () => {
      it('should parse ipfs:// thumbnail format', () => {
        const result = parseTitleMetadata('QmRealCid:::ipfs://QmThumbnailCid1234567890123456789012345678901234:::My Video');

        expect(result.title).toBe('My Video');
        expect(result.realCid).toBe('QmRealCid');
        expect(result.thumbnailCid).toBe('ipfs://QmThumbnailCid1234567890123456789012345678901234');
        expect(result.thumbnailUrl).toBe('ipfs://QmThumbnailCid1234567890123456789012345678901234');
        expect(result.schemaVersion).toBe(3);
      });

      it('should preserve ipfs:// URL as-is', () => {
        const ipfsUrl = 'ipfs://QmThumbCid123456789012345678901234567890123456';
        const result = parseTitleMetadata(`QmReal:::${ipfsUrl}:::Title`);

        expect(result.thumbnailUrl).toBe(ipfsUrl);
      });
    });

    describe('Schema v4 (delivery manifest)', () => {
      it('should parse four-part titles with a manifest CID', () => {
        const manifestCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
        const result = parseTitleMetadata(`QmRealCid:::ipfs://QmThumbCid1234567890123456789012345678901234:::${manifestCid}:::My Video`);

        expect(result.title).toBe('My Video');
        expect(result.realCid).toBe('QmRealCid');
        expect(result.manifestCid).toBe(manifestCid);
        expect(result.thumbnailCid).toBe('ipfs://QmThumbCid1234567890123456789012345678901234');
        expect(result.schemaVersion).toBe(4);
      });
    });

    describe('Edge cases', () => {
      it('should handle null input', () => {
        const result = parseTitleMetadata(null);

        expect(result.title).toBe('Untitled');
        expect(result.realCid).toBeNull();
        expect(result.thumbnailCid).toBeNull();
      });

      it('should handle undefined input', () => {
        const result = parseTitleMetadata(undefined);

        expect(result.title).toBe('Untitled');
      });

      it('should handle empty string', () => {
        const result = parseTitleMetadata('');

        expect(result.title).toBe('Untitled');
      });

      it('should use custom fallback title', () => {
        const result = parseTitleMetadata('', 'Custom Fallback');

        expect(result.title).toBe('Custom Fallback');
      });

      it('should handle title with ::: in it', () => {
        const result = parseTitleMetadata('QmReal:::QmThumb12345678901234567890123456789012:::Title:::With:::Colons');

        expect(result.title).toBe('Title:::With:::Colons');
        expect(result.realCid).toBe('QmReal');
      });

      it('should return placeholder for invalid thumbnail CID', () => {
        const result = parseTitleMetadata('QmReal:::invalid:::Title');

        expect(result.thumbnailCid).toBeNull();
        expect(result.thumbnailUrl).toBe('/placeholder.svg');
      });

      it('should preserve rawTitle', () => {
        const raw = 'QmReal:::QmThumb12345678901234567890123456789012:::Title';
        const result = parseTitleMetadata(raw);

        expect(result.rawTitle).toBe(raw);
      });
    });

    describe('Direct URL thumbnails', () => {
      it('should handle https:// URLs', () => {
        const result = parseTitleMetadata('QmReal:::https://example.com/thumb.jpg:::Title');

        expect(result.thumbnailUrl).toBe('https://example.com/thumb.jpg');
        expect(result.thumbnailCid).toBe('https://example.com/thumb.jpg');
      });

      it('should handle http:// URLs', () => {
        const result = parseTitleMetadata('QmReal:::http://example.com/image.png:::Title');

        expect(result.thumbnailUrl).toBe('http://example.com/image.png');
      });
    });
  });

  describe('encodeTitleMetadata', () => {
    it('should encode with thumbnail', () => {
      const result = encodeTitleMetadata('QmReal', 'My Video', 'QmThumb');

      expect(result).toBe('QmReal:::QmThumb:::My Video');
    });

    it('should encode without thumbnail', () => {
      const result = encodeTitleMetadata('QmReal', 'My Video');

      expect(result).toBe('QmReal:::My Video');
    });

    it('should encode with ipfs:// URL thumbnail', () => {
      const result = encodeTitleMetadata('QmReal', 'Title', 'ipfs://QmThumbCid123456789012345678901234567890123456');

      expect(result).toBe('QmReal:::ipfs://QmThumbCid123456789012345678901234567890123456:::Title');
    });

    it('should handle empty title', () => {
      const result = encodeTitleMetadata('QmReal', '');

      expect(result).toBe('QmReal:::');
    });
  });

  describe('extractRealCid', () => {
    it('should extract CID from encoded title', () => {
      const result = extractRealCid('QmRealCid123:::QmThumb:::Title');

      expect(result).toBe('QmRealCid123');
    });

    it('should return plain CID unchanged', () => {
      const cid = 'QmPlainCid12345678901234567890123456789012345';
      const result = extractRealCid(cid);

      expect(result).toBe(cid);
    });

    it('should extract from v1 format', () => {
      const result = extractRealCid('QmReal:::Title Only');

      expect(result).toBe('QmReal');
    });
  });

  describe('isValidCid', () => {
    it('should accept valid CIDv0 (Qm...)', () => {
      const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      expect(isValidCid(cid)).toBe(true);
    });

    it('should accept valid CIDv1 (ba...)', () => {
      const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
      expect(isValidCid(cid)).toBe(true);
    });

    it('should reject short strings', () => {
      expect(isValidCid('Qm123')).toBe(false);
    });

    it('should reject invalid prefixes', () => {
      expect(isValidCid('ab12345678901234567890123456789012345678901234')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidCid('')).toBe(false);
    });
  });

  describe('buildThumbnailUrl', () => {
    it('should build gateway URL for IPFS CID', () => {
      const validCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const result = buildThumbnailUrl(validCid);

      expect(result).toContain('crustipfs.xyz');
    });

    it('should return ipfs:// URL as-is', () => {
      const ipfsUrl = 'ipfs://QmThumbCid123456789012345678901234567890123456';
      const result = buildThumbnailUrl(ipfsUrl);

      expect(result).toBe(ipfsUrl);
    });

    it('should return direct URL as-is', () => {
      const url = 'https://example.com/image.jpg';
      const result = buildThumbnailUrl(url);

      expect(result).toBe(url);
    });

    it('should return placeholder for null', () => {
      const result = buildThumbnailUrl(null);

      expect(result).toBe('/placeholder.svg');
    });

    it('should return placeholder for invalid CID', () => {
      const result = buildThumbnailUrl('invalid');

      expect(result).toBe('/placeholder.svg');
    });
  });
});
