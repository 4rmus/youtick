'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { getGatewayUrls } from '@/lib/crust';

// Module-level cache to avoid repeated URL resolution work
const resolvedUrlCache = new Map<string, string[]>();

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
}

/**
 * IPFS thumbnail with gateway fallback chain.
 *
 * This component intentionally avoids effect-driven state updates.
 * Fallback attempts are tracked per source URL and updated only in event handlers.
 */
export function IPFSThumbnail({
  url,
  alt = 'Thumbnail',
  className = '',
  fallbackUrl = '/placeholder-video.svg',
  onLoad,
  onError,
}: IPFSThumbnailProps) {
  const sourceKey = url || '__fallback__';
  const candidates = useMemo(
    () => (url ? resolveUrlCandidates(url) : [fallbackUrl]),
    [url, fallbackUrl],
  );

  // Per-source attempt counters so changing `url` naturally resets attempts.
  const [attemptsBySource, setAttemptsBySource] = useState<Record<string, number>>({});
  const attempt = attemptsBySource[sourceKey] || 0;

  const imageUrl = attempt < candidates.length
    ? candidates[attempt]
    : fallbackUrl;

  const handleImageError = useCallback(() => {
    const nextAttempt = attempt + 1;

    if (nextAttempt < candidates.length) {
      setAttemptsBySource((prev) => ({ ...prev, [sourceKey]: nextAttempt }));
      return;
    }

    // Exhausted all candidates; move to fallback state and notify caller.
    setAttemptsBySource((prev) => ({ ...prev, [sourceKey]: candidates.length }));
    onError?.(new Error('All gateways failed'));
  }, [attempt, candidates, sourceKey, onError]);

  const handleImageLoad = useCallback(() => {
    onLoad?.();
  }, [onLoad]);

  return (
    <Image
      src={imageUrl}
      alt={alt}
      className={className}
      width={1600}
      height={900}
      sizes="100vw"
      unoptimized
      onError={handleImageError}
      onLoad={handleImageLoad}
    />
  );
}
