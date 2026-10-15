import { KeyPair } from 'near-api-js';

export interface Env {
    PAYMENT_SERVICE_ENABLED?: string;
    NEAR_NETWORK?: string;
    NEAR_RPC_URL?: string;
    MARKET_V2_CONTRACT_ID?: string;
    /**
     * Until the tax adviser's evidence policy (roadmap X3) exists, only `fixed-testnet` is
     * implemented: one VAT-inclusive rate for every buyer, testnet only.
     */
    VAT_POLICY?: string;
    VAT_RATE_BPS?: string;
    VAT_KEY_VERSION?: string;
    /** Secret. The VAT signer's NEAR-format ed25519 key; never logged. */
    VAT_SIGNER_PRIVATE_KEY?: string;
    ALLOWED_ORIGINS?: string;
    PAYMENT_RATE_LIMITER?: RateLimit;
    /** Checkout funnel counts; without the binding `/v1/funnel` accepts and drops events. */
    FUNNEL?: AnalyticsEngineDataset;
    /** Refund request inbox (migrations/); without it the refund endpoints answer 503. */
    REFUNDS?: D1Database;
    /** Secret. Bearer token of the operator tools for `/internal/*`; at least 32 characters. */
    REFUND_ADMIN_TOKEN?: string;
    /** Card path (roadmap E8). Off unless exactly `true` and a provider adapter exists. */
    CARD_PATH_ENABLED?: string;
    /** The Market V2 payment operator account the card path signs as. */
    PAYMENT_OPERATOR_ID?: string;
    /** Secret. A key of PAYMENT_OPERATOR_ID kept only for the card path; never logged. */
    PAYMENT_OPERATOR_PRIVATE_KEY?: string;
    /** Secret. HMAC key of `payment_reference_hmac`: 32 bytes as 64 lowercase hex; never rotated while orders are open. */
    CARD_REFERENCE_SECRET?: string;
    /** The single card operator (src/card-operator-object.ts). */
    CARD_OPERATOR?: DurableObjectNamespace;
}

export interface CardConfig {
    operatorId: string;
    operatorPrivateKey: string;
    referenceSecret: string;
}

/** The card path's own settings; null keeps every card endpoint answering `card_path_disabled`. */
export function cardConfig(env: Env): CardConfig | null {
    if (env.CARD_PATH_ENABLED !== 'true' || !env.REFUNDS || !env.CARD_OPERATOR || !ACCOUNT_ID.test(env.PAYMENT_OPERATOR_ID ?? '')
        || !/^[0-9a-f]{64}$/.test(env.CARD_REFERENCE_SECRET ?? '')) {
        return null;
    }
    try {
        if (KeyPair.fromString(env.PAYMENT_OPERATOR_PRIVATE_KEY as `ed25519:${string}`).getPublicKey().keyType !== 0) return null;
    } catch {
        return null;
    }
    return { operatorId: env.PAYMENT_OPERATOR_ID!, operatorPrivateKey: env.PAYMENT_OPERATOR_PRIVATE_KEY!, referenceSecret: env.CARD_REFERENCE_SECRET! };
}

export interface PaymentConfig {
    network: 'testnet';
    rpcUrl: string;
    marketContractId: string;
    rateBps: bigint;
    keyVersion: number;
    signer: KeyPair;
    publicKey: string;
    allowedOrigins: string[];
}

const ACCOUNT_ID = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function paymentConfig(env: Env): PaymentConfig | null {
    // Mainnet is refused on purpose: a VAT policy needs the tax adviser's decision first (X3).
    if (env.PAYMENT_SERVICE_ENABLED !== 'true' || env.NEAR_NETWORK !== 'testnet' || env.VAT_POLICY !== 'fixed-testnet') return null;
    const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
    if (!env.NEAR_RPC_URL?.startsWith('https://') || !ACCOUNT_ID.test(env.MARKET_V2_CONTRACT_ID ?? '')
        || !/^(0|[1-9][0-9]{0,3})$/.test(env.VAT_RATE_BPS ?? '') || BigInt(env.VAT_RATE_BPS!) > 2_700n
        || !/^[1-9][0-9]{0,8}$/.test(env.VAT_KEY_VERSION ?? '')
        || !origins.every((origin) => /^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/.test(origin) || /^http:\/\/localhost:[0-9]+$/.test(origin))) {
        return null;
    }
    let signer: KeyPair;
    try {
        signer = KeyPair.fromString(env.VAT_SIGNER_PRIVATE_KEY as `ed25519:${string}`);
        if (signer.getPublicKey().keyType !== 0) return null;
    } catch {
        return null;
    }
    return {
        network: 'testnet', rpcUrl: env.NEAR_RPC_URL, marketContractId: env.MARKET_V2_CONTRACT_ID!, rateBps: BigInt(env.VAT_RATE_BPS!),
        keyVersion: Number(env.VAT_KEY_VERSION), signer, publicKey: signer.getPublicKey().toString(), allowedOrigins: origins,
    };
}
