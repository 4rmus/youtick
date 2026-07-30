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
  "finalize_paid_publish",
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
  "record_byte_integrity",
  "record_kms_store",
  "record_source_delete",
  "restart_paid_job",
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

assertExactMethods("market", market, expectedMarket);
assertExactMethods("access", access, expectedAccess);

const forbidden =
  /gift|trial|onboarding|prepaid|managed.?guest|upload.?session|studio|object.?v1|claim|free/i;
for (const [label, abi] of [
  ["market", market],
  ["access", access],
]) {
  const match = JSON.stringify(abi).match(forbidden);
  if (match) {
    throw new Error(`${label} ABI contains removed launch term: ${match[0]}`);
  }
}

const sessionScope = access.body.root_schema?.definitions?.SessionScope;
if (JSON.stringify(sessionScope?.enum) !== JSON.stringify(["Play"])) {
  throw new Error("Access ABI SessionScope must contain only Play");
}

console.log(
  `paid-media-v4 ABI PASS: market=${expectedMarket.length}, access=${expectedAccess.length}, SessionScope=Play`,
);
