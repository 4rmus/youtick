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
  "cancel_bridge_rotation",
  "contract_source_metadata",
  "create_paid_job",
  "create_paid_job_near",
  "execute_bridge_rotation",
  "finalize_livepeer_publication",
  "freeze_bridge",
  "ft_on_transfer",
  "get_creator_balance",
  "get_governance_state",
  "get_media_job",
  "get_platform_balance",
  "get_platform_near_balance",
  "get_publication",
  "get_publications",
  "get_publications_count",
  "get_quote_key_version",
  "get_storage_reserve_status",
  "get_takedown",
  "get_usdc_contract_id",
  "has_entitlement",
  "new",
  "on_creator_withdraw",
  "on_platform_withdraw",
  "on_platform_near_withdraw",
  "pause_new_purchases",
  "propose_bridge",
  "replace_upload_key",
  "restart_paid_job",
  "rotate_quote_public_key",
  "suspend_livepeer_sales",
  "takedown_livepeer_publication",
  "unfreeze_bridge",
  "unpause_new_purchases",
  "withdraw_creator_balance",
  "withdraw_platform_balance",
  "withdraw_platform_near",
];

const expectedAccess = [
  "accept_ownership",
  "can_execute",
  "can_play",
  "cancel_action",
  "cleanup_session_grants",
  "contract_source_metadata",
  "execute_action",
  "get_contract_state",
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
  "set_grant_issuance",
  "set_market_contract",
  "set_scope_policy",
  "unpause_contract",
  "unpause_scope",
  "verify_session_grant",
];

assertExactMethods("market", market, expectedMarket);
assertExactMethods("access", access, expectedAccess);

const marketAbi = JSON.stringify(market);
const accessAbi = JSON.stringify(access);

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
  "state_version",
  "admin_account_id",
  "guardian_account_id",
  "active_bridge_account_id",
  "pending_bridge_account_id",
  "bridge_frozen",
  "new_purchases_paused",
  "bridge_rotation_proposed_at_ms",
  "storage_usage_bytes",
  "storage_byte_cost_yocto",
  "storage_stake_yocto",
  "operational_reserve_yocto",
  "account_balance_yocto",
  "reserve_headroom_yocto",
  "reserve_runway_bytes",
  "reserve_covered",
]) {
  if (!marketAbi.includes(`\"${field}\"`)) {
    throw new Error(`market ABI is missing Livepeer field: ${field}`);
  }
}

for (const field of [
  "state_version",
  "owner_id",
  "pending_owner_id",
  "market_contract_id",
  "paused",
  "grant_issuance_enabled",
  "target_owner_id",
  "resource_id",
  "session_pok",
]) {
  if (!accessAbi.includes(`\"${field}\"`)) {
    throw new Error(`access ABI is missing v2 field: ${field}`);
  }
}

const issueGrant = access.body.functions.find(({ name }) => name === "issue_session_grant");
if (JSON.stringify(issueGrant?.params?.args?.map(({ name }) => name)) !== JSON.stringify(["request"])) {
  throw new Error("access issue_session_grant must accept one request object");
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
