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
  "create_paid_job_near",
  "finalize_livepeer_publication",
  "ft_on_transfer",
  "get_creator_balance",
  "get_media_job",
  "get_platform_balance",
  "get_platform_near_balance",
  "get_publication",
  "get_publications",
  "get_publications_count",
  "get_quote_key_version",
  "get_takedown",
  "get_usdc_contract_id",
  "has_entitlement",
  "new",
  "on_creator_withdraw",
  "on_platform_withdraw",
  "on_platform_near_withdraw",
  "replace_upload_key",
  "restart_paid_job",
  "rotate_quote_public_key",
  "suspend_livepeer_sales",
  "takedown_livepeer_publication",
  "withdraw_creator_balance",
  "withdraw_platform_balance",
  "withdraw_platform_near",
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
  "set_scope_policy",
  "unpause_contract",
  "unpause_scope",
  "verify_session_grant",
];

assertExactMethods("market", market, expectedMarket);
assertExactMethods("access", access, expectedAccess);

const marketAbi = JSON.stringify(market);

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
  "fee_asset",
  "fee_amount",
  "fee_usd_micro",
  "upload_public_key",
  "upload_key_expires_at_ms",
  "fee_quote_hash",
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
