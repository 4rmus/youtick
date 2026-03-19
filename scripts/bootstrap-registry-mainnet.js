const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const OWNER_ACCOUNT_ID = process.env.ZERO_TRUST_OWNER_ID || process.env.MASTER_ACCOUNT_ID || 'youtick.near';
const OWNER_SECRET_KEY = process.env.ZERO_TRUST_OWNER_KEY || process.env.MASTER_SECRET_KEY;
const REGISTRY_CONTRACT_ID = process.env.REGISTRY_CONTRACT_ID || 'registry.youtick.near';
const OPERATOR_CONFIG_PATH = process.env.KMS_OPERATORS_PATH || path.join(
    __dirname,
    'config/mainnet-kms-operators.json',
);

async function loadNearApiJs() {
    const moduleUrl = pathToFileURL(
        path.join(__dirname, '../apps/web/node_modules/near-api-js/lib/index.js'),
    ).href;

    return import(moduleUrl);
}

function ensureFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found at ${filePath}`);
    }
}

function loadConfig() {
    ensureFileExists(
        OPERATOR_CONFIG_PATH,
        'Operator config file. Start from scripts/config/mainnet-kms-operators.example.json',
    );

    const config = JSON.parse(fs.readFileSync(OPERATOR_CONFIG_PATH, 'utf-8'));
    if (!Array.isArray(config.decryptionOperators) || config.decryptionOperators.length === 0) {
        throw new Error('decryptionOperators must contain at least one operator');
    }

    return config;
}

async function main() {
    if (!OWNER_SECRET_KEY) {
        throw new Error('ZERO_TRUST_OWNER_KEY or MASTER_SECRET_KEY is required');
    }

    const config = loadConfig();
    const { Account, KeyPair, KeyPairSigner, actions } = await loadNearApiJs();
    const ownerKeyPair = KeyPair.fromString(OWNER_SECRET_KEY);
    const owner = new Account(OWNER_ACCOUNT_ID, RPC_URL, new KeyPairSigner(ownerKeyPair));

    const deactivateOperators = Array.isArray(config.deactivateOperators)
        ? config.deactivateOperators
        : [];
    const relayers = Array.isArray(config.relayers) ? config.relayers : [];
    const threshold = config.threshold || {
        totalOperators: config.decryptionOperators.length,
        requiredShares: Math.min(3, config.decryptionOperators.length),
    };

    for (const operatorAccountId of deactivateOperators) {
        try {
            await owner.signAndSendTransaction({
                receiverId: REGISTRY_CONTRACT_ID,
                actions: [
                    actions.functionCall(
                        'deactivate_decryption_operator',
                        { account_id: operatorAccountId },
                        '30000000000000',
                        '0',
                    ),
                ],
            });
        } catch {
            // Best effort cleanup.
        }
    }

    await owner.signAndSendTransaction({
        receiverId: REGISTRY_CONTRACT_ID,
        actions: [
            actions.functionCall(
                'set_threshold_config',
                {
                    total_operators: threshold.totalOperators,
                    required_shares: threshold.requiredShares,
                },
                '30000000000000',
                '0',
            ),
        ],
    });

    for (const operator of config.decryptionOperators) {
        await owner.signAndSendTransaction({
            receiverId: REGISTRY_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    'upsert_decryption_operator',
                    {
                        account_id: operator.accountId,
                        endpoint: operator.endpoint,
                        transport_public_key: operator.transportPublicKey,
                    },
                    '30000000000000',
                    '0',
                ),
            ],
        });
    }

    for (const relayer of relayers) {
        await owner.signAndSendTransaction({
            receiverId: REGISTRY_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    'upsert_relayer',
                    {
                        account_id: relayer.accountId,
                        endpoint: relayer.endpoint,
                        transport_public_key: relayer.transportPublicKey,
                    },
                    '30000000000000',
                    '0',
                ),
            ],
        });
    }

    console.log(JSON.stringify({
        registryContractId: REGISTRY_CONTRACT_ID,
        ownerAccountId: OWNER_ACCOUNT_ID,
        threshold,
        operators: config.decryptionOperators,
        relayers,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
