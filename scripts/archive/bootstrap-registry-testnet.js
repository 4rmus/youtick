const { pathToFileURL } = require('url');
const path = require('path');

const RPC_URL = 'https://rpc.testnet.near.org';
const OWNER_ACCOUNT_ID = process.env.ZERO_TRUST_OWNER_ID || 'v2-0.utick.testnet';
const OWNER_SECRET_KEY =
    process.env.MASTER_SECRET_KEY ||
    process.env.ZERO_TRUST_OWNER_KEY;
const REGISTRY_CONTRACT_ID =
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ||
    process.env.REGISTRY_CONTRACT_ID ||
    'registry-1773606802388.v2-0.utick.testnet';

const DECRYPTION_OPERATORS = [
    {
        accountId: 'kms-a.v2-0.utick.testnet',
        endpoint: 'https://youtick-kms-testnet.araafatsum.workers.dev',
        transportPublicKey: 'cf-worker:testnet:youtick-kms-testnet',
    },
    {
        accountId: 'kms-b.v2-0.utick.testnet',
        endpoint: 'https://youtick-kms-testnet-b.araafatsum.workers.dev',
        transportPublicKey: 'cf-worker:testnet:youtick-kms-testnet-b',
    },
    {
        accountId: 'kms-c.v2-0.utick.testnet',
        endpoint: 'https://youtick-kms-testnet-c.araafatsum.workers.dev',
        transportPublicKey: 'cf-worker:testnet:youtick-kms-testnet-c',
    },
    {
        accountId: 'kms-d.v2-0.utick.testnet',
        endpoint: 'https://youtick-kms-testnet-d.araafatsum.workers.dev',
        transportPublicKey: 'cf-worker:testnet:youtick-kms-testnet-d',
    },
    {
        accountId: 'kms-e.v2-0.utick.testnet',
        endpoint: 'https://youtick-kms-testnet-e.araafatsum.workers.dev',
        transportPublicKey: 'cf-worker:testnet:youtick-kms-testnet-e',
    },
];

const LEGACY_OPERATOR_IDS = [
    'v2-0.utick.testnet',
];

const RELAYER = {
    accountId: process.env.RELAYER_REGISTRY_ACCOUNT_ID || OWNER_ACCOUNT_ID,
    endpoint: process.env.RELAYER_ENDPOINT || `near:testnet:${OWNER_ACCOUNT_ID}`,
    transportPublicKey: process.env.RELAYER_TRANSPORT_PUBLIC_KEY || 'bootstrap-relayer:testnet',
};

async function loadNearApiJs() {
    const moduleUrl = pathToFileURL(
        path.join(__dirname, '../apps/web/node_modules/near-api-js/lib/index.js'),
    ).href;

    return import(moduleUrl);
}

async function main() {
    if (!OWNER_SECRET_KEY) {
        throw new Error('MASTER_SECRET_KEY or ZERO_TRUST_OWNER_KEY is required. Do not hardcode owner keys in archived scripts.');
    }

    const { Account, KeyPair, KeyPairSigner, actions } = await loadNearApiJs();

    const ownerKeyPair = KeyPair.fromString(OWNER_SECRET_KEY);
    const owner = new Account(OWNER_ACCOUNT_ID, RPC_URL, new KeyPairSigner(ownerKeyPair));

    for (const operatorAccountId of LEGACY_OPERATOR_IDS) {
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
            // Best-effort cleanup: ignore if the legacy record was not present.
        }
    }

    for (const operator of DECRYPTION_OPERATORS) {
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

    await owner.signAndSendTransaction({
        receiverId: REGISTRY_CONTRACT_ID,
        actions: [
            actions.functionCall(
                'upsert_relayer',
                {
                    account_id: RELAYER.accountId,
                    endpoint: RELAYER.endpoint,
                    transport_public_key: RELAYER.transportPublicKey,
                },
                '30000000000000',
                '0',
            ),
        ],
    });

    console.log(JSON.stringify({
        registryContractId: REGISTRY_CONTRACT_ID,
        operators: DECRYPTION_OPERATORS,
        relayer: RELAYER,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
