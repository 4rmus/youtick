#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";

const SHA256_RE = /^[a-f0-9]{64}$/;
const GIT_SHA_RE = /^[a-f0-9]{40}$/;
const DECIMAL_RE = /^[1-9][0-9]*$/;
const JOB_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const PLACEHOLDER_RE = /<[^>]+>|(^|[-_\s])(placeholder|replace|change[-_\s]?me|todo|dummy)($|[-_\s])/i;
const GENERIC_VALUE_RE = /^(?:example|sample|test)(?:[._:-].*)?$/i;
const MAINNET_USDC_CONTRACT_ID = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const PREVIEW_CONTRACT_IDS = Object.freeze({
  market: "lp-arch-market-v2-260809.youtick-dev-v3.testnet",
  access: "lp-arch-access-v2-260809.youtick-dev-v3.testnet",
});
const PREVIEW_READ_MODEL_ORIGIN = "https://read-preview.youtick.net";
const PAYMENT_ASSET_IDS = new Set([
  "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  "nep141:wrap.near",
  "nep141:usdt.tether-token.near",
]);

const TARGETS = Object.freeze({
  preview: Object.freeze({
    web: Object.freeze({ worker: "youtick-web-preview", domain: "preview.youtick.net" }),
    bridge: Object.freeze({
      worker: "youtick-livepeer-bridge-preview",
      domain: "bridge-preview.youtick.net",
    }),
  }),
  production: Object.freeze({
    web: Object.freeze({ worker: "youtick-web", domain: "app.youtick.net" }),
    bridge: Object.freeze({ worker: "youtick-livepeer-bridge", domain: "bridge.youtick.net" }),
  }),
});

const WEB_KEYS = Object.freeze([
  "NEXT_PUBLIC_NEAR_NETWORK",
  "NEXT_PUBLIC_MARKET_CONTRACT_ID",
  "NEXT_PUBLIC_ACCESS_CONTRACT_ID",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_LIVEPEER_BRIDGE_URL",
  "NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1",
  "NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE",
  "NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS",
  "NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2",
  "NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2",
  "NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL",
  "NEXT_PUBLIC_MARKET_READ_MODEL_URL",
  "NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE",
  "NEXT_PUBLIC_USDC_CONTRACT_ID",
  "NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO",
  "NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO",
]);

const BRIDGE_KEYS = Object.freeze([
  "ALLOWED_ORIGINS",
  "NEAR_NETWORK",
  "MARKET_CONTRACT_ID",
  "ACCESS_CONTRACT_ID",
  "LIVEPEER_PROJECT_ID",
  "LIVEPEER_API_TOKEN_NAME",
  "LIVEPEER_CREATOR_ALLOWLIST",
  "LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS",
  "LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS",
  "LIVEPEER_PAID_MEDIA_OPERATOR_ID",
  "LIVEPEER_JWT_PUBLIC_KEY",
  "LIVEPEER_JWT_ISSUER",
  "NEAR_OPERATOR_ACCOUNT_ID",
  "NEAR_OPERATOR_KEY_EPOCH",
  "NEAR_SPONSOR_RELAYER_ACCOUNT_ID",
  "NEAR_SPONSOR_RELAYER_KEY_EPOCH",
  "CREATOR_FEE_QUOTE_KEY_VERSION",
  "LIVEPEER_BRIDGE_ENABLED",
  "LIVEPEER_NEW_UPLOADS_ENABLED",
  "LIVEPEER_PLAYBACK_ISSUANCE_ENABLED",
  "LIVEPEER_PLAYBACK_V2_ENABLED",
  "LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED",
  "LIVEPEER_WEBHOOK_QUEUE_ENABLED",
  "LIVEPEER_PROVIDER_MUTATIONS_ENABLED",
  "LIVEPEER_OPERATOR_MUTATIONS_ENABLED",
  "LIVEPEER_OPERATOR_JOB_ID",
  "UPLOAD_JOB_ARCHIVE_ENABLED",
  "OPERATOR_OUTBOX_ARCHIVE_ENABLED",
  "LIVEPEER_NEAR_CREATOR_FEE_ENABLED",
  "LIVEPEER_SPONSORED_UPLOADS_ENABLED",
  "LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED",
  "MULTI_ASSET_PAYMENTS_MODE",
  "MULTI_ASSET_PAYMENT_ASSET_IDS",
]);

const OPTIONAL_KEYS = new Set([
  "NEXT_PUBLIC_USDC_CONTRACT_ID",
  "NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO",
  "NEXT_PUBLIC_MARKET_READ_MODEL_URL",
  "LIVEPEER_CREATOR_ALLOWLIST",
  "LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS",
  "LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS",
  "MULTI_ASSET_PAYMENT_ASSET_IDS",
  "NEAR_SPONSOR_RELAYER_ACCOUNT_ID",
  "NEAR_SPONSOR_RELAYER_KEY_EPOCH",
  "LIVEPEER_OPERATOR_JOB_ID",
]);

const FALSE_FLAGS = Object.freeze([
  "NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE",
  "NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2",
  "LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED",
  "LIVEPEER_WEBHOOK_QUEUE_ENABLED",
  "UPLOAD_JOB_ARCHIVE_ENABLED",
  "LIVEPEER_NEAR_CREATOR_FEE_ENABLED",
]);

const RELEASE_FILES = Object.freeze({
  webPreview: "web-preview.tar.gz",
  webProduction: "web-production.tar.gz",
  bridge: "bridge.tar.gz",
  readModel: "read-model.tar.gz",
  previewConfig: "preview-config.json",
  productionConfig: "production-config.json",
});

const CHECKSUM_FILES = Object.freeze([
  RELEASE_FILES.bridge,
  RELEASE_FILES.readModel,
  "manifest.json",
  RELEASE_FILES.previewConfig,
  RELEASE_FILES.productionConfig,
  RELEASE_FILES.webPreview,
  RELEASE_FILES.webProduction,
]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  if (!command) fail("command is required: config, manifest, or verify");

  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const option = tokens[index];
    const value = tokens[index + 1];
    if (!option?.startsWith("--") || value === undefined || value.startsWith("--")) {
      fail(`invalid option near ${option ?? "end of command"}`);
    }
    const name = option.slice(2);
    if (Object.hasOwn(options, name)) fail(`duplicate option --${name}`);
    options[name] = value;
  }
  return { command, options };
}

function option(options, name) {
  const value = options[name]?.trim();
  if (!value) fail(`--${name} is required`);
  return value;
}

function assertOnlyOptions(options, allowed) {
  for (const name of Object.keys(options)) {
    if (!allowed.includes(name)) fail(`unknown option --${name}`);
  }
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} has unexpected fields`);
  }
}

function rejectPlaceholder(value, label) {
  const genericContract =
    (label.endsWith("MARKET_CONTRACT_ID") && value.toLowerCase() === "market.testnet") ||
    (label.endsWith("ACCESS_CONTRACT_ID") && value.toLowerCase() === "access.testnet");
  if (
    PLACEHOLDER_RE.test(value) ||
    GENERIC_VALUE_RE.test(value) ||
    /^(x{3,}|tbd)$/i.test(value) ||
    /example\.com|\.example(?:[./:]|$)/i.test(value) ||
    genericContract
  ) {
    fail(`${label} contains a placeholder`);
  }
}

function normalizeOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS origin`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail(`${label} must be an HTTPS origin without a path, query, or credentials`);
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".workers.dev") ||
    hostname === "youtick.net" ||
    hostname === "www.youtick.net"
  ) {
    fail(`${label} is not an allowed dark-release target`);
  }
  return url.origin;
}

function envValue(environment, key) {
  const name = `${environment.toUpperCase()}_${key}`;
  const value = process.env[name] ?? "";
  if (/\p{Cc}/u.test(value)) fail(`${name} must not contain control characters`);
  if (value !== value.trim()) fail(`${name} must not have leading or trailing whitespace`);
  if (!value && !OPTIONAL_KEYS.has(key)) fail(`${name} must not be empty`);
  if (value) rejectPlaceholder(value, name);
  return value;
}

function buildConfig(environment) {
  if (!Object.hasOwn(TARGETS, environment)) fail("--environment must be preview or production");

  const web = Object.fromEntries(WEB_KEYS.map((key) => [key, envValue(environment, key)]));
  const bridge = Object.fromEntries(BRIDGE_KEYS.map((key) => [key, envValue(environment, key)]));

  for (const flag of FALSE_FLAGS) {
    const value = web[flag] ?? bridge[flag];
    if (value !== "false") fail(`${environment.toUpperCase()}_${flag} must be exactly false`);
  }
  const baseCanaryFlags = [
    web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1,
    bridge.LIVEPEER_BRIDGE_ENABLED,
  ];
  const uploadCanaryFlags = [
    bridge.LIVEPEER_NEW_UPLOADS_ENABLED,
    bridge.LIVEPEER_PROVIDER_MUTATIONS_ENABLED,
  ];
  const playbackCanaryFlags = [
    web.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2,
    bridge.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED,
    bridge.LIVEPEER_PLAYBACK_V2_ENABLED,
  ];
  const closedCanary = [...baseCanaryFlags, ...uploadCanaryFlags, ...playbackCanaryFlags]
    .every((value) => value === "false");
  const uploadCanary = baseCanaryFlags.every((value) => value === "true")
    && uploadCanaryFlags.every((value) => value === "true")
    && playbackCanaryFlags.every((value) => value === "false");
  const playbackCanary = baseCanaryFlags.every((value) => value === "true")
    && uploadCanaryFlags.every((value) => value === "false")
    && playbackCanaryFlags.every((value) => value === "true");
  if (environment === "production" && !closedCanary) {
    fail("PRODUCTION Livepeer canary flags must be exactly false");
  }
  if (environment === "preview" && !closedCanary && !uploadCanary && !playbackCanary) {
    fail("PREVIEW Livepeer canary flags must form a closed, upload-only, or playback-only packet");
  }
  const sponsorCanaryFlags = [
    web.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS,
    bridge.LIVEPEER_SPONSORED_UPLOADS_ENABLED,
    bridge.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED,
    bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED,
  ];
  if (environment === "production" && sponsorCanaryFlags.some((value) => value !== "false")) {
    fail("PRODUCTION sponsor canary flags must be exactly false");
  }
  if (environment === "preview"
      && !(sponsorCanaryFlags.every((value) => value === "false")
        || sponsorCanaryFlags.every((value) => value === "true"))) {
    fail("PREVIEW sponsor canary flags must be all false or all true");
  }
  if (environment === "preview" && sponsorCanaryFlags[0] === "true") {
    if (!uploadCanary) {
      fail("PREVIEW sponsor canary requires upload canary flags");
    }
    const relayer = bridge.NEAR_SPONSOR_RELAYER_ACCOUNT_ID;
    if (!/^[a-z0-9][a-z0-9._-]{0,62}\.testnet$/.test(relayer)
        || [bridge.MARKET_CONTRACT_ID, bridge.ACCESS_CONTRACT_ID, bridge.NEAR_OPERATOR_ACCOUNT_ID]
          .includes(relayer)) {
      fail("PREVIEW sponsor canary requires a separate testnet relayer account");
    }
    if (!DECIMAL_RE.test(bridge.NEAR_SPONSOR_RELAYER_KEY_EPOCH)) {
      fail("PREVIEW sponsor canary requires a positive relayer key epoch");
    }
    if (!JOB_ID_RE.test(bridge.LIVEPEER_OPERATOR_JOB_ID)) {
      fail("PREVIEW sponsor canary requires an exact operator job");
    }
  } else if (bridge.LIVEPEER_OPERATOR_JOB_ID !== "") {
    fail("LIVEPEER_OPERATOR_JOB_ID must be empty outside sponsored Preview");
  }
  if (environment === "preview" && uploadCanary) {
    const creators = bridge.LIVEPEER_CREATOR_ALLOWLIST.split(",");
    const expectedCreators = sponsorCanaryFlags[0] === "true" ? 1 : 2;
    if (creators.length !== expectedCreators
        || new Set(creators).size !== expectedCreators
        || creators.some((creator) => !/^[a-z0-9][a-z0-9._-]{0,62}\.testnet$/.test(creator))) {
      fail(expectedCreators === 1
        ? "PREVIEW sponsored upload canary requires exactly one testnet creator"
        : "PREVIEW multi-creator upload canary requires exactly two distinct testnet creators");
    }
    if (bridge.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS !== "20000000") {
      fail("PREVIEW multi-creator upload canary monthly budget must be exactly 20000000");
    }
    if (bridge.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS !== "2000000") {
      fail("PREVIEW multi-creator upload canary job reservation must be exactly 2000000");
    }
  }
  const operatorArchive = bridge.OPERATOR_OUTBOX_ARCHIVE_ENABLED;
  if (environment === "production" && operatorArchive !== "false") {
    fail("PRODUCTION_OPERATOR_OUTBOX_ARCHIVE_ENABLED must be exactly false");
  }
  if (environment === "preview" && !["false", "true"].includes(operatorArchive)) {
    fail("PREVIEW_OPERATOR_OUTBOX_ARCHIVE_ENABLED must be exactly false or true");
  }
  const derivedReadModel = web.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL;
  if (environment === "production" && derivedReadModel !== "false") {
    fail("PRODUCTION_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL must be exactly false");
  }
  if (environment === "preview" && !["false", "true"].includes(derivedReadModel)) {
    fail("PREVIEW_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL must be exactly false or true");
  }
  if (derivedReadModel === "true") {
    web.NEXT_PUBLIC_MARKET_READ_MODEL_URL = normalizeOrigin(
      web.NEXT_PUBLIC_MARKET_READ_MODEL_URL,
      "NEXT_PUBLIC_MARKET_READ_MODEL_URL",
    );
    if (web.NEXT_PUBLIC_MARKET_READ_MODEL_URL !== PREVIEW_READ_MODEL_ORIGIN) {
      fail(`NEXT_PUBLIC_MARKET_READ_MODEL_URL must be exactly ${PREVIEW_READ_MODEL_ORIGIN}`);
    }
  }
  const paymentMode = web.NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE;
  if (paymentMode !== bridge.MULTI_ASSET_PAYMENTS_MODE) {
    fail("web and Bridge multi-asset payment modes must match");
  }
  const allowedPaymentModes = environment === "preview" ? ["off", "preview"] : ["off"];
  if (!allowedPaymentModes.includes(paymentMode)) {
    fail(`${environment.toUpperCase()} multi-asset payment mode is not allowed`);
  }
  const paymentAssetIds = bridge.MULTI_ASSET_PAYMENT_ASSET_IDS
    .split(",")
    .filter(Boolean);
  if (paymentMode !== "off" && paymentAssetIds.length === 0) {
    fail("MULTI_ASSET_PAYMENT_ASSET_IDS is required when multi-asset payments are enabled");
  }
  if (paymentAssetIds.some((id) => !PAYMENT_ASSET_IDS.has(id))
      || new Set(paymentAssetIds).size !== paymentAssetIds.length) {
    fail("MULTI_ASSET_PAYMENT_ASSET_IDS must use unique supported canonical IDs");
  }

  for (const [name, value] of [
    ["NEXT_PUBLIC_NEAR_NETWORK", web.NEXT_PUBLIC_NEAR_NETWORK],
    ["NEAR_NETWORK", bridge.NEAR_NETWORK],
  ]) {
    if (!["testnet", "mainnet"].includes(value)) fail(`${name} must be exactly testnet or mainnet`);
  }
  if (paymentMode !== "off"
      && (web.NEXT_PUBLIC_NEAR_NETWORK !== "mainnet" || bridge.NEAR_NETWORK !== "mainnet")) {
    fail("multi-asset payments require mainnet");
  }
  if (paymentMode !== "off" && web.NEXT_PUBLIC_USDC_CONTRACT_ID !== MAINNET_USDC_CONTRACT_ID) {
    fail("multi-asset payments require the mainnet Circle USDC contract");
  }
  if (!DECIMAL_RE.test(web.NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO)) {
    fail("NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO must be positive");
  }

  const expectedWebOrigin = `https://${TARGETS[environment].web.domain}`;
  const expectedBridgeOrigin = `https://${TARGETS[environment].bridge.domain}`;
  web.NEXT_PUBLIC_APP_URL = normalizeOrigin(web.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL");
  web.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL = normalizeOrigin(
    web.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL,
    "NEXT_PUBLIC_LIVEPEER_BRIDGE_URL",
  );
  if (web.NEXT_PUBLIC_APP_URL !== expectedWebOrigin) {
    fail(`NEXT_PUBLIC_APP_URL must be exactly ${expectedWebOrigin}`);
  }
  if (web.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL !== expectedBridgeOrigin) {
    fail(`NEXT_PUBLIC_LIVEPEER_BRIDGE_URL must be exactly ${expectedBridgeOrigin}`);
  }

  const allowedOrigins = [
    ...new Set(
      bridge.ALLOWED_ORIGINS.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => normalizeOrigin(entry, "ALLOWED_ORIGINS")),
    ),
  ].sort();
  if (!allowedOrigins.includes(expectedWebOrigin)) {
    fail(`ALLOWED_ORIGINS must contain ${expectedWebOrigin}`);
  }
  bridge.ALLOWED_ORIGINS = allowedOrigins.join(",");
  bridge.LIVEPEER_JWT_ISSUER = normalizeOrigin(bridge.LIVEPEER_JWT_ISSUER, "LIVEPEER_JWT_ISSUER");

  if (web.NEXT_PUBLIC_NEAR_NETWORK !== bridge.NEAR_NETWORK) fail("web and Bridge NEAR_NETWORK must match");
  if (web.NEXT_PUBLIC_MARKET_CONTRACT_ID !== bridge.MARKET_CONTRACT_ID) {
    fail("web and Bridge MARKET_CONTRACT_ID must match");
  }
  if (web.NEXT_PUBLIC_ACCESS_CONTRACT_ID !== bridge.ACCESS_CONTRACT_ID) {
    fail("web and Bridge ACCESS_CONTRACT_ID must match");
  }
  if (environment === "preview") {
    if (web.NEXT_PUBLIC_MARKET_CONTRACT_ID !== PREVIEW_CONTRACT_IDS.market) {
      fail(`PREVIEW_MARKET_CONTRACT_ID must be exactly ${PREVIEW_CONTRACT_IDS.market}`);
    }
    if (web.NEXT_PUBLIC_ACCESS_CONTRACT_ID !== PREVIEW_CONTRACT_IDS.access) {
      fail(`PREVIEW_ACCESS_CONTRACT_ID must be exactly ${PREVIEW_CONTRACT_IDS.access}`);
    }
  }

  for (const key of [
    "NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO",
    "NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO",
    "LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS",
    "LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS",
  ]) {
    const value = web[key] ?? bridge[key];
    if (value && !/^[0-9]+$/.test(value)) fail(`${key} must be an unsigned integer`);
  }
  for (const key of ["NEAR_OPERATOR_KEY_EPOCH", "CREATOR_FEE_QUOTE_KEY_VERSION"]) {
    if (!DECIMAL_RE.test(bridge[key])) fail(`${key} must be a positive integer`);
  }
  if (bridge.NEAR_SPONSOR_RELAYER_KEY_EPOCH
      && !DECIMAL_RE.test(bridge.NEAR_SPONSOR_RELAYER_KEY_EPOCH)) {
    fail("NEAR_SPONSOR_RELAYER_KEY_EPOCH must be a positive integer");
  }

  return {
    schemaVersion: 1,
    environment,
    targets: TARGETS[environment],
    web,
    bridge,
  };
}

function validateConfig(config, environment) {
  assertKeys(config, ["schemaVersion", "environment", "targets", "web", "bridge"], "config");
  if (config.schemaVersion !== 1 || config.environment !== environment) fail(`invalid ${environment} config`);
  assertKeys(config.targets, ["web", "bridge"], "config.targets");
  assertKeys(config.targets.web, ["worker", "domain"], "config.targets.web");
  assertKeys(config.targets.bridge, ["worker", "domain"], "config.targets.bridge");
  if (JSON.stringify(config.targets) !== JSON.stringify(TARGETS[environment])) fail("config targets are not allowed");
  assertKeys(config.web, WEB_KEYS, "config.web");
  assertKeys(config.bridge, BRIDGE_KEYS, "config.bridge");

  const prefix = environment.toUpperCase();
  const previous = {};
  for (const [key, value] of [...Object.entries(config.web), ...Object.entries(config.bridge)]) {
    const name = `${prefix}_${key}`;
    previous[name] = process.env[name];
    process.env[name] = value;
  }
  try {
    if (canonicalJson(buildConfig(environment)) !== canonicalJson(config)) fail(`${environment} config is not canonical`);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function regularFile(path, label) {
  let stats;
  try {
    stats = await lstat(path);
  } catch {
    fail(`${label} does not exist`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`${label} must be a regular file`);
  return stats;
}

async function fileMetadata(path) {
  const stats = await regularFile(path, path);
  const bytes = await readFile(path);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: stats.size,
  };
}

function directReleaseFile(path, outputDir, expectedName, label) {
  const absolute = resolve(path);
  if (dirname(absolute) !== outputDir || basename(absolute) !== expectedName) {
    fail(`${label} must be ${expectedName} directly inside --output-dir`);
  }
  return absolute;
}

async function readCanonicalConfig(path, environment) {
  const text = await readFile(path, "utf8");
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    fail(`${environment} config is not valid JSON`);
  }
  validateConfig(config, environment);
  if (text !== canonicalJson(config)) fail(`${environment} config file is not canonical`);
  return config;
}

async function commandConfig(options) {
  assertOnlyOptions(options, ["environment", "output"]);
  const environment = option(options, "environment");
  const output = resolve(option(options, "output"));
  const config = buildConfig(environment);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, canonicalJson(config), { flag: "w" });
}

async function commandManifest(options) {
  const allowed = [
    "sha",
    "run-id",
    "run-attempt",
    "web-lock",
    "bridge-lock",
    "web-preview",
    "web-production",
    "bridge",
    "read-model",
    "preview-config",
    "production-config",
    "output-dir",
  ];
  assertOnlyOptions(options, allowed);

  const sha = option(options, "sha");
  if (!GIT_SHA_RE.test(sha)) fail("--sha must be an exact lowercase 40-character Git SHA");
  const runId = option(options, "run-id");
  const runAttempt = option(options, "run-attempt");
  if (!DECIMAL_RE.test(runId) || !DECIMAL_RE.test(runAttempt)) fail("CI run ID and attempt must be positive integers");

  const outputDir = resolve(option(options, "output-dir"));
  await mkdir(outputDir, { recursive: true });
  const files = {
    webPreview: directReleaseFile(option(options, "web-preview"), outputDir, RELEASE_FILES.webPreview, "web preview bundle"),
    webProduction: directReleaseFile(
      option(options, "web-production"),
      outputDir,
      RELEASE_FILES.webProduction,
      "web production bundle",
    ),
    bridge: directReleaseFile(option(options, "bridge"), outputDir, RELEASE_FILES.bridge, "Bridge bundle"),
    readModel: directReleaseFile(
      option(options, "read-model"),
      outputDir,
      RELEASE_FILES.readModel,
      "read model bundle",
    ),
    previewConfig: directReleaseFile(
      option(options, "preview-config"),
      outputDir,
      RELEASE_FILES.previewConfig,
      "preview config",
    ),
    productionConfig: directReleaseFile(
      option(options, "production-config"),
      outputDir,
      RELEASE_FILES.productionConfig,
      "production config",
    ),
  };

  await readCanonicalConfig(files.previewConfig, "preview");
  await readCanonicalConfig(files.productionConfig, "production");

  const [webLock, bridgeLock, webPreview, webProduction, bridge, readModel, previewConfig, productionConfig] = await Promise.all([
    fileMetadata(resolve(option(options, "web-lock"))),
    fileMetadata(resolve(option(options, "bridge-lock"))),
    fileMetadata(files.webPreview),
    fileMetadata(files.webProduction),
    fileMetadata(files.bridge),
    fileMetadata(files.readModel),
    fileMetadata(files.previewConfig),
    fileMetadata(files.productionConfig),
  ]);

  const manifest = {
    schemaVersion: 1,
    sha,
    ci: { runId, runAttempt },
    targets: TARGETS,
    lockfiles: {
      web: { path: "apps/web/package-lock.json", ...webLock },
      bridge: { path: "workers/livepeer-bridge/package-lock.json", ...bridgeLock },
    },
    configs: {
      preview: { path: RELEASE_FILES.previewConfig, ...previewConfig },
      production: { path: RELEASE_FILES.productionConfig, ...productionConfig },
    },
    bundles: {
      webPreview: { path: RELEASE_FILES.webPreview, ...webPreview },
      webProduction: { path: RELEASE_FILES.webProduction, ...webProduction },
      bridge: { path: RELEASE_FILES.bridge, ...bridge },
      readModel: { path: RELEASE_FILES.readModel, ...readModel },
    },
  };

  const manifestPath = resolve(outputDir, "manifest.json");
  await writeFile(manifestPath, canonicalJson(manifest), { flag: "w" });
  const checksumPaths = Object.fromEntries(
    CHECKSUM_FILES.map((name) => [name, resolve(outputDir, name)]),
  );
  const checksums = await Promise.all(
    CHECKSUM_FILES.map(async (name) => `${(await fileMetadata(checksumPaths[name])).sha256}  ${name}`),
  );
  await writeFile(resolve(outputDir, "SHA256SUMS"), `${checksums.join("\n")}\n`, { flag: "w" });
}

function validateFileRecord(record, expectedPath, label) {
  assertKeys(record, ["path", "sha256", "bytes"], label);
  if (record.path !== expectedPath || !SHA256_RE.test(record.sha256)) fail(`${label} is invalid`);
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) fail(`${label}.bytes is invalid`);
}

async function readChecksums(path) {
  const text = await readFile(path, "utf8");
  const lines = text.trimEnd().split("\n");
  const entries = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!match) fail("SHA256SUMS contains an invalid or traversing path");
    if (entries.has(match[2])) fail("SHA256SUMS contains a duplicate path");
    entries.set(match[2], match[1]);
  }
  if (entries.size !== CHECKSUM_FILES.length || CHECKSUM_FILES.some((name) => !entries.has(name))) {
    fail("SHA256SUMS does not contain the exact release file set");
  }
  const canonical = `${CHECKSUM_FILES.map((name) => `${entries.get(name)}  ${name}`).join("\n")}\n`;
  if (text !== canonical) fail("SHA256SUMS is not canonical");
  return entries;
}

async function commandVerify(options) {
  assertOnlyOptions(options, ["artifact-dir", "sha", "web-lock", "bridge-lock"]);
  const artifactDir = resolve(option(options, "artifact-dir"));
  const expectedSha = option(options, "sha");
  if (!GIT_SHA_RE.test(expectedSha)) fail("--sha must be an exact lowercase 40-character Git SHA");

  const checksumPath = directReleaseFile(
    resolve(artifactDir, "SHA256SUMS"),
    artifactDir,
    "SHA256SUMS",
    "checksum file",
  );
  await regularFile(checksumPath, "SHA256SUMS");
  const checksums = await readChecksums(checksumPath);
  for (const name of CHECKSUM_FILES) {
    const path = directReleaseFile(resolve(artifactDir, name), artifactDir, name, name);
    const actual = await fileMetadata(path);
    if (actual.sha256 !== checksums.get(name)) fail(`${name} checksum mismatch`);
  }

  const manifestText = await readFile(resolve(artifactDir, "manifest.json"), "utf8");
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    fail("manifest.json is not valid JSON");
  }
  assertKeys(manifest, ["schemaVersion", "sha", "ci", "targets", "lockfiles", "configs", "bundles"], "manifest");
  if (manifestText !== canonicalJson(manifest)) fail("manifest.json is not canonical");
  if (manifest.schemaVersion !== 1 || manifest.sha !== expectedSha) fail("manifest SHA does not match the requested SHA");
  assertKeys(manifest.ci, ["runId", "runAttempt"], "manifest.ci");
  if (!DECIMAL_RE.test(manifest.ci.runId) || !DECIMAL_RE.test(manifest.ci.runAttempt)) fail("manifest CI identity is invalid");
  if (JSON.stringify(manifest.targets) !== JSON.stringify(TARGETS)) fail("manifest targets are not allowed");

  assertKeys(manifest.lockfiles, ["web", "bridge"], "manifest.lockfiles");
  assertKeys(manifest.configs, ["preview", "production"], "manifest.configs");
  assertKeys(manifest.bundles, ["webPreview", "webProduction", "bridge", "readModel"], "manifest.bundles");
  validateFileRecord(manifest.lockfiles.web, "apps/web/package-lock.json", "manifest.lockfiles.web");
  validateFileRecord(
    manifest.lockfiles.bridge,
    "workers/livepeer-bridge/package-lock.json",
    "manifest.lockfiles.bridge",
  );
  validateFileRecord(manifest.configs.preview, RELEASE_FILES.previewConfig, "manifest.configs.preview");
  validateFileRecord(manifest.configs.production, RELEASE_FILES.productionConfig, "manifest.configs.production");
  validateFileRecord(manifest.bundles.webPreview, RELEASE_FILES.webPreview, "manifest.bundles.webPreview");
  validateFileRecord(
    manifest.bundles.webProduction,
    RELEASE_FILES.webProduction,
    "manifest.bundles.webProduction",
  );
  validateFileRecord(manifest.bundles.bridge, RELEASE_FILES.bridge, "manifest.bundles.bridge");
  validateFileRecord(manifest.bundles.readModel, RELEASE_FILES.readModel, "manifest.bundles.readModel");

  await readCanonicalConfig(resolve(artifactDir, RELEASE_FILES.previewConfig), "preview");
  await readCanonicalConfig(resolve(artifactDir, RELEASE_FILES.productionConfig), "production");

  const records = [
    [manifest.lockfiles.web, resolve(option(options, "web-lock"))],
    [manifest.lockfiles.bridge, resolve(option(options, "bridge-lock"))],
    [manifest.configs.preview, resolve(artifactDir, RELEASE_FILES.previewConfig)],
    [manifest.configs.production, resolve(artifactDir, RELEASE_FILES.productionConfig)],
    [manifest.bundles.webPreview, resolve(artifactDir, RELEASE_FILES.webPreview)],
    [manifest.bundles.webProduction, resolve(artifactDir, RELEASE_FILES.webProduction)],
    [manifest.bundles.bridge, resolve(artifactDir, RELEASE_FILES.bridge)],
    [manifest.bundles.readModel, resolve(artifactDir, RELEASE_FILES.readModel)],
  ];
  for (const [record, path] of records) {
    const actual = await fileMetadata(path);
    if (record.sha256 !== actual.sha256 || record.bytes !== actual.bytes) fail(`${record.path} does not match manifest`);
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "config") await commandConfig(options);
  else if (command === "manifest") await commandManifest(options);
  else if (command === "verify") await commandVerify(options);
  else fail(`unknown command ${command}`);
}

main().catch((error) => {
  console.error(`release-metadata: ${error.message}`);
  process.exitCode = 1;
});
