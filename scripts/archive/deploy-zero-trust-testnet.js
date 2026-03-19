const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const NETWORK_ID = 'testnet';
const RPC_URL = 'https://rpc.testnet.near.org';
const MASTER_ACCOUNT_ID = process.env.MASTER_ACCOUNT_ID || 'v2-0.utick.testnet';
const MASTER_SECRET_KEY = process.env.MASTER_SECRET_KEY;
const OWNER_ACCOUNT_ID = process.env.ZERO_TRUST_OWNER_ID || MASTER_ACCOUNT_ID;
const MARKET_CONTRACT_ID = process.env.MARKET_CONTRACT_ID || MASTER_ACCOUNT_ID;
const deploymentSuffix = process.env.ZERO_TRUST_DEPLOY_SUFFIX || `${Date.now()}`;
const ACCESS_CONTRACT_ID = process.env.ACCESS_CONTRACT_ID || `access-${deploymentSuffix}.${MASTER_ACCOUNT_ID}`;
const REGISTRY_CONTRACT_ID = process.env.REGISTRY_CONTRACT_ID || `registry-${deploymentSuffix}.${MASTER_ACCOUNT_ID}`;

const ACCESS_WASM_PATH = process.env.ACCESS_WASM_PATH || path.join(
    __dirname,
    '../contracts/access-control/target/near/youtick_access_control.wasm',
);

const REGISTRY_WASM_PATH = process.env.REGISTRY_WASM_PATH || path.join(
    __dirname,
    '../contracts/operator-registry/target/near/youtick_operator_registry.wasm',
);

const CREDENTIALS_DIR = path.join(__dirname, '../.near-credentials/testnet');

async function loadNearApiJs() {
    const moduleUrl = pathToFileURL(
        path.join(__dirname, '../apps/web/node_modules/near-api-js/lib/index.js'),
    ).href;

    return import(moduleUrl);
}

function ensureFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found at ${filePath}. Build the contract before deploying.`);
    }
}

function saveCredentials(accountId, keyPair) {
    if (!fs.existsSync(CREDENTIALS_DIR)) {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }

    const payload = {
        account_id: accountId,
        public_key: keyPair.getPublicKey().toString(),
        secret_key: keyPair.toString(),
    };

    fs.writeFileSync(
        path.join(CREDENTIALS_DIR, `${accountId}.json`),
        JSON.stringify(payload, null, 2),
    );
}

function getSubaccountPrefix(accountId, parentAccountId) {
    const suffix = `.${parentAccountId}`;
    if (!accountId.endsWith(suffix)) {
        throw new Error(`Account ${accountId} must be a direct subaccount of ${parentAccountId}`);
    }

    return accountId.slice(0, -suffix.length);
}

async function main() {
    if (!MASTER_SECRET_KEY) {
        throw new Error('MASTER_SECRET_KEY is required');
    }

    const { Account, KeyPair, KeyPairSigner, nearToYocto } = await loadNearApiJs();

    const masterKeyPair = KeyPair.fromString(MASTER_SECRET_KEY);
    const masterSigner = new KeyPairSigner(masterKeyPair);
    const masterAccount = new Account(MASTER_ACCOUNT_ID, RPC_URL, masterSigner);

    async function createAndDeploy(accountId, wasmPath, init, label) {
        ensureFileExists(wasmPath, `${label} WASM`);

        const keyPair = KeyPair.fromRandom('ed25519');
        const signer = new KeyPairSigner(keyPair);
        const wasm = fs.readFileSync(wasmPath);

        console.log(`\nCreating ${label} account: ${accountId}`);
        await masterAccount.createSubAccount({
            accountOrPrefix: getSubaccountPrefix(accountId, MASTER_ACCOUNT_ID),
            publicKey: keyPair.getPublicKey(),
            nearToTransfer: nearToYocto('5'),
        });
        saveCredentials(accountId, keyPair);

        const contractAccount = new Account(accountId, RPC_URL, signer);
        console.log(`Deploying ${label} contract...`);
        await contractAccount.deployContract(wasm);

        console.log(`Initializing ${label} contract...`);
        await contractAccount.callFunction({
            contractId: accountId,
            methodName: 'new',
            args: init,
            gas: '30000000000000',
        });

        console.log(`${label} deployed: ${accountId}`);
    }

    await createAndDeploy(
        ACCESS_CONTRACT_ID,
        ACCESS_WASM_PATH,
        {
            owner_id: OWNER_ACCOUNT_ID,
            market_contract_id: MARKET_CONTRACT_ID,
            registry_contract_id: REGISTRY_CONTRACT_ID,
        },
        'access-control',
    );

    await createAndDeploy(
        REGISTRY_CONTRACT_ID,
        REGISTRY_WASM_PATH,
        {
            owner_id: OWNER_ACCOUNT_ID,
        },
        'operator-registry',
    );

    console.log('\nEnvironment updates:');
    console.log(`NEXT_PUBLIC_NEAR_NETWORK=${NETWORK_ID}`);
    console.log(`NEXT_PUBLIC_MARKET_CONTRACT_ID=${MARKET_CONTRACT_ID}`);
    console.log(`NEXT_PUBLIC_ACCESS_CONTRACT_ID=${ACCESS_CONTRACT_ID}`);
    console.log(`NEXT_PUBLIC_REGISTRY_CONTRACT_ID=${REGISTRY_CONTRACT_ID}`);
    console.log(`NEAR_ACCESS_CONTRACT_ID=${ACCESS_CONTRACT_ID}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
