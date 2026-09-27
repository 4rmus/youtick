import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { actions, baseDecode, baseEncode, createTransaction, decodeTransaction, encodeTransaction, PublicKey } from 'near-api-js';
import { nearAuthAccountPreflight } from './near-auth-account-preflight';
import { checkSigningAccount, rpc, sessionKey, verifyApproval } from './near-auth-signing-server';
import { ticketConfig, ticketRequest } from './near-auth-ticket-purchase';
import { productSessionSettings } from './near-auth-session-settings';
import { DEVICE_GAS, DEVICE_NEAR_LIMIT, readDeviceRecoveryState } from '../../../protocol/paid-media-livepeer-v1/device-recovery';

async function checkDevice(tx: ReturnType<typeof decodeTransaction>, sponsor: string, origin: string,
    generation: unknown, playbackId: unknown) {
    const { market } = ticketConfig(), call = tx.actions.length === 1 ? tx.actions[0].functionCall : undefined;
    if (tx.receiverId !== market || !call || Object.keys(tx.actions[0]).join(',') !== 'functionCall'
        || call.methodName !== 'activate_playback_device' || call.gas !== DEVICE_GAS || call.deposit !== 1n
        || call.args.length > 2048 || !Number.isSafeInteger(generation) || Number(generation) < 1
        || typeof playbackId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(playbackId)) throw new Error('invalid_intent');
    const args = JSON.parse(Buffer.from(call.args).toString('utf8'));
    const request = ticketRequest(args.publication_id, args.playback_session, tx.signerId, origin);
    if (Object.keys(args).sort().join(',') !== 'playback_session,publication_id') throw new Error('invalid_intent');
    const key = await checkSigningAccount(tx, sponsor, true, DEVICE_NEAR_LIMIT, 'device');
    const publication = await readDeviceRecoveryState(rpc, market, tx.signerId, request.publicationId, request.playbackSession, key.block_hash);
    if (publication.generation !== generation || publication.playback_id !== playbackId) throw new Error('playback_denied');
    return { ...request, generation: generation as number, playbackId, marketContractId: market };
}

export async function prepareGoogleDevice(subject: string, origin: string, sponsor: string,
    publicationId: unknown, playbackSession: unknown, generation: unknown, playbackId: unknown) {
    const account = await nearAuthAccountPreflight(subject);
    if (!account.accounts.includes(account.implicitAccount) || sponsor === account.implicitAccount) throw new Error('account_required');
    const request = ticketRequest(publicationId, playbackSession, account.implicitAccount, origin);
    const access = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: account.implicitAccount, public_key: account.publicKey });
    if (access.permission !== 'FullAccess' || !Number.isSafeInteger(access.nonce) || access.nonce < 0
        || typeof access.block_hash !== 'string' || baseDecode(access.block_hash).length !== 32) throw new Error('account_changed');
    const tx = createTransaction(account.implicitAccount, PublicKey.fromString(account.publicKey), ticketConfig().market, BigInt(access.nonce) + 1n,
        [actions.functionCall('activate_playback_device', { publication_id: request.publicationId, playback_session: request.playbackSession }, DEVICE_GAS, 1n)], baseDecode(access.block_hash));
    const bytes = encodeTransaction(tx);
    const device = await checkDevice(decodeTransaction(bytes), sponsor, origin, generation, playbackId);
    const now = Math.floor(Date.now() / 1000);
    const ticket = await new EncryptJWT({ sponsor, transaction: Buffer.from(bytes).toString('base64'), generation, playbackId })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer('youtick-auth-v1-device').setAudience(origin)
        .setSubject(subject).setIssuedAt(now).setExpirationTime(now + 300).encrypt(sessionKey('product'));
    return { ticket, accountId: account.implicitAccount, transaction: Array.from(bytes),
        transactionHash: baseEncode(createHash('sha256').update(bytes).digest()), expiresAt: (now + 300) * 1000, device };
}

export async function authorizeGoogleDevice(subject: string, origin: string, ticket: string, token: string, accountId: string, sponsor: string) {
    if (ticket.length > 8192) throw new Error('invalid_intent');
    const { payload } = await jwtDecrypt(ticket, sessionKey('product'), { issuer: 'youtick-auth-v1-device', audience: origin,
        keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'], requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: 300 });
    if (payload.sub !== subject || payload.sponsor !== sponsor || sponsor === accountId
        || typeof payload.transaction !== 'string' || payload.transaction.length > 4096) throw new Error('invalid_intent');
    const bytes = Buffer.from(payload.transaction, 'base64'), tx = decodeTransaction(bytes);
    if (!Buffer.from(encodeTransaction(tx)).equals(bytes) || tx.signerId !== accountId || !/^[a-f0-9]{64}$/.test(accountId)
        || !tx.publicKey.toString().startsWith('ed25519:') || Buffer.from(tx.publicKey.data).toString('hex') !== accountId) throw new Error('invalid_intent');
    const approved = await verifyApproval(token, subject, bytes, productSessionSettings()?.clientId);
    const device = await checkDevice(tx, sponsor, origin, payload.generation, payload.playbackId);
    const expiresAtMs = Math.min(approved.expiresAtMs, payload.exp! * 1000);
    if (expiresAtMs <= Date.now()) throw new Error('authorization_expired');
    return { bytes, device, expiresAtMs };
}
