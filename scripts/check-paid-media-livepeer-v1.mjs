import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = resolve(root, "protocol/paid-media-livepeer-v1");
const schema = readJson(resolve(protocolDir, "schema.json"));
const vectors = readJson(resolve(protocolDir, "golden-vectors.json"));

validate(schema, vectors, "$", schema);

const messageFields = [
  "domain",
  "version",
  "method",
  "route",
  "network",
  "contract_id",
  "account_id",
  "resource",
  "session_public_key",
  "origin",
  "device_nonce",
  "expires_at_ms",
  "body_sha256",
];
checkRequest(vectors.upload_intent, "/v1/upload-intents");
checkRequest(vectors.playback_token_request, "/v1/playback-tokens");
assert(vectors.upload_intent.envelope.version === "3", "upload control v3 is required");

const quoteFields = [
  "domain", "version", "network", "contract_id", "creator_id", "job_id",
  "expected_source_bytes", "fee_usd_micro", "near_usd_micro", "fee_near_yocto",
  "rate_source", "rate_timestamp_ms", "expires_at_ms", "quote_key_version",
];
const quoteVector = vectors.creator_fee_quote;
const quoteMessage = quoteFields.map((field) => quoteVector.quote[field]).join("\n");
assert(quoteVector.canonical_message === quoteMessage, "creator quote canonical message drift");
const quoteId = createHash("sha256").update(quoteMessage).digest("hex");
assert(quoteVector.quote_id === quoteId && quoteVector.quote.quote_id === quoteId, "creator quote ID drift");
const rawQuoteKey = Buffer.from(quoteVector.public_key_base64, "base64");
const quoteKey = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawQuoteKey]),
  format: "der",
  type: "spki",
});
assert(verify(null, Buffer.from(quoteMessage), quoteKey, Buffer.from(quoteVector.signature_base64, "base64")), "creator quote signature drift");
const expectedNear = (BigInt(quoteVector.quote.fee_usd_micro) * 10n ** 24n + BigInt(quoteVector.quote.near_usd_micro) - 1n)
  / BigInt(quoteVector.quote.near_usd_micro);
assert(BigInt(quoteVector.quote.fee_near_yocto) === expectedNear, "creator quote NEAR conversion drift");

const sponsorFields = [
  "domain", "version", "network", "contract_id", "creator_id", "job_id",
  "request_sha256", "expected_source_bytes", "upload_fee_usdc", "sponsor_fee_usdc",
  "total_fee_usdc", "delegate_receiver_id", "delegate_method", "delegate_gas",
  "delegate_deposit_yocto", "issued_at_ms", "quote_block_height",
  "max_delegate_block_height", "expires_at_ms", "quote_key_version",
];
const sponsorRequestFields = [
  "creator_id", "job_id", "title", "price_usdc", "expected_source_bytes",
  "profile_id", "profile_config_sha256", "upload_public_key", "upload_key_expires_at_ms",
];
const sponsorVector = vectors.sponsored_upload_quote;
assert(
  JSON.stringify(Object.keys(sponsorVector.paid_job_request)) === JSON.stringify(sponsorRequestFields),
  "sponsor request field order drift",
);
const sponsorRequestJson = JSON.stringify(Object.fromEntries(
  sponsorRequestFields.map((field) => [field, sponsorVector.paid_job_request[field]]),
));
assert(sponsorVector.request_json === sponsorRequestJson, "sponsor request JSON drift");
const sponsorRequestSha = createHash("sha256").update(sponsorRequestJson).digest("hex");
assert(sponsorVector.request_sha256 === sponsorRequestSha, "sponsor request SHA-256 drift");
assert(sponsorVector.quote.request_sha256 === sponsorRequestSha, "sponsor quote request binding drift");
assert(sponsorVector.quote.creator_id === sponsorVector.paid_job_request.creator_id, "sponsor creator binding drift");
assert(sponsorVector.quote.job_id === sponsorVector.paid_job_request.job_id, "sponsor job binding drift");
assert(
  sponsorVector.quote.expected_source_bytes === sponsorVector.paid_job_request.expected_source_bytes,
  "sponsor source byte binding drift",
);
assert(
  sponsorVector.quote.delegate_receiver_id === "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  "sponsor testnet USDC receiver drift",
);
const sponsorMessage = sponsorFields.map((field) => sponsorVector.quote[field]).join("\n");
assert(sponsorVector.canonical_message === sponsorMessage, "sponsor quote canonical message drift");
const sponsorQuoteId = createHash("sha256").update(sponsorMessage).digest("hex");
assert(
  sponsorVector.quote_id === sponsorQuoteId && sponsorVector.quote.quote_id === sponsorQuoteId,
  "sponsor quote ID drift",
);
assert(sponsorVector.public_key_base64 === quoteVector.public_key_base64, "quote key mismatch");
assert(
  verify(null, Buffer.from(sponsorMessage), quoteKey, Buffer.from(sponsorVector.signature_base64, "base64")),
  "sponsor quote signature drift",
);
const sponsorSourceBytes = BigInt(sponsorVector.quote.expected_source_bytes);
const sponsorUploadFee = (sponsorSourceBytes * 300_000n + 1_000_000_000n - 1n) / 1_000_000_000n;
const boundedSponsorUploadFee = sponsorUploadFee < 500_000n ? 500_000n : sponsorUploadFee;
assert(BigInt(sponsorVector.quote.upload_fee_usdc) === boundedSponsorUploadFee, "sponsor upload fee drift");
assert(sponsorVector.quote.sponsor_fee_usdc === "100000", "fixed sponsor fee drift");
assert(
  BigInt(sponsorVector.quote.total_fee_usdc) === boundedSponsorUploadFee + 100_000n,
  "sponsor total fee drift",
);
const sponsorBlockWindow = BigInt(sponsorVector.quote.max_delegate_block_height)
  - BigInt(sponsorVector.quote.quote_block_height);
assert(sponsorBlockWindow > 0n && sponsorBlockWindow <= 200n, "sponsor block window drift");
const sponsorLifetime = BigInt(sponsorVector.quote.expires_at_ms)
  - BigInt(sponsorVector.quote.issued_at_ms);
assert(sponsorLifetime > 0n && sponsorLifetime <= 120_000n, "sponsor quote lifetime drift");

const upload = vectors.upload_intent.body;
const publication = vectors.finalize_publication;
const playback = vectors.playback_token_request.body;
assert(BigInt(upload.expected_source_bytes) <= BigInt(vectors.limits.max_source_bytes), "source exceeds protocol maximum");
assert(vectors.upload_intent.envelope.resource === `job:${upload.job_id}:${upload.generation}`, "job resource binding mismatch");
assert(vectors.playback_token_request.envelope.resource === `playback:${playback.job_id}:${playback.generation}:${playback.playback_id}`, "playback resource binding mismatch");
for (const field of ["job_id", "generation", "expected_source_bytes", "profile_id", "profile_config_sha256"]) {
  assert(publication[field] === upload[field], `publication ${field} mismatch`);
}
for (const field of ["job_id", "generation", "playback_id"]) {
  assert(playback[field] === publication[field], `playback ${field} mismatch`);
}
assert(publication.verified_source_bytes === upload.expected_source_bytes, "verified source byte mismatch");

console.log("paid-media-livepeer-v1 protocol: OK");

function checkRequest(request, route) {
  const canonicalBody = canonicalJson(request.body);
  assert(request.canonical_body === canonicalBody, `${route} canonical body drift`);
  const bodyHash = createHash("sha256").update(canonicalBody).digest("hex");
  assert(request.body_sha256 === bodyHash, `${route} body SHA-256 drift`);
  assert(request.envelope.body_sha256 === bodyHash, `${route} envelope body SHA-256 drift`);
  assert(request.envelope.route === route, `${route} envelope route drift`);
  assert(request.envelope.version === (route === "/v1/upload-intents" ? "3" : "2"), `${route} envelope version drift`);
  const canonicalMessage = messageFields.map((field) => request.envelope[field]).join("\n");
  assert(request.canonical_message === canonicalMessage, `${route} canonical signed message drift`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validate(node, value, path, document) {
  if (node.$ref) {
    const target = node.$ref.split("/").slice(1).reduce((part, key) => part[key], document);
    return validate(target, value, path, document);
  }
  if ("const" in node) assert(equal(value, node.const), `${path} must equal its schema constant`);
  if (node.enum) assert(node.enum.some((item) => equal(value, item)), `${path} is outside its enum`);
  if (node.type === "object") {
    assert(value && typeof value === "object" && !Array.isArray(value), `${path} must be an object`);
    for (const key of node.required ?? []) assert(key in value, `${path}.${key} is required`);
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) assert(key in (node.properties ?? {}), `${path}.${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (key in value) validate(child, value[key], `${path}.${key}`, document);
    }
  } else if (node.type === "array") {
    assert(Array.isArray(value), `${path} must be an array`);
    for (const [index, item] of value.entries()) validate(node.items, item, `${path}[${index}]`, document);
  } else if (node.type === "string") {
    assert(typeof value === "string", `${path} must be a string`);
    if (node.minLength !== undefined) assert(value.length >= node.minLength, `${path} is too short`);
    if (node.pattern) assert(new RegExp(node.pattern, "u").test(value), `${path} has an invalid format`);
  } else if (node.type === "integer") {
    assert(Number.isInteger(value), `${path} must be an integer`);
    if (node.minimum !== undefined) assert(value >= node.minimum, `${path} is below minimum`);
    if (node.maximum !== undefined) assert(value <= node.maximum, `${path} is above maximum`);
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
