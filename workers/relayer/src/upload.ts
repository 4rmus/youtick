// V2 upload through NEAR Auth (roadmap E5b.2). Two upload steps need the creator's signature, and
// both follow the purchase pattern: the relayer never accepts a delegate action from the client,
// it rebuilds the only two it sponsors and requires those exact bytes to equal the `fatxn` the
// user approved on the NEAR Auth screen.
// - upload fee: the user's account calling USDC `ft_transfer_call` to Market V2 with a plain
//   `create_paid_job` message (no sponsor quote, no playback session);
// - upload key: the user's account calling Market V2 `replace_upload_key`.
// The byte formats are fixed in protocol/youtick-market-v2 (`upload` vector).
import { PublicKey, actions, buildDelegateAction, encodeDelegateAction } from 'near-api-js';

/** Shared with apps/web/lib/v2/upload.ts; the protocol size budget assumes the same values. */
export const UPLOAD_GAS = 100_000_000_000_000n;
export const UPLOAD_DEPOSIT = 1n;
export const UPLOAD_KEY_GAS = 100_000_000_000_000n;
export const UPLOAD_KEY_DEPOSIT = 0n;
export const UPLOAD_ACTION = 'create_paid_job';
export const UPLOAD_PROFILE_ID = 'paid-media-livepeer-v1';

export interface UploadArgs {
    receiver_id: string;
    amount: string;
    msg: string;
}

export interface UploadFields {
    args: UploadArgs;
    nonce: string;
    max_block_height: string;
}

export interface UploadKeyArgs {
    job_id: string;
    new_public_key: string;
    expires_at_ms: string;
}

export interface UploadKeyFields {
    args: UploadKeyArgs;
    nonce: string;
    max_block_height: string;
}

const DECIMAL = /^[1-9][0-9]{0,38}$/;
const U64_MAX = (1n << 64n) - 1n;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const NEAR_KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const u64 = (value: unknown) => typeof value === 'string' && DECIMAL.test(value) && BigInt(value) <= U64_MAX;

function envelope(value: unknown): { args: Record<string, unknown>; nonce: string; max_block_height: string } {
    const body = value as Record<string, unknown> | null;
    const args = body?.args as Record<string, unknown> | undefined;
    if (!body || Object.keys(body).sort().join(',') !== 'args,max_block_height,nonce' || !args || typeof args !== 'object' || Array.isArray(args)
        || !u64(body.nonce) || !u64(body.max_block_height)) {
        throw new Error('invalid_request');
    }
    return { args, nonce: body.nonce as string, max_block_height: body.max_block_height as string };
}

export function parseUploadFields(value: unknown, marketContractId: string): UploadFields & { jobId: string } {
    const { args, nonce, max_block_height } = envelope(value);
    if (Object.keys(args).join(',') !== 'receiver_id,amount,msg' || args.receiver_id !== marketContractId
        || typeof args.amount !== 'string' || !DECIMAL.test(args.amount) || typeof args.msg !== 'string' || args.msg.length > 2_048) {
        throw new Error('invalid_request');
    }
    let msg: Record<string, unknown>;
    try {
        msg = JSON.parse(args.msg) as Record<string, unknown>;
    } catch {
        throw new Error('invalid_request');
    }
    // `checkUploadMessage` verifies the rest the way Market V2 does; the relayer only refuses to
    // sponsor anything that is not a V2 paid-job creation.
    if (msg?.action !== UPLOAD_ACTION || typeof msg.job_id !== 'string' || !IDENTIFIER.test(msg.job_id)) throw new Error('invalid_request');
    return { args: { receiver_id: args.receiver_id, amount: args.amount, msg: args.msg }, nonce, max_block_height, jobId: msg.job_id };
}

export function parseUploadKeyFields(value: unknown): UploadKeyFields {
    const { args, nonce, max_block_height } = envelope(value);
    if (Object.keys(args).join(',') !== 'job_id,new_public_key,expires_at_ms' || typeof args.job_id !== 'string' || !IDENTIFIER.test(args.job_id)
        || typeof args.new_public_key !== 'string' || !NEAR_KEY.test(args.new_public_key) || !u64(args.expires_at_ms)) {
        throw new Error('invalid_request');
    }
    return { args: { job_id: args.job_id, new_public_key: args.new_public_key, expires_at_ms: args.expires_at_ms as string }, nonce, max_block_height };
}

function delegate(input: {
    senderId: string; receiverId: string; publicKey: string; nonce: string; maxBlockHeight: string;
    method: string; args: object; gas: bigint; deposit: bigint;
}) {
    const delegateAction = buildDelegateAction({
        senderId: input.senderId,
        receiverId: input.receiverId,
        publicKey: PublicKey.fromString(input.publicKey),
        nonce: BigInt(input.nonce),
        maxBlockHeight: BigInt(input.maxBlockHeight),
        actions: [actions.functionCall(input.method, { ...input.args }, input.gas, input.deposit)],
    });
    return { delegateAction, bytes: encodeDelegateAction(delegateAction) };
}

export function uploadDelegate(input: { senderId: string; publicKey: string; usdcContractId: string; fields: UploadFields }) {
    return delegate({
        senderId: input.senderId, receiverId: input.usdcContractId, publicKey: input.publicKey,
        nonce: input.fields.nonce, maxBlockHeight: input.fields.max_block_height,
        method: 'ft_transfer_call', args: input.fields.args, gas: UPLOAD_GAS, deposit: UPLOAD_DEPOSIT,
    });
}

export function uploadKeyDelegate(input: { senderId: string; publicKey: string; marketContractId: string; fields: UploadKeyFields }) {
    return delegate({
        senderId: input.senderId, receiverId: input.marketContractId, publicKey: input.publicKey,
        nonce: input.fields.nonce, maxBlockHeight: input.fields.max_block_height,
        method: 'replace_upload_key', args: input.fields.args, gas: UPLOAD_KEY_GAS, deposit: UPLOAD_KEY_DEPOSIT,
    });
}
