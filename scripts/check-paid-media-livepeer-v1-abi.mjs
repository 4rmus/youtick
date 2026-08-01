import fs from "node:fs";

const marketPath =
  process.argv[2] ??
  "contracts/nft-ticket/target/near/youtick_nft_abi.json";
const accessPath =
  process.argv[3] ??
  "contracts/access-control/target/near/youtick_access_control_abi.json";

const market = JSON.parse(fs.readFileSync(marketPath, "utf8"));
const access = JSON.parse(fs.readFileSync(accessPath, "utf8"));

const expectedMarket = [
  "contract_source_metadata",
  "create_paid_job",
  "finalize_livepeer_publication",
  "ft_on_transfer",
  "get_creator_balance",
  "get_media_job",
  "get_platform_balance",
  "get_publication",
  "get_usdc_contract_id",
  "has_entitlement",
  "new",
  "on_creator_withdraw",
  "on_platform_withdraw",
  "restart_paid_job",
  "suspend_livepeer_sales",
  "withdraw_creator_balance",
  "withdraw_platform_balance",
];

const expectedAccess = [
  "accept_ownership",
  "can_execute",
  "can_play",
  "cancel_action",
  "contract_source_metadata",
  "execute_action",
  "get_scope_policy",
  "get_session_grant",
  "get_timelock",
  "issue_session_grant",
  "list_session_grants",
  "new",
  "pause_contract",
  "pause_scope",
  "propose_action",
  "propose_owner",
  "revoke_session_grant",
  "revoke_subject_sessions",
  "set_market_contract",
  "set_registry_contract",
  "set_scope_policy",
  "unpause_contract",
  "unpause_scope",
  "verify_session_grant",
];

assertExactMethods("market", market, expectedMarket);
assertExactMethods("access", access, expectedAccess);

const marketAbi = JSON.stringify(market);
const forbidden =
  /paid-media-v4|manifest|kms|cid|receipt|source_delete|ingest_public_key|finalize_paid_publish|record_byte_integrity|record_kms_store/i;
const match = marketAbi.match(forbidden);
if (match) throw new Error(`market ABI contains superseded v4 term: ${match[0]}`);

for (const field of [
  "expected_source_bytes",
  "profile_config_sha256",
  "asset_id_hash",
  "playback_id",
  "project_id_hash",
  "verified_source_bytes",
  "provider_source_fingerprint",
  "ready_at_ms",
  "availability",
]) {
  if (!marketAbi.includes(`\"${field}\"`)) {
    throw new Error(`market ABI is missing Livepeer field: ${field}`);
  }
}

const availability = market.body.root_schema?.definitions?.PublicationAvailability;
if (
  JSON.stringify(availability?.enum) !==
  JSON.stringify(["ACTIVE", "SALES_SUSPENDED", "TAKEDOWN"])
) {
  throw new Error("PublicationAvailability ABI mismatch");
}

console.log(
  `paid-media-livepeer-v1 ABI PASS: market=${expectedMarket.length}, access=${expectedAccess.length}`,
);

function methodNames(abi) {
  return abi.body.functions.map(({ name }) => name).sort();
}

function assertExactMethods(label, abi, expected) {
  const actual = methodNames(abi);
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `${label} ABI mismatch\nexpected: ${wanted.join(", ")}\nactual: ${actual.join(", ")}`,
    );
  }
}
