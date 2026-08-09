import { handleNearRpcRequest } from '../proxy';

export async function OPTIONS(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: { Allow: 'POST, OPTIONS' },
    });
}

export async function POST(request: Request): Promise<Response> {
    return handleNearRpcRequest(request, 'broadcast');
}
