// V2 crypto purchase through NEAR Auth (roadmap E7b). The relayer never accepts a delegate action
// from the client: it rebuilds the only one it sponsors — the user's account calling USDC
// `ft_transfer_call` to Market V2 with a `buy_ticket_v2` message — and requires those exact bytes
// to equal the `fatxn` the user approved on the NEAR Auth screen.
import { PublicKey, actions, buildDelegateAction, encodeDelegateAction } from 'near-api-js';

/** Shared with apps/web/lib/v2/purchase.ts; the protocol size budget assumes the same values. */
export const PURCHASE_GAS = 300_000_000_000_000n;
export const PURCHASE_DEPOSIT = 1n;
/** A delegate must expire within this many blocks of the current final height. */
export const MAX_DELEGATE_TTL_BLOCKS = 1_200n;
/** NEAR rejects a delegate nonce at or above `block_height * 1e6` (DelegateActionNonceTooLarge). */
export const NONCE_RANGE_MULTIPLIER = 1_000_000n;

export interface PurchaseArgs {
    receiver_id: string;
    amount: string;
    msg: string;
}

export interface PurchaseFields {
    args: PurchaseArgs;
    nonce: string;
    max_block_height: string;
}

const DECIMAL = /^[1-9][0-9]{0,38}$/;
const U64_MAX = (1n << 64n) - 1n;
const u64 = (value: unknown) => typeof value === 'string' && DECIMAL.test(value) && BigInt(value) <= U64_MAX;

export function parsePurchaseFields(value: unknown, marketContractId: string): PurchaseFields & { publicationId: string } {
    const body = value as Record<string, unknown> | null;
    const args = body?.args as Record<string, unknown> | undefined;
    if (!body || Object.keys(body).sort().join(',') !== 'args,max_block_height,nonce'
        || !args || Object.keys(args).join(',') !== 'receiver_id,amount,msg'
        || args.receiver_id !== marketContractId || typeof args.amount !== 'string' || !DECIMAL.test(args.amount)
        || typeof args.msg !== 'string' || args.msg.length > 2_048
        || !u64(body.nonce) || !u64(body.max_block_height)) {
        throw new Error('invalid_request');
    }
    let msg: Record<string, unknown>;
    try {
        msg = JSON.parse(args.msg) as Record<string, unknown>;
    } catch {
        throw new Error('invalid_request');
    }
    // The Market verifies the rest (ticket and VAT signatures, price); the relayer only refuses
    // to sponsor anything that is not a V2 ticket purchase.
    if (msg?.action !== 'buy_ticket_v2' || typeof msg.publication_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(msg.publication_id)) {
        throw new Error('invalid_request');
    }
    return {
        args: { receiver_id: args.receiver_id, amount: args.amount, msg: args.msg },
        nonce: body.nonce as string, max_block_height: body.max_block_height as string, publicationId: msg.publication_id,
    };
}

export function purchaseDelegate(input: {
    senderId: string; publicKey: string; usdcContractId: string; fields: PurchaseFields;
}) {
    const delegateAction = buildDelegateAction({
        senderId: input.senderId,
        receiverId: input.usdcContractId,
        publicKey: PublicKey.fromString(input.publicKey),
        nonce: BigInt(input.fields.nonce),
        maxBlockHeight: BigInt(input.fields.max_block_height),
        actions: [actions.functionCall('ft_transfer_call', { ...input.fields.args }, PURCHASE_GAS, PURCHASE_DEPOSIT)],
    });
    return { delegateAction, bytes: encodeDelegateAction(delegateAction) };
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
    return difference === 0;
}
