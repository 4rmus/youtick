import { handleNearAuthSession } from '@/lib/near-auth-session-server';

export const GET = (request: Request) => handleNearAuthSession(request, 'lab');
export const POST = GET;
export const DELETE = GET;
