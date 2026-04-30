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
const OPERATOR_CONFIG_JSON = process.env.KMS_OPERATORS_CONFIG;

async function loadNearApiJs() {
    const moduleUrl = pathToFileURL(
        path.join(__dirname, '../apps/web/node_modules/near-api-js/lib/index.js'),
    ).href;

    return import(moduleUrl);
}

function decodeSuccessValue(result) {
    const value = result && result.status && result.status.SuccessValue;
    if (!value) {
        return null;
    }

    const decoded = Buffer.from(value, 'base64').toString('utf-8');
    try {
        return JSON.parse(decoded);
    } catch {
        return decoded;
    }
}

function ensureFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found at ${filePath}`);
    }
}

function validateConfig(config, source) {
    if (!Array.isArray(config.decryptionOperators) || config.decryptionOperators.length === 0) {
        throw new Error('decryptionOperators must contain at least one operator');
    }

    const endpoints = [
        ...config.decryptionOperators.map((operator) => operator.endpoint),
        ...(Array.isArray(config.relayers) ? config.relayers.map((relayer) => relayer.endpoint) : []),
    ].filter((endpoint) => typeof endpoint === 'string');

    const hasExampleEndpoint = endpoints.some((endpoint) => endpoint.includes('.example.'));
    if (hasExampleEndpoint && process.env.ALLOW_EXAMPLE_KMS_CONFIG !== 'true') {
        throw new Error(
            `${source} contains example KMS endpoints. Provide the real config through KMS_OPERATORS_CONFIG or KMS_OPERATORS_PATH.`,
        );
    }
}

function loadConfig() {
    if (OPERATOR_CONFIG_JSON && OPERATOR_CONFIG_JSON.trim()) {
        let config;
        try {
            config = JSON.parse(OPERATOR_CONFIG_JSON);
        } catch (error) {
            throw new Error(`KMS_OPERATORS_CONFIG must be valid JSON: ${error.message}`);
        }

        validateConfig(config, 'KMS_OPERATORS_CONFIG');
        return config;
    }

    ensureFileExists(
        OPERATOR_CONFIG_PATH,
        'Operator config file. Start from scripts/config/mainnet-kms-operators.example.json',
    );

    const config = JSON.parse(fs.readFileSync(OPERATOR_CONFIG_PATH, 'utf-8'));
    validateConfig(config, OPERATOR_CONFIG_PATH);
    return config;
}

async function main() {
    if (!OWNER_SECRET_KEY) {
        throw new Error('ZERO_TRUST_OWNER_KEY or MASTER_SECRET_KEY is required');
    }

    const config = loadConfig();
    const { Account, KeyPair, KeyPairSigner, actions: nearActions } = await loadNearApiJs();
    const ownerKeyPair = KeyPair.fromString(OWNER_SECRET_KEY);
    const owner = new Account(OWNER_ACCOUNT_ID, RPC_URL, new KeyPairSigner(ownerKeyPair));
    const proposedActions = [];

    async function proposeRegistryAction(action) {
        const result = await owner.signAndSendTransaction({
            receiverId: REGISTRY_CONTRACT_ID,
            actions: [
                nearActions.functionCall(
                    'propose_action',
                    { action },
                    '30000000000000',
                    '0',
                ),
            ],
        });
        const id = decodeSuccessValue(result);
        proposedActions.push({ id, action });
        return id;
    }

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
            await proposeRegistryAction({
                DeactivateDecryptionOperator: {
                    account_id: operatorAccountId,
                },
            });
        } catch {
            // Best effort cleanup proposal.
        }
    }

    for (const operator of config.decryptionOperators) {
        await proposeRegistryAction({
            UpsertDecryptionOperator: {
                account_id: operator.accountId,
                endpoint: operator.endpoint,
                transport_public_key: operator.transportPublicKey,
            },
        });
    }

    for (const relayer of relayers) {
        await proposeRegistryAction({
            UpsertRelayer: {
                account_id: relayer.accountId,
                endpoint: relayer.endpoint,
                transport_public_key: relayer.transportPublicKey,
            },
        });
    }

    await proposeRegistryAction({
        SetThresholdConfig: {
            total_operators: threshold.totalOperators,
            required_shares: threshold.requiredShares,
        },
    });

    console.log('\nTimelock proposals were submitted. Review each proposal, wait at least 24 hours, then execute reviewed IDs:');
    for (const proposal of proposedActions) {
        if (proposal.id === null || proposal.id === undefined) {
            console.log(`- near view ${REGISTRY_CONTRACT_ID} get_timelock '{"id": <id>}'`);
            continue;
        }
        console.log(`- near view ${REGISTRY_CONTRACT_ID} get_timelock '{"id": ${proposal.id}}'`);
        console.log(`  near call ${REGISTRY_CONTRACT_ID} execute_action '{"id": ${proposal.id}}' --accountId ${OWNER_ACCOUNT_ID}`);
    }

    console.log('\nAfter execution, verify:');
    console.log(`- near view ${REGISTRY_CONTRACT_ID} list_decryption_operators`);
    console.log(`- near view ${REGISTRY_CONTRACT_ID} get_threshold_config`);

    console.log(JSON.stringify({
        registryContractId: REGISTRY_CONTRACT_ID,
        ownerAccountId: OWNER_ACCOUNT_ID,
        threshold,
        operators: config.decryptionOperators,
        relayers,
        proposedActions,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
