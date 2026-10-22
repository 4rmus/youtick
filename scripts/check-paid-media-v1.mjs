// Checks the V2 media descriptors in protocol/paid-media-v1 (owner decision OD19, gate M2-G1).
//
// stream-profile.json holds one entry, `stream`: the Cloudflare Stream profile a Market V2 upload names
// in `profile_config_sha256`. Its `hash` is the SHA-256 of the UTF-8 JSON of the entry without `hash`,
// keys sorted recursively, no whitespace: the `sortedJson` rule of check-paid-media-livepeer-v1.mjs.
// The V1 directory protocol/paid-media-livepeer-v1 stays frozen; its profiles never move here.
//
//   node scripts/check-paid-media-v1.mjs [path-to-stream-profile.json]
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const STREAM_PROFILE_PATH = resolve(root, "protocol/paid-media-v1/stream-profile.json");
const V1_PROFILES_PATH = resolve(root, "protocol/paid-media-livepeer-v1/profiles.json");

const ENTRY_KEYS = ["codec", "container", "hash", "maxDurationSecondsCap", "policy", "profiles", "provider"];
// The ladder recorded on Cloudflare Stream (sandbox spike 2026-10-21, 1920x1080 source): five H.264
// renditions in fMP4. The Bridge expects every rung up to the input height.
export const STREAM_LADDER = Object.freeze([
  Object.freeze({ name: "240p", width: 426, height: 240 }),
  Object.freeze({ name: "360p", width: 640, height: 360 }),
  Object.freeze({ name: "480p", width: 852, height: 480 }),
  Object.freeze({ name: "720p", width: 1280, height: 720 }),
  Object.freeze({ name: "1080p", width: 1920, height: 1080 }),
]);
// Owner decision OD3: a 2-hour cap. Cloudflare Stream itself accepts 1..36000; a different cap is an
// owner decision that changes the descriptor hash and the release constant STREAM_MAX_DURATION_SECONDS.
export const MAX_DURATION_SECONDS_CAP = 7200;

/** The canonical JSON the hash covers; identical to `sortedJson` in check-paid-media-livepeer-v1.mjs. */
export const sortedJson = (value) => JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);

/** SHA-256 hex of an entry without its `hash` field. */
export function streamProfileHash(entry) {
  const { hash: _hash, ...rest } = entry;
  return createHash("sha256").update(sortedJson(rest)).digest("hex");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(value, keys) {
  return isObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

/**
 * Throws on the first problem; returns the descriptor hash. `v1Hashes` are the frozen V1 profile hashes,
 * which a Stream hash must never equal (the Bridge selects the adapter by hash).
 */
export function checkStreamProfile(document, { v1Hashes = [] } = {}) {
  assert(sameKeys(document, ["stream"]), "stream-profile.json must hold exactly one entry, `stream`");
  const entry = document.stream;
  assert(sameKeys(entry, ENTRY_KEYS), `stream must have exactly the keys ${ENTRY_KEYS.join(", ")}`);
  assert(entry.provider === "cloudflare-stream", "stream.provider must be cloudflare-stream");
  assert(entry.container === "fmp4", "stream.container must be fmp4");
  assert(entry.codec === "h264", "stream.codec must be h264");
  assert(sameKeys(entry.policy, ["requireSignedURLs", "tokenPlacement"])
    && entry.policy.requireSignedURLs === true && entry.policy.tokenPlacement === "path",
  "stream.policy must be exactly {requireSignedURLs: true, tokenPlacement: \"path\"}");
  assert(entry.maxDurationSecondsCap === MAX_DURATION_SECONDS_CAP,
    `stream.maxDurationSecondsCap must be ${MAX_DURATION_SECONDS_CAP} (owner decision OD3)`);
  assert(Array.isArray(entry.profiles) && entry.profiles.length === STREAM_LADDER.length,
    `stream.profiles must list ${STREAM_LADDER.length} renditions`);
  entry.profiles.forEach((profile, index) => {
    const at = `stream.profiles[${index}]`;
    assert(sameKeys(profile, ["name", "width", "height"]), `${at} must have exactly name, width, height`);
    assert(Number.isSafeInteger(profile.width) && profile.width > 0 && Number.isSafeInteger(profile.height) && profile.height > 0,
      `${at} dimensions must be positive integers`);
    assert(profile.name === `${profile.height}p`, `${at}.name must be the height followed by p`);
    const rung = STREAM_LADDER[index];
    assert(profile.name === rung.name && profile.width === rung.width && profile.height === rung.height,
      `${at} must be ${JSON.stringify(rung)} (ascending ladder)`);
  });
  assert(typeof entry.hash === "string" && /^[0-9a-f]{64}$/.test(entry.hash), "stream.hash must be 64 lowercase hex characters");
  assert(entry.hash === streamProfileHash(entry), "stream.hash drift: it must equal SHA-256 of the sorted-key JSON of the entry without hash");
  assert(!v1Hashes.includes(entry.hash), "stream.hash must differ from every V1 profile hash");
  return entry.hash;
}

export function v1ProfileHashes(path = V1_PROFILES_PATH) {
  return Object.values(JSON.parse(readFileSync(path, "utf8"))).map((profile) => profile.hash);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const path = process.argv[2] ? resolve(process.argv[2]) : STREAM_PROFILE_PATH;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    // The descriptor is committed by the Bridge gate of M2 in the same push as this checker's CI step.
    console.error(`stream descriptor missing: ${relative(root, path) || path}`);
    process.exit(1);
  }
  try {
    const hash = checkStreamProfile(JSON.parse(text), { v1Hashes: v1ProfileHashes() });
    console.log(`paid-media-v1 stream profile OK (${hash})`);
  } catch (error) {
    console.error(`paid-media-v1 stream profile: ${error.message}`);
    process.exit(1);
  }
}
