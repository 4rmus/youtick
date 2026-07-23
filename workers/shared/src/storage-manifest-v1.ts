export const STORAGE_MANIFEST_V1_SCHEMA = 'youtick.storage-manifest.v1' as const;
export const STORAGE_MANIFEST_V1_MAX_CANONICAL_BYTES = 16 * 1024 * 1024;
export const STORAGE_MANIFEST_V1_MAX_OBJECT_BYTES = 64 * 1024 * 1024;
export const STORAGE_MANIFEST_V1_MAX_OBJECTS = 10_000;

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NEAR_ACCOUNT_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const PATH_COMPONENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const CID_PATTERN = /^b[a-z2-7]{58}$/;
const CID_V0_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9+/]{16}$/;
const TOP_LEVEL_KEYS = [
  'content_id',
  'encryption_generation',
  'media',
  'network_id',
  'nft_contract_id',
  'objects',
  'schema',
  'version_id',
] as const;
const MEDIA_KEYS = ['content_type', 'duration_ms', 'packaging', 'tracks'] as const;
const TRACK_KEYS = ['bitrate', 'codec', 'kind', 'rendition', 'timescale', 'track_id'] as const;
const OBJECT_KEYS = [
  'byte_length',
  'cid',
  'ciphertext_sha256',
  'duration_ms',
  'encryption',
  'ordinal',
  'path',
  'plaintext_length',
  'role',
  'sequence',
  'start_ms',
  'track_id',
] as const;
const ENCRYPTION_KEYS = ['aad_version', 'algorithm', 'format', 'nonce_b64'] as const;
const ROLES = new Set(['init', 'segment']);
const TRACK_KINDS = new Set(['audio', 'video']);

export type StorageObjectRole = 'init' | 'segment';
export type StorageTrackKind = 'audio' | 'video';

export interface StorageManifestTrackV1 {
  bitrate: number;
  codec: string;
  kind: StorageTrackKind;
  rendition: string;
  timescale: number;
  track_id: number;
}

export interface StorageManifestMediaV1 {
  content_type: 'video/mp4';
  duration_ms: number;
  packaging: 'cmaf';
  tracks: StorageManifestTrackV1[];
}

export interface StorageManifestEncryptionV1 {
  aad_version: 'youtick.media-object-aad.v1';
  algorithm: 'AES-256-GCM';
  format: 'aes-gcm-tag-appended.v1';
  nonce_b64: string;
}

export interface StorageManifestObjectV1 {
  byte_length: number;
  cid: string;
  ciphertext_sha256: string;
  duration_ms: number | null;
  encryption: StorageManifestEncryptionV1;
  ordinal: number;
  path: string;
  plaintext_length: number;
  role: StorageObjectRole;
  sequence: number | null;
  start_ms: number | null;
  track_id: number | null;
}

export interface StorageManifestV1 {
  content_id: string;
  encryption_generation: number;
  media: StorageManifestMediaV1;
  network_id: 'mainnet' | 'testnet';
  nft_contract_id: string;
  objects: StorageManifestObjectV1[];
  schema: typeof STORAGE_MANIFEST_V1_SCHEMA;
  version_id: string;
}

export interface StorageManifestCommitmentsV1 {
  inventory_root: string;
  manifest_root: string;
}

export function parseStorageManifestV1(value: unknown): StorageManifestV1 {
  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS)) {
    throw new Error('invalid StorageManifestV1 object');
  }
  if (
    !isIdentifier(value.content_id)
    || !isPositiveInteger(value.encryption_generation, 0xffffffff)
    || (value.network_id !== 'mainnet' && value.network_id !== 'testnet')
    || !isNearAccountId(value.nft_contract_id)
    || !Array.isArray(value.objects)
    || value.objects.length === 0
    || value.objects.length > STORAGE_MANIFEST_V1_MAX_OBJECTS
    || value.schema !== STORAGE_MANIFEST_V1_SCHEMA
    || !isIdentifier(value.version_id)
  ) {
    throw new Error('invalid StorageManifestV1 fields');
  }

  const media = parseMedia(value.media);
  const tracks = new Map(media.tracks.map((track) => [track.track_id, track]));
  const paths = new Set<string>();
  const nonces = new Set<string>();
  const initScopes = new Set<number | null>();
  const timelines = new Map<number, { endMs: number; nextSequence: number }>();
  const objects = value.objects.map((entry, index) => parseObject(
    entry,
    index,
    media.duration_ms,
    tracks,
    paths,
    nonces,
    initScopes,
    timelines,
  ));
  const hasGlobalInit = initScopes.has(null);
  if (
    (hasGlobalInit && initScopes.size !== 1)
    || (!hasGlobalInit && initScopes.size !== tracks.size)
    || timelines.size !== tracks.size
  ) {
    throw new Error('manifest must cover every track with init and segment objects');
  }

  return {
    content_id: value.content_id,
    encryption_generation: value.encryption_generation,
    media,
    network_id: value.network_id,
    nft_contract_id: value.nft_contract_id,
    objects,
    schema: value.schema,
    version_id: value.version_id,
  };
}

export function canonicalizeStorageManifestV1(value: unknown): Uint8Array {
  return encodeCanonical(canonicalManifest(parseStorageManifestV1(value)));
}

export function parseCanonicalStorageManifestV1(value: Uint8Array): StorageManifestV1 {
  if (value.length > STORAGE_MANIFEST_V1_MAX_CANONICAL_BYTES) {
    throw new Error('StorageManifestV1 exceeds the canonical byte limit');
  }
  const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(value);
  const manifest = parseStorageManifestV1(JSON.parse(decoded) as unknown);
  const canonical = encodeCanonical(canonicalManifest(manifest));
  if (canonical.length !== value.length || canonical.some((byte, index) => byte !== value[index])) {
    throw new Error('StorageManifestV1 bytes are not canonical');
  }
  return manifest;
}

export function canonicalizeStorageObjectAadV1(value: unknown, ordinal: number): Uint8Array {
  const manifest = parseStorageManifestV1(value);
  const object = manifest.objects[ordinal];
  if (!object) {
    throw new Error(`unknown object ordinal ${ordinal}`);
  }
  const rendition = object.track_id === null
    ? null
    : manifest.media.tracks.find((track) => track.track_id === object.track_id)?.rendition;
  if (rendition === undefined) {
    throw new Error(`unknown object track at ordinal ${ordinal}`);
  }
  return encodeCanonical({
    aad_version: object.encryption.aad_version,
    content_id: manifest.content_id,
    duration_ms: object.duration_ms,
    encryption_generation: manifest.encryption_generation,
    network_id: manifest.network_id,
    nft_contract_id: manifest.nft_contract_id,
    ordinal: object.ordinal,
    path: object.path,
    plaintext_length: object.plaintext_length,
    rendition,
    role: object.role,
    sequence: object.sequence,
    start_ms: object.start_ms,
    track_id: object.track_id,
    version_id: manifest.version_id,
  });
}

export async function computeStorageManifestCommitmentsV1(
  value: unknown,
): Promise<StorageManifestCommitmentsV1> {
  const manifest = parseStorageManifestV1(value);
  const leaves = manifest.objects.map((object) => encodeCanonical(canonicalObject(object)));
  const [manifestHash, inventoryHash] = await Promise.all([
    sha256(encodeCanonical(canonicalManifest(manifest))),
    merkleTreeHash(leaves),
  ]);
  return {
    inventory_root: toHex(inventoryHash),
    manifest_root: toHex(manifestHash),
  };
}

function parseMedia(value: unknown): StorageManifestMediaV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, MEDIA_KEYS)
    || value.content_type !== 'video/mp4'
    || !isPositiveInteger(value.duration_ms, MAX_SAFE_INTEGER)
    || value.packaging !== 'cmaf'
    || !Array.isArray(value.tracks)
    || value.tracks.length === 0
    || value.tracks.length > 64
  ) {
    throw new Error('invalid StorageManifestV1 media');
  }

  let previousTrackId = 0;
  const renditions = new Set<string>();
  const tracks = value.tracks.map((entry) => {
    const track = parseTrack(entry);
    const renditionKey = `${track.kind}:${track.rendition}`;
    if (track.track_id <= previousTrackId || renditions.has(renditionKey)) {
      throw new Error('tracks must be uniquely sorted by track_id');
    }
    previousTrackId = track.track_id;
    renditions.add(renditionKey);
    return track;
  });
  return {
    content_type: value.content_type,
    duration_ms: value.duration_ms,
    packaging: value.packaging,
    tracks,
  };
}

function parseTrack(value: unknown): StorageManifestTrackV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, TRACK_KEYS)
    || !isPositiveInteger(value.bitrate, MAX_SAFE_INTEGER)
    || !isIdentifier(value.codec)
    || typeof value.kind !== 'string'
    || !TRACK_KINDS.has(value.kind)
    || !isIdentifier(value.rendition)
    || !isPositiveInteger(value.timescale, MAX_SAFE_INTEGER)
    || !isPositiveInteger(value.track_id, 0xffffffff)
  ) {
    throw new Error('invalid StorageManifestV1 track');
  }
  return value as unknown as StorageManifestTrackV1;
}

function parseObject(
  value: unknown,
  expectedOrdinal: number,
  mediaDurationMs: number,
  tracks: Map<number, StorageManifestTrackV1>,
  paths: Set<string>,
  nonces: Set<string>,
  initScopes: Set<number | null>,
  timelines: Map<number, { endMs: number; nextSequence: number }>,
): StorageManifestObjectV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, OBJECT_KEYS)
    || !isPositiveInteger(value.byte_length, STORAGE_MANIFEST_V1_MAX_OBJECT_BYTES)
    || typeof value.cid !== 'string'
    || !isCanonicalCidV1(value.cid)
    || typeof value.ciphertext_sha256 !== 'string'
    || !SHA256_PATTERN.test(value.ciphertext_sha256)
    || !isNullableSafeInteger(value.duration_ms, true)
    || value.ordinal !== expectedOrdinal
    || typeof value.path !== 'string'
    || !isRelativePath(value.path)
    || !isPositiveInteger(value.plaintext_length, STORAGE_MANIFEST_V1_MAX_OBJECT_BYTES - 16)
    || value.byte_length !== value.plaintext_length + 16
    || typeof value.role !== 'string'
    || !ROLES.has(value.role)
    || !isNullableSafeInteger(value.sequence)
    || !isNullableSafeInteger(value.start_ms)
    || !isNullableTrackId(value.track_id)
  ) {
    throw new Error(`invalid object fields at ordinal ${expectedOrdinal}`);
  }

  const encryption = parseEncryption(value.encryption);
  if (paths.has(value.path) || nonces.has(encryption.nonce_b64)) {
    throw new Error(`duplicate path or nonce at ordinal ${expectedOrdinal}`);
  }
  if (value.track_id !== null && !tracks.has(value.track_id)) {
    throw new Error(`unknown track at ordinal ${expectedOrdinal}`);
  }

  if (value.role === 'init') {
    if (
      value.sequence !== null
      || value.start_ms !== null
      || value.duration_ms !== null
      || initScopes.has(value.track_id)
    ) {
      throw new Error(`invalid init object at ordinal ${expectedOrdinal}`);
    }
    initScopes.add(value.track_id);
  } else {
    if (
      value.track_id === null
      || value.sequence === null
      || value.start_ms === null
      || value.duration_ms === null
    ) {
      throw new Error(`invalid timed object at ordinal ${expectedOrdinal}`);
    }
    const timeline = timelines.get(value.track_id) ?? { endMs: 0, nextSequence: 0 };
    if (
      value.sequence !== timeline.nextSequence
      || value.start_ms < timeline.endMs
      || value.start_ms > mediaDurationMs - value.duration_ms
    ) {
      throw new Error(`invalid sequence at ordinal ${expectedOrdinal}`);
    }
    timelines.set(value.track_id, {
      endMs: value.start_ms + value.duration_ms,
      nextSequence: timeline.nextSequence + 1,
    });
  }

  paths.add(value.path);
  nonces.add(encryption.nonce_b64);
  return {
    byte_length: value.byte_length,
    cid: value.cid,
    ciphertext_sha256: value.ciphertext_sha256,
    duration_ms: value.duration_ms,
    encryption,
    ordinal: value.ordinal,
    path: value.path,
    plaintext_length: value.plaintext_length,
    role: value.role as StorageObjectRole,
    sequence: value.sequence,
    start_ms: value.start_ms,
    track_id: value.track_id,
  };
}

function parseEncryption(value: unknown): StorageManifestEncryptionV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ENCRYPTION_KEYS)
    || value.aad_version !== 'youtick.media-object-aad.v1'
    || value.algorithm !== 'AES-256-GCM'
    || value.format !== 'aes-gcm-tag-appended.v1'
    || typeof value.nonce_b64 !== 'string'
    || !NONCE_PATTERN.test(value.nonce_b64)
  ) {
    throw new Error('invalid StorageManifestV1 encryption');
  }
  return value as unknown as StorageManifestEncryptionV1;
}

function canonicalManifest(value: StorageManifestV1): StorageManifestV1 {
  return {
    content_id: value.content_id,
    encryption_generation: value.encryption_generation,
    media: {
      content_type: value.media.content_type,
      duration_ms: value.media.duration_ms,
      packaging: value.media.packaging,
      tracks: value.media.tracks.map((track) => ({
        bitrate: track.bitrate,
        codec: track.codec,
        kind: track.kind,
        rendition: track.rendition,
        timescale: track.timescale,
        track_id: track.track_id,
      })),
    },
    network_id: value.network_id,
    nft_contract_id: value.nft_contract_id,
    objects: value.objects.map(canonicalObject),
    schema: value.schema,
    version_id: value.version_id,
  };
}

function canonicalObject(value: StorageManifestObjectV1): StorageManifestObjectV1 {
  return {
    byte_length: value.byte_length,
    cid: value.cid,
    ciphertext_sha256: value.ciphertext_sha256,
    duration_ms: value.duration_ms,
    encryption: {
      aad_version: value.encryption.aad_version,
      algorithm: value.encryption.algorithm,
      format: value.encryption.format,
      nonce_b64: value.encryption.nonce_b64,
    },
    ordinal: value.ordinal,
    path: value.path,
    plaintext_length: value.plaintext_length,
    role: value.role,
    sequence: value.sequence,
    start_ms: value.start_ms,
    track_id: value.track_id,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function isNearAccountId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 2
    && value.length <= 64
    && NEAR_ACCOUNT_ID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum;
}

function isNullableSafeInteger(value: unknown, positive = false): value is number | null {
  return value === null || (
    Number.isSafeInteger(value)
    && (value as number) >= (positive ? 1 : 0)
    && (value as number) <= MAX_SAFE_INTEGER
  );
}

function isNullableTrackId(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value, 0xffffffff);
}

function isRelativePath(value: string): boolean {
  return value.length <= 512 && value.split('/').every((part) => PATH_COMPONENT_PATTERN.test(part));
}

export function isCanonicalCidV1(value: string): boolean {
  if (!CID_PATTERN.test(value)) {
    return false;
  }
  const bytes = decodeBase32(value.slice(1));
  return bytes.length === 36
    && bytes[0] === 1
    && (bytes[1] === 0x55 || bytes[1] === 0x70)
    && bytes[2] === 0x12
    && bytes[3] === 0x20;
}

export function normalizeL3ProviderCid(value: string): {
  providerCid: string;
  manifestCid: string;
} {
  if (isCanonicalCidV1(value)) {
    return { providerCid: value, manifestCid: value };
  }
  if (!CID_V0_PATTERN.test(value)) {
    throw new Error('invalid L3 provider CID');
  }
  const multihash = decodeBase58(value);
  if (multihash.length !== 34 || multihash[0] !== 0x12 || multihash[1] !== 0x20) {
    throw new Error('invalid L3 provider CID');
  }
  return {
    providerCid: value,
    manifestCid: `b${encodeBase32(new Uint8Array([0x01, 0x70, ...multihash]))}`,
  };
}

function decodeBase58(value: string): Uint8Array {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const littleEndian = [0];
  for (const character of value) {
    let carry = alphabet.indexOf(character);
    if (carry < 0) return new Uint8Array();
    for (let index = 0; index < littleEndian.length; index += 1) {
      carry += littleEndian[index] * 58;
      littleEndian[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      littleEndian.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return new Uint8Array(littleEndian.reverse());
}

function encodeBase32(value: Uint8Array): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >> bits) & 0x1f];
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0) result += alphabet[(buffer << (5 - bits)) & 0x1f];
  return result;
}

function decodeBase32(value: string): Uint8Array {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const result: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) {
      return new Uint8Array();
    }
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0 && buffer !== 0) {
    return new Uint8Array();
  }
  return new Uint8Array(result);
}

function encodeCanonical(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

async function merkleTreeHash(leaves: Uint8Array[]): Promise<Uint8Array> {
  const stack: Array<{ hash: Uint8Array; size: number }> = [];
  for (const leaf of leaves) {
    let hash = await sha256(concatBytes(new Uint8Array([0]), leaf));
    let size = 1;
    while (stack.at(-1)?.size === size) {
      const left = stack.pop();
      if (!left) break;
      hash = await sha256(concatBytes(new Uint8Array([1]), left.hash, hash));
      size *= 2;
    }
    stack.push({ hash, size });
  }
  let root = stack.pop()?.hash;
  if (!root) {
    throw new Error('StorageManifestV1 inventory is empty');
  }
  while (stack.length > 0) {
    const left = stack.pop();
    if (!left) break;
    root = await sha256(concatBytes(new Uint8Array([1]), left.hash, root));
  }
  return root;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', value));
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
