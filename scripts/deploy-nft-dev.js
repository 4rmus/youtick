const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const NETWORK_ID = "testnet";
const RPC_URL = "https://rpc.testnet.near.org";
const MASTER_ACCOUNT_ID = "v2-0.utick.testnet";
const MASTER_KEY = "REDACTED";
const WASM_PATH = path.join(
    __dirname,
    "../contracts/nft-ticket/target/near/youtick_nft.wasm",
);
const CREDENTIALS_DIR = path.join(__dirname, "../.near-credentials/testnet");

async function loadNearApiJs() {
    const moduleUrl = pathToFileURL(
        path.join(__dirname, "../apps/web/node_modules/near-api-js/lib/index.js"),
    ).href;

    return await import(moduleUrl);
}

function saveCredentials(accountId, keyPair) {
    if (!fs.existsSync(CREDENTIALS_DIR)) {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }

    const credentials = {
        account_id: accountId,
        public_key: keyPair.getPublicKey().toString(),
        secret_key: keyPair.toString(),
    };

    fs.writeFileSync(
        path.join(CREDENTIALS_DIR, `${accountId}.json`),
        JSON.stringify(credentials, null, 2),
    );
}

async function main() {
    const { Account, KeyPair, KeyPairSigner, nearToYocto } = await loadNearApiJs();

    const contractPrefix = `dev-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const contractAccountId = `${contractPrefix}.${MASTER_ACCOUNT_ID}`;

    console.log(`Creating testnet staging account: ${contractAccountId}`);

    const masterKeyPair = KeyPair.fromString(MASTER_KEY);
    const masterSigner = new KeyPairSigner(masterKeyPair);
    const masterAccount = new Account(MASTER_ACCOUNT_ID, RPC_URL, masterSigner);

    const contractKeyPair = KeyPair.fromRandom("ed25519");

    await masterAccount.createSubAccount({
        accountOrPrefix: contractPrefix,
        publicKey: contractKeyPair.getPublicKey(),
        nearToTransfer: nearToYocto("10"),
    });
    console.log("Sub-account created.");

    saveCredentials(contractAccountId, contractKeyPair);

    const contractSigner = new KeyPairSigner(contractKeyPair);
    const contractAccount = new Account(contractAccountId, RPC_URL, contractSigner);
    const wasm = fs.readFileSync(WASM_PATH);

    console.log("Deploying contract...");
    await contractAccount.deployContract(wasm);
    console.log("Contract deployed.");

    try {
        console.log("Initializing contract...");
        await contractAccount.callFunction({
            contractId: contractAccountId,
            methodName: "new",
            args: { owner_id: contractAccountId },
            gas: "30000000000000",
        });
        console.log("Initialized successfully.");
    } catch (error) {
        console.log(`Initialization skipped/failed: ${error.message}`);
    }

    console.log(`\nDONE. Contract ID: ${contractAccountId}`);
    console.log(`Update .env.local with NEXT_PUBLIC_NFT_CONTRACT_ID=${contractAccountId}`);
    console.log(`::CONTRACT_ID::${contractAccountId}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
