import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import l3Vectors from '../../../protocol/l3-verification-v1/golden-vectors.json';
import schema from '../../../protocol/storage-manifest-v1/schema.json';
import vectors from '../../../protocol/storage-manifest-v1/golden-vectors.json';
import {
  canonicalizeStorageManifestV1,
  canonicalizeStorageObjectAadV1,
  computeStorageManifestCommitmentsV1,
  normalizeL3ProviderCid,
  parseCanonicalStorageManifestV1,
  parseStorageManifestV1,
} from '../../shared/src/storage-manifest-v1';

const validateSchema = new Ajv2020({ allowUnionTypes: true, strict: true }).compile(schema);

describe('StorageManifestV1 golden vectors', () => {
  it('matches the canonical bytes, AAD and commitments', async () => {
    const canonical = canonicalizeStorageManifestV1(vectors.manifest);
    const objectAad = vectors.manifest.objects.map((_, ordinal) => (
      new TextDecoder().decode(canonicalizeStorageObjectAadV1(vectors.manifest, ordinal))
    ));
    const commitments = await computeStorageManifestCommitmentsV1(vectors.manifest);

    expect(new TextDecoder().decode(canonical)).toBe(vectors.canonical_json);
    expect(parseCanonicalStorageManifestV1(canonical)).toEqual(parseStorageManifestV1(vectors.manifest));
    expect(objectAad).toEqual(vectors.object_aad_json);
    expect(commitments).toEqual({
      inventory_root: vectors.inventory_root,
      manifest_root: vectors.manifest_root,
    });
  });

  for (const vector of vectors.invalid_manifests) {
    it(`rejects ${vector.name}`, () => {
      expect(() => parseStorageManifestV1(vector.manifest)).toThrow();
    });
  }

  it('keeps the machine-readable schema aligned with protocol constants', () => {
    expect(validateSchema(vectors.manifest), JSON.stringify(validateSchema.errors)).toBe(true);
    for (const vector of vectors.invalid_manifests.slice(1)) {
      expect(validateSchema(vector.manifest), vector.name).toBe(false);
    }
    expect(schema).toMatchObject({
      properties: {
        network_id: { enum: ['mainnet', 'testnet'] },
        objects: { maxItems: 10_000 },
        schema: { const: 'youtick.storage-manifest.v1' },
      },
      $defs: {
        object: {
          properties: {
            byte_length: { maximum: 67_108_864 },
            cid: { pattern: '^b[a-z2-7]{58}$' },
          },
        },
      },
    });
  });

  it('rejects non-canonical wire JSON', () => {
    const encoder = new TextEncoder();
    const canonical = vectors.canonical_json;
    const nonCanonical = [
      JSON.stringify(vectors.manifest, null, 2),
      canonical.replace('{', '{"content_id":"duplicate",'),
      canonical.replace('"encryption_generation":1', '"encryption_generation":1.0'),
      canonical.replace('"sequence":0', '"sequence":-0'),
      `\ufeff${canonical}`,
    ];
    for (const value of nonCanonical) {
      expect(() => parseCanonicalStorageManifestV1(encoder.encode(value))).toThrow();
    }
  });

  it('rejects unsafe integers and unknown fields', () => {
    const unsafe = structuredClone(vectors.manifest) as unknown as Record<string, unknown>;
    unsafe.encryption_generation = Number.MAX_SAFE_INTEGER + 1;
    expect(() => parseStorageManifestV1(unsafe)).toThrow();

    const unknown = {
      ...vectors.manifest,
      provider: 'lighthouse',
    };
    expect(() => parseStorageManifestV1(unknown)).toThrow();
  });

  it('rejects malformed CIDs and overlapping track timelines', () => {
    const malformedCid = structuredClone(vectors.manifest);
    malformedCid.objects[0].cid = `b${'a'.repeat(58)}`;
    expect(() => parseStorageManifestV1(malformedCid)).toThrow();

    const overlap = structuredClone(vectors.manifest) as unknown as {
      objects: Array<Record<string, unknown>>;
    };
    const segment = overlap.objects[1];
    overlap.objects.push({
      ...segment,
      encryption: {
        ...(segment.encryption as Record<string, unknown>),
        nonce_b64: 'BAQEBAQEBAQEBAQE',
      },
      ordinal: 3,
      path: 'video/720p/000001.m4s',
      sequence: 1,
      start_ms: 0,
    });
    expect(() => parseStorageManifestV1(overlap)).toThrow();
  });

  it('normalizes the Lighthouse provider CID but keeps the manifest CIDv1-only', () => {
    expect(normalizeL3ProviderCid(l3Vectors.cidNormalization.providerCid)).toEqual(
      l3Vectors.cidNormalization,
    );

    const providerCidManifest = structuredClone(vectors.manifest);
    providerCidManifest.objects[0].cid = l3Vectors.cidNormalization.providerCid;
    expect(() => parseStorageManifestV1(providerCidManifest)).toThrow();

    const manifestCidManifest = structuredClone(vectors.manifest);
    manifestCidManifest.objects[0].cid = l3Vectors.cidNormalization.manifestCid;
    expect(() => parseStorageManifestV1(manifestCidManifest)).not.toThrow();
  });

  it('canonicalizes a shuffled input object to the frozen bytes', () => {
    const manifest = vectors.manifest;
    const shuffled = {
      version_id: manifest.version_id,
      objects: manifest.objects,
      nft_contract_id: manifest.nft_contract_id,
      network_id: manifest.network_id,
      media: manifest.media,
      encryption_generation: manifest.encryption_generation,
      content_id: manifest.content_id,
      schema: manifest.schema,
    };
    expect(new TextDecoder().decode(canonicalizeStorageManifestV1(shuffled))).toBe(vectors.canonical_json);
  });
});
