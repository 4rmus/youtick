import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { MpcSponsorBinding } from '../../../../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { authSurfaceAllowed } from '@/lib/near-auth-session-settings';
import { readNearAuthSession } from '@/lib/near-auth-lab-session';
import { prepareProductUpload, submitProductMpc, productMpcStatus } from '@/lib/near-auth-mpc-sponsor';

const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
export async function POST(request: Request) {
    const url = new URL(request.url);
    if (!authSurfaceAllowed(url, 'product')) return json({ error: 'not_found' }, 404);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'origin_denied' }, 403);
    if (url.search || request.headers.get('content-type')?.split(';')[0] !== 'application/json' || !request.body) return json({ error: 'invalid_request' }, 400);
    try { if (!await readNearAuthSession(request, 'product')) return json({ error: 'session_required' }, 401); }
    catch { return json({ error: 'session_required' }, 401); }
    let body: Record<string, unknown>;
    const reader = request.body.getReader();
    try {
        const chunks: Uint8Array[] = []; let size = 0;
        for (;;) {
            const part = await reader.read(); if (part.done) break;
            size += part.value.length;
            if (size > 16384) { await reader.cancel(); return json({ error: 'invalid_request' }, 413); }
            chunks.push(part.value);
        }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { return json({ error: 'invalid_request' }, 400); }
    finally { reader.releaseLock(); }
    const fields = body.action === 'status' ? ['action', 'operationId']
        : body.action === 'prepare' ? ['action', 'encodedArgs']
        : body.action === 'submit' ? ['action', 'review', 'approvalToken']
        : [];
    if (!fields.length || Object.keys(body).sort().join(',') !== fields.sort().join(',')) return json({ error: 'invalid_request' }, 400);
    if (body.action === 'status' && (typeof body.operationId !== 'string'
        || !(body.action === 'status' && body.operationId === '') && !/^[a-f0-9]{64}$/.test(body.operationId))) return json({ error: 'invalid_request' }, 400);
    let binding: MpcSponsorBinding | undefined;
    try {
        const context = await getCloudflareContext({ async: true });
        binding = (context.env as unknown as { NEAR_AUTH_MPC?: MpcSponsorBinding }).NEAR_AUTH_MPC;
    } catch { /* Missing binding is closed; no public proxy fallback. */ }
    const enabled = Boolean(binding && process.env.NEAR_AUTH_V1_UPLOAD_ENABLED === 'true'
        && process.env.NEAR_AUTH_V1_MPC_ENABLED === 'true' && process.env.NEAR_AUTH_V1_MPC_ACCOUNT_ID);
    try {
        if (body.action === 'status') return json({ enabled, payment: binding ? await productMpcStatus(request, binding, body.operationId as string) : null });
        if (!enabled) return json({ error: 'upload_disabled' }, 503);
        if (body.action === 'prepare') return json({ review: await prepareProductUpload(request, binding, body.encodedArgs) });
        if (body.action === 'submit') {
            if (typeof body.review !== 'string' || typeof body.approvalToken !== 'string') return json({ error: 'invalid_request' }, 400);
            return json({ payment: await submitProductMpc(request, binding, 'upload', body.review, body.approvalToken) });
        }
        return json({ error: 'invalid_request' }, 400);
    } catch (error) {
        const code = error instanceof Error && ['session_required', 'account_required', 'origin_denied',
            'mpc_pending', 'upload_not_ready', 'budget_not_verified', 'invalid_approval', 'upload_disabled',
            'upload_expired', 'authorization_expired', 'compact_upload_unavailable'].includes(error.message)
            ? error.message : 'upload_check_failed';
        return json({ error: code }, code === 'session_required' ? 401 : 422);
    }
}
