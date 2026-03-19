const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const NETWORK_ID = 'mainnet';
const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const MASTER_ACCOUNT_ID = process.env.MASTER_ACCOUNT_ID || 'youtick.near';
const MASTER_SECRET_KEY = process.env.MASTER_SECRET_KEY;
const OWNER_ACCOUNT_ID = process.env.ZERO_TRUST_OWNER_ID || MASTER_ACCOUNT_ID;
const MARKET_CONTRACT_ID = process.env.MARKET_CONTRACT_ID || MASTER_ACCOUNT_ID;
const ACCESS_CONTRACT_ID = process.env.ACCESS_CONTRACT_ID || `access.${MASTER_ACCOUNT_ID}`;
const REGISTRY_CONTRACT_ID = process.env.REGISTRY_CONTRACT_ID || `registry.${MASTER_ACCOUNT_ID}`;
const ACCESS_INITIAL_BALANCE_NEAR = process.env.ACCESS_INITIAL_BALANCE_NEAR || '1';
const ACCESS_TARGET_BALANCE_NEAR = process.env.ACCESS_TARGET_BALANCE_NEAR || '3';
const REGISTRY_INITIAL_BALANCE_NEAR = process.env.REGISTRY_INITIAL_BALANCE_NEAR || '5';
const ACCESS_WASM_PATH = process.env.ACCESS_WASM_PATH || path.join(
    __dirname,
    '../contracts/access-control/target/near/youtick_access_control.wasm',
);
const REGISTRY_WASM_PATH = process.env.REGISTRY_WASM_PATH || path.join(
    __dirname,
    '../contracts/operator-registry/target/near/youtick_operator_registry.wasm',
);
const CREDENTIALS_DIR = process.env.NEAR_CREDENTIALS_DIR || path.join(
    os.homedir(),
    '.near-credentials',
    NETWORK_ID,
);

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

function credentialPathFor(accountId) {
    return path.join(CREDENTIALS_DIR, `${accountId}.json`);
}

function saveCredentials(accountId, keyPair) {
    if (!fs.existsSync(CREDENTIALS_DIR)) {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }

    fs.writeFileSync(
        credentialPathFor(accountId),
        JSON.stringify({
            account_id: accountId,
            public_key: keyPair.getPublicKey().toString(),
            secret_key: keyPair.toString(),
        }, null, 2),
    );
}

function loadSavedKeyPair(KeyPair, accountId) {
    const filePath = credentialPathFor(accountId);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const secretKey = raw.secret_key || raw.private_key;
    if (!secretKey) {
        throw new Error(`Credential file for ${accountId} is missing secret_key`);
    }

    return KeyPair.fromString(secretKey);
}

function getSubaccountPrefix(accountId, parentAccountId) {
    const suffix = `.${parentAccountId}`;
    if (!accountId.endsWith(suffix)) {
        throw new Error(`Account ${accountId} must be a direct subaccount of ${parentAccountId}`);
    }

    return accountId.slice(0, -suffix.length);
}

function yoctoToNearFloat(amount) {
    return Number(amount) / 1e24;
}

async function getAccountState(provider, accountId) {
    try {
        return await provider.query({
            request_type: 'view_account',
            finality: 'final',
            account_id: accountId,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('does not exist') || message.includes('UNKNOWN_ACCOUNT')) {
            return null;
        }
        throw error;
    }
}

async function accountExists(provider, accountId) {
    return Boolean(await getAccountState(provider, accountId));
}

async function createOrLoadContractAccount({
    Account,
    KeyPair,
    KeyPairSigner,
    nearToYocto,
    provider,
    masterAccount,
    accountId,
    initialBalanceNear,
}) {
    const savedKeyPair = loadSavedKeyPair(KeyPair, accountId);
    if (savedKeyPair) {
        return {
            created: false,
            keyPair: savedKeyPair,
            account: new Account(accountId, RPC_URL, new KeyPairSigner(savedKeyPair)),
        };
    }

    const exists = await accountExists(provider, accountId);
    if (exists) {
        throw new Error(
            `Account ${accountId} already exists but no credential file was found at ${credentialPathFor(accountId)}.`,
        );
    }

    const keyPair = KeyPair.fromRandom('ed25519');
    await masterAccount.createSubAccount({
        accountOrPrefix: getSubaccountPrefix(accountId, MASTER_ACCOUNT_ID),
        publicKey: keyPair.getPublicKey(),
        nearToTransfer: nearToYocto(initialBalanceNear),
    });
    saveCredentials(accountId, keyPair);

    return {
        created: true,
        keyPair,
        account: new Account(accountId, RPC_URL, new KeyPairSigner(keyPair)),
    };
}

async function initializeContract(contractAccount, initArgs, label) {
    try {
        await contractAccount.callFunction({
            contractId: contractAccount.accountId,
            methodName: 'new',
            args: initArgs,
            gas: '30000000000000',
        });
        console.log(`${label} initialized.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Already initialized')) {
            console.log(`${label} already initialized.`);
            return;
        }
        throw error;
    }
}

async function ensureMinimumBalance({
    account,
    fundingAccount,
    actions,
    nearToYocto,
    minimumBalanceNear,
    label,
    provider,
}) {
    const state = await getAccountState(provider, account.accountId);
    if (!state) {
        throw new Error(`${account.accountId} does not exist on-chain yet`);
    }
    const currentBalanceNear = yoctoToNearFloat(state.amount);
    const minimum = Number(minimumBalanceNear);

    if (currentBalanceNear >= minimum) {
        return;
    }

    const topUpNear = (minimum - currentBalanceNear).toFixed(5);
    await fundingAccount.signAndSendTransaction({
        receiverId: account.accountId,
        actions: [
            actions.transfer(nearToYocto(topUpNear)),
        ],
    });
    console.log(`${label} topped up by ${topUpNear} NEAR.`);
}

async function main() {
    if (!MASTER_SECRET_KEY) {
        throw new Error('MASTER_SECRET_KEY is required');
    }

    const { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, nearToYocto } = await loadNearApiJs();
    const masterKeyPair = KeyPair.fromString(MASTER_SECRET_KEY);
    const masterSigner = new KeyPairSigner(masterKeyPair);
    const masterAccount = new Account(MASTER_ACCOUNT_ID, RPC_URL, masterSigner);
    const provider = new JsonRpcProvider({ url: RPC_URL });

    ensureFileExists(ACCESS_WASM_PATH, 'access-control WASM');
    ensureFileExists(REGISTRY_WASM_PATH, 'operator-registry WASM');

    const registry = await createOrLoadContractAccount({
        Account,
        KeyPair,
        KeyPairSigner,
        nearToYocto,
        provider,
        masterAccount,
        accountId: REGISTRY_CONTRACT_ID,
        initialBalanceNear: REGISTRY_INITIAL_BALANCE_NEAR,
    });

    const access = await createOrLoadContractAccount({
        Account,
        KeyPair,
        KeyPairSigner,
        nearToYocto,
        provider,
        masterAccount,
        accountId: ACCESS_CONTRACT_ID,
        initialBalanceNear: ACCESS_INITIAL_BALANCE_NEAR,
    });

    await ensureMinimumBalance({
        account: access.account,
        fundingAccount: registry.account,
        actions,
        nearToYocto,
        minimumBalanceNear: ACCESS_TARGET_BALANCE_NEAR,
        label: 'access-control',
        provider,
    });

    console.log(`\nDeploying operator-registry to ${REGISTRY_CONTRACT_ID}...`);
    await registry.account.deployContract(fs.readFileSync(REGISTRY_WASM_PATH));
    await initializeContract(
        registry.account,
        { owner_id: OWNER_ACCOUNT_ID },
        'operator-registry',
    );

    console.log(`\nDeploying access-control to ${ACCESS_CONTRACT_ID}...`);
    await access.account.deployContract(fs.readFileSync(ACCESS_WASM_PATH));
    await initializeContract(
        access.account,
        {
            owner_id: OWNER_ACCOUNT_ID,
            market_contract_id: MARKET_CONTRACT_ID,
            registry_contract_id: REGISTRY_CONTRACT_ID,
        },
        'access-control',
    );

    if (OWNER_ACCOUNT_ID === MASTER_ACCOUNT_ID) {
        await masterAccount.signAndSendTransaction({
            receiverId: REGISTRY_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    'set_threshold_config',
                    {
                        total_operators: 5,
                        required_shares: 3,
                    },
                    '30000000000000',
                    '0',
                ),
            ],
        });
        console.log('Registry threshold set to 3-of-5.');
    } else {
        console.log(
            `Threshold setup skipped because owner is ${OWNER_ACCOUNT_ID}. Run set_threshold_config from the owner account.`,
        );
    }

    console.log('\nDeployment summary:');
    console.log(JSON.stringify({
        network: NETWORK_ID,
        rpcUrl: RPC_URL,
        marketContractId: MARKET_CONTRACT_ID,
        accessContractId: ACCESS_CONTRACT_ID,
        registryContractId: REGISTRY_CONTRACT_ID,
        accessCreated: access.created,
        registryCreated: registry.created,
        credentialsDir: CREDENTIALS_DIR,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
