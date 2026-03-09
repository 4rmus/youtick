'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { fetchFromGateways, getGatewayUrls } from '@/lib/crust';

// Module-level cache to avoid repeated URL resolution work
const resolvedUrlCache = new Map<string, string[]>();
const selectedUrlCache = new Map<string, string>();
const fetchedBlobUrlCache = new Map<string, string>();
let lastSuccessfulGatewayOrigin: string | null = null;
const THUMBNAIL_PROBE_TIMEOUT_MS = 1800;
const THUMBNAIL_STAGGER_MS = 500;
const MAX_THUMBNAIL_CANDIDATES = 3;

/**
 * Extract IPFS CID from various URL formats.
 * Returns null if URL doesn't contain an IPFS CID.
 */
function extractCidFromUrl(url: string): string | null {
  const ipfsMatch = url.match(/\/ipfs\/([A-Za-z0-9]{46,})/);
  if (ipfsMatch) return ipfsMatch[1];

  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[a-z2-7]{57,})$/.test(url)) {
    return url;
  }

  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', '');
  }

  return null;
}

function getThumbnailGatewayUrls(cid: string): string[] {
  const publicGateways = getGatewayUrls(cid);
  const crustDirect = `https://crustipfs.xyz/ipfs/${cid}`;
  return [...publicGateways, crustDirect];
}

function getUrlOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function prioritizeGatewayUrls(urls: string[]): string[] {
  if (!lastSuccessfulGatewayOrigin) {
    return urls;
  }

  return [...urls].sort((a, b) => {
    const aMatches = getUrlOrigin(a) === lastSuccessfulGatewayOrigin;
    const bMatches = getUrlOrigin(b) === lastSuccessfulGatewayOrigin;
    if (aMatches === bMatches) return 0;
    return aMatches ? -1 : 1;
  });
}

function resolveUrlCandidates(inputUrl: string): string[] {
  const cached = resolvedUrlCache.get(inputUrl);
  if (cached) return cached;

  if (inputUrl.startsWith('data:')) {
    const result = [inputUrl];
    resolvedUrlCache.set(inputUrl, result);
    return result;
  }

  const cid = extractCidFromUrl(inputUrl);
  if (cid) {
    const result = getThumbnailGatewayUrls(cid);
    resolvedUrlCache.set(inputUrl, result);
    return result;
  }

  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://') || inputUrl.startsWith('/')) {
    const result = [inputUrl];
    resolvedUrlCache.set(inputUrl, result);
    return result;
  }

  const result = [inputUrl];
  resolvedUrlCache.set(inputUrl, result);
  return result;
}

interface IPFSThumbnailProps {
  /** URL to display - supports IPFS CIDs, gateway URLs, and direct URLs */
  url?: string | null;
  /** Alt text for the image */
  alt?: string;
  /** CSS class name */
  className?: string;
  /** Fallback URL if image fails to load */
  fallbackUrl?: string;
  /** Called when image loads successfully */
  onLoad?: () => void;
  /** Called when image fails to load */
  onError?: (error: Error) => void;
  /** Browser loading hint */
  loading?: 'lazy' | 'eager';
  /** Probe timeout before trying the next gateway candidate */
  timeoutMs?: number;
}

/**
 * IPFS thumbnail with latency-aware gateway selection.
 */
export function IPFSThumbnail({
  url,
  alt = 'Thumbnail',
  className = '',
  fallbackUrl = '/placeholder-video.svg',
  onLoad,
  onError,
  loading = 'lazy',
  timeoutMs = THUMBNAIL_PROBE_TIMEOUT_MS,
}: IPFSThumbnailProps) {
  const sourceKey = url || '__fallback__';
  const candidates = useMemo(
    () => prioritizeGatewayUrls(url ? resolveUrlCandidates(url) : [fallbackUrl]).slice(0, MAX_THUMBNAIL_CANDIDATES),
    [url, fallbackUrl],
  );
  const cachedUrl = selectedUrlCache.get(sourceKey);
  const [imageUrl, setImageUrl] = useState<string>(() => {
    if (cachedUrl && candidates.includes(cachedUrl)) {
      return cachedUrl;
    }
    return candidates[0] ?? fallbackUrl;
  });

  useEffect(() => {
    let cancelled = false;

    async function resolveBestCandidate() {
      const fetchedBlobUrl = fetchedBlobUrlCache.get(sourceKey);
      if (fetchedBlobUrl) {
        setImageUrl(fetchedBlobUrl);
        return;
      }

        const cid = url ? extractCidFromUrl(url) : null;
        if (cid) {
          try {
            const response = await fetchFromGateways(cid, { timeout: Math.max(timeoutMs, 2500) });
            const blob = await response.blob();
            if (cancelled) return;

          const normalizedBlob = blob.type.startsWith('image/')
            ? blob
            : new Blob([blob], { type: 'image/jpeg' });
          const objectUrl = URL.createObjectURL(normalizedBlob);
          fetchedBlobUrlCache.set(sourceKey, objectUrl);
          setImageUrl(objectUrl);
          return;
          } catch {
            // Fall through to public gateway probing.
        }
      }

      const cached = selectedUrlCache.get(sourceKey);
      if (cached && candidates.includes(cached)) {
        setImageUrl(cached);
        return;
      }

      setImageUrl(candidates[0] ?? fallbackUrl);

      if (candidates.length <= 1 || typeof window === 'undefined' || typeof window.Image === 'undefined') {
        setImageUrl(candidates[0] ?? fallbackUrl);
        return;
      }

      try {
        const winner = await pickResponsiveImageUrl(candidates, timeoutMs);
        if (cancelled) return;
        selectedUrlCache.set(sourceKey, winner);
        lastSuccessfulGatewayOrigin = getUrlOrigin(winner);
        setImageUrl(winner);
      } catch {
        if (cancelled) return;
        setImageUrl(fallbackUrl);
        onError?.(new Error('All gateways failed'));
      }
    }

    void resolveBestCandidate();

    return () => {
      cancelled = true;
    };
  }, [candidates, fallbackUrl, onError, sourceKey, timeoutMs, url]);

  const handleImageError = () => {
    selectedUrlCache.delete(sourceKey);
    setImageUrl(fallbackUrl);
    onError?.(new Error('Image load failed'));
  };

  const handleImageLoad = () => {
    const origin = getUrlOrigin(imageUrl);
    if (origin) {
      lastSuccessfulGatewayOrigin = origin;
    }
    if (imageUrl !== fallbackUrl) {
      selectedUrlCache.set(sourceKey, imageUrl);
    }
    onLoad?.();
  };

  return (
    <span className="contents">
      <Image
        src={imageUrl}
        alt={alt}
        className={className}
        width={1600}
        height={900}
        sizes="100vw"
        unoptimized
        loading={loading}
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    </span>
  );
}

async function pickResponsiveImageUrl(candidates: string[], timeoutMs: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const timers: number[] = [];
    const cleanups: Array<() => void> = [];
    let failures = 0;
    let settled = false;

    const finish = (resolver: () => void) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      for (const cleanup of cleanups) {
        cleanup();
      }
      resolver();
    };

    candidates.forEach((candidate, index) => {
      const timer = window.setTimeout(() => {
        const img = new window.Image();
        const cleanup = () => {
          window.clearTimeout(timeout);
          img.onload = null;
          img.onerror = null;
        };

        const timeout = window.setTimeout(() => {
          cleanup();
          img.src = '';
          failures += 1;
          if (failures === candidates.length) {
            finish(() => reject(new Error('All candidates timed out')));
          }
        }, timeoutMs);

        cleanups.push(cleanup);

        img.onload = () => {
          finish(() => resolve(candidate));
        };

        img.onerror = () => {
          cleanup();
          failures += 1;
          if (failures === candidates.length) {
            finish(() => reject(new Error('All candidates failed')));
          }
        };

        img.src = candidate;
      }, index * THUMBNAIL_STAGGER_MS);

      timers.push(timer);
    });
  });
}
