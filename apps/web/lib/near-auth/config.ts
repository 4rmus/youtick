// NEAR Auth (Google / passkey through fast-auth) for the V2 ticket flow. Disabled unless the flag
// is set; a network without a pinned provider entry has no NEAR Auth at all.
import { NEAR_NETWORK } from '../constants';

export interface NearAuthProvider {
    /** OIDC issuer with trailing slash, exactly as it appears in `iss` and in fast-auth paths. */
    issuer: string;
    /** Audience of signing access tokens; it is also the fast-auth JWT guard account. */
    signingAudience: string;
    fastAuthContractId: string;
    mpcContractId: string;
    /** MPC domain fast-auth signs with; the account key is derived in it. */
    fastAuthDomainId: number;
}

// Values the spikes verified on testnet (youtick-v2-spikes 1b3e66c). Mainnet waits for the NEAR Auth
// approval (roadmap X2), which supplies the issuer and client; until then there is no entry.
export const NEAR_AUTH_PROVIDERS: Readonly<Record<'testnet' | 'mainnet', NearAuthProvider | null>> = Object.freeze({
    testnet: Object.freeze({
        issuer: 'https://login.testnet.fast-auth.com/',
        signingAudience: 'auth0.jwt.fast-auth.testnet',
        fastAuthContractId: 'fast-auth.testnet',
        mpcContractId: 'v1.signer-prod.testnet',
        fastAuthDomainId: 1,
    }),
    mainnet: null,
});

export interface NearAuthConfig {
    network: 'testnet' | 'mainnet';
    clientId: string;
    provider: NearAuthProvider;
}

export function nearAuthConfig(
    env: { enabled?: string; clientId?: string; network?: 'testnet' | 'mainnet' } = {
        enabled: process.env.NEXT_PUBLIC_ENABLE_NEAR_AUTH_V2,
        clientId: process.env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID,
        network: NEAR_NETWORK,
    },
): NearAuthConfig | null {
    const network = env.network;
    if (env.enabled !== 'true' || (network !== 'testnet' && network !== 'mainnet')) return null;
    const provider = NEAR_AUTH_PROVIDERS[network];
    const clientId = env.clientId?.trim() ?? '';
    if (!provider || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) return null;
    return { network, clientId, provider };
}
