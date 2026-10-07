// Sign-in for the V2 ticket flow (option C2): one NEAR Auth login whose id_token nonce binds a fresh
// CKD ephemeral key, then ckd-gate rule (a) returns the account's CKD secret with no approval screen.
// Nothing here is persisted: the id_token, scalar and CKD key live only in the returned values.
import {
    CKD_TRUST_ROOTS, ckdGateNonce, createCkdDecryptor, generateEphemeralKeyPV, requestKeyArgs,
    type CkdGateResult, type CkdNetwork, type CkdTrustRoot,
} from '../ticket-keys/ckd';
import { resolveNearAuthAccount, type ViewFunction } from './account';
import type { NearAuthConfig } from './config';
import { checkIdToken } from './id-token';
import { loginWithNonce, type OidcEnvironment, type PopupLike } from './oidc';

/** Submits `request_key` to the gate (through the relayer, which pays gas) and returns `on_ckd`'s value. */
export type CkdRequestSubmitter = (request: {
    gateAccountId: string;
    args: ReturnType<typeof requestKeyArgs>;
}) => Promise<CkdGateResult>;

export interface CkdSignInResult {
    accountId: string;
    /** The fast-auth key of the account, `ed25519:…`. */
    publicKey: string;
    ckdKey: Uint8Array;
    gateAccountId: string;
}

export interface CkdSignInInput {
    config: NearAuthConfig;
    gateAccountId: string;
    popup: PopupLike;
    redirectUri: string;
    /**
     * Reads the expected account. Serve it from an RPC the relayer does not control: the result's
     * account check is the only thing stopping a relayer from answering with another account's CKD.
     */
    view: ViewFunction;
    submit: CkdRequestSubmitter;
    prompt?: 'login';
    nowS?: () => number;
    oidc?: OidcEnvironment;
    /** Tests only; production always uses the pinned `CKD_TRUST_ROOTS`. */
    trustRoots?: Readonly<Record<CkdNetwork, readonly CkdTrustRoot[]>>;
}

export function trustedCkdGates(
    network: NearAuthConfig['network'], roots: Readonly<Record<CkdNetwork, readonly CkdTrustRoot[]>> = CKD_TRUST_ROOTS,
): string[] {
    return roots[network].map((root) => root.gateAccountId);
}

export async function signInWithCkd(input: CkdSignInInput): Promise<CkdSignInResult> {
    const { config, gateAccountId } = input;
    const roots = input.trustRoots ?? CKD_TRUST_ROOTS;
    // Checked before login so a token is never published for a gate we would not trust.
    if (!trustedCkdGates(config.network, roots).includes(gateAccountId)) {
        if (!input.popup.closed) input.popup.close();
        throw new Error('ckd_gate_not_trusted');
    }
    const ephemeral = generateEphemeralKeyPV();
    const nonce = ckdGateNonce(gateAccountId, ephemeral);
    const idToken = await loginWithNonce(input.popup, {
        issuer: config.provider.issuer, clientId: config.clientId, nonce, redirectUri: input.redirectUri,
        ...(input.prompt ? { prompt: input.prompt } : {}),
    }, input.oidc);
    const nowS = input.nowS ?? (() => Math.floor(Date.now() / 1000));
    const claims = checkIdToken(idToken, { issuer: config.provider.issuer, clientId: config.clientId, nonce, nowS: nowS() });
    const account = await resolveNearAuthAccount(config.provider, claims, input.view);
    // Rule (a): no account_id, so the gate resolves the token's own fast-auth account.
    const result = await input.submit({ gateAccountId, args: requestKeyArgs(idToken, ephemeral) });
    const ckdKey = createCkdDecryptor(roots)({
        network: config.network, gateAccountId, accountId: account.accountId, result, scalar: ephemeral.scalar,
    });
    return { accountId: account.accountId, publicKey: account.publicKey, ckdKey, gateAccountId };
}
