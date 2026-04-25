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

const TIMELock_IDS = [1, 2, 3, 4, 5, 6];
const CONTRACT_ID = "registry.youtick.near";

async function main() {
    const signer = loadSigner(CONTRACT_ID);
    const account = new Account(CONTRACT_ID, "https://rpc.fastnear.com", signer);
    
    for (const id of TIMELock_IDS) {
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
