import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI = resolve(import.meta.dirname, "release-metadata.mjs");
const REPO_ROOT = resolve(import.meta.dirname, "..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("PREVIEW_") && !name.startsWith("PRODUCTION_")),
);

function publicEnv(environment) {
  const prefix = environment.toUpperCase();
  const webOrigin = environment === "preview" ? "https://preview.youtick.net" : "https://app.youtick.net";
  const bridgeOrigin =
    environment === "preview" ? "https://bridge-preview.youtick.net" : "https://bridge.youtick.net";
  const marketContractId = environment === "preview"
    ? "lp-arch-market-v2-260809.youtick-dev-v3.testnet"
    : "paid-media-v1.testnet";
  const accessContractId = environment === "preview"
    ? "lp-arch-access-v2-260809.youtick-dev-v3.testnet"
    : "ticket-access-v1.testnet";
  const values = {
    NEXT_PUBLIC_NEAR_NETWORK: "testnet",
    NEXT_PUBLIC_MARKET_CONTRACT_ID: marketContractId,
    NEXT_PUBLIC_ACCESS_CONTRACT_ID: accessContractId,
    NEXT_PUBLIC_APP_URL: webOrigin,
    NEXT_PUBLIC_LIVEPEER_BRIDGE_URL: bridgeOrigin,
    NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1: "false",
    NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE: "false",
    NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS: "false",
    NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2: "false",
    NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2: "false",
    NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL: "false",
    NEXT_PUBLIC_MARKET_READ_MODEL_URL: "",
    NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE: "off",
    NEXT_PUBLIC_USDC_CONTRACT_ID: "usdc.testnet",
    NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO: "1",
    NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO: "1",
    ALLOWED_ORIGINS: webOrigin,
    NEAR_NETWORK: "testnet",
    MARKET_CONTRACT_ID: marketContractId,
    ACCESS_CONTRACT_ID: accessContractId,
    LIVEPEER_PROJECT_ID: "project-123",
    LIVEPEER_API_TOKEN_NAME: "release-token",
    LIVEPEER_CREATOR_ALLOWLIST: "",
    LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: "1000000",
    LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: "1000",
    LIVEPEER_PAID_MEDIA_OPERATOR_ID: "operator.testnet",
    LIVEPEER_JWT_PUBLIC_KEY: "public-key-material",
    LIVEPEER_JWT_ISSUER: webOrigin,
    NEAR_OPERATOR_ACCOUNT_ID: "bridge.testnet",
    NEAR_OPERATOR_KEY_EPOCH: "1",
    NEAR_SPONSOR_RELAYER_ACCOUNT_ID: "",
    NEAR_SPONSOR_RELAYER_KEY_EPOCH: "",
    CREATOR_FEE_QUOTE_KEY_VERSION: "1",
    LIVEPEER_BRIDGE_ENABLED: "false",
    LIVEPEER_NEW_UPLOADS_ENABLED: "false",
    LIVEPEER_PLAYBACK_ISSUANCE_ENABLED: "false",
    LIVEPEER_PLAYBACK_V2_ENABLED: "false",
    LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED: "false",
    LIVEPEER_WEBHOOK_QUEUE_ENABLED: "false",
    LIVEPEER_PROVIDER_MUTATIONS_ENABLED: "false",
    LIVEPEER_OPERATOR_MUTATIONS_ENABLED: "false",
    LIVEPEER_OPERATOR_JOB_ID: "",
    UPLOAD_JOB_ARCHIVE_ENABLED: "false",
    OPERATOR_OUTBOX_ARCHIVE_ENABLED: "false",
    LIVEPEER_NEAR_CREATOR_FEE_ENABLED: "false",
    LIVEPEER_SPONSORED_UPLOADS_ENABLED: "false",
    LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED: "false",
    MULTI_ASSET_PAYMENTS_MODE: "off",
    MULTI_ASSET_PAYMENT_ASSET_IDS: "",
  };
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [`${prefix}_${name}`, value]));
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...CLEAN_ENV, ...env },
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, result.stderr);
}

function makeRelease() {
  const root = mkdtempSync(join(tmpdir(), "youtick-release-metadata-"));
  const artifactDir = join(root, "release");
  const webLock = join(root, "web-package-lock.json");
  const bridgeLock = join(root, "bridge-package-lock.json");
  const previewConfig = join(artifactDir, "preview-config.json");
  const productionConfig = join(artifactDir, "production-config.json");

  writeFileSync(join(root, ".keep"), "");
  assertSuccess(run(["config", "--environment", "preview", "--output", previewConfig], publicEnv("preview")));
  assertSuccess(
    run(["config", "--environment", "production", "--output", productionConfig], publicEnv("production")),
  );
  writeFileSync(webLock, "web lock\n");
  writeFileSync(bridgeLock, "bridge lock\n");
  writeFileSync(join(artifactDir, "web-preview.tar.gz"), "preview bundle\n");
  writeFileSync(join(artifactDir, "web-production.tar.gz"), "production bundle\n");
  writeFileSync(join(artifactDir, "bridge.tar.gz"), "bridge bundle\n");
  writeFileSync(join(artifactDir, "read-model.tar.gz"), "read model bundle\n");

  const manifestArgs = [
    "manifest",
    "--sha",
    SHA,
    "--run-id",
    "12345",
    "--run-attempt",
    "1",
    "--web-lock",
    webLock,
    "--bridge-lock",
    bridgeLock,
    "--web-preview",
    join(artifactDir, "web-preview.tar.gz"),
    "--web-production",
    join(artifactDir, "web-production.tar.gz"),
    "--bridge",
    join(artifactDir, "bridge.tar.gz"),
    "--read-model",
    join(artifactDir, "read-model.tar.gz"),
    "--preview-config",
    previewConfig,
    "--production-config",
    productionConfig,
    "--output-dir",
    artifactDir,
  ];
  assertSuccess(run(manifestArgs));
  return { artifactDir, webLock, bridgeLock, manifestArgs };
}

test("workflows keep cumulative Preview release provenance", () => {
  const ci = readFileSync(join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");
  const preview = readFileSync(join(REPO_ROOT, ".github/workflows/deploy-preview.yml"), "utf8");
  const promote = readFileSync(join(REPO_ROOT, ".github/workflows/promote-production.yml"), "utf8");
  const gate = ci.slice(ci.indexOf("  ci-gate:"));

  assert.match(gate, /- name: Test release tooling/);
  assert.doesNotMatch(ci, /release-signal/);
  assert.match(preview, /vars\.DEPLOY_PREVIEW_ENABLED == 'true'/);
  assert.match(preview, /gh api --paginate --slurp/);
  assert.match(preview, /\.path == "\.github\/workflows\/deploy-preview\.yml"/);
  assert.match(preview, /git merge-base --is-ancestor "\$\{candidate_sha\}" "\$\{SHA\}"/);
  assert.match(preview, /git diff --name-only -z "\$\{baseline\}" "\$\{SHA\}"/);
  assert.match(
    preview,
    /if \[\[ "\$\{PREVIEW_LIVEPEER_BRIDGE_ENABLED\}" == "true" \]\]; then\s+deploy=true\s+echo "Preview Livepeer canary enabled; building current main \$\{SHA\}\."/,
  );
  assert.match(
    preview,
    /elif \[\[ "\$\{baseline\}" == "\$\{SHA\}" \]\] \\\s+&& \[\[ "\$\{PREVIEW_OPERATOR_OUTBOX_ARCHIVE_ENABLED\}" == "false" \]\]; then\s+deploy=true\s+echo "Explicit closed Preview redeploy requested for current main \$\{SHA\}\."\s+elif \[\[ -z "\$\{baseline\}" \]\]; then/,
  );
  assert.match(preview, /apps\/web\/\*\|workers\/livepeer-bridge\/\*\|read-model\/\*/);
  assert.match(preview, /contracts\/\*\|scripts\/check-paid-media-livepeer-v1-abi\.mjs\|docs\/\*/);
  assert.match(preview, /cloudflare-release\.mjs write-bridge-wrangler/);
  assert.match(preview, /cloudflare-release\.mjs write-read-model-wrangler/);
  assert.match(preview, /--read-model "\$\{RUNNER_TEMP\}\/release\/read-model\.tar\.gz"/);
  assert.match(
    preview,
    /LIVEPEER_JWT_PRIVATE_KEY: \$\{\{ secrets\.PREVIEW_LIVEPEER_JWT_PRIVATE_KEY \}\}/,
  );
  assert.match(preview, /PREVIEW_SPONSORED_UPLOAD_CANARY_ENABLED/);
  assert.match(
    preview,
    /PREVIEW_LIVEPEER_OPERATOR_JOB_ID: \$\{\{ vars\.PREVIEW_SPONSORED_UPLOAD_CANARY_ENABLED == 'true' && vars\.PREVIEW_LIVEPEER_OPERATOR_JOB_ID \|\| '' \}\}/,
  );
  assert.match(preview, /PREVIEW_CREATOR_FEE_QUOTE_PRIVATE_KEY/);
  assert.match(preview, /PREVIEW_NEAR_SPONSOR_RELAYER_PRIVATE_KEY/);
  assert.match(preview, /PREVIEW_NEAR_SPONSOR_RELAYER_ACCOUNT_ID/);
  assert.match(preview, /PREVIEW_NEAR_SPONSOR_RELAYER_KEY_EPOCH/);
  assert.match(
    preview,
    /PREVIEW_OPERATOR_OUTBOX_ARCHIVE_ENABLED: \$\{\{ vars\.PREVIEW_OPERATOR_OUTBOX_ARCHIVE_ENABLED \}\}/,
  );
  for (const name of [
    "PREVIEW_NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1",
    "PREVIEW_LIVEPEER_BRIDGE_ENABLED",
    "PREVIEW_LIVEPEER_NEW_UPLOADS_ENABLED",
    "PREVIEW_LIVEPEER_PROVIDER_MUTATIONS_ENABLED",
  ]) {
    assert.match(
      preview,
      new RegExp(`${name}: .*PREVIEW_MULTI_CREATOR_UPLOAD_CANARY_ENABLED.*PREVIEW_SPONSORED_UPLOAD_CANARY_ENABLED`),
    );
  }
  assert.doesNotMatch(promote, /PREVIEW_MULTI_CREATOR_UPLOAD_CANARY_ENABLED/);
  assert.match(preview, /PRODUCTION_OPERATOR_OUTBOX_ARCHIVE_ENABLED: "false"/);
  assert.match(preview, /PRODUCTION_LIVEPEER_OPERATOR_JOB_ID: ""/);
  for (const name of [
    "PRODUCTION_NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS",
    "PRODUCTION_LIVEPEER_SPONSORED_UPLOADS_ENABLED",
    "PRODUCTION_LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED",
  ]) assert.match(preview, new RegExp(`${name}: "false"`));
  assert.doesNotMatch(promote, /SPONSORED_UPLOAD_CANARY|NEAR_SPONSOR_RELAYER_PRIVATE_KEY/);
  assert.doesNotMatch(preview, /cp workers\/livepeer-bridge\/wrangler\.toml/);
});

test("config emits only canonical public values", () => {
  const root = mkdtempSync(join(tmpdir(), "youtick-release-config-"));
  const output = join(root, "preview-config.json");
  const secret = "do-not-publish-this-secret";
  const env = {
    ...publicEnv("preview"),
    PREVIEW_LIVEPEER_API_KEY: secret,
    PREVIEW_NEAR_RPC_URL: "https://secret-rpc.invalid/token",
  };

  assertSuccess(run(["config", "--environment", "preview", "--output", output], env));
  const text = readFileSync(output, "utf8");
  const config = JSON.parse(text);
  assert.equal(config.targets.web.worker, "youtick-web-preview");
  assert.equal(config.targets.bridge.domain, "bridge-preview.youtick.net");
  assert.equal(
    config.web.NEXT_PUBLIC_MARKET_CONTRACT_ID,
    "lp-arch-market-v2-260809.youtick-dev-v3.testnet",
  );
  assert.equal(
    config.bridge.ACCESS_CONTRACT_ID,
    "lp-arch-access-v2-260809.youtick-dev-v3.testnet",
  );
  assert.equal(config.web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1, "false");
  assert.equal(config.web.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2, "false");
  assert.equal(config.web.NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2, "false");
  assert.equal(config.web.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL, "false");
  assert.equal(config.bridge.LIVEPEER_BRIDGE_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_NEW_UPLOADS_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_PLAYBACK_V2_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_WEBHOOK_QUEUE_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_PROVIDER_MUTATIONS_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED, "false");
  assert.equal(config.bridge.LIVEPEER_OPERATOR_JOB_ID, "");
  assert.equal(config.bridge.UPLOAD_JOB_ARCHIVE_ENABLED, "false");
  assert.equal(config.bridge.OPERATOR_OUTBOX_ARCHIVE_ENABLED, "false");
  assert.equal(config.web.NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE, "off");
  assert.equal(text, `${JSON.stringify(config, null, 2)}\n`);
  assert.doesNotMatch(text, /API_KEY|NEAR_RPC_URL|secret-rpc/);
  assert.ok(!text.includes(secret));
  assert.ok(!text.includes(createHash("sha256").update(secret).digest("hex")));
});

test("config rejects placeholders and enforces release flag policy", async (t) => {
  await t.test("noncanonical Preview contract IDs", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MARKET_CONTRACT_ID = "ytlp-pv-market-32a01cc.testnet";
    env.PREVIEW_MARKET_CONTRACT_ID = "ytlp-pv-market-32a01cc.testnet";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PREVIEW_MARKET_CONTRACT_ID must be exactly lp-arch-market-v2-260809/);
  });

  await t.test("placeholder", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MARKET_CONTRACT_ID = "<replace-with-market-contract>";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /placeholder/);
  });

  await t.test("generic contract ID", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MARKET_CONTRACT_ID = "market.testnet";
    env.PREVIEW_MARKET_CONTRACT_ID = "market.testnet";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /placeholder/);
  });

  await t.test("example value", () => {
    const env = publicEnv("preview");
    env.PREVIEW_LIVEPEER_JWT_ISSUER = "https://issuer.example.com";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /placeholder/);
  });

  await t.test("generic provider value", () => {
    const env = publicEnv("preview");
    env.PREVIEW_LIVEPEER_PROJECT_ID = "example";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /placeholder/);
  });

  await t.test("generic account value", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MARKET_CONTRACT_ID = "example.testnet";
    env.PREVIEW_MARKET_CONTRACT_ID = "example.testnet";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /placeholder/);
  });

  await t.test("true feature flag", () => {
    const env = publicEnv("production");
    env.PRODUCTION_LIVEPEER_BRIDGE_ENABLED = "true";
    const result = run(
      ["config", "--environment", "production", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly false/);
  });

  for (const flag of [
    "NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS",
    "LIVEPEER_SPONSORED_UPLOADS_ENABLED",
    "LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED",
  ]) {
    await t.test(`true ${flag}`, () => {
      const env = publicEnv("preview");
      env[`PREVIEW_${flag}`] = "true";
      const result = run(
        ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
        env,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /sponsor canary flags must be all false or all true/);
    });
  }

  await t.test("complete Preview sponsored upload canary packet", () => {
    const output = join(tmpdir(), "preview-sponsored-upload-config.json");
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = "true";
    env.PREVIEW_LIVEPEER_BRIDGE_ENABLED = "true";
    env.PREVIEW_LIVEPEER_NEW_UPLOADS_ENABLED = "true";
    env.PREVIEW_LIVEPEER_PROVIDER_MUTATIONS_ENABLED = "true";
    env.PREVIEW_LIVEPEER_OPERATOR_MUTATIONS_ENABLED = "true";
    env.PREVIEW_NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS = "true";
    env.PREVIEW_LIVEPEER_SPONSORED_UPLOADS_ENABLED = "true";
    env.PREVIEW_LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED = "true";
    env.PREVIEW_NEAR_SPONSOR_RELAYER_ACCOUNT_ID = "sponsor-relayer.testnet";
    env.PREVIEW_NEAR_SPONSOR_RELAYER_KEY_EPOCH = "1";
    env.PREVIEW_LIVEPEER_CREATOR_ALLOWLIST = "creator-one.testnet";
    env.PREVIEW_LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS = "20000000";
    env.PREVIEW_LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS = "2000000";
    let result = run(["config", "--environment", "preview", "--output", output], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exact operator job/);
    env.PREVIEW_LIVEPEER_OPERATOR_JOB_ID = "job-recovery";
    result = run(["config", "--environment", "preview", "--output", output], env);
    assertSuccess(result);
    const config = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(config.web.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS, "true");
    assert.equal(config.bridge.LIVEPEER_SPONSORED_UPLOADS_ENABLED, "true");
    assert.equal(config.bridge.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED, "true");
    assert.equal(config.bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED, "true");
    assert.equal(config.bridge.LIVEPEER_OPERATOR_JOB_ID, "job-recovery");
    assert.equal(config.bridge.NEAR_SPONSOR_RELAYER_ACCOUNT_ID, "sponsor-relayer.testnet");
    assert.equal(config.bridge.NEAR_SPONSOR_RELAYER_KEY_EPOCH, "1");
  });

  await t.test("operator job outside sponsored Preview", () => {
    for (const environment of ["preview", "production"]) {
      const env = publicEnv(environment);
      env[`${environment.toUpperCase()}_LIVEPEER_OPERATOR_JOB_ID`] = "job-recovery";
      const result = run(
        ["config", "--environment", environment, "--output", join(tmpdir(), "unused-config.json")],
        env,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /must be empty outside sponsored Preview/);
    }
  });

  await t.test("Preview derived read model at its exact origin", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = "true";
    env.PREVIEW_NEXT_PUBLIC_MARKET_READ_MODEL_URL = "https://read-preview.youtick.net";
    const output = join(tmpdir(), "preview-read-model-config.json");
    const result = run(["config", "--environment", "preview", "--output", output], env);
    assertSuccess(result);
    const config = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(config.web.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL, "true");
    assert.equal(config.web.NEXT_PUBLIC_MARKET_READ_MODEL_URL, "https://read-preview.youtick.net");
  });

  await t.test("Preview derived read model at another origin", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = "true";
    env.PREVIEW_NEXT_PUBLIC_MARKET_READ_MODEL_URL = "https://other.youtick.net";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be exactly https:\/\/read-preview\.youtick\.net/);
  });

  await t.test("Production derived read model", () => {
    const env = publicEnv("production");
    env.PRODUCTION_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = "true";
    env.PRODUCTION_NEXT_PUBLIC_MARKET_READ_MODEL_URL = "https://read-preview.youtick.net";
    const result = run(
      ["config", "--environment", "production", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PRODUCTION_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL must be exactly false/);
  });

  await t.test("true upload archive flag", () => {
    const env = publicEnv("preview");
    env.PREVIEW_UPLOAD_JOB_ARCHIVE_ENABLED = "true";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly false/);
  });

  await t.test("partial Preview upload canary flags", () => {
    const env = publicEnv("preview");
    env.PREVIEW_LIVEPEER_NEW_UPLOADS_ENABLED = "true";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be all false or all true/);
  });

  for (const flag of [
    "NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2",
    "NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2",
    "LIVEPEER_PLAYBACK_V2_ENABLED",
    "LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED",
    "LIVEPEER_WEBHOOK_QUEUE_ENABLED",
  ]) {
    await t.test(`true ${flag}`, () => {
      const env = publicEnv("preview");
      env[`PREVIEW_${flag}`] = "true";
      const result = run(
        ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
        env,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /exactly false/);
    });
  }

  await t.test("true playback-issuance flag", () => {
    const env = publicEnv("preview");
    env.PREVIEW_LIVEPEER_PLAYBACK_ISSUANCE_ENABLED = "true";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly false/);
  });

  await t.test("partial Preview provider-mutation flag", () => {
    const env = publicEnv("preview");
    env.PREVIEW_LIVEPEER_PROVIDER_MUTATIONS_ENABLED = "true";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be all false or all true/);
  });

  await t.test("complete Preview multi-creator upload canary packet", () => {
    const output = join(tmpdir(), "preview-multi-creator-upload-config.json");
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = "true";
    env.PREVIEW_LIVEPEER_BRIDGE_ENABLED = "true";
    env.PREVIEW_LIVEPEER_NEW_UPLOADS_ENABLED = "true";
    env.PREVIEW_LIVEPEER_PROVIDER_MUTATIONS_ENABLED = "true";
    env.PREVIEW_LIVEPEER_CREATOR_ALLOWLIST = "creator-one.testnet,creator-two.testnet";
    env.PREVIEW_LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS = "20000000";
    env.PREVIEW_LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS = "2000000";
    const result = run(["config", "--environment", "preview", "--output", output], env);
    assertSuccess(result);
    const config = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(config.web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1, "true");
    assert.equal(config.bridge.LIVEPEER_BRIDGE_ENABLED, "true");
    assert.equal(config.bridge.LIVEPEER_NEW_UPLOADS_ENABLED, "true");
    assert.equal(config.bridge.LIVEPEER_PROVIDER_MUTATIONS_ENABLED, "true");
  });

  await t.test("Preview upload canary rejects one creator", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = "true";
    env.PREVIEW_LIVEPEER_BRIDGE_ENABLED = "true";
    env.PREVIEW_LIVEPEER_NEW_UPLOADS_ENABLED = "true";
    env.PREVIEW_LIVEPEER_PROVIDER_MUTATIONS_ENABLED = "true";
    env.PREVIEW_LIVEPEER_CREATOR_ALLOWLIST = "creator-one.testnet";
    env.PREVIEW_LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS = "20000000";
    env.PREVIEW_LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS = "2000000";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires exactly two distinct testnet creators/);
  });

  for (const [label, name, value, error] of [
    [
      "duplicate creators",
      "PREVIEW_LIVEPEER_CREATOR_ALLOWLIST",
      "creator-one.testnet,creator-one.testnet",
      /requires exactly two distinct testnet creators/,
    ],
    [
      "wrong monthly budget",
      "PREVIEW_LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS",
      "20000001",
      /monthly budget must be exactly 20000000/,
    ],
    [
      "wrong job reservation",
      "PREVIEW_LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS",
      "2000001",
      /job reservation must be exactly 2000000/,
    ],
  ]) {
    await t.test(`Preview upload canary rejects ${label}`, () => {
      const env = publicEnv("preview");
      env.PREVIEW_NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = "true";
      env.PREVIEW_LIVEPEER_BRIDGE_ENABLED = "true";
      env.PREVIEW_LIVEPEER_NEW_UPLOADS_ENABLED = "true";
      env.PREVIEW_LIVEPEER_PROVIDER_MUTATIONS_ENABLED = "true";
      env.PREVIEW_LIVEPEER_CREATOR_ALLOWLIST = "creator-one.testnet,creator-two.testnet";
      env.PREVIEW_LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS = "20000000";
      env.PREVIEW_LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS = "2000000";
      env[name] = value;
      const result = run(
        ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
        env,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
    });
  }

  await t.test("true operator-mutation flag", () => {
    const env = publicEnv("preview");
    env.PREVIEW_LIVEPEER_OPERATOR_MUTATIONS_ENABLED = "true";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sponsor canary flags must be all false or all true/);
  });

  await t.test("true Production operator-mutation flag", () => {
    const env = publicEnv("production");
    env.PRODUCTION_LIVEPEER_OPERATOR_MUTATIONS_ENABLED = "true";
    const result = run(
      ["config", "--environment", "production", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PRODUCTION sponsor canary flags must be exactly false/);
  });

  await t.test("true Preview operator archive flag", () => {
    const output = join(tmpdir(), "preview-operator-archive-config.json");
    const env = publicEnv("preview");
    env.PREVIEW_OPERATOR_OUTBOX_ARCHIVE_ENABLED = "true";
    const result = run(
      ["config", "--environment", "preview", "--output", output],
      env,
    );
    assertSuccess(result);
    const config = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(config.bridge.OPERATOR_OUTBOX_ARCHIVE_ENABLED, "true");
  });

  await t.test("true Production operator archive flag", () => {
    const env = publicEnv("production");
    env.PRODUCTION_OPERATOR_OUTBOX_ARCHIVE_ENABLED = "true";
    const result = run(
      ["config", "--environment", "production", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly false/);
  });

  await t.test("production payment preview mode", () => {
    const env = publicEnv("production");
    env.PRODUCTION_NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PRODUCTION_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PRODUCTION_MULTI_ASSET_PAYMENT_ASSET_IDS = "nep141:wrap.near";
    const result = run(
      ["config", "--environment", "production", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /mode is not allowed/);
  });

  await t.test("preview payment mode without assets", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PREVIEW_MULTI_ASSET_PAYMENTS_MODE = "preview";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ASSET_IDS is required/);
  });

  await t.test("valid mainnet dry-quote preview", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PREVIEW_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PREVIEW_NEXT_PUBLIC_NEAR_NETWORK = "mainnet";
    env.PREVIEW_NEAR_NETWORK = "mainnet";
    env.PREVIEW_NEXT_PUBLIC_USDC_CONTRACT_ID =
      "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
    env.PREVIEW_MULTI_ASSET_PAYMENT_ASSET_IDS =
      "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
    assertSuccess(run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "payment-preview.json")],
      env,
    ));
  });

  await t.test("payment preview on testnet", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PREVIEW_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PREVIEW_MULTI_ASSET_PAYMENT_ASSET_IDS = "nep141:wrap.near";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /require mainnet/);
  });

  await t.test("unsupported payment asset", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PREVIEW_MULTI_ASSET_PAYMENTS_MODE = "preview";
    env.PREVIEW_MULTI_ASSET_PAYMENT_ASSET_IDS = "nep141:unknown.near";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /supported canonical IDs/);
  });

  await t.test("public target", () => {
    const env = publicEnv("preview");
    env.PREVIEW_NEXT_PUBLIC_APP_URL = "https://youtick.net";
    env.PREVIEW_ALLOWED_ORIGINS = "https://youtick.net";
    env.PREVIEW_LIVEPEER_JWT_ISSUER = "https://youtick.net";
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not an allowed dark-release target/);
  });
});

test("config rejects invalid networks and unsafe environment text", async (t) => {
  await t.test("missing payment gas reserve while quote creation is off", () => {
    const env = publicEnv("preview");
    delete env.PREVIEW_NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO;
    const result = run(
      ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PREVIEW_NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO must not be empty/);
  });

  for (const name of ["PREVIEW_NEXT_PUBLIC_NEAR_NETWORK", "PREVIEW_NEAR_NETWORK"]) {
    await t.test(`${name} outside the exact allowlist`, () => {
      const env = publicEnv("preview");
      env[name] = "betanet";
      const result = run(
        ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
        env,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /must be exactly testnet or mainnet/);
    });
  }

  for (const [label, name, value, error] of [
    ["leading whitespace", "PREVIEW_LIVEPEER_PROJECT_ID", " project-123", /leading or trailing whitespace/],
    ["trailing whitespace", "PREVIEW_LIVEPEER_CREATOR_ALLOWLIST", "creator.testnet ", /leading or trailing whitespace/],
    ["control character", "PREVIEW_LIVEPEER_PROJECT_ID", "project\t123", /control characters/],
  ]) {
    await t.test(label, () => {
      const env = publicEnv("preview");
      env[name] = value;
      const result = run(
        ["config", "--environment", "preview", "--output", join(tmpdir(), "unused-config.json")],
        env,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
    });
  }

  await t.test("empty optional value remains valid", () => {
    const env = publicEnv("preview");
    env.PREVIEW_LIVEPEER_CREATOR_ALLOWLIST = "";
    assertSuccess(
      run(["config", "--environment", "preview", "--output", join(tmpdir(), "empty-optional.json")], env),
    );
  });
});

test("manifest verification detects tampering and SHA mismatch", async (t) => {
  await t.test("valid release", () => {
    const release = makeRelease();
    assertSuccess(
      run([
        "verify",
        "--artifact-dir",
        release.artifactDir,
        "--sha",
        SHA,
        "--web-lock",
        release.webLock,
        "--bridge-lock",
        release.bridgeLock,
      ]),
    );
    const manifest = JSON.parse(readFileSync(join(release.artifactDir, "manifest.json"), "utf8"));
    assert.equal(manifest.sha, SHA);
    assert.equal(manifest.lockfiles.web.path, "apps/web/package-lock.json");
    assert.equal(manifest.bundles.bridge.path, "bridge.tar.gz");
    assert.equal(manifest.bundles.readModel.path, "read-model.tar.gz");
  });

  await t.test("tampered bundle", () => {
    const release = makeRelease();
    writeFileSync(join(release.artifactDir, "bridge.tar.gz"), "tampered\n");
    const result = run([
      "verify",
      "--artifact-dir",
      release.artifactDir,
      "--sha",
      SHA,
      "--web-lock",
      release.webLock,
      "--bridge-lock",
      release.bridgeLock,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checksum mismatch/);
  });

  await t.test("wrong requested SHA", () => {
    const release = makeRelease();
    const result = run([
      "verify",
      "--artifact-dir",
      release.artifactDir,
      "--sha",
      "abcdef0123456789abcdef0123456789abcdef01",
      "--web-lock",
      release.webLock,
      "--bridge-lock",
      release.bridgeLock,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest SHA/);
  });

  await t.test("traversing checksum entry", () => {
    const release = makeRelease();
    const checksumPath = join(release.artifactDir, "SHA256SUMS");
    const checksums = readFileSync(checksumPath, "utf8").replace("bridge.tar.gz", "../bridge.tar.gz");
    writeFileSync(checksumPath, checksums);
    const result = run([
      "verify",
      "--artifact-dir",
      release.artifactDir,
      "--sha",
      SHA,
      "--web-lock",
      release.webLock,
      "--bridge-lock",
      release.bridgeLock,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /traversing path/);
  });
});
