#!/usr/bin/env node
import { Account, KeyPair, KeyPairSigner, actions as nearActions } from '../apps/web/node_modules/near-api-js/lib/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ownerAccountId = process.env.ZERO_TRUST_OWNER_ID || process.env.MASTER_ACCOUNT_ID || 'youtick.near';
const accessContractId = process.env.ACCESS_CONTRACT_ID || 'access.youtick.near';
const registryContractId = process.env.REGISTRY_CONTRACT_ID || 'registry.youtick.near';
const rpcUrl = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const confirm = process.env.CONFIRM_PRESTAGE_EMERGENCY_PROPOSALS;
const includeAccessPause = process.env.INCLUDE_ACCESS_PAUSE === 'true';
const credentialsPath = process.env.OWNER_CREDENTIALS_PATH
  || path.join(os.homedir(), '.near-credentials/mainnet', `${ownerAccountId}.json`);

function decodeSuccessValue(result) {
  const value = result?.status?.SuccessValue;
  if (!value) return null;

  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  try {
    return JSON.parse(decoded);
  } catch {
    return decoded;
  }
}

async function rpcQuery(contractId, methodName, args = {}) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${contractId}:${methodName}`,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC query failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (body.error) {
    throw new Error(`RPC error: ${JSON.stringify(body.error)}`);
  }

  const bytes = body.result?.result || [];
  const text = Buffer.from(bytes).toString('utf-8');
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (confirm !== ownerAccountId) {
    throw new Error(`Refusing to submit emergency proposals. Set CONFIRM_PRESTAGE_EMERGENCY_PROPOSALS=${ownerAccountId}.`);
  }

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Owner credentials not found: ${credentialsPath}`);
  }

  const operators = await rpcQuery(registryContractId, 'list_decryption_operators');
  const activeOperators = operators
    .filter((operator) => operator.active === true)
    .map((operator) => operator.account_id);
  if (activeOperators.length === 0) {
    throw new Error('No active decryption operators found.');
  }

  const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  const signer = new KeyPairSigner(KeyPair.fromString(creds.private_key || creds.secret_key));
  const owner = new Account(ownerAccountId, rpcUrl, signer);
  const proposals = [];

  async function propose(receiverId, action) {
    const tx = await owner.signAndSendTransaction({
      receiverId,
      actions: [
        nearActions.functionCall('propose_action', { action }, '30000000000000', '0'),
      ],
    });
    proposals.push({
      receiverId,
      action,
      proposalId: decodeSuccessValue(tx),
      txHash: tx.transaction.hash,
    });
  }

  if (includeAccessPause) {
    await propose(accessContractId, 'PauseContract');
  }
  await propose(registryContractId, 'Pause');

  for (const accountId of activeOperators) {
    await propose(registryContractId, {
      DeactivateDecryptionOperator: {
        account_id: accountId,
      },
    });
  }

  console.log(JSON.stringify({
    ownerAccountId,
    accessContractId,
    registryContractId,
    includeAccessPause,
    activeOperators,
    proposals,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
