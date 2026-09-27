import { nearAuthLabEnabled, NEAR_AUTH_SIGNING_CHECK_ERRORS, safeSigningDiagnostic } from '@/lib/near-auth-lab';
import { readNearAuthLabSession } from '@/lib/near-auth-lab-session';
import { authorizeGoogleSigning, completeGoogleSigning, prepareGoogleSigning, verifyGoogleTransaction } from '@/lib/near-auth-signing-server';
import { authorizeGoogleUpload, completeGoogleUpload, prepareGoogleUpload } from '@/lib/near-auth-upload-server';
import { authorizeGoogleUsdc, prepareGoogleUsdc, verifyGoogleUsdc } from '@/lib/near-auth-usdc-server';

const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });

export async function POST(request: Request) {
    const url = new URL(request.url);
    if (!nearAuthLabEnabled(process.env.NODE_ENV, process.env.NEAR_AUTH_LAB_ENABLED, process.env.NEXT_PUBLIC_NEAR_NETWORK)
        || !['localhost', '127.0.0.1'].includes(url.hostname)) return json({ error: 'not_found' }, 404);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'origin_denied' }, 403);
    let subject: string | null;
    try { subject = await readNearAuthLabSession(request); } catch { subject = null; }
    if (!subject) return json({ error: 'session_required' }, 401);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' || !request.body) return json({ error: 'invalid_request' }, 400);
    let body: Record<string, unknown>;
    const reader = request.body.getReader();
    try {
        const chunks = []; let size = 0;
        for (;;) {
            const part = await reader.read(); if (part.done) break;
            size += part.value.length;
            if (size > 32768) { await reader.cancel(); return json({ error: 'body_too_large' }, 413); }
            chunks.push(part.value);
        }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_request');
    } catch { return json({ error: 'invalid_request' }, 400); }
    finally { reader.releaseLock(); }
    const fields = body.action === 'prepare-usdc' ? ['action', 'sender']
        : body.action === 'authorize-usdc' ? ['action', 'ticket']
        : body.action === 'verify-usdc' ? ['action', 'ticket', 'txHash']
        : body.action === 'prepare-upload' ? ['action', 'sponsor', 'encodedArgs']
        : body.action === 'authorize-upload' ? ['action', 'ticket', 'token']
        : body.action === 'complete-upload' ? ['action', 'ticket', 'outerHash']
        : body.action === 'prepare-purchase' ? ['action', 'sponsor', 'publicationId', 'playbackSession']
        : body.action === 'prepare' ? ['action', 'sponsor'] : body.action === 'authorize' ? ['action', 'ticket', 'token']
        : body.action === 'complete' ? ['action', 'ticket', 'outerHash'] : body.action === 'verify' ? ['action', 'ticket'] : [];
    if (!fields.length || Object.keys(body).length !== fields.length || Object.keys(body).some((key) => !fields.includes(key))) return json({ error: 'invalid_request' }, 400);
    const startedAt = Date.now();
    let checkStage: string | undefined;
    try {
        if (body.action === 'prepare-usdc') return json(await prepareGoogleUsdc(subject, url.origin, body.sender));
        if (body.action === 'authorize-usdc') return json(await authorizeGoogleUsdc(subject, url.origin, body.ticket));
        if (body.action === 'verify-usdc') return json(await verifyGoogleUsdc(subject, url.origin, body.ticket, body.txHash));
        if (body.action === 'prepare-upload') return json(await prepareGoogleUpload(subject, url.origin, body.sponsor, body.encodedArgs));
        if (body.action === 'authorize-upload') return json(await authorizeGoogleUpload(subject, url.origin, body.ticket, body.token,
            (stage) => { checkStage = stage; }));
        if (body.action === 'complete-upload') return json(await completeGoogleUpload(subject, url.origin, body.ticket, body.outerHash));
        if (body.action === 'prepare') return json(await prepareGoogleSigning(subject, url.origin, body.sponsor));
        if (body.action === 'prepare-purchase') return json(await prepareGoogleSigning(subject, url.origin, body.sponsor,
            { publicationId: body.publicationId, playbackSession: body.playbackSession }));
        if (body.action === 'authorize') return json(await authorizeGoogleSigning(subject, url.origin, body.ticket, body.token));
        if (body.action === 'complete') return json(await completeGoogleSigning(subject, url.origin, body.ticket, body.outerHash));
        return json(await verifyGoogleTransaction(subject, url.origin, body.ticket));
    } catch (error) {
        const reason = error instanceof Error && NEAR_AUTH_SIGNING_CHECK_ERRORS.has(error.message) ? error.message
            : error instanceof Error && 'code' in error && error.code === 'ERR_JWT_EXPIRED' ? 'authorization_expired'
            : error instanceof Error && error.name === 'TimeoutError' ? 'check_timeout' : 'signing_check_failed';
        const detail = checkStage ? { diagnostic: safeSigningDiagnostic({
            stage: checkStage,
            code: error instanceof Error ? ('code' in error ? error.code : error.name) : undefined,
            claim: error instanceof Error && 'claim' in error ? error.claim : undefined,
            claimCheck: error instanceof Error && 'reason' in error ? error.reason : undefined,
        }) } : {};
        // Local lab only. Never log tokens, tickets, subjects, transaction bodies or raw provider errors.
        console.warn(JSON.stringify({ event: 'near_auth_signing_check_failed', action: body.action, reason, ...detail, durationMs: Date.now() - startedAt }));
        return json({ error: reason === 'unapproved_claims' ? reason : 'signing_check_failed', reason, action: body.action, ...detail }, 422);
    }
}
