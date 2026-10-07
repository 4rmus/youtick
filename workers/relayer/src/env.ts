import { KeyPair } from 'near-api-js';
import type { FastAuthProvider } from './near';

export interface Env {
    RELAYER_ENABLED?: string;
    RELAYER_MUTATIONS_ENABLED?: string;
    NEAR_NETWORK?: string;
    NEAR_RPC_URL?: string;
    RELAYER_ACCOUNT_ID?: string;
    /** Secret. Full-access key of the relayer account (roadmap D7); never logged. */
    RELAYER_PRIVATE_KEY?: string;
    NEAR_AUTH_CLIENT_ID?: string;
    CKD_GATE_ACCOUNT_IDS?: string;
    USDC_CONTRACT_ID?: string;
    ACCOUNT_FUNDING_YOCTO?: string;
    MAX_STORAGE_DEPOSIT_YOCTO?: string;
    DAILY_ACCOUNT_LIMIT?: string;
    DAILY_CKD_LIMIT?: string;
    IDENTITY_DAILY_CKD_LIMIT?: string;
    DAILY_INVITE_USDC_MICRO_LIMIT?: string;
    INVITE_AMOUNTS_USDC_MICRO?: string;
    INVITE_TTL_DAYS?: string;
    ALLOWED_ORIGINS?: string;
    /** Secret. Bearer token for `/internal/*` (invite creation, allowlist reads). */
    RELAYER_ADMIN_TOKEN?: string;
    RELAYER_CONTROL?: DurableObjectNamespace;
    /** Per-IP limiter for `/v1/*`; the daily caps alone could be drained by throwaway identities. */
    RELAYER_RATE_LIMITER?: RateLimit;
}

// Pinned like the web client's NEAR_AUTH_PROVIDERS; mainnet waits for the NEAR Auth approval (X2).
export const FAST_AUTH_PROVIDERS: Readonly<Record<'testnet' | 'mainnet', FastAuthProvider | null>> = Object.freeze({
    testnet: Object.freeze({
        issuer: 'https://login.testnet.fast-auth.com/',
        fastAuthContractId: 'fast-auth.testnet',
        mpcContractId: 'v1.signer-prod.testnet',
        fastAuthDomainId: 1,
    }),
    mainnet: null,
});

export interface RelayerConfig {
    network: 'testnet' | 'mainnet';
    provider: FastAuthProvider;
    clientId: string;
    accountId: string;
    privateKey: string;
    publicKey: string;
    mutationsEnabled: boolean;
    ckdGates: string[];
    usdcContractId: string;
    accountFundingYocto: string;
    maxStorageDepositYocto: string;
    dailyAccountLimit: string;
    dailyCkdLimit: string;
    identityDailyCkdLimit: string;
    dailyInviteUsdcMicroLimit: string;
    inviteAmountsMicro: string[];
    inviteTtlMs: number;
    allowedOrigins: string[];
}

const ACCOUNT_ID = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const POSITIVE = /^[1-9][0-9]{0,30}$/;

/** Returns null unless every value is present and well-formed; the relayer then answers 503. */
export function relayerConfig(env: Env): RelayerConfig | null {
    const network = env.NEAR_NETWORK;
    if (env.RELAYER_ENABLED !== 'true' || (network !== 'testnet' && network !== 'mainnet')) return null;
    const provider = FAST_AUTH_PROVIDERS[network];
    if (!provider) return null;
    const list = (value: string | undefined) => (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    const ckdGates = list(env.CKD_GATE_ACCOUNT_IDS);
    const inviteAmountsMicro = list(env.INVITE_AMOUNTS_USDC_MICRO);
    const allowedOrigins = list(env.ALLOWED_ORIGINS);
    const numbers = [env.ACCOUNT_FUNDING_YOCTO, env.MAX_STORAGE_DEPOSIT_YOCTO, env.DAILY_ACCOUNT_LIMIT, env.DAILY_CKD_LIMIT,
        env.IDENTITY_DAILY_CKD_LIMIT, env.DAILY_INVITE_USDC_MICRO_LIMIT, env.INVITE_TTL_DAYS];
    if (!env.NEAR_RPC_URL?.startsWith('https://') || !ACCOUNT_ID.test(env.RELAYER_ACCOUNT_ID ?? '')
        || !ACCOUNT_ID.test(env.USDC_CONTRACT_ID ?? '') || !/^[A-Za-z0-9_-]{1,128}$/.test(env.NEAR_AUTH_CLIENT_ID ?? '')
        || !ckdGates.every((gate) => ACCOUNT_ID.test(gate))
        || !inviteAmountsMicro.length || !inviteAmountsMicro.every((amount) => POSITIVE.test(amount))
        || !allowedOrigins.every((origin) => /^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/.test(origin) || /^http:\/\/localhost:[0-9]+$/.test(origin))
        || !numbers.every((value) => POSITIVE.test(value ?? ''))
        || !/^[A-Za-z0-9_-]{32,256}$/.test(env.RELAYER_ADMIN_TOKEN ?? '')) return null;
    let publicKey: string;
    try {
        publicKey = KeyPair.fromString(env.RELAYER_PRIVATE_KEY as `ed25519:${string}`).getPublicKey().toString();
    } catch {
        return null;
    }
    return {
        network, provider, clientId: env.NEAR_AUTH_CLIENT_ID!, accountId: env.RELAYER_ACCOUNT_ID!,
        privateKey: env.RELAYER_PRIVATE_KEY!, publicKey,
        mutationsEnabled: env.RELAYER_MUTATIONS_ENABLED === 'true',
        ckdGates, usdcContractId: env.USDC_CONTRACT_ID!, accountFundingYocto: env.ACCOUNT_FUNDING_YOCTO!,
        maxStorageDepositYocto: env.MAX_STORAGE_DEPOSIT_YOCTO!, dailyAccountLimit: env.DAILY_ACCOUNT_LIMIT!,
        dailyCkdLimit: env.DAILY_CKD_LIMIT!, identityDailyCkdLimit: env.IDENTITY_DAILY_CKD_LIMIT!,
        dailyInviteUsdcMicroLimit: env.DAILY_INVITE_USDC_MICRO_LIMIT!, inviteAmountsMicro,
        inviteTtlMs: Number(env.INVITE_TTL_DAYS) * 86_400_000, allowedOrigins,
    };
}
