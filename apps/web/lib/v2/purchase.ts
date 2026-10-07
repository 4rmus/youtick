// V2 crypto checkout through NEAR Auth (roadmap E7b/E7c). One approval on the NEAR Auth screen:
// the user approves a delegate action (their account calling USDC `ft_transfer_call` to Market V2
// with `buy_ticket_v2`); the relayer turns that approval into an MPC signature through fast-auth
// and relays it. The ticket is confirmed only by `get_ticket` on chain.
import { PublicKey, actions, buildDelegateAction, encodeDelegateAction } from 'near-api-js';
import { requestDelegateApproval, type OidcEnvironment, type PopupLike } from '../near-auth/oidc';
import { deriveRootKey, ticketKey } from '../ticket-keys/keys';
import { buildPurchaseTransferArgs, signatureExpiry, type VatAttestation } from '../ticket-keys/messages';
import type { V2Config } from './config';
import type { DeviceKey } from './device-key';
import { readTicket, type MarketTicket, type ViewContract } from './tickets';

/** Must match workers/relayer/src/purchase.ts: the relayer rebuilds these exact bytes. */
export const PURCHASE_GAS = 300_000_000_000_000n;
export const PURCHASE_DEPOSIT = 1n;
/** Blocks the approval stays valid for; the relayer accepts at most 1,200. */
export const DELEGATE_TTL_BLOCKS = 600n;

export interface PurchaseArgs {
    receiver_id: string;
    amount: string;
    msg: string;
}

export function purchaseDelegateBytes(input: {
    senderId: string; publicKey: string; usdcContractId: string; args: PurchaseArgs; nonce: bigint; maxBlockHeight: bigint;
}): Uint8Array {
    return encodeDelegateAction(buildDelegateAction({
        senderId: input.senderId,
        receiverId: input.usdcContractId,
        publicKey: PublicKey.fromString(input.publicKey),
        nonce: input.nonce,
        maxBlockHeight: input.maxBlockHeight,
        actions: [actions.functionCall('ft_transfer_call', { ...input.args }, PURCHASE_GAS, PURCHASE_DEPOSIT)],
    }));
}

export interface CheckoutDeps {
    view: ViewContract;
    /** Final-state access key of the user's account: nonce and the block height it was read at. */
    accessKey: (accountId: string, publicKey: string) => Promise<{ nonce: bigint; blockHeight: bigint }>;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    oidc?: OidcEnvironment;
    randomNonce?: () => string;
}

export class CheckoutError extends Error {}

async function postJson(fetcher: typeof fetch, url: string, body: unknown): Promise<{ status: number; value: Record<string, unknown> }> {
    let response: Response;
    try {
        response = await fetcher(url, {
            method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
        });
    } catch {
        throw new CheckoutError('checkout_unavailable');
    }
    const value = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, value };
}

function errorCode(value: Record<string, unknown>, fallback: string): string {
    return typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error) ? value.error : fallback;
}

/**
 * Buys one ticket. `ticketIndex` must be unused: the caller reserves it (recovery scan `nextIndex`
 * plus any purchase it started in this session). A collision is refunded by the contract.
 */
export async function buyTicket(input: {
    config: V2Config;
    paymentServiceUrl: string;
    usdcContractId: string;
    session: { accountId: string; publicKey: string; ckdKey: Uint8Array };
    publicationId: string;
    ticketIndex: number;
    device: DeviceKey;
    popup: PopupLike;
    redirectUri: string;
    deps: CheckoutDeps;
}): Promise<MarketTicket> {
    const { config, session, deps } = input;
    const fetcher = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const now = deps.now ?? (() => Date.now());
    const ticket = ticketKey(deriveRootKey(session.ckdKey), input.ticketIndex);
    const closePopup = () => { if (!input.popup.closed) input.popup.close(); };

    let args: PurchaseArgs;
    let nonce: bigint;
    let maxBlockHeight: bigint;
    let bytes: Uint8Array;
    try {
        const vat = await postJson(fetcher, `${input.paymentServiceUrl}/v1/vat-attestations`, {
            ticket_id: ticket.ticketId, publication_id: input.publicationId,
        });
        if (vat.status !== 200) throw new CheckoutError(errorCode(vat.value, 'vat_unavailable'));
        const attestation = vat.value as unknown as VatAttestation & { gross_usdc_micro: string };
        args = buildPurchaseTransferArgs({
            binding: { network: config.auth.network, contractId: config.marketContractId }, ticket, publicationId: input.publicationId,
            grossUsdcMicro: attestation.gross_usdc_micro,
            device: { sessionPublicKey: input.device.sessionPublicKey, certificateSha256: input.device.certificateSha256 },
            expiresAtMs: signatureExpiry(now()),
            vat: { vat_usdc_micro: attestation.vat_usdc_micro, expires_at_ms: attestation.expires_at_ms, key_version: attestation.key_version, signature: attestation.signature },
        });
        const key = await deps.accessKey(session.accountId, session.publicKey);
        nonce = key.nonce + 1n;
        maxBlockHeight = key.blockHeight + DELEGATE_TTL_BLOCKS;
        bytes = purchaseDelegateBytes({ senderId: session.accountId, publicKey: session.publicKey, usdcContractId: input.usdcContractId, args, nonce, maxBlockHeight });
    } catch (error) {
        closePopup();
        throw error instanceof CheckoutError ? error : new CheckoutError(error instanceof Error && /^[a-z_]{1,64}$/.test(error.message) ? error.message : 'checkout_failed');
    }

    const accessToken = await requestDelegateApproval(input.popup, {
        issuer: config.auth.provider.issuer, clientId: config.auth.clientId, redirectUri: input.redirectUri,
        nonce: deps.randomNonce?.() ?? crypto.randomUUID(), audience: config.auth.provider.signingAudience, delegateBytes: bytes,
    }, deps.oidc);

    const body = { access_token: accessToken, args, nonce: nonce.toString(), max_block_height: maxBlockHeight.toString() };
    for (let attempt = 0; ; attempt += 1) {
        const relayed = await postJson(fetcher, `${config.relayerUrl}/v1/purchases`, body);
        if (relayed.status === 200) break;
        if (relayed.status !== 202 || attempt >= 20) throw new CheckoutError(errorCode(relayed.value, 'purchase_pending'));
        await sleep(3_000);
    }
    // The relay landed; only the chain says whether the Market accepted or refunded the transfer.
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const onChain = await readTicket(deps.view, config.marketContractId, ticket.ticketId);
        if (onChain) return onChain;
        await sleep(2_000);
    }
    throw new CheckoutError('purchase_not_confirmed');
}
