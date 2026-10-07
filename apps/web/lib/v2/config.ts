// V2 ticket pages are available only when NEAR Auth is configured and every V2 endpoint is set.
import { APP_CONFIG } from '../constants';
import { nearAuthConfig, type NearAuthConfig } from '../near-auth/config';

export interface V2Config {
    auth: NearAuthConfig;
    marketContractId: string;
    gateAccountId: string;
    relayerUrl: string;
    bridgeUrl: string;
}

const ACCOUNT_ID = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function httpsOrigin(value: string | undefined): string | null {
    try {
        const url = new URL(value ?? '');
        return url.protocol === 'https:' && url.origin === value?.replace(/\/$/, '') ? url.origin : null;
    } catch {
        return null;
    }
}

export function v2Config(
    env: { marketContractId?: string; gateAccountId?: string; relayerUrl?: string; bridgeUrl?: string; auth?: NearAuthConfig | null } = {
        marketContractId: process.env.NEXT_PUBLIC_MARKET_V2_CONTRACT_ID,
        gateAccountId: process.env.NEXT_PUBLIC_CKD_GATE_ACCOUNT_ID,
        relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL,
        bridgeUrl: APP_CONFIG.livepeerBridgeUrl,
    },
): V2Config | null {
    const auth = env.auth === undefined ? nearAuthConfig() : env.auth;
    const relayerUrl = httpsOrigin(env.relayerUrl);
    const bridgeUrl = httpsOrigin(env.bridgeUrl);
    const marketContractId = env.marketContractId?.trim() ?? '';
    const gateAccountId = env.gateAccountId?.trim() ?? '';
    if (!auth || !relayerUrl || !bridgeUrl || !ACCOUNT_ID.test(marketContractId) || !ACCOUNT_ID.test(gateAccountId)) return null;
    return { auth, marketContractId, gateAccountId, relayerUrl, bridgeUrl };
}
