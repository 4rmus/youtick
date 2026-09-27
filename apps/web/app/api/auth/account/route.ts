import { readNearAuthSession } from '@/lib/near-auth-lab-session';
import { authSurfaceAllowed } from '@/lib/near-auth-session-settings';
import { nearAuthAccountPreflight } from '@/lib/near-auth-account-preflight';

const json = (value: object, status = 200) => Response.json(value, { status,
    headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });

export async function POST(request: Request) {
    const url = new URL(request.url);
    if (!authSurfaceAllowed(url, 'product')) return json({ error: 'not_found' }, 404);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'origin_denied' }, 403);
    if (url.search) return json({ error: 'invalid_request' }, 400);
    // Next can represent an empty POST as a closed stream, as in the lab account route.
    if (request.body) {
        const reader = request.body.getReader();
        try {
            if (!(await reader.read()).done) return json({ error: 'invalid_request' }, 400);
        } catch { return json({ error: 'invalid_request' }, 400); }
        finally { await reader.cancel(); reader.releaseLock(); }
    }
    let session;
    try { session = await readNearAuthSession(request, 'product'); } catch { session = null; }
    if (!session) return json({ error: 'session_required' }, 401);
    try {
        const account = await nearAuthAccountPreflight(session.subject);
        if (session.expiresAt <= Date.now()) return json({ error: 'session_required' }, 401);
        return json({ accountId: account.implicitAccount, accountReady: account.accounts.includes(account.implicitAccount),
            expiresAt: session.expiresAt });
    } catch { return json({ error: 'account_check_unavailable' }, 503); }
}
