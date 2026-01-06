const { connect, keyStores, KeyPair, utils } = require("near-api-js");
const fs = require("fs");
const path = require("path");

// Configuration
const NETWORK_ID = "testnet";
const HELPER_URL = "https://helper.testnet.near.org";
// Available Relayer as fallback funder
const MASTER_ACCOUNT_ID = "v2-0.utick.testnet";
const MASTER_KEY = "ed25519:49LaWnj78mkVGxy7QQqiSFyZ5k9bkiBfqyDQmKD6UhkfgGRNr22BqFD2V9oYQk3JidaKQd5T7CPit1bVhdkCuAaG";

// Path to compiled WASM
const WASM_PATH = path.join(__dirname, "../contracts/nft-ticket/target/wasm32-unknown-unknown/release/youtick_nft.wasm");

async function main() {
    // Generate random dev account ID
    const randomId = "dev-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
    // Use LET for reassignment in fallback
    let contractAccountId = `${randomId}.testnet`;

    console.log(`Attempting to create and deploy to: ${contractAccountId}`);

    const keyStore = new keyStores.InMemoryKeyStore();
    const near = await connect({
        networkId: NETWORK_ID,
        nodeUrl: "https://rpc.testnet.near.org",
        keyStore,
        helperUrl: HELPER_URL,
    });

    const newKeyPair = KeyPair.fromRandom("ed25519");
    await keyStore.setKey(NETWORK_ID, contractAccountId, newKeyPair);

    // 1. Create Account via Faucet (Helper)
    let createdViaFaucet = false;
    try {
        console.log("Requesting account from Faucet/Helper...");
        await near.createAccount(contractAccountId, newKeyPair.getPublicKey());
        console.log("Account created via Faucet!");
        createdViaFaucet = true;
    } catch (e) {
        console.error("Faucet creation failed:", e.message);

        // Fallback: Create sub-account under v2-0
        console.log("Falling back to sub-account creation using local Relayer funds...");
        const fallbackId = `dev-${Date.now()}.v2-0.utick.testnet`;
        console.log(`New Target: ${fallbackId}`);

        // Setup master account
        const masterKeyPair = KeyPair.fromString(MASTER_KEY);
        await keyStore.setKey(NETWORK_ID, MASTER_ACCOUNT_ID, masterKeyPair);
        const masterAccount = await near.account(MASTER_ACCOUNT_ID);

        // Update key for fallback ID
        await keyStore.setKey(NETWORK_ID, fallbackId, newKeyPair);

        await masterAccount.createAccount(
            fallbackId,
            newKeyPair.getPublicKey(),
            utils.format.parseNearAmount("10")
        );
        contractAccountId = fallbackId; // Update target
        console.log("Sub-account created:", contractAccountId);
    }

    // Save credentials locally
    const credDir = path.join(__dirname, "../.near-credentials/testnet");
    if (!fs.existsSync(credDir)) {
        fs.mkdirSync(credDir, { recursive: true });
    }
    fs.writeFileSync(
        path.join(credDir, `${contractAccountId}.json`),
        JSON.stringify(newKeyPair)
    );

    // 2. Deploy Contract
    const contractAccount = await near.account(contractAccountId);
    const wasm = fs.readFileSync(WASM_PATH);

    console.log("Deploying contract...");
    await contractAccount.deployContract(wasm);
    console.log("Contract deployed!");

    // 3. Initialize
    try {
        console.log("Initializing...");
        await contractAccount.functionCall({
            contractId: contractAccountId,
            methodName: "new",
            args: { owner_id: contractAccountId },
            gas: "30000000000000"
        });
        console.log("Initialized successfully.");
    } catch (e) {
        console.log("Init failed (might be already init):", e.message);
    }

    console.log(`\nDONE. Contract ID: ${contractAccountId}`);
    console.log(`Update .env.local with NEXT_PUBLIC_NFT_CONTRACT_ID=${contractAccountId}`);

    // Output for parsing
    console.log(`::CONTRACT_ID::${contractAccountId}`);
}

main().catch(console.error);
