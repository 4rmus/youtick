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
