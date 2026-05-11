import { getGatewayUrls, markGatewayUnhealthyByUrl, resolveGatewayUrl } from './crust';

export type IpfsMediaPurpose = 'image' | 'video' | 'generic';

const resolvedCandidateCache = new Map<string, string[]>();
const selectedUrlCache = new Map<string, string>();
const pendingSelectionCache = new Map<string, Promise<string>>();
const failedUrlCache = new Map<string, Set<string>>();
const preconnectedOrigins = new Set<string>();

export const DEFAULT_IPFS_MEDIA_TIMEOUT_MS = 1_800;
export const MAX_IPFS_MEDIA_CANDIDATES = 3;

function getCacheKey(sourceKey: string, purpose: IpfsMediaPurpose): string {
    return `${purpose}:${sourceKey}`;
}

export function getIpfsMediaSourceKey(url?: string | null): string {
    return url || '__fallback__';
}

export function extractIpfsCid(input: string): string | null {
    const ipfsMatch = input.match(/\/ipfs\/([A-Za-z0-9]{46,})/);
    if (ipfsMatch) {
        return ipfsMatch[1];
    }

    const subdomainMatch = input.match(/^https?:\/\/([a-z0-9]+)\.ipfs\.[^/]+(?:\/.*)?$/i);
    if (subdomainMatch) {
        return subdomainMatch[1];
    }

    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[a-z2-7]{57,})$/.test(input)) {
        return input;
    }

    if (input.startsWith('ipfs://')) {
        return input.slice('ipfs://'.length);
    }

    return null;
}

export function isDirectMediaUrl(input: string): boolean {
    return input.startsWith('http://')
        || input.startsWith('https://')
        || input.startsWith('data:')
        || input.startsWith('/');
}

function getBaseCandidates(input: string, limit: number): string[] {
    const cached = resolvedCandidateCache.get(input);
    if (cached) {
        return cached.slice(0, limit);
    }

    let result: string[];
    if (isDirectMediaUrl(input)) {
        result = [input];
    } else {
        const cid = extractIpfsCid(input);
        result = cid ? getGatewayUrls(cid).slice(0, limit) : [input];
    }

    resolvedCandidateCache.set(input, result);
    return result;
}

function preconnectMediaOrigin(url: string): void {
    if (typeof document === 'undefined' || !url.startsWith('http://') && !url.startsWith('https://')) {
        return;
    }

    try {
        const origin = new URL(url).origin;
        if (preconnectedOrigins.has(origin)) {
            return;
        }

        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = origin;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
        preconnectedOrigins.add(origin);
    } catch {
        // Ignore malformed URLs and DOM edge cases.
    }
}

export function getIpfsMediaCandidates(
    input: string | null | undefined,
    options?: {
        sourceKey?: string;
        purpose?: IpfsMediaPurpose;
        fallbackUrl?: string;
        limit?: number;
    },
): string[] {
    const fallbackUrl = options?.fallbackUrl;
    if (!input) {
        return fallbackUrl ? [fallbackUrl] : [];
    }

    const purpose = options?.purpose ?? 'image';
    const sourceKey = options?.sourceKey ?? getIpfsMediaSourceKey(input);
    const cacheKey = getCacheKey(sourceKey, purpose);
    const limit = options?.limit ?? MAX_IPFS_MEDIA_CANDIDATES;

    const selected = selectedUrlCache.get(cacheKey);
    const failed = failedUrlCache.get(cacheKey);
    const baseCandidates = getBaseCandidates(input, limit);
    let candidates = failed
        ? baseCandidates.filter((candidate) => !failed.has(candidate))
        : baseCandidates;

    if (selected && candidates.includes(selected)) {
        candidates = [selected, ...candidates.filter((candidate) => candidate !== selected)];
    }

    if (candidates.length === 0 && fallbackUrl) {
        return [fallbackUrl];
    }

    return candidates;
}

export async function resolveIpfsMediaUrl(
    input: string | null | undefined,
    options?: {
        sourceKey?: string;
        purpose?: IpfsMediaPurpose;
        timeoutMs?: number;
        fallbackUrl?: string;
        limit?: number;
    },
): Promise<string | undefined> {
    const candidates = getIpfsMediaCandidates(input, options);
    if (candidates.length === 0) {
        return undefined;
    }

    if (!input) {
        return candidates[0];
    }

    const purpose = options?.purpose ?? 'image';
    const sourceKey = options?.sourceKey ?? getIpfsMediaSourceKey(input);
    const cacheKey = getCacheKey(sourceKey, purpose);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_IPFS_MEDIA_TIMEOUT_MS;
    const cid = extractIpfsCid(input);
    const selected = selectedUrlCache.get(cacheKey);

    if (selected && candidates.includes(selected)) {
        preconnectMediaOrigin(selected);
        return selected;
    }

    if (!cid || candidates.length <= 1) {
        if (candidates[0] && candidates[0] !== options?.fallbackUrl) {
            selectedUrlCache.set(cacheKey, candidates[0]);
            preconnectMediaOrigin(candidates[0]);
        }
        return candidates[0];
    }

    const pendingKey = `${cacheKey}:${timeoutMs}`;
    const existing = pendingSelectionCache.get(pendingKey);
    if (existing) {
        try {
            const winner = await existing;
            if (candidates.includes(winner)) {
                preconnectMediaOrigin(winner);
                return winner;
            }
        } catch {
            return candidates[0];
        }
    }

    const pending = resolveGatewayUrl(cid, {
        purpose,
        timeout: timeoutMs,
        range: purpose === 'video' ? { start: 0, end: 65_535 } : undefined,
        markUnhealthyOnFailure: purpose !== 'image',
    })
        .then((winner) => {
            if (candidates.includes(winner)) {
                selectedUrlCache.set(cacheKey, winner);
                preconnectMediaOrigin(winner);
                return winner;
            }

            return candidates[0];
        })
        .finally(() => {
            pendingSelectionCache.delete(pendingKey);
        });

    pendingSelectionCache.set(pendingKey, pending);

    try {
        return await pending;
    } catch {
        return candidates[0];
    }
}

export function rememberSuccessfulIpfsMediaUrl(
    url: string,
    options?: {
        sourceKey?: string;
        purpose?: IpfsMediaPurpose;
    },
): void {
    const purpose = options?.purpose ?? 'image';
    const sourceKey = options?.sourceKey ?? getIpfsMediaSourceKey(url);
    const cacheKey = getCacheKey(sourceKey, purpose);

    selectedUrlCache.set(cacheKey, url);
    preconnectMediaOrigin(url);

    const failed = failedUrlCache.get(cacheKey);
    if (!failed) {
        return;
    }

    failed.delete(url);
    if (failed.size === 0) {
        failedUrlCache.delete(cacheKey);
    }
}

export function rememberFailedIpfsMediaUrl(
    url: string,
    options?: {
        input?: string | null;
        sourceKey?: string;
        purpose?: IpfsMediaPurpose;
    },
): void {
    const purpose = options?.purpose ?? 'image';
    const sourceKey = options?.sourceKey ?? getIpfsMediaSourceKey(options?.input ?? url);
    const cacheKey = getCacheKey(sourceKey, purpose);
    const failed = failedUrlCache.get(cacheKey) ?? new Set<string>();

    failed.add(url);
    failedUrlCache.set(cacheKey, failed);
    if (purpose !== 'image') {
        markGatewayUnhealthyByUrl(url);
    }

    if (selectedUrlCache.get(cacheKey) === url) {
        selectedUrlCache.delete(cacheKey);
    }
}

export function getNextIpfsMediaUrl(
    input: string | null | undefined,
    options?: {
        currentUrl?: string;
        sourceKey?: string;
        purpose?: IpfsMediaPurpose;
        fallbackUrl?: string;
        limit?: number;
    },
): string | undefined {
    const candidates = getIpfsMediaCandidates(input, options);
    return candidates.find((candidate) => candidate !== options?.currentUrl && candidate !== options?.fallbackUrl);
}
