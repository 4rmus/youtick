const { connect, keyStores, KeyPair, utils } = require("near-api-js");
const fs = require("fs");
const path = require("path");

// Configuration
const NETWORK_ID = "testnet";
const MASTER_ACCOUNT_ID = "v2-0.utick.testnet";
// Testnet deployment key
const MASTER_KEY = "REDACTED";
const CONTRACT_ACCOUNT_ID = `nft.${MASTER_ACCOUNT_ID}`;

// Path to compiled WASM
const WASM_PATH = path.join(__dirname, "../contracts/nft-ticket/target/wasm32-unknown-unknown/release/youtick_nft.wasm");

async function main() {
    console.log(`Deploying to ${CONTRACT_ACCOUNT_ID}...`);

    // 1. Setup Connection
    const keyStore = new keyStores.InMemoryKeyStore();
    const keyPair = KeyPair.fromString(MASTER_KEY);
    await keyStore.setKey(NETWORK_ID, MASTER_ACCOUNT_ID, keyPair);

    const near = await connect({
        networkId: NETWORK_ID,
        nodeUrl: "https://rpc.testnet.near.org",
        keyStore,
    });

    const masterAccount = await near.account(MASTER_ACCOUNT_ID);

    // 2. Check/Create Contract Account
    // LOAD KEY IF EXISTS LOCALLY
    const credPath = path.join(__dirname, "../.near-credentials/testnet", `${CONTRACT_ACCOUNT_ID}.json`);
    if (fs.existsSync(credPath)) {
        console.log("Loading existing key from file...");
        const keyContent = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

        // Handle both raw string and object formats
        let secretKey = keyContent.secret_key || keyContent.private_key || keyContent;
        if (typeof secretKey !== 'string') {
            // Handle nested format or direct object
            secretKey = keyContent.secretKey || JSON.stringify(keyContent);
        }
        // Ensure it's a string for fromString
        if (typeof secretKey === 'object') {
            secretKey = JSON.stringify(secretKey);
        }

        // Final check: if it's a JSON string of KeyPair, KeyPair.fromString handles it?
        // Actually near-api-js KeyPair.fromString expects "ed25519:..." OR it can parse JSON object if passed as string?
        // Let's assume standard format "ed25519:..." or try-catch
        try {
            const kp = KeyPair.fromString(secretKey.toString());
            await keyStore.setKey(NETWORK_ID, CONTRACT_ACCOUNT_ID, kp);
        } catch (e) {
            console.error("Failed to parse key:", e.message);
            // Fallback: maybe it's the raw object and fromString failed?
            // If it's pure JSON object { public_key:..., secret_key:... }
            // KeyPair.fromString(JSON.stringify(obj)) might fail depending on version.
            // Let's assume it works or fail hard.
            throw e;
        }
    }

    let contractAccount = await near.account(CONTRACT_ACCOUNT_ID);

    try {
        await contractAccount.state();
        console.log("Account exists. Updating contract...");
    } catch (e) {
        console.log("Account missing. Creating sub-account...");
        const newKeyPair = KeyPair.fromRandom("ed25519");
        await keyStore.setKey(NETWORK_ID, CONTRACT_ACCOUNT_ID, newKeyPair);

        // Ensure directory exists
        const credDir = path.join(__dirname, "../.near-credentials/testnet");
        if (!fs.existsSync(credDir)) {
            fs.mkdirSync(credDir, { recursive: true });
        }

        // Save key to a file for future use
        fs.writeFileSync(
            path.join(credDir, `${CONTRACT_ACCOUNT_ID}.json`),
            JSON.stringify(newKeyPair)
        );

        await masterAccount.createAccount(
            CONTRACT_ACCOUNT_ID,
            newKeyPair.getPublicKey(),
            utils.format.parseNearAmount("10") // 10 NEAR initial balance (Increased for storage)
        );
        contractAccount = await near.account(CONTRACT_ACCOUNT_ID);
    }

    // 3. Deploy Contract
    const wasm = fs.readFileSync(WASM_PATH);

    const result = await contractAccount.deployContract(wasm);
    console.log("Contract deployed!");

    // 4. Initialize (try 'new', if fails assume working or migrate)
    try {
        console.log("Initializing...");
        await contractAccount.functionCall({
            contractId: CONTRACT_ACCOUNT_ID,
            methodName: "new",
            args: { owner_id: CONTRACT_ACCOUNT_ID },
            gas: "30000000000000" // 30 TGas
        });
        console.log("Initialized successfully.");
    } catch (e) {
        if (e.message.includes("Already initialized")) {
            console.log("Already initialized. Calling migrate_state...");
            try {
                // Call migrate_state if available
                await contractAccount.functionCall({
                    contractId: CONTRACT_ACCOUNT_ID,
                    methodName: "migrate_state",
                    args: {},
                    gas: "30000000000000"
                });
                console.log("Migration successful.");
            } catch (migErr) {
                console.log("Migration skipped/failed:", migErr.message);
            }
        } else {
            console.log("Init failed:", e.message);
        }
    }

    console.log(`\nDONE. Contract ID: ${CONTRACT_ACCOUNT_ID}`);
    console.log(`Update .env.local with NEXT_PUBLIC_NFT_CONTRACT_ID=${CONTRACT_ACCOUNT_ID}`);
}

main().catch(console.error);
