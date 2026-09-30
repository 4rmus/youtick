import type { Metadata } from 'next';
import { handleNearRpcRequest } from '@/app/api/near-rpc/proxy';
import { NEAR_CONFIG } from '@/lib/constants';
import { formatUsdc, livepeerPublicationCoverUrl, parseLivepeerPublication } from '@/lib/livepeer-publication';

const METADATA_READ_TIMEOUT_MS = 1_500;

export const GENERIC_SCREENING_METADATA: Metadata = {
    title: 'Screening',
    description: 'A ticketed digital screening on YouTick.',
};

/**
 * Title and cover for link previews. Goes through the same in-process read proxy as the browser
 * (allow-list, rate limit keyed on the requester, circuit breaker) with a short timeout;
 * any failure falls back to the generic metadata.
 */
export async function screeningMetadata(jobId: string, clientIp: string | null): Promise<Metadata> {
    try {
        const args = btoa(JSON.stringify({ publication_id: jobId }));
        const request = new Request('https://internal.invalid/api/near-rpc', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(clientIp ? { 'cf-connecting-ip': clientIp } : {}) },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 'screening-metadata', method: 'query',
                params: { request_type: 'call_function', account_id: NEAR_CONFIG.marketContractId, method_name: 'get_publication', args_base64: args, finality: 'final' },
            }),
            signal: AbortSignal.timeout(METADATA_READ_TIMEOUT_MS),
        });
        const response = await handleNearRpcRequest(request, 'read');
        if (!response.ok) return GENERIC_SCREENING_METADATA;
        const bytes: unknown = (await response.json())?.result?.result;
        if (!Array.isArray(bytes)) return GENERIC_SCREENING_METADATA;
        const value: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
        if (value === null) return GENERIC_SCREENING_METADATA;
        const publication = parseLivepeerPublication(value, jobId);
        const cover = livepeerPublicationCoverUrl(publication);
        const description = `${publication.creator_id} · ${formatUsdc(publication.price_usdc)} USDC`;
        return {
            title: publication.title,
            description,
            alternates: { canonical: `/s/${encodeURIComponent(jobId)}` },
            openGraph: { title: publication.title, description, ...(cover ? { images: [{ url: cover }] } : {}) },
            twitter: { card: cover ? 'summary_large_image' : 'summary', title: publication.title, description },
        };
    } catch {
        return GENERIC_SCREENING_METADATA;
    }
}
