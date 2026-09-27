import { createHash } from 'node:crypto';
import { isMpcSettled, type MpcCommand, type MpcSponsorBinding } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { readNearAuthSession } from './near-auth-lab-session';
import { productSessionSettings } from './near-auth-session-settings';
import { nearAuthAccountPreflight } from './near-auth-account-preflight';
import { authorizeGoogleSigning, prepareGoogleSigning, readIntent } from './near-auth-signing-server';
import { authorizeGoogleUpload, prepareGoogleUpload, readUpload } from './near-auth-upload-server';
import { authorizeGoogleDevice, prepareGoogleDevice } from './near-auth-device-server';
import { ticketConfig } from './near-auth-ticket-purchase';

async function identity(request: Request) {
    const settings = productSessionSettings();
    if (!settings || new URL(request.url).origin !== settings.origin || request.headers.get('origin') !== settings.origin) throw new Error('origin_denied');
    const session = await readNearAuthSession(request, 'product');
    if (!session || session.expiresAt <= Date.now()) throw new Error('session_required');
    const account = await nearAuthAccountPreflight(session.subject);
    if (!account.accounts.includes(account.implicitAccount) || session.expiresAt <= Date.now()) throw new Error('account_required');
    return { session, accountId: account.implicitAccount, origin: settings.origin };
}
// Server-only adapter: no public route or automatic binding fallback. The caller supplies a verified product review.
export async function submitProductMpc(request: Request, binding: MpcSponsorBinding | undefined,
    purpose: 'ticket' | 'upload' | 'device', review: string, approvalToken: string) {
    if (!binding || process.env.NEAR_AUTH_V1_MPC_ENABLED !== 'true') throw new Error('mpc_disabled');
    if (purpose === 'upload' && process.env.NEAR_AUTH_V1_UPLOAD_ENABLED !== 'true') throw new Error('upload_disabled');
    if (purpose === 'device' && (!binding.executeDevice || process.env.NEAR_AUTH_V1_DEVICE_ENABLED !== 'true')) throw new Error('device_activation_disabled');
    const { session, accountId, origin } = await identity(request);
    const sponsor = process.env.NEAR_AUTH_V1_MPC_ACCOUNT_ID;
    if (!sponsor) throw new Error('mpc_not_configured');
    let bytes: Uint8Array, resourceId: string, amountUsdc: string, expiresAtMs: number;
    if (purpose === 'ticket') {
        const intent = await readIntent(review, session.subject, origin, 'product');
        if (!intent.purchase || intent.tx.signerId !== accountId || intent.sponsor !== sponsor) throw new Error('invalid_intent');
        const approved = await authorizeGoogleSigning(session.subject, origin, review, approvalToken, 'product');
        bytes = intent.bytes; resourceId = intent.purchase.publicationId; amountUsdc = intent.purchase.priceUsdc;
        expiresAtMs = approved.approvalExpiresAtMs;
    } else if (purpose === 'upload') {
        const intent = await readUpload(review, session.subject, origin, 'product');
        if (intent.delegate.senderId !== accountId || intent.sponsor !== sponsor) throw new Error('invalid_intent');
        const approved = await authorizeGoogleUpload(session.subject, origin, review, approvalToken, undefined, 'product');
        bytes = intent.bytes; resourceId = intent.parsed.request.job_id; amountUsdc = intent.parsed.quote.total_fee_usdc;
        expiresAtMs = Math.min(approved.approvalExpiresAtMs, intent.expiresAtMs);
    } else if (purpose === 'device') {
        const pending = await binding.status(accountId);
        if (pending && !isMpcSettled(pending)) throw new Error('mpc_pending');
        const intent = await authorizeGoogleDevice(session.subject, origin, review, approvalToken, accountId, sponsor);
        bytes = intent.bytes; resourceId = intent.device.publicationId; amountUsdc = '0'; expiresAtMs = intent.expiresAtMs;
    } else throw new Error('invalid_intent');
    if (session.expiresAt <= Date.now()) throw new Error('session_required');
    const command: MpcCommand = { network: 'testnet', market: ticketConfig().market, accountId, purpose, resourceId,
        attemptId: createHash('sha256').update(review).digest('hex'), payloadBase64: Buffer.from(bytes).toString('base64'),
        payloadHash: createHash('sha256').update(bytes).digest('hex'), amountUsdc, approvalToken,
        approvalExpiresAtMs: Math.min(expiresAtMs, session.expiresAt) };
    return binding.submit(command);
}
export async function productMpcStatus(request: Request, binding: MpcSponsorBinding | undefined, operationId = '') {
    if (!binding) throw new Error('mpc_not_configured');
    const { accountId } = await identity(request);
    if (operationId !== '' && !/^[a-f0-9]{64}$/.test(operationId)) throw new Error('invalid_request');
    return binding.status(accountId, operationId);
}

export async function prepareProductTicket(request: Request, binding: MpcSponsorBinding | undefined,
    publicationId: unknown, playbackSession: unknown, expectedPrice: unknown) {
    if (!binding?.executeTicket || process.env.NEAR_AUTH_V1_TICKET_ENABLED !== 'true'
        || process.env.NEAR_AUTH_V1_MPC_ENABLED !== 'true') throw new Error('ticket_disabled');
    const { session, accountId, origin } = await identity(request);
    const pending = await binding.status(accountId);
    if (pending && !isMpcSettled(pending)) throw new Error('mpc_pending');
    const sponsor = process.env.NEAR_AUTH_V1_MPC_ACCOUNT_ID;
    if (!sponsor) throw new Error('mpc_not_configured');
    const review = await prepareGoogleSigning(session.subject, origin, sponsor, { publicationId, playbackSession }, 'product');
    if (review.accountId !== accountId || !review.purchase || review.purchase.priceUsdc !== expectedPrice) throw new Error('payment_amount_changed');
    if (session.expiresAt <= Date.now()) throw new Error('session_required');
    return review;
}
export async function executeProductTicket(request: Request, binding: MpcSponsorBinding | undefined, operationId: string) {
    if (!binding?.executeTicket || process.env.NEAR_AUTH_V1_TICKET_ENABLED !== 'true'
        || process.env.NEAR_AUTH_V1_MPC_ENABLED !== 'true') throw new Error('ticket_disabled');
    const { accountId } = await identity(request);
    if (!/^[a-f0-9]{64}$/.test(operationId)) throw new Error('invalid_request');
    return binding.executeTicket(accountId, operationId);
}

export async function prepareProductUpload(request: Request, binding: MpcSponsorBinding | undefined, encodedArgs: unknown) {
    if (!binding || process.env.NEAR_AUTH_V1_UPLOAD_ENABLED !== 'true'
        || process.env.NEAR_AUTH_V1_MPC_ENABLED !== 'true') throw new Error('upload_disabled');
    const { session, accountId, origin } = await identity(request);
    const pending = await binding.status(accountId);
    if (pending && !isMpcSettled(pending)) throw new Error('mpc_pending');
    const sponsor = process.env.NEAR_AUTH_V1_MPC_ACCOUNT_ID;
    if (!sponsor) throw new Error('mpc_not_configured');
    const review = await prepareGoogleUpload(session.subject, origin, sponsor, encodedArgs, 'product');
    if (review.accountId !== accountId || session.expiresAt <= Date.now()) throw new Error('session_required');
    return review;
}

export async function prepareProductDevice(request: Request, binding: MpcSponsorBinding | undefined,
    publicationId: unknown, playbackSession: unknown, generation: unknown, playbackId: unknown) {
    if (!binding?.executeDevice || process.env.NEAR_AUTH_V1_DEVICE_ENABLED !== 'true'
        || process.env.NEAR_AUTH_V1_MPC_ENABLED !== 'true') throw new Error('device_activation_disabled');
    const { session, accountId, origin } = await identity(request);
    const pending = await binding.status(accountId);
    if (pending && !isMpcSettled(pending)) throw new Error('mpc_pending');
    const sponsor = process.env.NEAR_AUTH_V1_MPC_ACCOUNT_ID;
    if (!sponsor) throw new Error('mpc_not_configured');
    const review = await prepareGoogleDevice(session.subject, origin, sponsor, publicationId, playbackSession, generation, playbackId);
    if (review.accountId !== accountId || session.expiresAt <= Date.now()) throw new Error('session_required');
    return review;
}
export async function executeProductDevice(request: Request, binding: MpcSponsorBinding | undefined, operationId: string) {
    if (!binding?.executeDevice || process.env.NEAR_AUTH_V1_DEVICE_ENABLED !== 'true'
        || process.env.NEAR_AUTH_V1_MPC_ENABLED !== 'true') throw new Error('device_activation_disabled');
    const { accountId } = await identity(request);
    if (!/^[a-f0-9]{64}$/.test(operationId)) throw new Error('invalid_request');
    return binding.executeDevice(accountId, operationId);
}
