
const { LitNodeClient } = require("@lit-protocol/lit-node-client");
const { LitNetwork, LitAbility, LIT_NETWORK } = require("@lit-protocol/constants");
const { LitAccessControlConditionResource, createSiweMessage, generateAuthSig } = require("@lit-protocol/auth-helpers");
const { ethers } = require("ethers");
const { decryptToFile, encryptFile } = require("@lit-protocol/encryption");

// Mock Browser Globals for Lit SDK (if needed in Node env)
globalThis.alert = console.log;

const LIT_ACTION_CODE = `
(async () => {
    console.log("Lit Action Running");
    LitActions.setCondition({ value: "true", rationale: "Always true" });
})();
`;

async function main() {
    console.log("Initializing Lit Client...");
    const client = new LitNodeClient({
        litNetwork: "datil-test",
        debug: false
    });
    await client.connect();
    console.log("Connected to Datil-Test");

    // 1. Setup Wallet & AuthSig
    const wallet = ethers.Wallet.createRandom();
    console.log("Using Wallet:", wallet.address);

    const authSig = await generateAuthSig({
        signer: wallet,
        toSign: await createSiweMessage({
            domain: "localhost",
            walletAddress: wallet.address,
            statement: "Test Lit Action",
            uri: "https://localhost/login",
            version: "1",
            chainId: 1
        })
    });

    // 2. Encrypt Content
    const message = "Hello Lit Protocol!";
    console.log("Encrypting message:", message);

    // We use a dummy condition for encryption initially, but we want to test the litAction one.
    // Ideally we encrypt WITH the new condition format we want to test.

    const testCases = [
        {
            name: "Control: Standard EVM Basic (Should Pass)",
            condition: {
                conditionType: 'evmBasic',
                contractAddress: '',
                standardContractType: '',
                chain: 'ethereum',
                method: 'eth_getBalance',
                parameters: [':userAddress', 'latest'],
                returnValueTest: {
                    comparator: '>=',
                    value: '0'
                }
            }
        },
        {
            name: "Kitchen Sink (All Fields)",
            condition: {
                conditionType: 'litAction',
                code: LIT_ACTION_CODE,
                contractAddress: '',
                standardContractType: '',
                chain: 'ethereum',
                method: '',
                parameters: [],
                // jsParams: {}, // Let's omit this for now or include? Let's include blank
                jsParams: {},
                returnValueTest: { comparator: '=', value: 'true' }
            }
        }
    ];

    for (const test of testCases) {
        console.log(`\n--- Testing Case: ${test.name} ---`);
        try {
            const accs = [test.condition];

            // Encrypt
            const { ciphertext, dataToEncryptHash } = await encryptFile(
                {
                    file: new Blob([message]),
                    unifiedAccessControlConditions: accs,
                    authSig,
                    chain: 'ethereum'
                },
                client
            );
            console.log("Encryption successful. Ciphertext/Hash obtained.");

            // Decrypt
            console.log("Attempting Decryption...");
            const decryptedFile = await decryptToFile(
                {
                    ciphertext,
                    dataToEncryptHash,
                    unifiedAccessControlConditions: accs,
                    authSig,
                    chain: 'ethereum'
                },
                client
            );

            const decryptedString = await new Response(decryptedFile).text();
            console.log("Decryption Result:", decryptedString);

            if (decryptedString === message) {
                console.log("✅ SUCCESS!");
            } else {
                console.log("❌ Content mismatch");
            }

        } catch (e) {
            console.error("❌ FAILED:");
            if (e.message) console.error(e.message);
            if (e.info) console.error(JSON.stringify(e.info, null, 2));
        }
    }

    process.exit(0);
}

main().catch(console.error);
