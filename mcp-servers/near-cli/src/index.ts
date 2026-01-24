#!/usr/bin/env node
/**
 * NEAR CLI MCP Server
 * Provides NEAR Protocol operations through MCP interface
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as nearAPI from "near-api-js";

const { connect, keyStores, utils } = nearAPI;

// Get NEAR connection
const getConnection = async () => {
  const networkId = process.env.NEAR_ENV || "testnet";
  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    `${process.env.HOME}/.near-credentials`
  );

  const config = {
    networkId,
    keyStore,
    nodeUrl: `https://rpc.${networkId}.near.org`,
    walletUrl: `https://wallet.${networkId}.near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
  };

  return await connect(config);
};

const server = new Server(
  { name: "near-cli-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "near_view",
      description: "Call a view method on a NEAR contract (no gas required). Use for reading contract state.",
      inputSchema: {
        type: "object",
        properties: {
          contractId: { type: "string", description: "Contract account ID (e.g., v1.utick.testnet)" },
          methodName: { type: "string", description: "View method name to call" },
          args: { type: "object", description: "Method arguments as JSON object (optional)" }
        },
        required: ["contractId", "methodName"]
      }
    },
    {
      name: "near_call",
      description: "Call a change method on a NEAR contract (requires gas). Use for state-changing operations.",
      inputSchema: {
        type: "object",
        properties: {
          contractId: { type: "string", description: "Contract account ID" },
          methodName: { type: "string", description: "Method name to call" },
          args: { type: "object", description: "Method arguments as JSON object" },
          accountId: { type: "string", description: "Signer account ID (must have keys in ~/.near-credentials)" },
          deposit: { type: "string", description: "Attached deposit in NEAR (optional, default: 0)" },
          gas: { type: "string", description: "Gas limit in TGas (optional, default: 30)" }
        },
        required: ["contractId", "methodName", "accountId"]
      }
    },
    {
      name: "near_state",
      description: "Get account state including balance, storage, and code hash",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Account ID to query" }
        },
        required: ["accountId"]
      }
    },
    {
      name: "near_keys",
      description: "Get access keys for an account",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Account ID to query" }
        },
        required: ["accountId"]
      }
    },
    {
      name: "near_tx_status",
      description: "Get transaction status and result by hash",
      inputSchema: {
        type: "object",
        properties: {
          txHash: { type: "string", description: "Transaction hash (base58 encoded)" },
          accountId: { type: "string", description: "Sender account ID" }
        },
        required: ["txHash", "accountId"]
      }
    },
    {
      name: "near_deploy",
      description: "Deploy a WASM contract to an account (REQUIRES APPROVAL)",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Account to deploy to" },
          wasmPath: { type: "string", description: "Path to WASM file" },
          initMethod: { type: "string", description: "Init method name (optional)" },
          initArgs: { type: "object", description: "Init method arguments (optional)" }
        },
        required: ["accountId", "wasmPath"]
      }
    },
    {
      name: "near_create_account",
      description: "Create a new NEAR account as subaccount",
      inputSchema: {
        type: "object",
        properties: {
          newAccountId: { type: "string", description: "New account ID to create" },
          creatorAccountId: { type: "string", description: "Creator account ID" },
          initialBalance: { type: "string", description: "Initial balance in NEAR (default: 0.1)" }
        },
        required: ["newAccountId", "creatorAccountId"]
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [{ type: "text", text: "Error: No arguments provided" }],
      isError: true
    };
  }

  try {
    const near = await getConnection();

    switch (name) {
      case "near_view": {
        const account = await near.account("dontcare");
        const result = await account.viewFunction({
          contractId: args.contractId as string,
          methodName: args.methodName as string,
          args: (args.args as object) || {}
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      case "near_call": {
        const account = await near.account(args.accountId as string);
        const gasAmount = args.gas
          ? BigInt(Number(args.gas) * 1e12)
          : BigInt("30000000000000"); // 30 TGas default

        const depositAmount = args.deposit
          ? BigInt(utils.format.parseNearAmount(args.deposit as string) || "0")
          : BigInt(0);

        const result = await account.functionCall({
          contractId: args.contractId as string,
          methodName: args.methodName as string,
          args: (args.args as object) || {},
          gas: gasAmount,
          attachedDeposit: depositAmount
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              transactionHash: result.transaction.hash,
              status: result.status,
              receipts: result.receipts_outcome?.length || 0
            }, null, 2)
          }]
        };
      }

      case "near_state": {
        const account = await near.account(args.accountId as string);
        const state = await account.state();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...state,
              balance_near: utils.format.formatNearAmount(state.amount),
              storage_usage_kb: (Number(state.storage_usage) / 1024).toFixed(2)
            }, null, 2)
          }]
        };
      }

      case "near_keys": {
        const account = await near.account(args.accountId as string);
        const keys = await account.getAccessKeys();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(keys.map(key => ({
              publicKey: key.public_key,
              accessKey: {
                nonce: key.access_key.nonce,
                permission: key.access_key.permission
              }
            })), null, 2)
          }]
        };
      }

      case "near_tx_status": {
        const result = await near.connection.provider.txStatus(
          args.txHash as string,
          args.accountId as string,
          "FINAL"
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      case "near_deploy": {
        // This is a sensitive operation - log warning
        console.error("WARNING: Deploying contract to", args.accountId);

        const fs = await import("fs");
        const wasmCode = fs.readFileSync(args.wasmPath as string);

        const account = await near.account(args.accountId as string);

        const result = await account.deployContract(wasmCode);

        // If init method provided, call it
        if (args.initMethod) {
          await account.functionCall({
            contractId: args.accountId as string,
            methodName: args.initMethod as string,
            args: (args.initArgs as object) || {},
            gas: BigInt("100000000000000"), // 100 TGas
            attachedDeposit: BigInt(0)
          });
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              deployed: true,
              transactionHash: result.transaction.hash,
              accountId: args.accountId
            }, null, 2)
          }]
        };
      }

      case "near_create_account": {
        const creatorAccount = await near.account(args.creatorAccountId as string);
        const keyPair = nearAPI.KeyPair.fromRandom("ed25519");
        const publicKey = keyPair.getPublicKey();

        const initialBalance = args.initialBalance
          ? utils.format.parseNearAmount(args.initialBalance as string)
          : utils.format.parseNearAmount("0.1");

        // Use functionCall to create subaccount
        const result = await creatorAccount.functionCall({
          contractId: "testnet",
          methodName: "create_account",
          args: {
            new_account_id: args.newAccountId as string,
            new_public_key: publicKey.toString()
          },
          gas: BigInt("100000000000000"),
          attachedDeposit: BigInt(initialBalance || "0")
        });

        // Save the key locally
        const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
          `${process.env.HOME}/.near-credentials`
        );
        await keyStore.setKey(
          process.env.NEAR_ENV || "testnet",
          args.newAccountId as string,
          keyPair
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              created: true,
              accountId: args.newAccountId,
              publicKey: publicKey.toString(),
              transactionHash: result.transaction.hash
            }, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("NEAR CLI MCP server running on", process.env.NEAR_ENV || "testnet");
