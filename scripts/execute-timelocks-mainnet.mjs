import { Account } from "../apps/web/node_modules/near-api-js/lib/accounts/account.js";
import { KeyPairSigner } from "../apps/web/node_modules/near-api-js/lib/signers/index.js";
import fs from "fs";
import path from "path";
import os from "os";

const CREDENTIALS_DIR = path.join(os.homedir(), ".near-credentials/mainnet");

function loadSigner(accountId) {
    const file = path.join(CREDENTIALS_DIR, `${accountId}.json`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const sk = raw.private_key || raw.secret_key;
    return KeyPairSigner.fromSecretKey(sk);
}

const CONTRACT_ID = process.env.REGISTRY_CONTRACT_ID || "registry.youtick.near";
const OWNER_ACCOUNT_ID = process.env.ZERO_TRUST_OWNER_ID || process.env.MASTER_ACCOUNT_ID || "youtick.near";
const RPC_URL = process.env.NEAR_RPC_URL || "https://rpc.mainnet.fastnear.com";
const TIMELOCK_IDS = (process.env.TIMELOCK_IDS || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0);
const CONFIRM_EXECUTE = process.env.CONFIRM_EXECUTE_TIMELOCKS;

async function main() {
    if (TIMELOCK_IDS.length === 0) {
        throw new Error("TIMELOCK_IDS is required, for example TIMELOCK_IDS=1,2,3");
    }

    if (CONFIRM_EXECUTE !== CONTRACT_ID) {
        throw new Error(`Refusing to execute timelocks on ${CONTRACT_ID}. Set CONFIRM_EXECUTE_TIMELOCKS=${CONTRACT_ID} after reviewing each proposal.`);
    }

    const signer = loadSigner(OWNER_ACCOUNT_ID);
    const account = new Account(OWNER_ACCOUNT_ID, RPC_URL, signer);
    
    for (const id of TIMELOCK_IDS) {
        console.log(`Executing timelock ${id}...`);
        try {
            const result = await account.callFunction({
                contractId: CONTRACT_ID,
                methodName: "execute_action",
                args: { id },
                gas: 300000000000000n,
                deposit: 0n
            });
            console.log(`✅ Timelock ${id} executed:`, result);
        } catch (e) {
            console.log(`❌ Timelock ${id} failed:`, e.message);
        }
    }
    
    console.log("\nAll timelocks processed.");
}

main().catch(e => { console.error(e); process.exit(1); });
