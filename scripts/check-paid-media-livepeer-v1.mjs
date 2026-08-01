import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

const planPath = resolve(root, "docs/architecture/near-livepeer-paid-media-implementation-plan.md");
const oldPlanPath = resolve(root, "docs/architecture/decentralized-paid-media-v4-plan.md");
const evaluationPath = resolve(root, "near-livepeer-serverless-paid-media-evaluation.md");
const adrPath = resolve(root, "docs/adr/adr-010-livepeer-paid-media.md");
const docsIndexPath = resolve(root, "docs/README.md");
const architectureIndexPath = resolve(root, "docs/architecture/README.md");
const marketReadmePath = resolve(root, "contracts/nft-ticket/README.md");
const accessReadmePath = resolve(root, "contracts/access-control/README.md");
const plan = readFileSync(planPath, "utf8");
const oldPlan = readFileSync(oldPlanPath, "utf8");
const evaluation = readFileSync(evaluationPath, "utf8");
const docsIndex = readFileSync(docsIndexPath, "utf8");
const architectureIndex = readFileSync(architectureIndexPath, "utf8");
assert(plan.includes("This is the only active target plan"), "canonical target marker missing");
assert(oldPlan.includes("SUPERSEDED / CODE_ONLY / NOT_DEPLOYED"), "old target is not marked superseded");
assert(evaluation.includes("SOURCE_EVALUATION / SUPERSEDED_BY_ADR_010 / NOT_DEPLOYED"), "evaluation truth marker mismatch");
assert(docsIndex.includes("NEAR + Livepeer Paid Media v1 Plan"), "docs index target link missing");
assert(architectureIndex.includes("near-livepeer-paid-media-implementation-plan.md"), "architecture target link missing");
for (const file of [marketReadmePath, accessReadmePath]) {
  assert(readFileSync(file, "utf8").includes("V4 SUPERSEDED / CODE ONLY / NOT DEPLOYED"), `${file.slice(root.length + 1)} target marker mismatch`);
}

const evaluationHash = createHash("sha256").update(evaluation).digest("hex");
assert(plan.includes(`SHA-256\n\`${evaluationHash}\``), "source evaluation SHA-256 drift");

for (const file of [planPath, oldPlanPath, evaluationPath, adrPath, docsIndexPath, architectureIndexPath, resolve(protocolDir, "README.md")]) {
  checkLocalLinks(file);
}

console.log("paid-media-livepeer-v1 protocol: OK");

function checkRequest(request, route) {
  const canonicalBody = canonicalJson(request.body);
  assert(request.canonical_body === canonicalBody, `${route} canonical body drift`);
  const bodyHash = createHash("sha256").update(canonicalBody).digest("hex");
  assert(request.body_sha256 === bodyHash, `${route} body SHA-256 drift`);
  assert(request.envelope.body_sha256 === bodyHash, `${route} envelope body SHA-256 drift`);
  assert(request.envelope.route === route, `${route} envelope route drift`);
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

function checkLocalLinks(file) {
  const markdown = readFileSync(file, "utf8");
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1].split(/[?#]/, 1)[0];
    if (!href || /^(https?:|mailto:)/.test(href)) continue;
    const target = resolve(dirname(file), decodeURIComponent(href));
    assert(existsSync(target), `${file.slice(root.length + 1)} has dead link: ${match[1]}`);
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
