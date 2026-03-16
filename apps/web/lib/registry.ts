import { NEAR_CONFIG } from './constants';
import { getProvider, viewContract } from './near';

export interface RegistryOperatorRecord {
    account_id: string;
    endpoint: string;
    transport_public_key: string;
    kind: 'DecryptionOperator' | 'Relayer';
    active: boolean;
}

export interface ThresholdConfig {
    total_operators: number;
    required_shares: number;
}

const REGISTRY_CACHE_MS = 60_000;

let cachedAt = 0;
let cachedOperators: RegistryOperatorRecord[] = [];
let pendingOperatorsPromise: Promise<RegistryOperatorRecord[]> | null = null;

export async function listActiveDecryptionOperators(): Promise<RegistryOperatorRecord[]> {
    if (Date.now() - cachedAt < REGISTRY_CACHE_MS) {
        return cachedOperators;
    }

    if (pendingOperatorsPromise) {
        return pendingOperatorsPromise;
    }

    pendingOperatorsPromise = (async () => {
        try {
            const provider = getProvider();
            const records = await viewContract<RegistryOperatorRecord[]>(
                provider,
                NEAR_CONFIG.registryContractId,
                'list_decryption_operators',
                {},
            );

            cachedOperators = records.filter((record) => record.active);
            cachedAt = Date.now();
            return cachedOperators;
        } catch {
            return cachedOperators;
        } finally {
            pendingOperatorsPromise = null;
        }
    })();

    return pendingOperatorsPromise;
}

export async function listActiveDecryptionOperatorEndpoints(): Promise<string[]> {
    const records = await listActiveDecryptionOperators();
    return Array.from(
        new Set(
            records
                .map((record) => record.endpoint.trim())
                .filter(Boolean),
        ),
    );
}

export async function getThresholdConfig(): Promise<ThresholdConfig | null> {
    try {
        const provider = getProvider();
        return await viewContract<ThresholdConfig>(
            provider,
            NEAR_CONFIG.registryContractId,
            'get_threshold_config',
            {},
        );
    } catch {
        return null;
    }
}

export function clearRegistryCache(): void {
    cachedAt = 0;
    cachedOperators = [];
    pendingOperatorsPromise = null;
}
