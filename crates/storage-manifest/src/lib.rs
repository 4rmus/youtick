use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::Read;

pub const SCHEMA: &str = "youtick.storage-manifest.v1";
pub const MAX_CANONICAL_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_OBJECT_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_OBJECTS: usize = 10_000;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
pub const MEDIA_OBJECT_VERIFICATION_SCHEMA: &str = "youtick.l3-readback.verify.v1";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MediaObjectVerificationIdentityV1 {
    pub authority_digest: String,
    pub job_id: String,
    pub generation: u32,
    pub reservation_id: String,
    pub ordinal: u32,
    pub provider_key: String,
    pub ciphertext_sha256: String,
    pub byte_length: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MediaObjectVerificationTaskV1 {
    pub schema: String,
    pub verification_id: String,
    pub job_id: String,
    pub generation: u32,
    pub ordinal: u32,
}

impl MediaObjectVerificationTaskV1 {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema != MEDIA_OBJECT_VERIFICATION_SCHEMA
            || !is_lower_hex_sha256(&self.verification_id)
            || !is_job_id(&self.job_id)
            || self.generation == 0
            || self.ordinal as usize >= MAX_OBJECTS
        {
            return Err("invalid media object verification task".into());
        }
        Ok(())
    }
}

pub fn media_object_verification_id_v1(
    identity: &MediaObjectVerificationIdentityV1,
) -> Result<String, String> {
    if !is_lower_hex_sha256(&identity.authority_digest)
        || !is_job_id(&identity.job_id)
        || identity.generation == 0
        || identity.reservation_id.len() < 16
        || identity.reservation_id.len() > 256
        || !identity
            .reservation_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._:+/=-".contains(&byte))
        || identity.ordinal as usize >= MAX_OBJECTS
        || !is_lower_hex_sha256(&identity.ciphertext_sha256)
        || !(17..=MAX_OBJECT_BYTES).contains(&identity.byte_length)
        || identity.provider_key
            != format!(
                "jobs/{}/objects/{}-{}",
                identity.job_id, identity.ordinal, identity.ciphertext_sha256
            )
    {
        return Err("invalid media object verification identity".into());
    }
    let canonical = format!(
        "{MEDIA_OBJECT_VERIFICATION_SCHEMA}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}",
        identity.authority_digest,
        identity.job_id,
        identity.generation,
        identity.reservation_id,
        identity.ordinal,
        identity.provider_key,
        identity.byte_length,
        identity.ciphertext_sha256,
    );
    Ok(to_hex(&Sha256::digest(canonical.as_bytes())))
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpectedCiphertextObject {
    pub byte_length: u64,
    pub ciphertext_sha256: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct L3ReadbackMetadata {
    pub head_status: u16,
    pub get_status: u16,
    pub redirected: bool,
    pub head_content_length: Option<u64>,
    pub get_content_length: Option<u64>,
    pub content_range: Option<String>,
    pub content_encoding: Option<String>,
    pub head_cid: Option<String>,
    pub get_cid: Option<String>,
    pub head_ciphertext_sha256: Option<String>,
    pub get_ciphertext_sha256: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CidReadbackMetadata {
    pub status: u16,
    pub redirected: bool,
    pub requested_cid: String,
    pub content_length: Option<u64>,
    pub content_range: Option<String>,
    pub content_encoding: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedCiphertextObject {
    pub byte_length: u64,
    pub cid: String,
    pub provider_cid: String,
    pub ciphertext_sha256: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NormalizedL3Cid {
    pub provider_cid: String,
    pub manifest_cid: String,
}

pub struct CiphertextStreamVerifier {
    expected: ExpectedCiphertextObject,
    digest: Sha256,
    byte_length: u64,
    source: String,
}

impl CiphertextStreamVerifier {
    pub fn new(expected: &ExpectedCiphertextObject, source: &str) -> Result<Self, String> {
        if expected.byte_length < 17
            || expected.byte_length > MAX_OBJECT_BYTES
            || !is_lower_hex_sha256(&expected.ciphertext_sha256)
            || source.is_empty()
        {
            return Err("invalid expected ciphertext object".into());
        }
        Ok(Self {
            expected: expected.clone(),
            digest: Sha256::new(),
            byte_length: 0,
            source: source.into(),
        })
    }

    pub fn update(&mut self, chunk: &[u8]) -> Result<(), String> {
        self.byte_length = self
            .byte_length
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "L3 readback byte count overflow".to_string())?;
        if self.byte_length > self.expected.byte_length {
            return Err(format!(
                "{} readback exceeds expected byte length",
                self.source
            ));
        }
        self.digest.update(chunk);
        Ok(())
    }

    pub fn finish(self) -> Result<(), String> {
        if self.byte_length != self.expected.byte_length {
            return Err(format!("{} readback byte length mismatch", self.source));
        }
        if to_hex(&self.digest.finalize()) != self.expected.ciphertext_sha256 {
            return Err(format!("{} readback SHA-256 mismatch", self.source));
        }
        Ok(())
    }
}

pub fn validate_l3_and_cid_readback_metadata(
    expected: &ExpectedCiphertextObject,
    l3: &L3ReadbackMetadata,
    cid_gateway: &CidReadbackMetadata,
) -> Result<String, String> {
    CiphertextStreamVerifier::new(expected, "L3")?;
    if l3.head_status != 200
        || l3.get_status != 200
        || l3.redirected
        || l3.content_range.is_some()
        || l3.content_encoding.is_some()
        || l3.head_content_length != Some(expected.byte_length)
        || l3.get_content_length != Some(expected.byte_length)
        || l3.head_ciphertext_sha256.as_deref() != Some(expected.ciphertext_sha256.as_str())
        || l3.get_ciphertext_sha256.as_deref() != Some(expected.ciphertext_sha256.as_str())
    {
        return Err("invalid L3 readback response".into());
    }
    if cid_gateway.status != 200
        || cid_gateway.redirected
        || cid_gateway.content_length != Some(expected.byte_length)
        || cid_gateway.content_range.is_some()
        || cid_gateway.content_encoding.is_some()
    {
        return Err("invalid CID gateway readback response".into());
    }

    let (Some(head_cid), Some(get_cid)) = (&l3.head_cid, &l3.get_cid) else {
        return Err("missing L3 readback CID".into());
    };
    if head_cid != get_cid || cid_gateway.requested_cid != *head_cid {
        return Err("invalid L3 readback CID".into());
    }
    let (cid_bytes, normalized) =
        parse_l3_provider_cid(head_cid).ok_or_else(|| "invalid L3 readback CID".to_string())?;
    if cid_bytes[1] == 0x55 && to_hex(&cid_bytes[4..]) != expected.ciphertext_sha256 {
        return Err("raw CID digest does not match ciphertext".into());
    }
    Ok(normalized.manifest_cid)
}

pub fn verify_l3_and_cid_ciphertext_readers<L: Read, C: Read>(
    expected: &ExpectedCiphertextObject,
    l3: &L3ReadbackMetadata,
    cid_gateway: &CidReadbackMetadata,
    l3_reader: L,
    cid_reader: C,
) -> Result<VerifiedCiphertextObject, String> {
    let cid = validate_l3_and_cid_readback_metadata(expected, l3, cid_gateway)?;

    verify_ciphertext_stream(expected, l3_reader, "L3")?;
    verify_ciphertext_stream(expected, cid_reader, "CID gateway")?;
    Ok(VerifiedCiphertextObject {
        byte_length: expected.byte_length,
        cid,
        provider_cid: l3.head_cid.clone().expect("validated L3 CID"),
        ciphertext_sha256: expected.ciphertext_sha256.clone(),
    })
}

fn verify_ciphertext_stream<R: Read>(
    expected: &ExpectedCiphertextObject,
    mut reader: R,
    source: &str,
) -> Result<(), String> {
    let mut verifier = CiphertextStreamVerifier::new(expected, source)?;
    let mut chunk = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut chunk)
            .map_err(|error| format!("{source} readback failed: {error}"))?;
        if read == 0 {
            break;
        }
        verifier.update(&chunk[..read])?;
    }
    verifier.finish()
}

fn is_job_id(value: &str) -> bool {
    value.len() <= 64
        && value
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_-".contains(&byte))
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StorageManifestV1 {
    pub content_id: String,
    pub encryption_generation: u32,
    pub media: StorageManifestMediaV1,
    pub network_id: String,
    pub nft_contract_id: String,
    pub objects: Vec<StorageManifestObjectV1>,
    pub schema: String,
    pub version_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StorageManifestMediaV1 {
    pub content_type: String,
    pub duration_ms: u64,
    pub packaging: String,
    pub tracks: Vec<StorageManifestTrackV1>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StorageManifestTrackV1 {
    pub bitrate: u64,
    pub codec: String,
    pub kind: String,
    pub rendition: String,
    pub timescale: u64,
    pub track_id: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StorageManifestObjectV1 {
    pub byte_length: u64,
    pub cid: String,
    pub ciphertext_sha256: String,
    pub duration_ms: Option<u64>,
    pub encryption: StorageManifestEncryptionV1,
    pub ordinal: u32,
    pub path: String,
    pub plaintext_length: u64,
    pub role: String,
    pub sequence: Option<u64>,
    pub start_ms: Option<u64>,
    pub track_id: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StorageManifestEncryptionV1 {
    pub aad_version: String,
    pub algorithm: String,
    pub format: String,
    pub nonce_b64: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageManifestCommitmentsV1 {
    pub inventory_root: String,
    pub manifest_root: String,
}

#[derive(Serialize)]
struct StorageObjectAadV1<'a> {
    aad_version: &'a str,
    content_id: &'a str,
    duration_ms: Option<u64>,
    encryption_generation: u32,
    network_id: &'a str,
    nft_contract_id: &'a str,
    ordinal: u32,
    path: &'a str,
    plaintext_length: u64,
    rendition: Option<&'a str>,
    role: &'a str,
    sequence: Option<u64>,
    start_ms: Option<u64>,
    track_id: Option<u32>,
    version_id: &'a str,
}

impl StorageManifestV1 {
    pub fn from_json(value: &[u8]) -> Result<Self, String> {
        if value.len() > MAX_CANONICAL_BYTES {
            return Err("StorageManifestV1 exceeds the canonical byte limit".into());
        }
        let manifest: Self = serde_json::from_slice(value).map_err(|error| error.to_string())?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn from_canonical_json(value: &[u8]) -> Result<Self, String> {
        let manifest = Self::from_json(value)?;
        if manifest.canonical_json()? != value {
            return Err("StorageManifestV1 bytes are not canonical".into());
        }
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema != SCHEMA
            || !is_identifier(&self.content_id)
            || self.encryption_generation == 0
            || !matches!(self.network_id.as_str(), "mainnet" | "testnet")
            || !is_near_account_id(&self.nft_contract_id)
            || !is_identifier(&self.version_id)
            || self.objects.is_empty()
            || self.objects.len() > MAX_OBJECTS
        {
            return Err("invalid StorageManifestV1 fields".into());
        }

        let track_ids = self.media.validate()?;
        let mut paths = HashSet::with_capacity(self.objects.len());
        let mut nonces = HashSet::with_capacity(self.objects.len());
        let mut init_scopes = HashSet::new();
        let mut timelines: HashMap<u32, (u64, u64)> = HashMap::new();
        for (index, object) in self.objects.iter().enumerate() {
            object.validate(index, &track_ids)?;
            if !paths.insert(object.path.as_str())
                || !nonces.insert(object.encryption.nonce_b64.as_str())
            {
                return Err(format!("duplicate path or nonce at ordinal {index}"));
            }
            if object.role == "init" {
                if object.sequence.is_some()
                    || object.start_ms.is_some()
                    || object.duration_ms.is_some()
                    || !init_scopes.insert(object.track_id)
                {
                    return Err(format!("invalid init object at ordinal {index}"));
                }
            } else {
                let (Some(track_id), Some(sequence), Some(start_ms), Some(duration_ms)) = (
                    object.track_id,
                    object.sequence,
                    object.start_ms,
                    object.duration_ms,
                ) else {
                    return Err(format!("invalid timed object at ordinal {index}"));
                };
                let timeline = timelines.entry(track_id).or_insert((0, 0));
                if sequence != timeline.0
                    || start_ms < timeline.1
                    || duration_ms > self.media.duration_ms
                    || start_ms > self.media.duration_ms - duration_ms
                {
                    return Err(format!("invalid sequence at ordinal {index}"));
                }
                *timeline = (timeline.0 + 1, start_ms + duration_ms);
            }
        }
        let has_global_init = init_scopes.contains(&None);
        if (has_global_init && init_scopes.len() != 1)
            || (!has_global_init && init_scopes.len() != track_ids.len())
            || timelines.len() != track_ids.len()
        {
            return Err("manifest must cover every track with init and segment objects".into());
        }
        Ok(())
    }

    pub fn canonical_json(&self) -> Result<Vec<u8>, String> {
        self.validate()?;
        serde_json::to_vec(self).map_err(|error| error.to_string())
    }

    pub fn object_aad(&self, ordinal: usize) -> Result<Vec<u8>, String> {
        self.validate()?;
        let object = self
            .objects
            .get(ordinal)
            .ok_or_else(|| format!("unknown object ordinal {ordinal}"))?;
        let rendition = object.track_id.and_then(|track_id| {
            self.media
                .tracks
                .iter()
                .find(|track| track.track_id == track_id)
                .map(|track| track.rendition.as_str())
        });
        serde_json::to_vec(&StorageObjectAadV1 {
            aad_version: &object.encryption.aad_version,
            content_id: &self.content_id,
            duration_ms: object.duration_ms,
            encryption_generation: self.encryption_generation,
            network_id: &self.network_id,
            nft_contract_id: &self.nft_contract_id,
            ordinal: object.ordinal,
            path: &object.path,
            plaintext_length: object.plaintext_length,
            rendition,
            role: &object.role,
            sequence: object.sequence,
            start_ms: object.start_ms,
            track_id: object.track_id,
            version_id: &self.version_id,
        })
        .map_err(|error| error.to_string())
    }

    pub fn commitments(&self) -> Result<StorageManifestCommitmentsV1, String> {
        let manifest_root = sha256(&self.canonical_json()?);
        let mut leaves = Vec::with_capacity(self.objects.len());
        for object in &self.objects {
            leaves.push(serde_json::to_vec(object).map_err(|error| error.to_string())?);
        }
        let inventory_root = merkle_tree_hash(&leaves);
        Ok(StorageManifestCommitmentsV1 {
            inventory_root: to_hex(&inventory_root),
            manifest_root: to_hex(&manifest_root),
        })
    }
}

impl StorageManifestMediaV1 {
    fn validate(&self) -> Result<HashSet<u32>, String> {
        if self.content_type != "video/mp4"
            || self.duration_ms == 0
            || self.duration_ms > MAX_SAFE_INTEGER
            || self.packaging != "cmaf"
            || self.tracks.is_empty()
            || self.tracks.len() > 64
        {
            return Err("invalid StorageManifestV1 media".into());
        }

        let mut previous_track_id = 0;
        let mut track_ids = HashSet::with_capacity(self.tracks.len());
        let mut renditions = HashSet::with_capacity(self.tracks.len());
        for track in &self.tracks {
            track.validate()?;
            let rendition = format!("{}:{}", track.kind, track.rendition);
            if track.track_id <= previous_track_id || !renditions.insert(rendition) {
                return Err("tracks must be uniquely sorted by track_id".into());
            }
            previous_track_id = track.track_id;
            track_ids.insert(track.track_id);
        }
        Ok(track_ids)
    }
}

impl StorageManifestTrackV1 {
    fn validate(&self) -> Result<(), String> {
        if self.bitrate == 0
            || self.bitrate > MAX_SAFE_INTEGER
            || !is_identifier(&self.codec)
            || !matches!(self.kind.as_str(), "audio" | "video")
            || !is_identifier(&self.rendition)
            || self.timescale == 0
            || self.timescale > MAX_SAFE_INTEGER
            || self.track_id == 0
        {
            return Err("invalid StorageManifestV1 track".into());
        }
        Ok(())
    }
}

impl StorageManifestObjectV1 {
    fn validate(&self, expected_ordinal: usize, track_ids: &HashSet<u32>) -> Result<(), String> {
        if self.byte_length < 17
            || self.byte_length > MAX_OBJECT_BYTES
            || !is_cid(&self.cid)
            || !is_lower_hex_sha256(&self.ciphertext_sha256)
            || self
                .duration_ms
                .is_some_and(|value| value == 0 || value > MAX_SAFE_INTEGER)
            || usize::try_from(self.ordinal).ok() != Some(expected_ordinal)
            || !is_relative_path(&self.path)
            || self.plaintext_length == 0
            || self.plaintext_length > MAX_OBJECT_BYTES - 16
            || self.byte_length != self.plaintext_length + 16
            || !matches!(self.role.as_str(), "init" | "segment")
            || self.sequence.is_some_and(|value| value > MAX_SAFE_INTEGER)
            || self.start_ms.is_some_and(|value| value > MAX_SAFE_INTEGER)
        {
            return Err(format!(
                "invalid object fields at ordinal {expected_ordinal}"
            ));
        }
        self.encryption.validate()?;

        if self
            .track_id
            .is_some_and(|track_id| !track_ids.contains(&track_id))
        {
            return Err(format!("unknown track at ordinal {expected_ordinal}"));
        }
        Ok(())
    }
}

impl StorageManifestEncryptionV1 {
    fn validate(&self) -> Result<(), String> {
        if self.aad_version != "youtick.media-object-aad.v1"
            || self.algorithm != "AES-256-GCM"
            || self.format != "aes-gcm-tag-appended.v1"
            || !is_base64_nonce(&self.nonce_b64)
        {
            return Err("invalid StorageManifestV1 encryption".into());
        }
        Ok(())
    }
}

fn is_identifier(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 128
        && bytes[0].is_ascii_alphanumeric()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

fn is_near_account_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    if !(2..=64).contains(&bytes.len()) {
        return false;
    }
    let mut previous_was_separator = true;
    for byte in bytes {
        if byte.is_ascii_lowercase() || byte.is_ascii_digit() {
            previous_was_separator = false;
        } else if matches!(byte, b'.' | b'_' | b'-') && !previous_was_separator {
            previous_was_separator = true;
        } else {
            return false;
        }
    }
    !previous_was_separator
}

fn is_relative_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value.split('/').all(|part| {
            let bytes = part.as_bytes();
            !bytes.is_empty()
                && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
                && bytes[1..].iter().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || matches!(byte, b'.' | b'_' | b'-')
                })
        })
}

fn is_cid(value: &str) -> bool {
    decode_cid(value).is_some()
}

fn decode_cid(value: &str) -> Option<Vec<u8>> {
    let encoded = value.strip_prefix('b').filter(|rest| rest.len() == 58)?;
    let bytes = decode_base32(encoded)?;
    (bytes.len() == 36
        && bytes[0] == 1
        && matches!(bytes[1], 0x55 | 0x70)
        && bytes[2] == 0x12
        && bytes[3] == 0x20)
        .then_some(bytes)
}

pub fn normalize_l3_provider_cid(value: &str) -> Option<NormalizedL3Cid> {
    parse_l3_provider_cid(value).map(|(_, normalized)| normalized)
}

fn parse_l3_provider_cid(value: &str) -> Option<(Vec<u8>, NormalizedL3Cid)> {
    if let Some(bytes) = decode_cid(value) {
        return Some((
            bytes,
            NormalizedL3Cid {
                provider_cid: value.to_string(),
                manifest_cid: value.to_string(),
            },
        ));
    }
    if value.len() != 46 {
        return None;
    }
    let multihash = decode_base58(value.strip_prefix("Qm").map(|_| value)?)?;
    if multihash.len() != 34 || multihash[0] != 0x12 || multihash[1] != 0x20 {
        return None;
    }
    let mut cid = Vec::with_capacity(36);
    cid.extend_from_slice(&[0x01, 0x70]);
    cid.extend_from_slice(&multihash);
    let canonical = format!("b{}", encode_base32(&cid));
    Some((
        cid,
        NormalizedL3Cid {
            provider_cid: value.to_string(),
            manifest_cid: canonical,
        },
    ))
}

fn decode_base58(value: &str) -> Option<Vec<u8>> {
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut little_endian = vec![0_u8];
    for byte in value.bytes() {
        let mut carry = u32::try_from(ALPHABET.iter().position(|digit| *digit == byte)?).ok()?;
        for decoded in &mut little_endian {
            carry += u32::from(*decoded) * 58;
            *decoded = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            little_endian.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    little_endian.reverse();
    Some(little_endian)
}

fn encode_base32(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz234567";
    let mut result = String::with_capacity((bytes.len() * 8).div_ceil(5));
    let mut buffer = 0_u32;
    let mut bits = 0_u8;
    for byte in bytes {
        buffer = (buffer << 8) | u32::from(*byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            result.push(char::from(ALPHABET[((buffer >> bits) & 0x1f) as usize]));
            buffer &= (1_u32 << bits) - 1;
        }
    }
    if bits > 0 {
        result.push(char::from(
            ALPHABET[((buffer << (5 - bits)) & 0x1f) as usize],
        ));
    }
    result
}

fn decode_base32(value: &str) -> Option<Vec<u8>> {
    let mut result = Vec::with_capacity(value.len() * 5 / 8);
    let mut buffer = 0_u32;
    let mut bits = 0_u8;
    for byte in value.bytes() {
        let digit = match byte {
            b'a'..=b'z' => u32::from(byte - b'a'),
            b'2'..=b'7' => u32::from(byte - b'2' + 26),
            _ => return None,
        };
        buffer = (buffer << 5) | digit;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            result.push(((buffer >> bits) & 0xff) as u8);
            buffer &= (1_u32 << bits) - 1;
        }
    }
    if bits > 0 && buffer != 0 {
        return None;
    }
    Some(result)
}

fn is_lower_hex_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_base64_nonce(value: &str) -> bool {
    value.len() == 16
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/'))
}

fn sha256(value: &[u8]) -> [u8; 32] {
    Sha256::digest(value).into()
}

fn merkle_tree_hash(leaves: &[Vec<u8>]) -> [u8; 32] {
    if leaves.len() == 1 {
        let mut leaf = Vec::with_capacity(1 + leaves[0].len());
        leaf.push(0);
        leaf.extend_from_slice(&leaves[0]);
        return sha256(&leaf);
    }
    let split = largest_power_of_two_less_than(leaves.len());
    let left = merkle_tree_hash(&leaves[..split]);
    let right = merkle_tree_hash(&leaves[split..]);
    let mut node = Vec::with_capacity(65);
    node.push(1);
    node.extend_from_slice(&left);
    node.extend_from_slice(&right);
    sha256(&node)
}

fn largest_power_of_two_less_than(value: usize) -> usize {
    let mut power = 1;
    while power * 2 < value {
        power *= 2;
    }
    power
}

fn to_hex(value: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(value.len() * 2);
    for byte in value {
        result.push(char::from(HEX[usize::from(byte >> 4)]));
        result.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{
        media_object_verification_id_v1, sha256, to_hex, verify_l3_and_cid_ciphertext_readers,
        CidReadbackMetadata, CiphertextStreamVerifier, ExpectedCiphertextObject,
        L3ReadbackMetadata, MediaObjectVerificationIdentityV1, MediaObjectVerificationTaskV1,
        StorageManifestV1,
    };
    use serde::Deserialize;
    use serde_json::Value;
    use std::io::Cursor;

    #[derive(Deserialize)]
    struct GoldenVectors {
        canonical_json: String,
        inventory_root: String,
        invalid_manifests: Vec<InvalidManifest>,
        manifest: Value,
        manifest_root: String,
        object_aad_json: Vec<String>,
    }

    #[derive(Deserialize)]
    struct InvalidManifest {
        name: String,
        manifest: Value,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VerificationGoldenVectors {
        cid_normalization: CidNormalizationGolden,
        identity: VerificationIdentityGolden,
        task: MediaObjectVerificationTaskV1,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CidNormalizationGolden {
        provider_cid: String,
        manifest_cid: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VerificationIdentityGolden {
        authority_digest: String,
        job_id: String,
        generation: u32,
        reservation_id: String,
        ordinal: u32,
        provider_key: String,
        ciphertext_sha256: String,
        byte_length: u64,
    }

    fn vectors() -> GoldenVectors {
        serde_json::from_str(include_str!(
            "../../../protocol/storage-manifest-v1/golden-vectors.json"
        ))
        .expect("golden vectors must be valid JSON")
    }

    #[test]
    fn media_object_verification_id_matches_the_typescript_golden_vector() {
        let golden: VerificationGoldenVectors = serde_json::from_str(include_str!(
            "../../../protocol/l3-verification-v1/golden-vectors.json"
        ))
        .unwrap();
        let identity = golden.identity;
        let verification_id = media_object_verification_id_v1(&MediaObjectVerificationIdentityV1 {
            authority_digest: identity.authority_digest,
            job_id: identity.job_id,
            generation: identity.generation,
            reservation_id: identity.reservation_id,
            ordinal: identity.ordinal,
            provider_key: identity.provider_key,
            ciphertext_sha256: identity.ciphertext_sha256,
            byte_length: identity.byte_length,
        })
        .unwrap();

        assert_eq!(verification_id, golden.task.verification_id);
        golden.task.validate().unwrap();

        let mut invalid_task = golden.task;
        invalid_task.job_id = "_job".into();
        assert!(invalid_task.validate().is_err());
    }

    fn readback_fixture(
        bytes: &[u8],
    ) -> (
        ExpectedCiphertextObject,
        L3ReadbackMetadata,
        CidReadbackMetadata,
    ) {
        let ciphertext_sha256 = to_hex(&sha256(bytes));
        let cid = vectors().manifest["objects"][0]["cid"]
            .as_str()
            .expect("fixture CID")
            .to_string();
        (
            ExpectedCiphertextObject {
                byte_length: bytes.len() as u64,
                ciphertext_sha256: ciphertext_sha256.clone(),
            },
            L3ReadbackMetadata {
                head_status: 200,
                get_status: 200,
                redirected: false,
                head_content_length: Some(bytes.len() as u64),
                get_content_length: Some(bytes.len() as u64),
                content_range: None,
                content_encoding: None,
                head_cid: Some(cid.clone()),
                get_cid: Some(cid.clone()),
                head_ciphertext_sha256: Some(ciphertext_sha256.clone()),
                get_ciphertext_sha256: Some(ciphertext_sha256),
            },
            CidReadbackMetadata {
                status: 200,
                redirected: false,
                requested_cid: cid,
                content_length: Some(bytes.len() as u64),
                content_range: None,
                content_encoding: None,
            },
        )
    }

    #[test]
    fn incremental_ciphertext_verifier_never_needs_the_full_body() {
        let bytes = vec![9_u8; 131_089];
        let expected = ExpectedCiphertextObject {
            byte_length: bytes.len() as u64,
            ciphertext_sha256: to_hex(&sha256(&bytes)),
        };
        let mut verifier = CiphertextStreamVerifier::new(&expected, "L3").unwrap();
        for chunk in bytes.chunks(16_384) {
            verifier.update(chunk).unwrap();
        }
        verifier.finish().unwrap();

        let mut too_long = CiphertextStreamVerifier::new(&expected, "L3").unwrap();
        assert!(too_long.update(&vec![0; bytes.len() + 1]).is_err());
    }

    #[test]
    fn matches_golden_canonical_bytes_aad_and_commitments() {
        let vectors = vectors();
        let manifest =
            StorageManifestV1::from_json(&serde_json::to_vec(&vectors.manifest).unwrap()).unwrap();
        let commitments = manifest.commitments().unwrap();

        assert_eq!(
            String::from_utf8(manifest.canonical_json().unwrap()).unwrap(),
            vectors.canonical_json
        );
        assert_eq!(
            StorageManifestV1::from_canonical_json(vectors.canonical_json.as_bytes()).unwrap(),
            manifest
        );
        let object_aad_json: Vec<String> = manifest
            .objects
            .iter()
            .enumerate()
            .map(|(ordinal, _)| String::from_utf8(manifest.object_aad(ordinal).unwrap()).unwrap())
            .collect();
        assert_eq!(object_aad_json, vectors.object_aad_json);
        assert_eq!(commitments.inventory_root, vectors.inventory_root);
        assert_eq!(commitments.manifest_root, vectors.manifest_root);
    }

    #[test]
    fn rejects_invalid_golden_vectors() {
        for vector in vectors().invalid_manifests {
            let result =
                StorageManifestV1::from_json(&serde_json::to_vec(&vector.manifest).unwrap());
            assert!(result.is_err(), "{} unexpectedly passed", vector.name);
        }
    }

    #[test]
    fn rejects_non_canonical_wire_json() {
        let vectors = vectors();
        let canonical = vectors.canonical_json;
        let non_canonical = [
            serde_json::to_string_pretty(&vectors.manifest).unwrap(),
            canonical.replacen('{', r#"{"content_id":"duplicate","#, 1),
            canonical.replacen(
                "\"encryption_generation\":1",
                "\"encryption_generation\":1.0",
                1,
            ),
            canonical.replacen("\"sequence\":0", "\"sequence\":-0", 1),
            format!("\u{feff}{canonical}"),
        ];
        for value in non_canonical {
            assert!(StorageManifestV1::from_canonical_json(value.as_bytes()).is_err());
        }
    }

    #[test]
    fn rejects_malformed_cid_and_overlapping_timeline() {
        let mut manifest: StorageManifestV1 =
            serde_json::from_value(vectors().manifest).expect("valid manifest fixture");
        let mut overlap_manifest = manifest.clone();

        manifest.objects[0].cid = format!("b{}", "a".repeat(58));
        assert!(manifest.validate().is_err());

        let mut overlap = overlap_manifest.objects[1].clone();
        overlap.encryption.nonce_b64 = "BAQEBAQEBAQEBAQE".into();
        overlap.ordinal = 3;
        overlap.path = "video/720p/000001.m4s".into();
        overlap.sequence = Some(1);
        overlap.start_ms = Some(0);
        overlap_manifest.objects.push(overlap);
        assert!(overlap_manifest.validate().is_err());
    }

    #[test]
    fn verifies_full_l3_and_cid_gateway_readback_streams() {
        let bytes = b"correct ciphertext body";
        let (expected, l3, cid_gateway) = readback_fixture(bytes);
        let verified = verify_l3_and_cid_ciphertext_readers(
            &expected,
            &l3,
            &cid_gateway,
            Cursor::new(bytes),
            Cursor::new(bytes),
        )
        .unwrap();

        assert_eq!(verified.byte_length, bytes.len() as u64);
        assert_eq!(verified.ciphertext_sha256, expected.ciphertext_sha256);
        assert_eq!(verified.cid, l3.head_cid.unwrap());
        assert_eq!(verified.provider_cid, verified.cid);
    }

    #[test]
    fn normalizes_lighthouse_cidv0_readback_to_manifest_cidv1() {
        let bytes = b"correct ciphertext body";
        let (expected, mut l3, mut cid_gateway) = readback_fixture(bytes);
        let golden: VerificationGoldenVectors = serde_json::from_str(include_str!(
            "../../../protocol/l3-verification-v1/golden-vectors.json"
        ))
        .unwrap();
        let provider_cid = golden.cid_normalization.provider_cid;
        l3.head_cid = Some(provider_cid.clone());
        l3.get_cid = Some(provider_cid.clone());
        cid_gateway.requested_cid = provider_cid.clone();

        let verified = verify_l3_and_cid_ciphertext_readers(
            &expected,
            &l3,
            &cid_gateway,
            Cursor::new(bytes),
            Cursor::new(bytes),
        )
        .unwrap();

        assert_eq!(verified.cid, golden.cid_normalization.manifest_cid);
        assert_eq!(verified.provider_cid, provider_cid);
    }

    #[test]
    fn rejects_short_long_and_wrong_l3_readback_bytes() {
        let bytes = b"correct ciphertext body";
        let (expected, l3, cid_gateway) = readback_fixture(bytes);

        assert!(verify_l3_and_cid_ciphertext_readers(
            &expected,
            &l3,
            &cid_gateway,
            Cursor::new(&bytes[..bytes.len() - 1]),
            Cursor::new(bytes),
        )
        .is_err());

        let mut longer = bytes.to_vec();
        longer.push(0);
        assert!(verify_l3_and_cid_ciphertext_readers(
            &expected,
            &l3,
            &cid_gateway,
            Cursor::new(longer),
            Cursor::new(bytes),
        )
        .is_err());

        let mut wrong = bytes.to_vec();
        wrong[0] ^= 1;
        assert!(verify_l3_and_cid_ciphertext_readers(
            &expected,
            &l3,
            &cid_gateway,
            Cursor::new(bytes),
            Cursor::new(wrong),
        )
        .is_err());
    }

    #[test]
    fn rejects_partial_redirected_encoded_or_mismatched_l3_responses() {
        let bytes = b"correct ciphertext body";
        let (expected, metadata, cid_gateway) = readback_fixture(bytes);
        let invalid = [
            L3ReadbackMetadata {
                get_status: 206,
                ..metadata.clone()
            },
            L3ReadbackMetadata {
                redirected: true,
                ..metadata.clone()
            },
            L3ReadbackMetadata {
                content_range: Some("bytes 0-22/23".into()),
                ..metadata.clone()
            },
            L3ReadbackMetadata {
                content_encoding: Some("gzip".into()),
                ..metadata.clone()
            },
            L3ReadbackMetadata {
                head_cid: Some(format!("{}x", metadata.head_cid.as_deref().unwrap())),
                ..metadata.clone()
            },
            L3ReadbackMetadata {
                get_ciphertext_sha256: Some("ab".repeat(32)),
                ..metadata.clone()
            },
        ];

        for response in invalid {
            assert!(verify_l3_and_cid_ciphertext_readers(
                &expected,
                &response,
                &cid_gateway,
                Cursor::new(bytes),
                Cursor::new(bytes),
            )
            .is_err());
        }
    }

    #[test]
    fn rejects_invalid_cid_gateway_response_and_wrong_raw_cid_digest() {
        let bytes = b"correct ciphertext body";
        let (expected, l3, cid_gateway) = readback_fixture(bytes);
        let partial = CidReadbackMetadata {
            status: 206,
            ..cid_gateway.clone()
        };
        assert!(verify_l3_and_cid_ciphertext_readers(
            &expected,
            &l3,
            &partial,
            Cursor::new(bytes),
            Cursor::new(bytes),
        )
        .is_err());

        let raw_cid_for_other_bytes = "bafkreiarrg3lo7wwgsxigewmyxxl2k2nuxwfkiljttyfw5rlnyt2dpoykm";
        let wrong_locator = CidReadbackMetadata {
            requested_cid: raw_cid_for_other_bytes.into(),
            ..cid_gateway.clone()
        };
        assert!(verify_l3_and_cid_ciphertext_readers(
            &expected,
            &l3,
            &wrong_locator,
            Cursor::new(bytes),
            Cursor::new(bytes),
        )
        .is_err());

        let wrong_raw_cid = L3ReadbackMetadata {
            head_cid: Some(raw_cid_for_other_bytes.into()),
            get_cid: Some(raw_cid_for_other_bytes.into()),
            ..l3
        };
        assert!(verify_l3_and_cid_ciphertext_readers(
            &expected,
            &wrong_raw_cid,
            &cid_gateway,
            Cursor::new(bytes),
            Cursor::new(bytes),
        )
        .is_err());
    }
}
