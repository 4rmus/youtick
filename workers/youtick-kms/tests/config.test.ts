import { describe, expect, it } from 'vitest';
import worker, { getAllowedOrigins, getWorkerReadiness, type Env } from '../src/index';

type TestEnv = Partial<Env>;

function baseEnv(overrides: TestEnv = {}): Env {
    return {
        VIDEO_KEYS: {} as Env['VIDEO_KEYS'],
        RATE_LIMIT: {} as Env['RATE_LIMIT'],
        ACCESS_CACHE: {} as Env['ACCESS_CACHE'],
        ALLOWED_ORIGINS: '',
        NEAR_CONTRACT_ID: 'youtick.near',
        NEAR_NETWORK: 'testnet',
        ...overrides,
    } as Env;
}

const VALID_SECRET = 'a'.repeat(48);
const OTHER_VALID_SECRET = 'b'.repeat(48);

describe('getAllowedOrigins', () => {
    it('returns empty set for empty config', () => {
        const env = baseEnv({ ALLOWED_ORIGINS: '' });
        expect(getAllowedOrigins(env).size).toBe(0);
    });

    it('splits comma-separated origins and trims whitespace', () => {
        const env = baseEnv({
            ALLOWED_ORIGINS: 'https://youtick.net, https://app.youtick.net ,https://preview.youtick.net',
        });
        const result = getAllowedOrigins(env);
        expect(result.size).toBe(3);
        expect(result.has('https://youtick.net')).toBe(true);
        expect(result.has('https://app.youtick.net')).toBe(true);
        expect(result.has('https://preview.youtick.net')).toBe(true);
    });

    it('drops empty entries from trailing commas', () => {
        const env = baseEnv({ ALLOWED_ORIGINS: 'https://youtick.net,,' });
        expect(getAllowedOrigins(env).size).toBe(1);
    });

    it('does not allow localhost on mainnet even if it is configured', async () => {
        const env = baseEnv({
            ALLOWED_ORIGINS: 'https://youtick.net,http://localhost:3000',
            NEAR_NETWORK: 'mainnet',
        });
        const response = await worker.fetch(
            new Request('https://kms.youtick.net/retrieve', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3000' },
            }),
            env,
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('getWorkerReadiness', () => {
    it('returns ready=true on non-mainnet with missing secrets', () => {
        const env = baseEnv({ NEAR_NETWORK: 'testnet' });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('flags missing registry config on mainnet', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            OPERATOR_SHARE_SECRET: VALID_SECRET,
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(false);
        expect(result.errors).toContain('NEAR_REGISTRY_CONTRACT_ID is required on mainnet');
        expect(result.errors).toContain('REGISTRY_OPERATOR_ACCOUNT_ID is required on mainnet');
    });

    it('flags missing OPERATOR_SHARE_SECRET on mainnet', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(false);
        expect(result.errors).toContain('OPERATOR_SHARE_SECRET is required on mainnet');
    });

    it('flags short OPERATOR_SHARE_SECRET', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
            OPERATOR_SHARE_SECRET: 'short',
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(false);
        expect(result.errors).toContain('OPERATOR_SHARE_SECRET must be at least 32 characters');
    });

    it('flags placeholder OPERATOR_SHARE_SECRET', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
            OPERATOR_SHARE_SECRET: 'CHANGE-ME-' + 'x'.repeat(40),
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(false);
        expect(result.errors).toContain('OPERATOR_SHARE_SECRET must be changed from the default placeholder');
    });

    it('accepts valid mainnet config without PREVIOUS', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
            OPERATOR_SHARE_SECRET: VALID_SECRET,
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('accepts dual-key rotation config with distinct secrets', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
            OPERATOR_SHARE_SECRET: VALID_SECRET,
            OPERATOR_SHARE_SECRET_PREVIOUS: OTHER_VALID_SECRET,
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(true);
    });

    it('rejects PREVIOUS equal to current secret', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
            OPERATOR_SHARE_SECRET: VALID_SECRET,
            OPERATOR_SHARE_SECRET_PREVIOUS: VALID_SECRET,
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(false);
        expect(result.errors).toContain('OPERATOR_SHARE_SECRET_PREVIOUS must differ from OPERATOR_SHARE_SECRET');
    });

    it('rejects short PREVIOUS', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
            OPERATOR_SHARE_SECRET: VALID_SECRET,
            OPERATOR_SHARE_SECRET_PREVIOUS: 'short',
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(false);
        expect(result.errors).toContain('OPERATOR_SHARE_SECRET_PREVIOUS must be at least 32 characters when set');
    });

    it('rejects placeholder PREVIOUS', () => {
        const env = baseEnv({
            NEAR_NETWORK: 'mainnet',
            NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
            REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
            OPERATOR_SHARE_SECRET: VALID_SECRET,
            OPERATOR_SHARE_SECRET_PREVIOUS: 'CHANGE-ME-' + 'y'.repeat(40),
        });
        const result = getWorkerReadiness(env);
        expect(result.ready).toBe(false);
        expect(result.errors).toContain('OPERATOR_SHARE_SECRET_PREVIOUS must not be a placeholder value');
    });
});
