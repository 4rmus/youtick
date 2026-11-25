import {
    MAX_PUBLICATION_COVER_BYTES,
    publicationCoverContentType,
    type PublicationCoverContentType,
} from './cover-image';
import type { Env } from './env';
import { JOB_ID_PATTERN, PLAYBACK_ID_PATTERN } from './constants';
import { formatLog, safeErrorCode, json } from './helpers';
import { rateLimitedEnvironment } from './config';
import { readFinalPublicationById } from './near-rpc';
import { publicBetaRateLimitResponse } from './public-testnet-beta';
import { mediaProvider, publicationProfileHash } from './provider-registry';

const PUBLICATION_COVER_CACHE_SECONDS = 24 * 60 * 60;
// Bounds how long a takedown can leave a cover visible: the edge visibility marker plus the browser max-age.
const PUBLICATION_COVER_VISIBLE_SECONDS = 30;

export function publicationCoverRoute(pathname: string): { jobId: string; generation: number } | null {
    const match = /^\/v1\/publication-covers\/([^/]+)\/([1-9][0-9]*)$/.exec(pathname);
    if (!match) return null;
    let jobId: string;
    try {
        jobId = decodeURIComponent(match[1]);
    } catch {
        return null;
    }
    const generation = Number(match[2]);
    if (!JOB_ID_PATTERN.test(jobId) || !Number.isSafeInteger(generation)) return null;
    return { jobId, generation };
}

export async function publicationCover(
    request: Request,
    env: Env,
    jobId: string,
    generation: number,
): Promise<Response> {
    try {
        const cacheKey = publicationCoverCacheKey(request, env, jobId, generation);
        const visibleKey = new Request(`${cacheKey.url}/visible`);
        const cachedCover = async (): Promise<Response | null> => {
            const cached = await caches.default.match(cacheKey);
            if (!cached) return null;
            const cachedBytes = new Uint8Array(await cached.arrayBuffer());
            const cachedContentType = publicationCoverContentType(cachedBytes);
            return cachedBytes.byteLength <= MAX_PUBLICATION_COVER_BYTES && cachedContentType
                ? publicCoverResponse(cachedBytes, cachedContentType) : null;
        };
        // Cache-first: a recent visibility check lets cached bytes skip the NEAR read and the rate limit.
        if (await caches.default.match(visibleKey)) {
            const hit = await cachedCover();
            if (hit) return hit;
        }
        if (rateLimitedEnvironment(env)) {
            const limited = await publicBetaRateLimitResponse(request, env, '/v1/publication-covers');
            if (limited) return limited;
        }

        const publication = await readFinalPublicationById(env, jobId);
        if (publication?.publication_id !== jobId
            || publication.generation !== generation
            || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))
            || typeof publication.playback_id !== 'string'
            || !PLAYBACK_ID_PATTERN.test(publication.playback_id)) {
            await caches.default.delete(visibleKey).catch(() => false);
            return json({ error: 'not_found' }, 404);
        }
        await caches.default.put(visibleKey, new Response(null, {
            headers: { 'Cache-Control': `public, max-age=${PUBLICATION_COVER_VISIBLE_SECONDS}` },
        })).catch(() => undefined);

        const hit = await cachedCover();
        if (hit) return hit;

        const cover = await mediaProvider(env, publicationProfileHash(publication))
            .readCover(publication.playback_id);
        const internal = new Response(cover.bytes, {
            headers: {
                'Cache-Control': `public, max-age=${PUBLICATION_COVER_CACHE_SECONDS}`,
                'Content-Length': String(cover.bytes.byteLength),
                'Content-Type': cover.contentType,
            },
        });
        await caches.default.put(cacheKey, internal.clone()).catch(() => undefined);
        return publicCoverResponse(cover.bytes, cover.contentType);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('publication_cover_failed', { code }));
        const status = code.startsWith('near_') || code === 'provider_unavailable' ? 503 : 502;
        return json({ error: 'publication_cover_unavailable' }, status);
    }
}

function publicationCoverCacheKey(
    request: Request,
    env: Env,
    jobId: string,
    generation: number,
): Request {
    const origin = new URL(request.url).origin;
    const scope = `${encodeURIComponent(env.NEAR_NETWORK!)}:${encodeURIComponent(env.MARKET_CONTRACT_ID!)}`;
    return new Request(`${origin}/__cache/publication-covers/${scope}/${encodeURIComponent(jobId)}/${generation}`);
}

function publicCoverResponse(body: ArrayBuffer | Uint8Array, contentType: PublicationCoverContentType): Response {
    const byteLength = body.byteLength;
    return new Response(body, {
        headers: {
            'Cache-Control': `public, max-age=${PUBLICATION_COVER_VISIBLE_SECONDS}`,
            'Content-Length': String(byteLength),
            'Content-Type': contentType,
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
