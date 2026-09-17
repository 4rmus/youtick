import { nearAuthLabEnabled } from '@/lib/near-auth-lab';
import { readNearAuthLabSession } from '@/lib/near-auth-lab-session';
import { nearAuthAccountPreflight } from '@/lib/near-auth-account-preflight';
import { nearAuthMediaPreflight } from '@/lib/near-auth-media-preflight';

function json(value: object, status = 200) {
    return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
}

export async function POST(request: Request) {
    const url = new URL(request.url);
    if (!nearAuthLabEnabled(process.env.NODE_ENV, process.env.NEAR_AUTH_LAB_ENABLED, process.env.NEXT_PUBLIC_NEAR_NETWORK)
        || !['localhost', '127.0.0.1'].includes(url.hostname)) return json({ error: 'not_found' }, 404);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'origin_denied' }, 403);
    // No client-supplied account, subject, key or token is accepted by this check.
    if (request.body) {
        const reader = request.body.getReader();
        try {
            if (!(await reader.read()).done) return json({ error: 'invalid_request' }, 400);
        } catch { return json({ error: 'invalid_request' }, 400); }
        finally { await reader.cancel(); reader.releaseLock(); }
    }
    let subject: string | null;
    try { subject = await readNearAuthLabSession(request); }
    catch { return json({ error: 'session_required' }, 401); }
    if (!subject) return json({ error: 'session_required' }, 401);
    const publication = url.searchParams.get('publication');
    if (publication !== null && (!/^[A-Za-z0-9._:-]{1,128}$/.test(publication)
        || [...url.searchParams.keys()].length !== 1)) return json({ error: 'invalid_request' }, 400);
    try {
        const account = await nearAuthAccountPreflight(subject, url.searchParams.get('prepare') === 'funding');
        return json(publication === null ? account : await nearAuthMediaPreflight(account, publication));
    }
    catch { return json({ error: 'account_check_unavailable' }, 503); }
}
