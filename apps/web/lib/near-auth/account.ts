// The NEAR account behind a NEAR Auth identity: the implicit account of the key the MPC network
// derives for fast-auth at `jwt#<iss>#<sub>`. ckd-gate rule (a) resolves the same account on chain,
// so a wrong answer here only makes the CKD result fail its account check.
import { baseDecode, baseEncode } from 'near-api-js';
import { hexEncode } from '../crypto/codec';
import type { NearAuthProvider } from './config';
import { fastAuthPath, type IdTokenClaims } from './id-token';

export type ViewFunction = <T>(contractId: string, method: string, args: Record<string, unknown>) => Promise<T>;

export interface NearAuthAccount {
    accountId: string;
    publicKey: string;
}

export async function resolveNearAuthAccount(
    provider: NearAuthProvider, claims: Pick<IdTokenClaims, 'iss' | 'sub'>, view: ViewFunction,
): Promise<NearAuthAccount> {
    if (claims.iss !== provider.issuer) throw new Error('id_token_issuer_mismatch');
    const [paused, mpcAddress, mpcDomain] = await Promise.all([
        view<unknown>(provider.fastAuthContractId, 'paused', {}),
        view<unknown>(provider.fastAuthContractId, 'mpc_address', {}),
        view<unknown>(provider.fastAuthContractId, 'mpc_domain_id', {}),
    ]);
    if (paused !== false) throw new Error('near_auth_paused');
    if (mpcAddress !== provider.mpcContractId || mpcDomain !== provider.fastAuthDomainId) {
        throw new Error('provider_configuration_changed');
    }
    const derived = await view<unknown>(provider.mpcContractId, 'derived_public_key', {
        path: fastAuthPath(claims), predecessor: provider.fastAuthContractId, domain_id: provider.fastAuthDomainId,
    });
    if (typeof derived !== 'string' || !derived.startsWith('ed25519:')) throw new Error('invalid_public_key');
    let raw: Uint8Array;
    try {
        raw = baseDecode(derived.slice('ed25519:'.length));
    } catch {
        throw new Error('invalid_public_key');
    }
    if (raw.length !== 32 || `ed25519:${baseEncode(raw)}` !== derived) throw new Error('invalid_public_key');
    return { accountId: hexEncode(raw), publicKey: derived };
}
