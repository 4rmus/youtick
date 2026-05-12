#!/usr/bin/env node

const accountId = process.env.NFT_CONTRACT_ID || 'youtick.near';
const rpcUrl = process.env.NEAR_RPC_URL || 'https://free.rpc.fastnear.com';
const onboardingMethods = [
  'create_sponsored_trial_direct',
  'claim_free_ticket_direct',
  'sponsor_implicit_guest_direct',
];

function getFunctionCallPermission(key) {
  const permission = key?.access_key?.permission;
  return permission && typeof permission === 'object' ? permission.FunctionCall : null;
}

function hasSameMethods(methodNames) {
  if (!Array.isArray(methodNames) || methodNames.length !== onboardingMethods.length) {
    return false;
  }
  return [...methodNames].sort().join(',') === [...onboardingMethods].sort().join(',');
}

const response = await fetch(rpcUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'list-onboarding-keys',
    method: 'query',
    params: {
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: accountId,
    },
  }),
});

if (!response.ok) {
  throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
}

const body = await response.json();
if (body.error) {
  throw new Error(`RPC error: ${JSON.stringify(body.error)}`);
}

const keys = body.result?.keys || [];
const fullAccess = keys.filter((key) => key.access_key?.permission === 'FullAccess');
const functionCall = keys
  .map((key) => ({ publicKey: key.public_key, permission: getFunctionCallPermission(key) }))
  .filter((key) => key.permission);

const onboardingLimited = functionCall.filter((key) => (
  key.permission.receiver_id === accountId && hasSameMethods(key.permission.method_names)
));
const broadContractKeys = functionCall.filter((key) => (
  key.permission.receiver_id === accountId
  && Array.isArray(key.permission.method_names)
  && key.permission.method_names.length === 0
));

const summary = {
  accountId,
  blockHeight: body.result?.block_height,
  totalKeys: keys.length,
  fullAccessCount: fullAccess.length,
  onboardingLimitedCount: onboardingLimited.length,
  broadContractFunctionCallCount: broadContractKeys.length,
  onboardingLimitedKeys: onboardingLimited.map((key) => key.publicKey),
  broadContractFunctionCallKeys: broadContractKeys.map((key) => key.publicKey),
};

console.log(JSON.stringify(summary, null, 2));
